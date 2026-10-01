// Arcade vehicle physics — planted but drifty, no simulation pretensions.
// One code path for player, AI and (simplified) traffic-adjacent interactions.
import * as THREE from 'three';
import { clamp, lerp, wrapS } from './utils.js';

export function createVehicle(carDef, opts = {}) {
  const top = carDef.stats.topSpeed;
  const c1 = Math.max(0.05, (carDef.stats.accel - 0.0016 * top * top) / top);
  return {
    def: carDef,
    isPlayer: !!opts.isPlayer,
    name: opts.name || carDef.name,
    color: opts.color ?? carDef.color,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    heading: 0,
    speed: 0,            // signed forward speed m/s
    steerVis: 0,
    wheelSpin: 0,
    s: 0, d: 0, roadY: 0,
    raceS: 0,            // unwrapped progress for lap/position logic
    prevS: 0,
    nitro: 1, nitroActive: false, nitroUsed: 0,
    slip: 0, slipBoostT: 0,
    airT: 0, vy: 0,
    offroad: false,
    drift: 0,
    stuckT: 0, wrongWayT: 0, wallCd: 0, wallGrind: false,
    lap: 0, lapStartT: 0, lapTimes: [], lastCp: -1,
    topSpeed: 0,
    events: [],
    resetCd: 0,
    dragC1: c1,
    finished: false, finishT: 0,
    ai: null,            // filled for AI drivers
  };
}

const _fwd = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _frame = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };

export function placeOnTrack(v, track, s, d, heading = null) {
  track.frameAt(s, _frame);
  v.s = wrapS(s, track.length);
  v.d = d;
  v.pos.copy(_frame.pos).addScaledVector(_frame.side, d);
  v.pos.y = _frame.pos.y;
  v.roadY = _frame.pos.y;
  v.heading = heading == null ? Math.atan2(_frame.tan.x, _frame.tan.z) : heading;
  v.vel.set(0, 0, 0);
  v.speed = 0;
  v.airT = 0; v.vy = 0;
  v.raceS = s; v.prevS = s;
  v.stuckT = 0;
}

export function resetVehicle(v, track) {
  if (v.resetCd > 0) return;
  v.resetCd = 1.0;
  // re-place on the road keeping race progress (raceS/lap must survive)
  const rs = v.raceS;
  placeOnTrack(v, track, v.s, 0);
  v.raceS = rs; v.prevS = v.s;
  v.events.push({ t: 'reset' });
}

function fwdVec(heading, out) {
  out.set(Math.sin(heading), 0, Math.cos(heading));
  return out;
}

