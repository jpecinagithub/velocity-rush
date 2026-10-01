// Civilian traffic: pooled, lane-following, lane-changing, despawning outside
// the player's active zone and respawning ahead. No per-frame allocation.
import { TRAFFIC_TYPES } from './constants.js';
import { clamp, lerp, wrapS } from './utils.js';

export class TrafficManager {
  constructor(track, count, seed = 1234) {
    this.track = track;
    this.cars = [];
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this._rnd = rnd;
    const half = track.roadHalf;
    this.lanes = [-0.62, -0.21, 0.21, 0.62].map((f) => f * half);
    for (let i = 0; i < count; i++) {
      const type = TRAFFIC_TYPES[Math.floor(rnd() * TRAFFIC_TYPES.length)];
      const lane = Math.floor(rnd() * this.lanes.length);
      this.cars.push({
        type,
        color: type.colors[Math.floor(rnd() * type.colors.length)],
        s: rnd() * track.length,
        d: this.lanes[lane],
        targetD: this.lanes[lane],
        speed: lerp(type.speed[0], type.speed[1], rnd()),
        cruise: 0,
        laneT: 3 + rnd() * 7,
        active: true,
        passFlag: 0, // near-miss bookkeeping vs player
        visual: null,
      });
      const c = this.cars[i];
      c.cruise = c.speed;
    }
  }
  reset(playerS) {
    const L = this.track.length;
    for (const c of this.cars) {
      c.s = wrapS(playerS + 120 + this._rnd() * 500, L);
      const lane = Math.floor(this._rnd() * this.lanes.length);
      c.d = this.lanes[lane]; c.targetD = c.d;
      c.speed = lerp(c.type.speed[0], c.type.speed[1], this._rnd());
      c.cruise = c.speed;
      c.passFlag = 0;
      c.active = true;
    }
  }
  laneFree(laneD, s, ignore, margin = 26) {
    const L = this.track.length;
    for (const o of this.cars) {
      if (o === ignore || !o.active) continue;
      let ds = Math.abs(o.s - s);
      ds = Math.min(ds, L - ds);
      if (ds < margin && Math.abs(o.d - laneD) < 2.6) return false;
    }
    return true;
  }
  update(dt, playerS, speedMul = 1) {
    const L = this.track.length;
    for (const c of this.cars) {
      // active zone around player; recycle behind -> ahead
      let ds = c.s - playerS;
      if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
      if (ds < -160) {
        c.s = wrapS(playerS + 420 + this._rnd() * 260, L);
        const lane = Math.floor(this._rnd() * this.lanes.length);
        c.d = this.lanes[lane]; c.targetD = c.d;
        c.speed = lerp(c.type.speed[0], c.type.speed[1], this._rnd()) * speedMul;
        c.cruise = c.speed;
        c.passFlag = 0;
        ds = c.s - playerS;
        if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
      }
      c.active = ds > -170 && ds < 640;
      if (!c.active) continue;

      // car-following: slow for slower traffic ahead in the same lane
      let want = c.cruise * speedMul;
      for (const o of this.cars) {
        if (o === c || !o.active) continue;
        let ods = o.s - c.s;
        if (ods < -L / 2) ods += L; else if (ods > L / 2) ods -= L;
        if (ods > 4 && ods < 34 && Math.abs(o.d - c.d) < 2.4 && o.speed < want) {
          want = Math.min(want, o.speed * 0.94);
        }
      }
      c.speed += clamp(want - c.speed, -14 * dt, 6 * dt);
      c.s = wrapS(c.s + c.speed * dt, L);

      // occasional safe lane change
      c.laneT -= dt;
      if (c.laneT <= 0) {
        c.laneT = 5 + this._rnd() * 8;
        const lane = Math.floor(this._rnd() * this.lanes.length);
        const ld = this.lanes[lane];
        if (Math.abs(ld - c.targetD) > 0.5 && this.laneFree(ld, c.s, c)) c.targetD = ld;
      }
      c.d += clamp(c.targetD - c.d, -2.2 * dt, 2.2 * dt);
    }
  }
}
