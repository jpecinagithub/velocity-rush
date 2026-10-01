// GameSession: owns the whole race — vehicles, AI, traffic, collisions,
// drafting, near-misses, checkpoints, laps, positions, timing, results.
// Rendering objects are built in attach(); the simulation itself is
// renderer-agnostic so the logic can be validated headlessly.
import * as THREE from 'three';
import { MODES } from './constants.js';
import { clamp, wrapS } from './utils.js';
import { Track } from './track.js';
import { createVehicle, placeOnTrack, stepVehicle, resetVehicle, collideVehicles } from './physics.js';
import { createAIDriver, stepAI } from './ai.js';
import { TrafficManager } from './traffic.js';
import { ParticleSystem } from './particles.js';
import { AudioManager } from './audio.js';
import { ChaseCamera } from './camera.js';
import { buildCarMesh } from './carMesh.js';
import { buildTrafficMesh } from './carMesh.js';
import { buildEnvironment } from './environment.js';
import { holder } from './activeSession.js';

const AI_NAMES = ['VOLT', 'JINX', 'RAZOR', 'ECHO', 'BLITZ'];
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class GameSession {
  constructor(config) {
    this.config = config;
    this.track = new Track(config.trackDef);
    this.mode = MODES[config.mode];
    this.difficulty = config.difficulty;
    this.quality = config.quality;
    this.getSettings = config.getSettings;
    this.cb = config.callbacks || {};
    this.playerAI = !!config.playerAI;
    this.laps = config.lapsOverride || this.mode.laps;

    this.audio = new AudioManager();
    this.input = config.input || null;
    this.state = 'idle';
    this.raceT = 0;
    this.countT = 0;
    this._lastCount = 4;
    this.finishT = 0;
    this._finishSent = false;
    this._msgId = 0;
    this.camMode = 0;

    // vehicles: [player, ...ai]
    this.vehicles = [];
    const player = createVehicle(config.carDef, { isPlayer: true, name: 'YOU' });
    this.vehicles.push(player);
    this.player = player;
    const aiDefs = config.aiCarDefs || [];
    for (let i = 0; i < this.mode.racers; i++) {
      const def = aiDefs[i % Math.max(1, aiDefs.length)];
      const v = createVehicle(def, { name: AI_NAMES[i % AI_NAMES.length] });
      v.ai = createAIDriver(this.difficulty, 1000 + i * 77);
      this.vehicles.push(v);
    }
    if (this.playerAI) this.player.ai = createAIDriver({ id: 'normal', aiTop: 0.94, aiGrip: 0.95, aiError: 0.02, aiAggr: 0.8 }, 42);

    const tCount = Math.max(0, Math.round(this.quality.traffic * this.mode.traffic));
    this.traffic = new TrafficManager(this.track, tCount, 987 + config.trackDef.id.length * 131);

    this.stats = { nearMisses: 0, overtakes: 0, nearScore: 0 };
    this._prevRel = new Array(this.vehicles.length).fill(0);
    this.results = null;

    // hud is mutated every frame; the HUD component reads it via rAF (no react state churn)
    this.hud = {
      speedKmh: 0, gear: '1', pos: 1, total: this.vehicles.length,
      lap: 1, laps: this.laps, nitro: 1, nitroActive: false,
      timeMs: 0, lastLap: null, bestLap: null, wrongWay: false,
      slip: false, drift: false, offroad: false, air: false,
      sprintToGo: 0,
    };
    // precomputed minimap polyline (decimated)
    const N = 220, xs = new Float32Array(N), zs = new Float32Array(N);
    const fr = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < N; i++) {
      this.track.frameAt((i / N) * this.track.length, fr);
      xs[i] = fr.pos.x; zs[i] = fr.pos.z;
      minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
      minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
    }
    this.mapData = { xs, zs, minX, maxX, minZ, maxZ, finishS: this.track.sprintFinishS };

    this.visuals = null;
    holder.session = this;
    this.resetRace();
  }

  msg(text, sub = '', cls = '') {
    if (this.cb.onMessage) this.cb.onMessage({ id: ++this._msgId, text, sub, cls });
  }

  // ---------- visuals ----------
  attach(scene, camera3, input) {
    if (input) this.input = input;
    this.scene = scene;
    this.env = buildEnvironment(scene, this.track, this.track.def.env, this.quality, this.track.def);
    this.particles = new ParticleSystem(scene, this.quality.particles);
    this.chase = new ChaseCamera(camera3);
    this.chase.mode = this.camMode;

    this.carVisuals = this.vehicles.map((v) => {
      const cv = buildCarMesh(v.def, v.color, this.quality);
      scene.add(cv.group);
      return cv;
    });
    this.trafficVisuals = this.traffic.cars.map((c) => {
      const g = buildTrafficMesh(c.type, c.color);
      scene.add(g);
      c.visual = g;
      return g;
    });
    // start/finish + sprint finish gantries are part of environment
    this.visuals = true;
    this.resetRace();
  }

  resetRace() {
    const L = this.track.length;
    // player last on grid, AI ahead
    this.vehicles.forEach((v, i) => {
      const gridIdx = i === 0 ? this.vehicles.length - 1 : i - 1;
      const { s, d } = this.track.gridSlot(gridIdx);
      placeOnTrack(v, this.track, s, d);
      v.lap = 0; v.lapStartT = 0; v.lapTimes = [];
      v.nitro = 1; v.nitroActive = false; v.nitroUsed = 0;
      v.slip = 0; v.slipBoostT = 0; v.topSpeed = 0;
      v.finished = false; v.finishT = 0; v.lastCp = -1;
      v.events.length = 0;
      v.wrongWayT = 0;
    });
    this.traffic.reset(this.player.s);
    this.raceT = 0; this.finishT = 0; this._finishSent = false;
    this.results = null;
    this.stats = { nearMisses: 0, overtakes: 0, nearScore: 0 };
    this._prevRel.fill(0);
    this._prevNitro = false;
    this._wasSlip = false;
    Object.assign(this.hud, {
      speedKmh: 0, gear: '1', pos: this.vehicles.length, total: this.vehicles.length,
      lap: 1, nitro: 1, nitroActive: false, timeMs: 0, lastLap: null, bestLap: null,
      wrongWay: false, slip: false, drift: false, offroad: false, air: false,
    });
    this.startCountdown();
    if (this.chase) {
      // pre-position camera behind grid for the countdown orbit start
      this.chase.snapTo(this.player);
    }
  }

  startCountdown() {
    this.state = 'countdown';
    this.countT = 3.0;
    this._lastCount = 4;
    this._orbitA = 0;
  }

  pauseGame() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.audio.suspend();
    if (this.cb.onPause) this.cb.onPause(true);
  }
  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = this._prePause || 'racing';
    if (this.cb.onPause) this.cb.onPause(false);
  }

  // ---------- per-frame ----------
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    if (this.state === 'idle') return;

    // input (and its edges) are polled even while paused so that
    // P / Escape / Options can always toggle pause back off
    if (this.input) this.input.update(dt);
    this._handleEdges();
    if (this.state === 'paused') return;

    if (this.state === 'countdown') this._updateCountdown(dt);
    else if (this.state === 'racing') this._updateRacing(dt);
    else if (this.state === 'finished') this._updateFinished(dt);

    if (this.particles) this.particles.update(dt);
    if (this.env) this.env.update(dt);
  }

  _handleEdges() {
    const inp = this.input;
    if (!inp) return;
    if (inp.consume('pause')) {
      if (this.state === 'paused') this.resumeGame();
      else this._prePause = this.state, this.pauseGame();
    }
    if (inp.consume('camera') && this.chase) {
      this.camMode = (this.camMode + 1) % 3;
      this.chase.mode = this.camMode;
      this.msg(['CHASE CAM', 'FAR CHASE', 'HOOD CAM'][this.camMode]);
    }
    if (inp.consume('reset') && this.state === 'racing') {
      resetVehicle(this.player, this.track);
    }
  }

  _updateCountdown(dt) {
    this.countT -= dt;
    const n = Math.ceil(this.countT);
    if (n < this._lastCount && n >= 1) {
      this._lastCount = n;
      this.audio.ensure();
      this.audio.countBeep(false);
      if (this.cb.onCountdown) this.cb.onCountdown(n);
    }
    // slow orbit around the player's car
    if (this.chase && this.visuals) {
      this._orbitA += dt * 0.55;
      const p = this.player.pos;
      this.chase.cam.position.set(
        p.x + Math.sin(this._orbitA) * 13,
        p.y + 4.2,
        p.z + Math.cos(this._orbitA) * 13
      );
      this.chase.cam.lookAt(p.x, p.y + 1, p.z);
    }
    this._syncVisuals(dt, true);
    if (this.countT <= 0) {
      this.audio.countBeep(true);
      if (this.cb.onCountdown) this.cb.onCountdown('GO!');
      this.state = 'racing';
      this.raceT = 0;
      this.vehicles.forEach((v) => { v.lapStartT = 0; });
      if (this.chase) this.chase.snapTo(this.player);
      this.msg(this.mode.sprint ? 'SPRINT START!' : this.mode.solo ? 'BEAT THE CLOCK!' : 'RACE START!', '', 'pink');
    }
  }

  _playerInput() {
    if (this.playerAI) return null; // driven via stepAI below
    const inp = this.input;
    if (!inp) return { steer: 0, accelerate: 0, brake: 0, handbrake: false, nitro: false };
    return {
      steer: inp.steer, accelerate: inp.accelerate, brake: inp.brake,
      handbrake: inp.handbrake, nitro: inp.nitro,
    };
  }

  _updateRacing(dt) {
    const track = this.track, L = track.length;
    this.raceT += dt;
    const p = this.player;

    // --- slipstream detection (before physics so drag applies this frame) ---
    let draft = 0, slipTarget = null;
    {
      let bestDs = 22;
      const consider = (os, od, oLen) => {
        let ds = os - p.s;
        if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
        if (ds > 2.5 && ds < 22 && Math.abs(od - p.d) < 2.4 && ds < bestDs) { bestDs = ds; slipTarget = true; }
      };
      for (const o of this.vehicles) { if (o !== p && !o.finished) consider(o.s, o.d); }
      for (const t of this.traffic.cars) { if (t.active) consider(t.s, t.d, t.type.len); }
      if (slipTarget && Math.abs(p.speed) > 38 && p.airT <= 0) {
        p.slip = Math.min(1.2, p.slip + dt / 2.0);
        draft = Math.min(1, p.slip);
        if (p.slip > 0.35 && !this._wasSlip) {
          this._wasSlip = true;
          this.msg('SLIPSTREAM', 'stay tucked in');
          this.audio.slipstream();
        }
      } else {
        if (this._wasSlip) {
          this._wasSlip = false;
          if (p.slip > 0.55) {
            p.slipBoostT = 1.15;
            p.nitro = Math.min(1, p.nitro + 0.08);
            this.msg('SLIPSTREAM BOOST', '', 'pink');
            this.audio.overtake();
          }
        }
        p.slip = Math.max(0, p.slip - dt * 2.5);
      }
    }

    // --- vehicles ---
    if (this.playerAI) {
      stepAI(p, dt, { track, difficulty: this.difficulty, vehicles: this.vehicles, traffic: this.traffic, player: p, solo: this.mode.solo });
    } else {
      stepVehicle(p, this._playerInput(), dt, { track, draft });
    }
    for (let i = 1; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      stepAI(v, dt, { track, difficulty: this.difficulty, vehicles: this.vehicles, traffic: this.traffic, player: p, solo: this.mode.solo });
    }
    this.traffic.update(dt, p.s, this.difficulty.trafficSpeed);

    // --- collisions ---
    for (let i = 1; i < this.vehicles.length; i++) collideVehicles(p, this.vehicles[i]);
    for (let i = 1; i < this.vehicles.length; i++)
      for (let j = i + 1; j < this.vehicles.length; j++) collideVehicles(this.vehicles[i], this.vehicles[j]);
    this._collideTraffic(p);

    // --- events -> audio / particles / camera ---
    for (const v of this.vehicles) this._drainEvents(v, dt === 0);
    this._continuousFx(dt);

    // --- near miss / overtake ---
    this._nearMiss(dt);
    this._overtake();

    // --- checkpoints / laps / finish ---
    this._raceLogic(dt);

    // --- positions ---
    this._positions();

    // --- nitro edge sound ---
    if (p.nitroActive && !this._prevNitro) this.audio.nitroStart();
    this._prevNitro = p.nitroActive;

    // --- audio ---
    const spd01 = clamp(Math.abs(p.speed) / p.def.stats.topSpeed, 0, 1.2);
    const rpm = clamp(Math.abs(p.speed) / (p.def.stats.topSpeed * 1.1), 0, 1);
    const thr = this.playerAI ? 0.8 : (this.input ? this.input.accelerate : 0);
    this.audio.engine(rpm, thr, p.nitroActive, true);
    this.audio.skid(p.drift * (p.airT > 0 ? 0 : 1));
    this.audio.wind(spd01);
    const s = this.getSettings ? this.getSettings() : {};
    this.audio.music(s.music !== false);

    // --- camera / hud ---
    if (this.chase) this.chase.update(dt, p, { shake: s.cameraShake || 'low' });
    this._syncVisuals(dt, false);
    this._updateHud();
  }

  _collideTraffic(p) {
    for (const t of this.traffic.cars) {
      if (!t.active) continue;
      const dx = t.visual ? t.visual.position.x - p.pos.x : 0;
      const dz = t.visual ? t.visual.position.z - p.pos.z : 0;
      // use track-space distance (cheap, no visual dependency issues)
      let ds = t.s - p.s;
      const L = this.track.length;
      if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
      if (Math.abs(ds) > 6 || Math.abs(t.d - p.d) > 3.1) continue;
      const ddx = dx, ddz = dz;
      const dist = Math.hypot(ddx, ddz);
      const minD = 2.6 + t.type.len / 4;
      if (dist < minD && dist > 1e-3) {
        const nx = ddx / dist, nz = ddz / dist;
        const closing = (p.vel.x - 0) * nx + (p.vel.z - 0) * nz;
        p.pos.x -= nx * (minD - dist) * 0.8;
        p.pos.z -= nz * (minD - dist) * 0.8;
        if (closing > 3) {
          p.vel.x -= nx * closing * 0.7;
          p.vel.z -= nz * closing * 0.7;
          p.speed *= 1 - clamp(closing / 110, 0.05, 0.3);
          p.events.push({ t: 'collide', mag: closing });
          t.speed *= 0.75;
        }
      }
    }
  }

  _drainEvents(v, _skip) {
    const isP = v === this.player;
    for (const e of v.events) {
      if (e.t === 'wall' || e.t === 'collide') {
        const mag = e.mag || 10;
        this.audio.collide(mag);
        if (this.particles) this.particles.sparks(v.pos.x, v.pos.y + 0.8, v.pos.z, Math.min(22, 6 + mag * 0.35));
        if (isP) {
          if (this.chase) this.chase.addTrauma(clamp(mag / 70, 0.15, 0.65));
          if (this.input) this.input.rumble(clamp(mag / 60, 0.2, 1), 160);
        }
      } else if (e.t === 'jump') {
        this.audio.jump();
        if (isP) this.msg('JUMP!');
      } else if (e.t === 'land') {
        this.audio.land();
        if (this.particles) this.particles.dust(v.pos.x, v.pos.y + 0.2, v.pos.z, 8);
        if (isP) {
          if (this.chase) this.chase.addTrauma(clamp(e.air * 0.35, 0.1, 0.5));
          if (this.input) this.input.rumble(0.5, 120);
          v.nitro = Math.min(1, v.nitro + 0.1);
        }
      } else if (e.t === 'reset') {
        if (isP) this.msg('RESET');
      }
    }
    v.events.length = 0;
  }

  _continuousFx(dt) {
    const p = this.player;
    if (!this.particles) return;
    const P = this.particles;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    // nitro flames
    if (p.nitroActive) {
      const bx = p.pos.x - fx * 2.3, bz = p.pos.z - fz * 2.3;
      P.flame(bx - fz * 0.45, p.pos.y + 0.55, bz + fx * 0.45, -fx, -fz);
      P.flame(bx + fz * 0.45, p.pos.y + 0.55, bz - fx * 0.45, -fx, -fz);
    }
    // drift smoke
    if (p.drift > 0.45 && p.airT <= 0 && Math.abs(p.speed) > 12) {
      P.smoke(p.pos.x - fx * 1.6, p.pos.y + 0.25, p.pos.z - fz * 1.6, 2, 0.5);
      p.nitro = Math.min(1, p.nitro + dt * 0.022); // clean drifting earns nitro
    }
    // off-road dust
    if (p.offroad && Math.abs(p.speed) > 8) {
      P.dust(p.pos.x, p.pos.y + 0.2, p.pos.z, 2);
      if (this.input && Math.random() < 0.25) this.input.rumble(0.18, 60);
    }
    // speed streaks
    const spd01 = Math.abs(p.speed) / p.def.stats.topSpeed;
    if (spd01 > 0.72 && Math.random() < (spd01 - 0.7) * 6) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 7;
      P.streak(
        p.pos.x + Math.cos(a) * r, p.pos.y + 1 + Math.random() * 2.5, p.pos.z + Math.sin(a) * r,
        -fx * p.speed * 0.55, 0, -fz * p.speed * 0.55
      );
    }
  }

  _nearMiss(dt) {
    const p = this.player, L = this.track.length;
    for (const t of this.traffic.cars) {
      if (!t.active) continue;
      let ds = t.s - p.s;
      if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
      if (ds > 40 || ds < -40) { t.passFlag = 0; continue; }
      if (t.passFlag) continue;
      if (ds < 3 && ds > -9) {
        const gap = Math.abs(p.d - t.d) - 1.9;
        const closing = p.speed - t.speed;
        if (gap > 0.1 && gap < 1.7 && closing > 8 && p.speed > 35) {
          t.passFlag = 1;
          const score = Math.round((1.7 - gap) * 130 + p.speed * 1.1);
          this.stats.nearMisses++;
          this.stats.nearScore += score;
          p.nitro = Math.min(1, p.nitro + 0.12);
          this.msg('NEAR MISS', `+${score}`, 'pink');
          this.audio.nearMiss();
        }
      }
    }
  }

  _overtake() {
    const p = this.player;
    const pProg = p.raceS;
    this.vehicles.forEach((v, i) => {
      if (i === 0) return;
      const rel = pProg - v.raceS;
      if (this._prevRel[i] < 0 && rel >= 0 && !v.finished) {
        this.stats.overtakes++;
        p.nitro = Math.min(1, p.nitro + 0.08);
        this.msg('OVERTAKE', v.name, '');
        this.audio.overtake();
      }
      this._prevRel[i] = rel;
    });
  }

  _raceLogic(dt) {
    const p = this.player, L = this.track.length;
    // checkpoints (once each per lap)
    const lapBase = p.lap * L;
    for (let i = p.lastCp + 1; i < this.track.checkpoints.length; i++) {
      const cpAbs = lapBase + this.track.checkpoints[i];
      if (p.raceS >= cpAbs) {
        p.lastCp = i;
        p.nitro = Math.min(1, p.nitro + 0.2);
        this.msg('CHECKPOINT', '+ nitro');
        this.audio.checkpoint();
      } else break;
    }
    // laps
    const newLap = Math.floor(p.raceS / L);
    if (newLap > p.lap) {
      p.lap = newLap;
      const lapT = this.raceT - p.lapStartT;
      p.lapTimes.push(lapT);
      p.lapStartT = this.raceT;
      p.lastCp = -1;
      if (!this.hud.bestLap || lapT < this.hud.bestLap) this.hud.bestLap = lapT;
      this.hud.lastLap = lapT;
      if (this.mode.solo) this.msg(`LAP ${newLap + 1}`, `lap ${fmtLap(lapT)}`);
      else if (newLap === this.laps - 1 && this.laps > 1) this.msg('FINAL LAP', '', 'pink');
      this.audio.checkpoint();
    }
    // AI laps / finish
    for (let i = 1; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const vl = Math.floor(v.raceS / L);
      if (vl > v.lap) { v.lap = vl; v.lapTimes.push(this.raceT - v.lapStartT); v.lapStartT = this.raceT; }
      if (!v.finished) {
        if (this.mode.sprint && v.raceS >= this.track.sprintFinishS) { v.finished = true; v.finishT = this.raceT; }
        else if (!this.mode.sprint && v.lap >= this.laps) { v.finished = true; v.finishT = this.raceT; }
      }
    }
    // player finish
    if (!p.finished) {
      let done = false;
      if (this.mode.sprint) done = p.raceS >= this.track.sprintFinishS;
      else done = p.lap >= this.laps;
      if (done) {
        p.finished = true; p.finishT = this.raceT;
        this._finishRace();
      }
    }
  }

  _positions() {
    const order = [...this.vehicles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishT - b.finishT;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceS - a.raceS;
    });
    order.forEach((v, i) => { v._pos = i + 1; });
    this.hud.pos = this.player._pos;
  }

  _finishRace() {
    const p = this.player;
    this.state = 'finished';
    this.finishT = 0;
    const pos = p._pos || 1;
    const total = Math.max(0, p.raceS) / 1000;
    const bestLap = p.lapTimes.length ? Math.min(...p.lapTimes) : this.raceT;
    this.results = {
      position: pos,
      total: this.vehicles.length,
      timeMs: this.mode.solo && p.lapTimes.length ? null : this.raceT * 1000,
      bestLapMs: bestLap * 1000,
      topSpeedKmh: Math.round(p.topSpeed * 3.6),
      nearMisses: this.stats.nearMisses,
      nearScore: this.stats.nearScore,
      nitroUsed: Math.round(p.nitroUsed * 10) / 10,
      overtakes: this.stats.overtakes,
      won: pos === 1,
      mode: this.mode.id,
    };
    this.audio.fanfare(pos === 1);
    this.audio.music(false);
    if (this.chase) this.chase.addTrauma(0.25);
  }

  _updateFinished(dt) {
    this.finishT += dt;
    // let the world roll on gently behind the results screen
    const p = this.player;
    stepVehicle(p, { steer: 0, accelerate: 0.15, brake: 0, handbrake: false, nitro: false }, dt, { track: this.track, draft: 0 });
    for (let i = 1; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.finished) stepAI(v, dt, { track: this.track, difficulty: this.difficulty, vehicles: this.vehicles, traffic: this.traffic, player: p, solo: this.mode.solo });
      else stepVehicle(v, { steer: 0, accelerate: 0.15, brake: 0, handbrake: false, nitro: false }, dt, { track: this.track, draft: 0 });
    }
    this._drainEvents(p);
    if (this.chase) {
      this._orbitA = (this._orbitA || 0) + dt * 0.4;
      const pp = p.pos;
      this.chase.cam.position.set(pp.x + Math.sin(this._orbitA) * 11, pp.y + 3.6, pp.z + Math.cos(this._orbitA) * 11);
      this.chase.cam.lookAt(pp.x, pp.y + 1, pp.z);
    }
    this._syncVisuals(dt, false);
    this._updateHud();
    if (this.finishT > 2.6 && !this._finishSent) {
      this._finishSent = true;
      if (this.cb.onFinish) this.cb.onFinish(this.results);
    }
  }

  _updateHud() {
    const p = this.player, h = this.hud;
    h.speedKmh = Math.round(Math.abs(p.speed) * 3.6);
    const g = Math.abs(p.speed) < 1 ? 'N' : p.speed < -1 ? 'R' : String(Math.min(6, 1 + Math.floor((Math.abs(p.speed) / p.def.stats.topSpeed) * 5.99)));
    h.gear = g;
    h.nitro = p.nitro;
    h.nitroActive = p.nitroActive;
    h.timeMs = this.raceT * 1000;
    h.lap = Math.min(this.laps, p.lap + 1);
    h.wrongWay = p.wrongWayT > 1.2;
    h.slip = this._wasSlip;
    h.drift = p.drift > 0.45;
    h.offroad = p.offroad;
    h.air = p.airT > 0;
    if (this.mode.sprint) h.sprintToGo = Math.max(0, this.track.sprintFinishS - p.raceS);
  }

  _syncVisuals(dt, grid) {
    if (!this.visuals) return;
    // cars
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i], cv = this.carVisuals[i];
      cv.group.position.copy(v.pos);
      cv.group.rotation.y = v.heading;
      // subtle body roll / pitch
      cv.tilt.rotation.z = clamp(-v.steerVis * Math.abs(v.speed) * 0.004, -0.09, 0.09);
      cv.tilt.rotation.x = clamp(v.airT > 0 ? -v.vy * 0.02 : (v._lastSpeed != null ? (v._lastSpeed - v.speed) * 0.004 : 0), -0.06, 0.08);
      v._lastSpeed = v.speed;
      for (const w of cv.wheels) w.rotation.x = v.wheelSpin;
      cv.wheelFL.rotation.y = cv.wheelFR.rotation.y = v.steerVis * 0.45;
      const braking = !this.playerAI && this.input ? this.input.brake > 0.1 : false;
      cv.brakeMat.emissiveIntensity = (v === this.player && braking) || v.speed < -0.5 ? 3.2 : (this.track.def.env === 'neon' ? 1.2 : 0.7);
      const fl = v.nitroActive;
      cv.flameL.visible = cv.flameR.visible = fl;
      if (fl) {
        const s = 0.8 + Math.random() * 0.7;
        cv.flameL.scale.set(s, s, 1.4 + Math.random());
        cv.flameR.scale.set(s, s, 1.4 + Math.random());
      }
    }
    // traffic
    const fr = this._fr || (this._fr = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() });
    for (const t of this.traffic.cars) {
      const g = t.visual;
      if (!g) continue;
      g.visible = t.active;
      if (!t.active) continue;
      this.track.frameAt(t.s, fr);
      g.position.copy(fr.pos).addScaledVector(fr.side, t.d);
      g.position.y = fr.pos.y;
      g.rotation.y = Math.atan2(fr.tan.x, fr.tan.z);
    }
  }

  dispose() {
    holder.session = null;
    if (this.particles && this.scene) this.particles.dispose(this.scene);
    if (this.env) this.env.dispose();
    this.audio.suspend();
    this.state = 'idle';
  }
}

function fmtLap(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
