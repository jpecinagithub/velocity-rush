// Pooled GPU particle system: zero allocation per frame, two draw calls
// (additive for sparks/flames/streaks, normal for smoke/dust).
import * as THREE from 'three';

const VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = (alpha) => `
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.08, d) * ${alpha.toFixed(2)};
  gl_FragColor = vec4(vColor, a);
}`;

function makeSystem(capacity, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  pos.fill(-9999);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG(additive ? 1.0 : 0.5),
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points, geo, pos, col, size,
    px: new Float32Array(capacity * 3), // velocity
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    grav: new Float32Array(capacity),
    drag: new Float32Array(capacity),
    baseSize: new Float32Array(capacity),
    head: 0, capacity,
  };
}

export class ParticleSystem {
  constructor(scene, capacity = 1200) {
    this.add = makeSystem(capacity, true);
    this.nrm = makeSystem(Math.floor(capacity / 2), false);
    scene.add(this.add.points);
    scene.add(this.nrm.points);
  }
  _spawn(sys, x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 0) {
    const i = sys.head; sys.head = (sys.head + 1) % sys.capacity;
    const i3 = i * 3;
    sys.pos[i3] = x; sys.pos[i3 + 1] = y; sys.pos[i3 + 2] = z;
    sys.px[i3] = vx; sys.px[i3 + 1] = vy; sys.px[i3 + 2] = vz;
    sys.col[i3] = r; sys.col[i3 + 1] = g; sys.col[i3 + 2] = b;
    sys.life[i] = life; sys.maxLife[i] = life;
    sys.baseSize[i] = size; sys.size[i] = size;
    sys.grav[i] = grav; sys.drag[i] = drag;
  }
  sparks(x, y, z, n = 10, spread = 6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * spread;
      this._spawn(this.add, x, y + Math.random(), z,
        Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp,
        0.35 + Math.random() * 0.4, 1.6 + Math.random() * 1.6,
        1.0, 0.55 + Math.random() * 0.3, 0.15, 12, 1.2);
    }
  }
  smoke(x, y, z, n = 6, dark = 0.35) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this._spawn(this.nrm, x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5),
        Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp,
        0.7 + Math.random() * 0.6, 2.2 + Math.random() * 1.6,
        dark, dark, dark, -1.5, 1.8);
    }
  }
  flame(x, y, z, dx, dz) {
    this._spawn(this.add, x, y, z,
      dx * (14 + Math.random() * 6) + (Math.random() - 0.5) * 2, 0.8 + Math.random(), dz * (14 + Math.random() * 6) + (Math.random() - 0.5) * 2,
      0.22 + Math.random() * 0.14, 2.6 + Math.random() * 2,
      0.35, 0.75 + Math.random() * 0.25, 1.0, 0, 2.5);
    if (Math.random() < 0.5) {
      this._spawn(this.add, x, y, z, dx * 8, 1.5, dz * 8,
        0.3, 3.4, 1.0, 0.45, 0.1, 0, 2);
    }
  }
  dust(x, y, z, n = 4) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(this.nrm, x, y + 0.3, z,
        Math.cos(a) * 3, 1 + Math.random() * 2.5, Math.sin(a) * 3,
        0.6 + Math.random() * 0.5, 1.4 + Math.random() * 1.2,
        0.62, 0.55, 0.42, -1, 2);
    }
  }
  streak(x, y, z, vx, vy, vz) {
    this._spawn(this.add, x, y, z, vx, vy, vz, 0.28, 1.1, 0.65, 0.85, 1.0, 0, 0.4);
  }
  update(dt) {
    for (const sys of [this.add, this.nrm]) {
      const { pos, px, life, maxLife, grav, drag, size, baseSize, capacity } = sys;
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const i3 = i * 3;
        if (life[i] <= 0) { pos[i3 + 1] = -9999; size[i] = 0; continue; }
        const dr = Math.exp(-drag[i] * dt);
        px[i3] *= dr; px[i3 + 2] *= dr;
        px[i3 + 1] = px[i3 + 1] * dr - grav[i] * dt;
        pos[i3] += px[i3] * dt; pos[i3 + 1] += px[i3 + 1] * dt; pos[i3 + 2] += px[i3 + 2] * dt;
        const t = life[i] / maxLife[i];
        size[i] = baseSize[i] * (sys === this.nrm ? (1.6 - t * 0.6) : t);
      }
      sys.geo.attributes.position.needsUpdate = true;
      sys.geo.attributes.aSize.needsUpdate = true;
      sys.geo.attributes.aColor.needsUpdate = true;
    }
  }
  dispose(scene) {
    scene.remove(this.add.points); scene.remove(this.nrm.points);
    this.add.geo.dispose(); this.nrm.geo.dispose();
  }
}
