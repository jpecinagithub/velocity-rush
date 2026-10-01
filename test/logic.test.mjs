// Headless logic validation for VELOCITY RUSH. Run: npm test
import { Track } from '../src/game/track.js';
import * as THREE from '../node_modules/three/build/three.module.js';
import { createVehicle, placeOnTrack, stepVehicle, collideVehicles } from '../src/game/physics.js';
import { TrafficManager } from '../src/game/traffic.js';
import { InputSystem } from '../src/game/input.js';
import { GameSession } from '../src/game/session.js';
import { CARS } from '../src/data/cars.js';
import { TRACKS } from '../src/data/tracks.js';
import { DIFFICULTIES, QUALITY } from '../src/game/constants.js';
import { loadBests, saveBest, loadUnlocks, unlockApexOne, loadSettings, saveSettings } from '../src/data/settings.js';

// localStorage shim for node
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
const finite = (v) => Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y) && Number.isFinite(v.pos.z) && Number.isFinite(v.speed);

console.log('== tracks ==');
for (const def of TRACKS) {
  const t = new Track(def);
  ok(`${def.id} length ${(t.length / 1000).toFixed(2)}km`, t.length > 2000 && t.length < 12000);
  ok(`${def.id} samples`, t.N > 200);
  let asc = true;
  for (let i = 1; i < t.checkpoints.length; i++) if (t.checkpoints[i] <= t.checkpoints[i - 1]) asc = false;
  ok(`${def.id} checkpoints sorted`, asc);
  const seen = new Set(); let dup = false;
  for (let i = 0; i < 6; i++) { const g = t.gridSlot(i); const k = Math.round(g.s) + ':' + g.d.toFixed(1); if (seen.has(k)) dup = true; seen.add(k); }
  ok(`${def.id} grid distinct`, !dup);
  // frameAt continuity + project roundtrip
  const fr = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
  t.frameAt(1234.5, fr);
  const tl = fr.tan.length();
  ok(`${def.id} tangent normalized`, Math.abs(tl - 1) < 0.01);
  const pr = t.project(fr.pos.x, fr.pos.y, fr.pos.z, 1234.5);
  ok(`${def.id} project roundtrip`, Math.abs(pr.s - 1234.5) < 30, `s=${pr.s}`);
  const hasTun = t.tunnel.some((x) => x), hasBr = t.bridge.some((x) => x);
  console.log(`       tunnel=${hasTun} bridge=${hasBr} sprintFinish=${Math.round(t.sprintFinishS)}m`);
}

console.log('== physics ==');
{
  const t = new Track(TRACKS[0]);
  const v = createVehicle(CARS[0], { isPlayer: true });
  placeOnTrack(v, t, 10, 0);
  for (let i = 0; i < 420; i++) stepVehicle(v, { steer: 0, accelerate: 1, brake: 0, handbrake: false, nitro: i > 300 }, 1 / 60, { track: t, draft: 0 });
  ok('accelerates past 55 m/s on straight', v.speed > 55, `speed=${v.speed.toFixed(1)}`);
  ok('nitro raises top speed', v.topSpeed > 78, `top=${v.topSpeed.toFixed(1)}`);
  // now plow into the wall with zero steering: must slow down but never trap
  for (let i = 0; i < 300; i++) stepVehicle(v, { steer: 0, accelerate: 1, brake: 0, handbrake: false, nitro: false }, 1 / 60, { track: t, draft: 0 });
  ok('wall does not trap the car', v.speed > 3 && finite(v), `speed=${v.speed.toFixed(1)}`);
  ok('no NaN after wall grinding', finite(v));
  ok('advanced along track', v.raceS > 500, `raceS=${v.raceS.toFixed(0)}`);
  // collision response
  const a = createVehicle(CARS[1], {}), b = createVehicle(CARS[2], {});
  placeOnTrack(a, t, 100, 0); placeOnTrack(b, t, 102, 0.5);
  a.speed = 50; b.speed = 40;
  collideVehicles(a, b);
  ok('collision separates', Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 2.5);
  ok('collision no NaN', finite(a) && finite(b));
}

console.log('== traffic ==');
{
  const t = new Track(TRACKS[0]);
  const tm = new TrafficManager(t, 16, 42);
  const p = createVehicle(CARS[0], { isPlayer: true });
  placeOnTrack(p, t, 100, 0); p.speed = 60;
  for (let i = 0; i < 600; i++) {
    p.s = (p.s + p.speed / 60) % t.length;
    tm.update(1 / 60, p.s, 1.0);
  }
  const active = tm.cars.filter((c) => c.active).length;
  ok('traffic stable', active === 16, `active=${active}`);
  ok('traffic speeds sane', tm.cars.every((c) => c.speed > 5 && c.speed < 40));
}

console.log('== input (no DOM/gamepad) ==');
{
  const inp = new InputSystem(() => ({}));
  inp.update(0.016);
  ok('neutral without devices', inp.steer === 0 && inp.accelerate === 0 && inp.consume('pause') === false);
  inp.rumble(1, 100); // must not throw
  ok('rumble harmless', true);
}

