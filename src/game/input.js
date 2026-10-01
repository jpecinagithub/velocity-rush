// Central input abstraction. The rest of the game only sees normalized values:
//   steer      -1..+1    brake      0..1
//   accelerate  0..1    handbrake  bool
//   nitro      bool     + edge events (pause/camera/reset/menu nav)
// KeyboardInput and GamepadInput both feed this same interface.
import { clamp } from './utils.js';

const SMOOTH_RATE = { low: 14, medium: 9, high: 5.5 }; // keyboard steer ramp (higher = snappier)

export class InputSystem {
  constructor(getSettings) {
    this.getSettings = getSettings;
    // normalized outputs
    this.steer = 0; this.accelerate = 0; this.brake = 0;
    this.handbrake = false; this.nitro = false;
    // gamepad state
    this.padConnected = false;
    this.padId = '';
    this.padIndex = -1;
    // configurable mapping layer (standard mapping defaults)
    this.mapping = {
      steerAxis: 0,
      accelBtn: 7,   // R2
      brakeBtn: 6,   // L2
      nitroBtn: 0,   // X / Cross
      handbrakeBtn: 2, // Square
      cameraBtn: 3,  // Triangle
      backBtn: 1,    // Circle
      pauseBtn: 9,   // Options
      dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15,
    };
    this._keys = new Set();
    this._edges = {};
    this._prevPad = {};
    this._kbSteer = 0;
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onPadConn = (e) => this._padEvent(e, true);
    this._onPadDis = (e) => this._padEvent(e, false);
    this._vibTimer = 0;
  }

