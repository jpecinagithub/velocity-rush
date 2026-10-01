// Modular road system + spline track queries.
// Tracks are composed from reusable segment modules (straight, curve,
// tunnel, bridge, jump, chicane). Closed loops are corrected so the seam
// is invisible; everything else samples an arc-length parameterized spline.
import * as THREE from 'three';
import { clamp, wrapS } from './utils.js';

// ---- module DSL ----
export const S = (len, opts = {}) => ({ t: 's', len, ...opts });
export const C = (r, deg, dir = 1) => ({ t: 'c', r, deg, dir });
export const TUN = (len) => ({ t: 's', len, tunnel: true });
export const BRU = (len, dy) => ({ t: 's', len, dy, bridge: true });
export const BRD = (len, dy) => ({ t: 's', len, dy: -dy, bridge: true });
export const JUMP = () => ({ t: 'jump', len: 70 });
export const CHIC = (r, deg) => ({ t: 'chicane', r, deg });
export const CHL = (r, deg) => 2 * r * Math.sin((deg * Math.PI) / 180); // longitudinal length of an S-chicane

function expandModules(modules) {
  const out = [];
  for (const m of modules) {
    if (m.t === 'chicane') out.push({ t: 'c', r: m.r, deg: m.deg, dir: 1 }, { t: 'c', r: m.r, deg: m.deg, dir: -1 });
    else out.push(m);
  }
  return out;
}

