// AI racing drivers: racing line, corner braking, overtakes, traffic
// avoidance, mistakes, and mild (non-teleporting) adaptive balancing.
import * as THREE from 'three';
import { clamp, lerp, wrapS } from './utils.js';
import { stepVehicle } from './physics.js';

const _f1 = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
const _f2 = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };

function signedCurve(track, s) {
  track.frameAt(s, _f1); track.frameAt(s + 14, _f2);
  const h1 = Math.atan2(_f1.tan.x, _f1.tan.z);
  const h2 = Math.atan2(_f2.tan.x, _f2.tan.z);
  let dh = h2 - h1;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return dh / 14; // signed curvature-ish
}

export function createAIDriver(difficulty, seed = 1) {
  return {
    seed,
    mistakeT: 4 + Math.random() * 8,
    mistakeD: 0,
    mistakeDur: 0,
    desiredD: 0,
    wobble: Math.random() * 10,
  };
}

const _target = new THREE.Vector3();

export function stepAI(v, dt, ctx) {
  const { track, difficulty, vehicles, traffic, player } = ctx;
  const ai = v.ai;
  const st = v.def.stats;
  const L = track.length;

  // --- target speed from curvature ahead ---
  const look = 20 + Math.abs(v.speed) * 0.55;
  const cAhead = Math.abs(signedCurve(track, v.s + look * 0.5)) + track.curvatureAt(v.s + look) * 0.5;
  const latA = (difficulty.id === 'easy' ? 15 : difficulty.id === 'normal' ? 23 : 31) * difficulty.aiGrip;
  let target = Math.sqrt(latA / Math.max(cAhead, 1e-4));
  target = Math.min(target, st.topSpeed * difficulty.aiTop);

  // mild adaptive balancing (no teleporting, no impossible speed)
  if (player && !ctx.solo) {
    const gap = player.raceS - v.raceS;
    if (gap > 130) target *= 1.06;
    else if (gap < -160) target *= 0.96;
  }

  // --- racing line: aim for the inside of the upcoming corner ---
  const dh = signedCurve(track, v.s + 26);
  const laneMax = track.roadHalf - 2.2;
  let desiredD = clamp(Math.sign(dh) * 3.4, -laneMax, laneMax);

  // --- mistakes: occasional wobble off the ideal line ---
  ai.mistakeT -= dt;
  if (ai.mistakeT <= 0) {
    ai.mistakeT = 5 + Math.random() * 12;
    ai.mistakeDur = 0.8 + Math.random() * 1.2;
    ai.mistakeD = (Math.random() - 0.5) * 2 * difficulty.aiError * 90;
  }
  if (ai.mistakeDur > 0) { ai.mistakeDur -= dt; desiredD += ai.mistakeD; }
  ai.wobble += dt * 2;
  desiredD += Math.sin(ai.wobble) * difficulty.aiError * 22;
  ai.desiredD = clamp(desiredD, -laneMax, laneMax);

  // --- obstacle avoidance (racers + traffic) ---
  let avoidD = 0, brakeFor = null;
  const consider = (os, od, oSpeed, oLen) => {
    let ds = os - v.s;
    if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
    if (ds > 3 && ds < 42 && Math.abs(od - v.d) < 3.4) {
      const side = v.d >= od ? 1 : -1;
      const shift = side * 4.2 * difficulty.aiAggr;
      if (Math.abs(shift) > Math.abs(avoidD)) avoidD = shift;
      if (ds < 20 && oSpeed < v.speed) brakeFor = oSpeed;
    }
  };
  for (const o of vehicles) {
    if (o === v || o.finished) continue;
    consider(o.s, o.d, o.speed, 4.4);
  }
  if (traffic) {
    for (const t of traffic.cars) {
      if (!t.active) continue;
      consider(t.s, t.d, t.speed, t.type.len);
    }
  }
  const finalD = clamp(ai.desiredD + avoidD, -laneMax, laneMax);

  // --- steering toward target point ---
  track.frameAt(v.s + 13, _f1);
  _target.copy(_f1.pos).addScaledVector(_f1.side, finalD);
  _target.sub(v.pos); _target.y = 0;
  const dist = _target.length();
  let steer = 0;
  if (dist > 0.5) {
    _target.multiplyScalar(1 / dist);
    const ang = Math.atan2(_target.x, _target.z);
    let diff = ang - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    steer = clamp(diff * 2.6, -1, 1);
  }

  // --- throttle / brake ---
  let accel = 0, brake = 0;
  if (brakeFor != null && v.speed > brakeFor + 2) {
    brake = clamp((v.speed - brakeFor) / 12, 0.3, 1);
  } else if (v.speed < target) {
    accel = 1;
  } else {
    brake = clamp((v.speed - target) / 18, 0, 1);
    if (v.speed < target + 3) accel = 0.35;
  }
  const nitro = v.nitro > 0.45 && cAhead < 0.004 && v.speed > 30 && Math.random() < 0.9;

  stepVehicle(v, { steer, accelerate: accel, brake, handbrake: false, nitro }, dt, { track, draft: 0 });
}
