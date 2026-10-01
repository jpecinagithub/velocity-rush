// Small math / random helpers. No per-frame allocation by callers' convention.
export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
// Frame-rate independent exponential smoothing. rate ~ how snappy.
export function damp(current, target, rate, dt) {
  if (dt <= 0) return current;
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}
export function dampAngle(current, target, rate, dt) {
  let d = (target - current) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return current + d * (1 - Math.exp(-rate * dt));
}
export function wrapS(s, length) {
  s %= length;
  if (s < 0) s += length;
  return s;
}
// Seeded PRNG (mulberry32) for deterministic track decoration.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}
