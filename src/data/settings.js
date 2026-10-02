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

export function loadBests() {
  const b = read(STORE.bests, {});
  // Circuit moved from 3 to 2 laps: old 3-lap times are not comparable, purge them once.
  let purged = false;
  for (const k of Object.keys(b)) {
    if (k.endsWith(':circuit')) { delete b[k]; purged = true; }
  }
  if (purged) write(STORE.bests, b);
  return b;
} // key `${trackId}:${mode}` -> ms
export function saveBest(trackId, mode, ms) {
  const b = loadBests();
  const k = `${trackId}:${mode}`;
  if (b[k] == null || ms < b[k]) { b[k] = Math.round(ms); write(STORE.bests, b); return true; }
  return false;
}

// --- Circuit lap records with pilot nicknames (top 10 per track) ---
export const MAX_RECORDS = 10;
export function loadRecords(trackId) {
  const all = read(STORE.records, {});
  const list = Array.isArray(all[trackId]) ? all[trackId] : [];
  return list
    .filter((r) => r && Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, MAX_RECORDS);
}
export function qualifiesForRecords(trackId, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const list = loadRecords(trackId);
  return list.length < MAX_RECORDS || ms < list[list.length - 1].ms;
}
// Saves a record, returns the 0-based rank, or -1 if it did not make the top 10.
export function saveRecord(trackId, { name, ms, carId, difficulty }) {
  const all = read(STORE.records, {});
  const list = (Array.isArray(all[trackId]) ? all[trackId] : [])
    .filter((r) => r && Number.isFinite(r.ms));
  const entry = {
    name: String(name || 'DRIVER').trim().slice(0, 12) || 'DRIVER',
    ms: Math.round(ms),
    carId: carId || null,
    difficulty: difficulty || null,
    date: new Date().toISOString().slice(0, 10),
  };
  list.push(entry);
  list.sort((a, b) => a.ms - b.ms);
  const trimmed = list.slice(0, MAX_RECORDS);
  all[trackId] = trimmed;
  write(STORE.records, all);
  return trimmed.indexOf(entry);
}

export function loadPilotName() {
  try { return localStorage.getItem(STORE.pilot) || ''; } catch { return ''; }
}
export function savePilotName(name) {
  try { localStorage.setItem(STORE.pilot, String(name || '').slice(0, 12)); } catch { /* private mode */ }
}

export function loadUnlocks() { return read(STORE.unlocks, { apexone: false }); }
export function unlockApexOne() {
  const u = loadUnlocks();
  if (!u.apexone) { u.apexone = true; write(STORE.unlocks, u); return true; }
  return false;
}