// inp: {steer(-1..1), accelerate(0..1), brake(0..1), handbrake(bool), nitro(bool), locked(bool)}
// ctx: {track, draft (0..1 slipstream strength), time}
// Returns nothing; drains into v.events.
export function stepVehicle(v, inp, dt, ctx) {
  const track = ctx.track;
  const st = v.def.stats;
  if (v.resetCd > 0) v.resetCd -= dt;
  if (v.finished) { // coast after finish
    inp = { steer: 0, accelerate: 0.25, brake: 0, handbrake: false, nitro: false };
  }
  const locked = inp.locked;
  const steerIn = locked ? 0 : inp.steer;
  const accelIn = locked ? 0 : inp.accelerate;
  const brakeIn = locked ? 0 : inp.brake;
  const handbrake = !locked && inp.handbrake;

  fwdVec(v.heading, _fwd);
  let fSpeed = v.vel.dot(_fwd); // signed forward speed

  // --- steering (less aggressive at very high speed) ---
  const topEff = st.topSpeed * (v.nitroActive ? 1.14 : 1);
  const spd01 = clamp(Math.abs(fSpeed) / st.topSpeed, 0, 1.4);
  const steerAuthority = (0.021 * st.handling) / (1 + Math.pow(spd01, 2) * 0.85);
  const yawRate = steerIn * steerAuthority * fSpeed * (handbrake ? 1.55 : 1) * (v.airT > 0 ? 0.35 : 1);
  v.heading += yawRate * dt;
  v.steerVis += clamp(steerIn - v.steerVis, -8 * dt, 8 * dt);

  // --- longitudinal ---
  const nitroOn = !locked && inp.nitro && v.nitro > 0.12 && fSpeed > 4;
  v.nitroActive = nitroOn;
  let a = accelIn * st.accel;
  if (nitroOn) {
    a += 17 * st.nitro;
    v.nitro = Math.max(0, v.nitro - 0.30 * dt);
    v.nitroUsed += dt;
  }
  if (v.slipBoostT > 0) { a += 9; v.slipBoostT -= dt; }
  // drag (slipstream reduces it)
  const dragMul = 1 - 0.22 * (ctx.draft || 0);
  a -= (v.dragC1 * fSpeed + 0.0016 * fSpeed * Math.abs(fSpeed)) * dragMul;
  // brake / reverse
  if (brakeIn > 0) {
    if (fSpeed > 1) a -= brakeIn * st.braking;
    else a -= brakeIn * 14; // reverse
  }
  if (!locked && v.offroad) a -= fSpeed * 1.15; // off-road slowdown
  a -= Math.sign(fSpeed) * 0.6; // rolling resistance

  fSpeed += a * dt;
  const maxRev = -16;
  const vmax = topEff * (v.offroad ? 0.55 : 1);
  fSpeed = clamp(fSpeed, maxRev, vmax + 6);

  // --- lateral grip (handbrake => drift) ---
  fwdVec(v.heading, _fwd);
  _lat.copy(v.vel).addScaledVector(_fwd, -v.vel.dot(_fwd));
  const grip = v.airT > 0 ? 0 : handbrake ? 2.1 : v.offroad ? 4.2 : 7.5;
  _lat.multiplyScalar(Math.exp(-grip * dt));
  v.vel.copy(_fwd).multiplyScalar(fSpeed).add(_lat);
  v.pos.addScaledVector(v.vel, dt);
  v.speed = fSpeed;
  v.topSpeed = Math.max(v.topSpeed, Math.abs(fSpeed));
  v.drift = clamp(Math.abs(_lat.length()) / 12, 0, 1) * (handbrake || Math.abs(steerIn) > 0.7 ? 1 : 0.4);
  v.wheelSpin += (fSpeed / 0.35) * dt;

  // --- track projection ---
  const proj = track.project(v.pos.x, v.pos.y, v.pos.z, v.s);
  v.prevS = v.s;
  // handle wrap for raceS continuity
  let ds = proj.s - v.prevS;
  const L = track.length;
  if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
  v.s = proj.s;
  v.raceS += ds;
  v.d = proj.d;
  v.roadY = proj.roadY;
  if (ds < -0.5) v.wrongWayT += dt; else if (ds > 0.5) v.wrongWayT = Math.max(0, v.wrongWayT - dt * 2);
  const half = track.roadHalf;

  // --- jumps / airborne ---
  if (v.airT <= 0) {
    for (const jz of track.jumpZones) {
      const crossed = v.prevS < jz.kicker && proj.s >= jz.kicker && ds > 0 && ds < 50;
      if (crossed && fSpeed > 18) {
        v.vy = 3.2 + fSpeed * 0.055;
        v.airT = 0.001;
        v.events.push({ t: 'jump' });
        break;
      }
    }
    if (v.airT <= 0) v.pos.y = proj.roadY; // glued
  }
  if (v.airT > 0) {
    v.vy -= 24 * dt;
    v.pos.y += v.vy * dt;
    v.airT += dt;
    if (v.pos.y <= proj.roadY && v.vy < 0) {
      v.pos.y = proj.roadY;
      const air = v.airT;
      v.airT = 0; v.vy = 0;
      v.events.push({ t: 'land', air });
    }
  }

  // --- off-road + walls ---
  const wasOff = v.offroad;
  v.offroad = Math.abs(v.d) > half && v.airT <= 0;
  if (v.offroad && !wasOff) v.events.push({ t: 'offroad', on: true });
  if (!v.offroad && wasOff) v.events.push({ t: 'offroad', on: false });

  const wallD = half + 2.4;
  const inWall = Math.abs(v.d) > wallD && v.airT <= 0;
  if (inWall) {
    const sign = Math.sign(v.d);
    track.frameAt(v.s, _frame);
    v.pos.copy(_frame.pos).addScaledVector(_frame.side, sign * wallD);
    v.pos.y = _frame.pos.y;
    // lateral velocity into the wall only — scraping must not kill forward speed
    fwdVec(v.heading, _fwd);
    const vn = v.vel.dot(_frame.side) * sign; // >0 = moving into the wall
    if (vn > 0) {
      v.vel.addScaledVector(_frame.side, -sign * vn * 1.35);
      const impact = Math.abs(vn);
      const fresh = !v.wallGrind;
      v.wallGrind = true;
      // heavy scrub on the initial hit; light friction while grinding
      const scrub = fresh ? clamp(impact / 60, 0.03, 0.35) : 0.006;
      const ns = fSpeed * (1 - scrub);
      v.vel.copy(_fwd).multiplyScalar(ns).add(_lat.multiplyScalar(0.25));
      v.speed = ns;
      // nudge heading back toward the road direction so the car can escape
      const tanH = Math.atan2(_frame.tan.x, _frame.tan.z);
      let dh = tanH - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.heading += clamp(dh, -1, 1) * Math.min(0.9, impact * 0.02 + (fresh ? 0 : 0.25)) * dt * 8;
      if (fresh && impact > 3.5 && v.wallCd <= 0) {
        v.events.push({ t: 'wall', mag: impact });
        v.wallCd = 0.35;
      }
    }
    v.d = sign * wallD;
  } else {
    v.wallGrind = false;
  }
  if (v.wallCd > 0) v.wallCd -= dt;

  // --- stuck detection / auto reset ---
  if (Math.abs(fSpeed) < 0.7 && accelIn > 0.3 && !locked) v.stuckT += dt;
  else v.stuckT = Math.max(0, v.stuckT - dt);
  if (v.stuckT > 3.2) { resetVehicle(v, track); }
}