function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function walkModules(modules) {
  const pts = [];
  const flags = [];
  const jumpZones = [];
  let x = 0, y = 0, z = 0, h = 0, sAcc = 0;
  const STEP = 6;
  const push = (fl) => { pts.push(new THREE.Vector3(x, y, z)); flags.push(fl); };
  push({ tunnel: false, bridge: false, jump: false });
  for (const m of expandModules(modules)) {
    const fl = { tunnel: !!m.tunnel, bridge: !!m.bridge, jump: m.t === 'jump' };
    if (m.t === 's' || m.t === 'jump') {
      const n = Math.max(1, Math.round(m.len / STEP));
      const dy = (m.dy || 0) / n;
      const yStart = y;
      const s0 = sAcc;
      for (let i = 0; i < n; i++) {
        const stepLen = m.len / n;
        x += Math.sin(h) * stepLen; z += Math.cos(h) * stepLen;
        if (m.t === 'jump') {
          const t = (i + 1) / n;
          y = yStart + 2.8 * Math.sin(Math.PI * Math.min(t / 0.8, 1)); // kicker ramp, net zero
        } else y += dy;
        sAcc += stepLen;
        push(fl);
      }
      if (m.t === 'jump') jumpZones.push({ s0, kicker: s0 + m.len * 0.35, s1: s0 + m.len });
    } else if (m.t === 'c') {
      const rad = (m.deg * Math.PI) / 180;
      const arcLen = Math.abs(m.r * rad);
      const n = Math.max(2, Math.round(arcLen / STEP));
      const dh = m.dir * rad / n, seg = arcLen / n, dy = (m.dy || 0) / n;
      for (let i = 0; i < n; i++) {
        h += dh;
        x += Math.sin(h) * seg; z += Math.cos(h) * seg; y += dy;
        sAcc += seg;
        push(fl);
      }
    }
  }
  // Seam correction for closed loops: absorb any residual gap over the last 18% of points.
  const M = pts.length;
  const gap = new THREE.Vector3().subVectors(pts[0], pts[M - 1]);
  const gapLen = gap.length();
  if (gapLen > 0.001) {
    const start = Math.floor(M * 0.82);
    for (let i = start; i < M; i++) {
      const w = smooth01((i - start) / (M - 1 - start));
      pts[i].addScaledVector(gap, w);
    }
  }
  return { pts, flags, jumpZones, seamGap: gapLen };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Track {
  constructor(def) {
    this.def = def;
    const { pts, flags, jumpZones, seamGap } = walkModules(def.modules);
    this.seamGap = seamGap;
    this.jumpZones = jumpZones;
    this.roadHalf = (def.roadWidth || 15) / 2;

    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
    const N = (this.N = 2048);
    const spaced = this.curve.getSpacedPoints(N); // N+1 points, arc-length uniform
    this.px = new Float32Array(N + 1); this.py = new Float32Array(N + 1); this.pz = new Float32Array(N + 1);
    this.tx = new Float32Array(N + 1); this.ty = new Float32Array(N + 1); this.tz = new Float32Array(N + 1);
    this.curv = new Float32Array(N + 1);
    this.tunnel = new Uint8Array(N + 1);
    this.bridge = new Uint8Array(N + 1);
    const M = pts.length;
    for (let i = 0; i <= N; i++) {
      const p = spaced[i];
      this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
      const fl = flags[Math.min(M - 1, Math.round((i / N) * (M - 1)))];
      this.tunnel[i] = fl.tunnel ? 1 : 0;
      this.bridge[i] = fl.bridge ? 1 : 0;
    }
    // tangents via central differences, curvature from tangent swing
    for (let i = 0; i <= N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
      _v1.set(this.px[b] - this.px[a], this.py[b] - this.py[a], this.pz[b] - this.pz[a]).normalize();
      this.tx[i] = _v1.x; this.ty[i] = _v1.y; this.tz[i] = _v1.z;
    }
    for (let i = 0; i <= N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N, i + 2);
      const dot = clamp(this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b], -1, 1);
      const ang = Math.acos(dot);
      const ds = Math.max(1e-3, ((b - a) / N) * this.length);
      this.curv[i] = ang / ds;
    }

    // checkpoints every ~450 m
    this.checkpoints = [];
    for (let s = 250; s < this.length - 100; s += 450) this.checkpoints.push(s);

    // sprint finish: snap target fraction to a low-curvature, non-tunnel spot
    const target = (def.sprintFrac || 0.72) * this.length;
    let best = target, bestScore = 1e9;
    for (let s = target - 220; s <= target + 220; s += 4) {
      const sw = wrapS(s, this.length);
      const i = Math.round((sw / this.length) * N);
      const score = this.curv[i] * 4000 + (this.tunnel[i] ? 10 : 0) + Math.abs(s - target) / 220;
      if (score < bestScore) { bestScore = score; best = sw; }
    }
    this.sprintFinishS = best;
  }

  // Frame at distance s. out: {pos, tan, side} as THREE.Vector3 (reused by caller).
  frameAt(s, out) {
    const N = this.N;
    const f = (wrapS(s, this.length) / this.length) * N;
    const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, fr = f - Math.floor(f);
    const { pos, tan, side } = out;
    pos.set(
      this.px[i0] + (this.px[i1] - this.px[i0]) * fr,
      this.py[i0] + (this.py[i1] - this.py[i0]) * fr,
      this.pz[i0] + (this.pz[i1] - this.pz[i0]) * fr
    );
    tan.set(
      this.tx[i0] + (this.tx[i1] - this.tx[i0]) * fr,
      this.ty[i0] + (this.ty[i1] - this.ty[i0]) * fr,
      this.tz[i0] + (this.tz[i1] - this.tz[i0]) * fr
    ).normalize();
    // side = left of travel direction
    side.set(tan.z, 0, -tan.x).normalize();
    // note: with y-up, left of (0,0,1) is (+1,0,0)? side=(tan.z,0,-tan.x) -> (1,0,0) for tan=(0,0,1). Keep consistent everywhere.
    return out;
  }

  curvatureAt(s) {
    const i = Math.round((wrapS(s, this.length) / this.length) * this.N) % this.N;
    return this.curv[i];
  }
  isTunnel(s) {
    const i = Math.round((wrapS(s, this.length) / this.length) * this.N) % this.N;
    return !!this.tunnel[i];
  }

  // Project a world position onto the track near hintS. Returns {s, d, roadY}.
  project(px, py, pz, hintS) {
    const L = this.length;
    let bestS = wrapS(hintS, L), bestD2 = Infinity;
    for (let k = -8; k <= 30; k++) {
      const s = wrapS(hintS + k * 3, L);
      const i = Math.round((s / L) * this.N) % this.N;
      const dx = px - this.px[i], dz = pz - this.pz[i], dy = (py - this.py[i]) * 0.6;
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestS = s; }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = -4; k <= 4; k++) {
        const s = wrapS(bestS + k * 0.75, L);
        const i = Math.round((s / L) * this.N) % this.N;
        const dx = px - this.px[i], dz = pz - this.pz[i], dy = (py - this.py[i]) * 0.6;
        const d2 = dx * dx + dz * dz + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestS = s; }
      }
    }
    const i = Math.round((bestS / L) * this.N) % this.N;
    // side vector at i
    let sx = this.tz[i], sz = -this.tx[i];
    const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const d = (px - this.px[i]) * sx + (pz - this.pz[i]) * sz;
    return { s: bestS, d, roadY: this.py[i] };
  }

  // Coarse global search (used for respawns).
  nearestSGlobal(px, pz) {
    const N = this.N, L = this.length;
    let best = 0, bestD2 = Infinity;
    for (let i = 0; i < N; i += 8) {
      const dx = px - this.px[i], dz = pz - this.pz[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = (i / N) * L; }
    }
    return best;
  }

  gridSlot(i) {
    // i = 0..5 ; player starts last (arcade tradition), AI ahead
    // NOTE: s is intentionally UNWRAPPED (negative = before the start line).
    // placeOnTrack/frameAt wrap it for positioning, while raceS keeps the raw
    // value so crossing the start line at race start does NOT count as a lap.
    const row = Math.floor(i / 2);
    const s = -25 - row * 9;
    const d = i % 2 === 0 ? -2.8 : 2.8;
    return { s, d };
  }

  forEachStep(stepMeters, cb) {
    const n = Math.floor(this.length / stepMeters);
    const out = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
    for (let k = 0; k < n; k++) {
      const s = (k / n) * this.length;
      this.frameAt(s, out);
      cb(s, out, k);
    }
  }
}