  attach() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('gamepadconnected', this._onPadConn);
    window.addEventListener('gamepaddisconnected', this._onPadDis);
    this._scanPads();
  }
  detach() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('gamepadconnected', this._onPadConn);
    window.removeEventListener('gamepaddisconnected', this._onPadDis);
  }

  setMapping(partial) { Object.assign(this.mapping, partial); }

  _key(e, down) {
    const c = e.code;
    // Typing in a text field (e.g. the pilot nickname) must not drive the game
    // nor swallow keys: let the field handle them and ignore them here.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const handled = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyR','KeyC','KeyP','Enter','Escape','ShiftLeft','ShiftRight'];
    if (handled.includes(c)) e.preventDefault();
    if (down && !this._keys.has(c)) this._edgeFromKey(c);
    if (down) this._keys.add(c); else this._keys.delete(c);
  }
  _edgeFromKey(c) {
    if (c === 'KeyP' || c === 'Escape') this._edges.pause = true;
    if (c === 'KeyC') this._edges.camera = true;
    if (c === 'KeyR') this._edges.reset = true;
    if (c === 'Enter' || c === 'Space') this._edges.confirm = true;
    if (c === 'ArrowUp' || c === 'KeyW') this._edges.up = true;
    if (c === 'ArrowDown' || c === 'KeyS') this._edges.down = true;
    if (c === 'ArrowLeft' || c === 'KeyA') this._edges.left = true;
    if (c === 'ArrowRight' || c === 'KeyD') this._edges.right = true;
  }
  _padEvent(e, connected) {
    if (connected) {
      this.padConnected = true;
      this.padIndex = e.gamepad.index;
      this.padId = e.gamepad.id || 'Controller';
      this._edges.padConnected = true;
    } else {
      if (e.gamepad.index === this.padIndex) {
        this.padConnected = false; this.padId = ''; this.padIndex = -1;
      }
    }
  }
  _scanPads() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (p && p.connected) { this.padConnected = true; this.padIndex = p.index; this.padId = p.id || 'Controller'; break; }
      }
    } catch { /* no gamepad API */ }
  }
  _pad() {
    if (!this.padConnected) return null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads[this.padIndex];
      if (p && p.connected) return p;
      // index may have shifted — rescan
      for (const q of pads) if (q && q.connected) { this.padIndex = q.index; this.padId = q.id; return q; }
      this.padConnected = false; this.padId = '';
    } catch { /* ignore */ }
    return null;
  }
  _btn(p, i) {
    const b = p.buttons && p.buttons[i];
    if (!b) return 0;
    return typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
  }
  _axis(p, i) {
    const a = p.axes && p.axes[i];
    return typeof a === 'number' ? a : 0;
  }
  _dz(v, dz) {
    if (Math.abs(v) < dz) return 0;
    return (v - Math.sign(v) * dz) / (1 - dz);
  }

  consume(name) {
    const v = this._edges[name] === true;
    this._edges[name] = false;
    return v;
  }

  update(dt) {
    const s = this.getSettings ? this.getSettings() : {};
    const sens = 0.55 + ((s.steerSensitivity ?? 70) / 100) * 0.65;
    const dz = s.deadzone ?? 0.12;

    // ---- keyboard ----
    const k = this._keys;
    const kbLeft = k.has('ArrowLeft') || k.has('KeyA');
    const kbRight = k.has('ArrowRight') || k.has('KeyD');
    // NOTE: positive physics steer turns toward world +X, which the chase
    // camera shows as screen-LEFT, so human input is negated here.
    const kbTarget = (kbLeft ? 1 : 0) - (kbRight ? 1 : 0);
    const rate = SMOOTH_RATE[s.steerSmoothing] ?? SMOOTH_RATE.medium;
    this._kbSteer += clamp(kbTarget - this._kbSteer, -rate * dt, rate * dt);
    const kbSteer = clamp(this._kbSteer * sens, -1, 1);
    const kbAccel = (k.has('ArrowUp') || k.has('KeyW')) ? 1 : 0;
    const kbBrake = (k.has('ArrowDown') || k.has('KeyS')) ? 1 : 0;
    const kbHand = k.has('Space');
    const kbNitro = k.has('ShiftLeft') || k.has('ShiftRight');

    // ---- gamepad ----
    let gSteer = 0, gAccel = 0, gBrake = 0, gHand = false, gNitro = false;
    let padActive = false;
    const p = this._pad();
    if (p) {
      const m = this.mapping;
      gSteer = clamp(-this._dz(this._axis(p, m.steerAxis), dz) * sens, -1, 1);
      gAccel = clamp(this._btn(p, m.accelBtn), 0, 1);
      // some pads expose triggers as buttons 6/7, others as axes; value path covers both
      gBrake = clamp(this._btn(p, m.brakeBtn), 0, 1);
      gNitro = this._btn(p, m.nitroBtn) > 0.4;
      gHand = this._btn(p, m.handbrakeBtn) > 0.4;
      padActive = Math.abs(gSteer) > 0.02 || gAccel > 0.02 || gBrake > 0.02 || gNitro || gHand;
      // edge buttons
      const edge = (idx, name) => {
        const v = this._btn(p, idx) > 0.4;
        if (v && !this._prevPad[name]) this._edges[name] = true;
        this._prevPad[name] = v;
      };
      edge(m.pauseBtn, 'pause');
      edge(m.cameraBtn, 'camera');
      edge(m.backBtn, 'back');
      edge(m.nitroBtn, 'confirm'); // X confirms in menus too
      edge(m.dpadUp, 'up'); edge(m.dpadDown, 'down');
      edge(m.dpadLeft, 'left'); edge(m.dpadRight, 'right');
      // left stick doubles as menu nav
      const ax = this._dz(this._axis(p, 0), 0.35), ay = this._dz(this._axis(p, 1), 0.35);
      const stick = (v, name) => { if (v && !this._prevPad[name]) this._edges[name] = true; this._prevPad[name] = v; };
      stick(ax > 0.5, 'right'); stick(ax < -0.5, 'left');
      stick(ay > 0.5, 'down'); stick(ay < -0.5, 'up');
      if (this._vibTimer > 0) this._vibTimer -= dt;
    }

    // ---- merge: gamepad wins while it is being touched, keyboard always available ----
    this.steer = padActive ? gSteer : kbSteer;
    this.accelerate = Math.max(kbAccel, gAccel);
    this.brake = Math.max(kbBrake, gBrake);
    this.handbrake = kbHand || gHand;
    this.nitro = kbNitro || gNitro;
  }

  // Controller vibration. Never throws; silently ignored when unsupported.
  rumble(intensity, durationMs) {
    try {
      const s = this.getSettings ? this.getSettings() : {};
      if (s.vibration === false) return;
      if (this._vibTimer > 0) return; // rate-limit
      const p = this._pad();
      const act = p && p.vibrationActuator;
      if (act && act.playEffect) {
        this._vibTimer = 0.09;
        const v = clamp(intensity, 0, 1);
        act.playEffect('dual-rumble', { duration: durationMs, strongMagnitude: v, weakMagnitude: v * 0.7 }).catch(() => {});
      }
    } catch { /* vibration unsupported — game continues */ }
  }
}