// Circle-ish car-vs-car collision. Light = pushed more. Never explodes.
const _delta = new THREE.Vector3();
export function collideVehicles(a, b) {
  _delta.subVectors(b.pos, a.pos); _delta.y = 0;
  const dist = _delta.length();
  const minD = 4.3;
  if (dist >= minD || dist < 1e-4) return;
  _delta.multiplyScalar(1 / dist);
  const overlap = minD - dist;
  const wa = a.def.stats.weight, wb = b.def.stats.weight;
  const tot = wa + wb;
  a.pos.addScaledVector(_delta, -overlap * (wb / tot));
  b.pos.addScaledVector(_delta, overlap * (wa / tot));
  // closing speed along normal
  const closing = _delta.x * (a.vel.x - b.vel.x) + _delta.z * (a.vel.z - b.vel.z);
  if (closing > 2) {
    const imp = closing * 0.45;
    a.vel.addScaledVector(_delta, -imp * (wb / tot) * 2);
    b.vel.addScaledVector(_delta, imp * (wa / tot) * 2);
    // scrub speed
    a.speed *= 1 - clamp(closing / 120, 0.03, 0.22);
    b.speed *= 1 - clamp(closing / 120, 0.03, 0.22);
    // re-derive vel from speed along heading + keep some lateral
    const mag = closing;
    a.events.push({ t: 'collide', mag });
    b.events.push({ t: 'collide', mag });
  }
}