console.log('== full AI race (ridge, 1 lap) ==');
{
  const sess = new GameSession({
    trackDef: TRACKS[1], carDef: CARS[0], aiCarDefs: CARS.filter((c) => !c.locked),
    mode: 'circuit', difficulty: DIFFICULTIES.normal, quality: QUALITY.low,
    getSettings: () => ({}), callbacks: {}, playerAI: true, lapsOverride: 1,
  });
  let frames = 0, nan = false, wild = 0;
  let lapAfterStart = -1;
  const t0 = Date.now();
  while (sess.state !== 'finished' && frames < 60 * 240) {
    sess.update(1 / 60); frames++;
    if (frames === 120) lapAfterStart = sess.player.lap; // well past the start line
    for (const v of sess.vehicles) {
      if (!finite(v)) nan = true;
      if (Math.abs(v.d) > 120) wild++;
    }
    if (nan) break;
  }
  console.log(`       sim wall time ${((Date.now() - t0) / 1000).toFixed(1)}s for ${frames} frames`);
  ok('race finished', sess.state === 'finished', `state=${sess.state} lap=${sess.player.lap}`);
  ok('no NaN in race', !nan);
  ok('cars stayed near road', wild === 0, `wild=${wild}`);
  ok('results sane', sess.results && sess.results.position >= 1 && sess.results.position <= 6, JSON.stringify(sess.results && sess.results.position));
  ok('hud updated', sess.hud.speedKmh >= 0 && sess.hud.timeMs > 0);
  // REGRESSION: crossing the start line at race start must not count as a lap
  ok('no phantom lap at start', lapAfterStart === 0, `lap=${lapAfterStart}`);
  ok('real lap distance', frames > 1500, `frames=${frames}`);
  ok('lap time is a full lap', sess.player.lapTimes[0] > 20, `lap0=${sess.player.lapTimes[0] && sess.player.lapTimes[0].toFixed(1)}s`);
  sess.dispose();
}

console.log('== sprint (azure) ==');
{
  const sess = new GameSession({
    trackDef: TRACKS[0], carDef: CARS[3], aiCarDefs: CARS.filter((c) => !c.locked),
    mode: 'sprint', difficulty: DIFFICULTIES.easy, quality: QUALITY.low,
    getSettings: () => ({}), callbacks: {}, playerAI: true,
  });
  let frames = 0, earlyState = null;
  while (sess.state !== 'finished' && frames < 60 * 240) {
    sess.update(1 / 60); frames++;
    if (frames === 240) earlyState = sess.state; // 4s in: must still be racing
  }
  ok('sprint finished', sess.state === 'finished', `state=${sess.state} raceS=${Math.round(sess.player.raceS)}`);
  // REGRESSION: sprint must not finish instantly (raceS used to start past the line)
  ok('sprint not instant', earlyState === 'racing' || earlyState === 'countdown', `state@4s=${earlyState}`);
  ok('sprint takes real time', sess.raceT > 15, `raceT=${sess.raceT.toFixed(1)}s`);
  const target = sess.track.sprintFinishS;
  ok('sprint ends at the finish arch', Math.abs(sess.player.raceS - target) < 300, `raceS=${Math.round(sess.player.raceS)} target=${target}`);
  sess.dispose();
}

// ---- steering sign: stick/Arrow RIGHT must produce negative steer
// (positive physics steer turns toward world +X = screen-LEFT for the chase cam)
{
  const pad = { index: 0, id: 'TestPad', connected: true, axes: [1, 0], buttons: [] };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const inp = new InputSystem(() => ({ steerSensitivity: 70, deadzone: 0 }));
  inp._padEvent({ gamepad: pad }, true);
  inp.update(0.016);
  ok('stick right steers screen-right', inp.steer < -0.5, `steer=${inp.steer.toFixed(2)}`);
  const kbr = new InputSystem(() => ({ steerSensitivity: 70, deadzone: 0 }));
  kbr._keys.add('ArrowRight');
  for (let i = 0; i < 30; i++) kbr.update(0.016);
  ok('ArrowRight steers screen-right', kbr.steer < -0.5, `steer=${kbr.steer.toFixed(2)}`);
  const kbl = new InputSystem(() => ({ steerSensitivity: 70, deadzone: 0 }));
  kbl._keys.add('ArrowLeft');
  for (let i = 0; i < 30; i++) kbl.update(0.016);
  ok('ArrowLeft steers screen-left', kbl.steer > 0.5, `steer=${kbl.steer.toFixed(2)}`);
  delete globalThis.navigator;
}

// ---- persistence (settings, best times, unlocks) ----
{
  localStorage.clear();
  ok('settings defaults', loadSettings().steerSensitivity === 70);
  saveSettings({ ...loadSettings(), steerSensitivity: 42 });
  ok('settings persist', loadSettings().steerSensitivity === 42);
  ok('no bests initially', Object.keys(loadBests()).length === 0);
  ok('saveBest first time', saveBest('azure', 'timeattack', 95234) === true);
  ok('best persists', loadBests()['azure:timeattack'] === 95234);
  ok('worse time rejected', saveBest('azure', 'timeattack', 99000) === false);
  ok('best unchanged after worse', loadBests()['azure:timeattack'] === 95234);
  ok('better time accepted', saveBest('azure', 'timeattack', 90100) === true);
  ok('best updated', loadBests()['azure:timeattack'] === 90100);
  ok('modes keyed separately', saveBest('azure', 'circuit', 120000) === true
    && loadBests()['azure:timeattack'] === 90100 && loadBests()['azure:circuit'] === 120000);
  ok('apex locked initially', loadUnlocks().apexone === false);
  ok('unlockApexOne', unlockApexOne() === true && loadUnlocks().apexone === true);
  ok('unlock idempotent', unlockApexOne() === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
