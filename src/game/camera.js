// Third-person chase camera with speed-reactive FOV, trauma-based shake,
// and three switchable views (close chase / distant chase / hood).
import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const _fwd = new THREE.Vector3();
const _des = new THREE.Vector3();
const _look = new THREE.Vector3();
const _side = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.cam = camera;
    this.mode = 0;
    this.trauma = 0;
    this.fov = 64;
    this.t = 0;
    this._init = false;
  }
  addTrauma(x) { this.trauma = clamp(this.trauma + x, 0, 1); }
  snapTo(car) {
    _fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    this.cam.position.copy(car.pos).addScaledVector(_fwd, -8).add(new THREE.Vector3(0, 3.2, 0));
    this.cam.lookAt(car.pos.x, car.pos.y + 1.2, car.pos.z);
    this._init = true;
  }
  update(dt, car, opts = {}) {
    const speed01 = clamp(Math.abs(car.speed) / car.def.stats.topSpeed, 0, 1.3);
    const nitro = car.nitroActive ? 1 : 0;
    const shakeAmp = opts.shake === 'off' ? 0 : opts.shake === 'high' ? 0.9 : 0.38;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);

    _fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    _side.set(_fwd.z, 0, -_fwd.x);

    if (this.mode === 2) {
      // hood cam
      _des.copy(car.pos).addScaledVector(_fwd, 0.55);
      _des.y += 1.32;
      this.cam.position.copy(_des);
      _look.copy(car.pos).addScaledVector(_fwd, 40); _look.y += 1.0;
      this.cam.lookAt(_look);
    } else {
      const dist = this.mode === 1 ? 13.5 + speed01 * 3.5 : 8 + speed01 * 3.2;
      const height = this.mode === 1 ? 4.6 : 3.1 + speed01 * 0.7;
      _des.copy(car.pos).addScaledVector(_fwd, -dist);
      _des.y += height;
      // lean slightly with steering for a dynamic feel
      _des.addScaledVector(_side, -car.steerVis * 0.9);
      const rate = this._init ? 7.5 : 100;
      this.cam.position.x = damp(this.cam.position.x, _des.x, rate, dt);
      this.cam.position.y = damp(this.cam.position.y, _des.y, rate, dt);
      this.cam.position.z = damp(this.cam.position.z, _des.z, rate, dt);
      _look.copy(car.pos).addScaledVector(_fwd, 10);
      _look.y += 1.4;
      // lookAt is applied after shake offset below
      this._lookX = damp(this._lookX ?? _look.x, _look.x, 9, dt);
      this._lookY = damp(this._lookY ?? _look.y, _look.y, 9, dt);
      this._lookZ = damp(this._lookZ ?? _look.z, _look.z, 9, dt);
      _look.set(this._lookX, this._lookY, this._lookZ);
      this.cam.lookAt(_look);
      this._init = true;
    }

    // trauma shake (collision / landing / nitro rumble)
    if (this.trauma > 0.001 && shakeAmp > 0) {
      const s = this.trauma * this.trauma * shakeAmp;
      const t = this.t * 61;
      this.cam.position.x += Math.sin(t * 1.13) * 0.35 * s;
      this.cam.position.y += Math.sin(t * 1.71 + 2) * 0.28 * s;
      this.cam.rotation.z += Math.sin(t * 0.93 + 4) * 0.02 * s;
    }
    // nitro micro-shake
    if (nitro && shakeAmp > 0) {
      this.cam.position.y += Math.sin(this.t * 90) * 0.02;
    }

    const targetFov = 62 + clamp(speed01, 0, 1) * 13 + nitro * 7;
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.02) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
