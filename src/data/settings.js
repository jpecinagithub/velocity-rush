import { STORE } from '../game/constants.js';

export const DEFAULT_SETTINGS = {
  graphics: 'auto',        // low | medium | high | auto
  sound: true,
  music: true,
  controlType: 'keyboard', // keyboard | gamepad
  steerSensitivity: 70,    // 0..100
  deadzone: 0.12,
  cameraShake: 'low',       // off | low | high
  vibration: true,
  steerSmoothing: 'medium', // low | medium | high
  cameraMode: 0,            // 0 close chase, 1 distant, 2 hood
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ }
}

export function loadSettings() { return read(STORE.settings, DEFAULT_SETTINGS); }
export function saveSettings(s) { write(STORE.settings, s); }

export function loadBests() { return read(STORE.bests, {}); } // key `${trackId}:${mode}` -> ms
export function saveBest(trackId, mode, ms) {
  const b = loadBests();
  const k = `${trackId}:${mode}`;
  if (b[k] == null || ms < b[k]) { b[k] = Math.round(ms); write(STORE.bests, b); return true; }
  return false;
}

export function loadUnlocks() { return read(STORE.unlocks, { apexone: false }); }
export function unlockApexOne() {
  const u = loadUnlocks();
  if (!u.apexone) { u.apexone = true; write(STORE.unlocks, u); return true; }
  return false;
}
