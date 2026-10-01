// Fully synthesized audio: engine, skid, wind, nitro, collisions, UI.
// No audio files, no network. All nodes are created lazily on first user gesture.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._eng = null;
    this._skid = null;
    this._wind = null;
    this._pulse = null;
    this._noiseBuf = null;
    this._lastRpm = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._buildEngine();
      this._buildSkid();
      this._buildWind();
    } catch { this.ctx = null; return false; }
    return !!this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  _buildEngine() {
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 35;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 750; filt.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(filt); o2.connect(g2); g2.connect(filt); filt.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this._eng = { o1, o2, filt, g };
  }
  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf; s.loop = true;
    return s;
  }
  _buildSkid() {
    const c = this.ctx;
    const s = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this._skid = { g };
  }
  _buildWind() {
    const c = this.ctx;
    const s = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this._wind = { g, f };
  }
  // --- per-frame vehicle audio. rpm01 0..1, throttle 0..1 ---
  engine(rpm01, throttle01, nitroOn, active) {
    if (!this.ctx || !this._eng) return;
    const e = this._eng;
    const rpm = this._lastRpm + (rpm01 - this._lastRpm) * 0.25;
    this._lastRpm = rpm;
    const t = this.ctx.currentTime;
    const fr = 55 + rpm * 230 + (nitroOn ? 45 : 0);
    e.o1.frequency.setTargetAtTime(fr, t, 0.03);
    e.o2.frequency.setTargetAtTime(fr * 0.5 + 3, t, 0.03);
    e.filt.frequency.setTargetAtTime(600 + rpm * 1400 + throttle01 * 900, t, 0.05);
    const g = active ? 0.10 + throttle01 * 0.10 + rpm * 0.05 : 0;
    e.g.gain.setTargetAtTime(g, t, 0.06);
  }
  skid(amount) {
    if (!this.ctx || !this._skid) return;
    this._skid.g.gain.setTargetAtTime(Math.min(0.3, amount * 0.3), this.ctx.currentTime, 0.05);
  }
  wind(speed01) {
    if (!this.ctx || !this._wind) return;
    const t = this.ctx.currentTime;
    this._wind.g.gain.setTargetAtTime(speed01 * speed01 * 0.22, t, 0.1);
    this._wind.f.frequency.setTargetAtTime(400 + speed01 * 1600, t, 0.1);
  }
  // subtle synth pulse during races (toggleable as "music")
  pulse(on, intensity = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this._pulse) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2;
      const lg = this.ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this._pulse = { o, lfo, g, base: 0.05 * intensity };
      g.gain.value = 0.05 * intensity;
    } else if (!on && this._pulse) {
      const p = this._pulse; this._pulse = null;
      p.g.gain.setTargetAtTime(0, t, 0.2);
      setTimeout(() => { try { p.o.stop(); p.lfo.stop(); } catch {} }, 600);
    } else if (on && this._pulse) {
      this._pulse.g.gain.setTargetAtTime(0.05 * intensity, t, 0.3);
    }
  }
  // --- one shots ---
  _tone(freq, dur, type = 'sine', vol = 0.25, when = 0, slideTo = null) {
    if (!this.ctx) return;
    try {
      const c = this.ctx, t = c.currentTime + when;
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch { /* ignore */ }
  }
  _noise(dur, vol, freq, when = 0) {
    if (!this.ctx) return;
    try {
      const c = this.ctx, t = c.currentTime + when;
      const s = c.createBufferSource(); s.buffer = this._noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.05);
    } catch { /* ignore */ }
  }
  click() { this._tone(660, 0.07, 'square', 0.12); }
  hover() { this._tone(440, 0.04, 'sine', 0.05); }
  countBeep(final) { this._tone(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.22); }
  checkpoint() { this._tone(740, 0.1, 'sine', 0.2); this._tone(1108, 0.16, 'sine', 0.2, 0.09); }
  overtake() { this._noise(0.35, 0.25, 3200); this._tone(300, 0.3, 'sawtooth', 0.1, 0, 900); }
  nearMiss() { this._noise(0.25, 0.2, 5200); this._tone(1200, 0.12, 'sine', 0.12, 0, 1800); }
  collide(mag) {
    const v = Math.min(0.5, 0.15 + mag / 120);
    this._noise(0.22, v, 900);
    this._tone(90, 0.25, 'sine', v, 0, 38);
  }
  nitroStart() { this._noise(0.5, 0.2, 2400); this._tone(180, 0.45, 'sawtooth', 0.12, 0, 520); }
  jump() { this._tone(240, 0.3, 'sine', 0.15, 0, 620); }
  land() { this._noise(0.18, 0.25, 500); }
  slipstream() { this._noise(0.6, 0.12, 1800); }
  fanfare(win) {
    const seq = win ? [523, 659, 784, 1047] : [392, 494, 587];
    seq.forEach((f, i) => this._tone(f, 0.34, 'triangle', 0.22, i * 0.16));
  }
  suspend() { this.engine(0, 0, false, false); this.skid(0); this.wind(0); this.pulse(false); }
}
