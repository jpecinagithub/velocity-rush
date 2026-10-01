// Fully synthesized audio: engine, skid, wind, nitro, collisions, UI.
// No audio files, no network. All nodes are created lazily on first user gesture.

// Race-music progression: Am - F - C - G (8 sixteenth-steps per chord, 32-step loop).
const MUS_CHORDS = [
  { bass: 55.00, tones: [220.00, 261.63, 329.63] }, // Am
  { bass: 43.65, tones: [174.61, 220.00, 261.63] }, // F
  { bass: 65.41, tones: [261.63, 329.63, 392.00] }, // C
  { bass: 49.00, tones: [196.00, 246.94, 293.66] }, // G
];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;      // engine, skid, wind, UI one-shots
    this.musicBus = null; // sequenced race music (independent toggle)
    this.muted = false;
    this._eng = null;
    this._skid = null;
    this._wind = null;
    this._noiseBuf = null;
    this._lastRpm = 0;
    // music sequencer state
    this._seqTimer = null;
    this._seqStep = 0;
    this._seqNextT = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this._initGraph(new AC());
      // a fresh context starts suspended; try to run immediately (works when
      // created from a user gesture, otherwise a later gesture resumes it)
      this.ctx.resume().catch(() => {});
    } catch { this.ctx = null; return false; }
    return !!this.ctx;
  }
  // Build the gain graph on a context (also usable with OfflineAudioContext).
  _initGraph(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.muted ? 0 : 1;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._buildEngine();
    this._buildSkid();
    this._buildWind();
  }
  setMuted(m) {
    this.muted = m;
    if (this.sfx) this.sfx.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
  }
  _buildEngine() {
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 35;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 750; filt.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(filt); o2.connect(g2); g2.connect(filt); filt.connect(g); g.connect(this.sfx);
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
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
    this._skid = { g };
  }
  _buildWind() {
    const c = this.ctx;
    const s = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
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
  // --- synthesized race music: 132 BPM driving synth loop, 100% original ---
  // 32-step loop (2 bars), Am - F - C - G. Lookahead scheduler, idempotent on/off.
  music(on) {
    on = !!on;
    if (!this.ctx) return;
    if (on && !this._seqTimer) {
      this._seqStep = 0;
      this._seqNextT = this.ctx.currentTime + 0.08;
      this._seqTimer = setInterval(() => this._scheduleMusic(), 90);
    } else if (!on && this._seqTimer) {
      clearInterval(this._seqTimer);
      this._seqTimer = null;
    }
  }
  _scheduleMusic() {
    if (!this.ctx || !this._seqTimer) return;
    const stepDur = 60 / 132 / 4;
    try {
      while (this._seqNextT < this.ctx.currentTime + 0.28) {
        this._playMusicStep(this._seqStep, this._seqNextT, stepDur);
        this._seqNextT += stepDur;
        this._seqStep = (this._seqStep + 1) % 32;
      }
    } catch { /* ignore scheduling hiccups */ }
  }
  _playMusicStep(step, t, stepDur) {
    const chord = MUS_CHORDS[(step >> 3) % 4]; // 8 steps per chord
    if (step % 4 === 0) this._musKick(t);
    if (step === 8 || step === 24) this._musNoise(t, 0.14, 0.20, 'bandpass', 1800); // snare
    if (step % 4 === 2) this._musNoise(t, 0.045, 0.06, 'highpass', 7500); // hat
    if (step % 2 === 0) {
      const up = step % 8 === 6; // octave pop on the driving 8ths
      this._musTone(chord.bass * (up ? 2 : 1), t, 0.17, 'sawtooth', 0.17, 340); // bass
      const oct = step >= 16 ? 2 : 1; // second bar lifts an octave
      const tone = chord.tones[(step >> 1) % 3] * oct;
      this._musTone(tone, t, stepDur * 1.9, 'triangle', 0.055, 0); // lead arp
    }
  }
  _musTone(freq, t, dur, type, vol, lp) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let out = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); out = f; }
    out.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _musNoise(t, dur, vol, type, freq) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicBus);
    s.start(t); s.stop(t + dur + 0.05);
  }
  _musKick(t) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.2);
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
      o.connect(g); g.connect(this.sfx);
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
      s.connect(f); f.connect(g); g.connect(this.sfx);
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
  suspend() { this.engine(0, 0, false, false); this.skid(0); this.wind(0); this.music(false); }
}
