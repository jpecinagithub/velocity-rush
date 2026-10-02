// Headless validation: ?autotest=1 — AI drives a full race with no
// renderer attached. Progress and errors are reported into the DOM.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GameSession } from '../game/session.js';
import { Track } from '../game/track.js';
import { InputSystem } from '../game/input.js';
import { CARS } from '../data/cars.js';
import { TRACKS } from '../data/tracks.js';
import { DIFFICULTIES, QUALITY, MODES } from '../game/constants.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function AutotestApp() {
  const [lines, setLines] = useState(['arrancando autotest…']);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const log = (s) => { if (!cancelled) setLines((p) => [...p, s]); };
    (async () => {
      try {
        // 1. tracks
        for (const def of TRACKS) {
          const t = new Track(def);
          if (!(t.length > 2000)) throw new Error(`${def.id}: longitud ${t.length}`);
          if (t.N < 200) throw new Error(`${def.id}: pocas muestras`);
          for (let i = 1; i < t.checkpoints.length; i++)
            if (t.checkpoints[i] <= t.checkpoints[i - 1]) throw new Error(`${def.id}: checkpoints desordenados`);
          const seen = new Set();
          for (let i = 0; i < 6; i++) { const g = t.gridSlot(i); const k = Math.round(g.s) + ':' + g.d.toFixed(1); if (seen.has(k)) throw new Error('grid duplicado'); seen.add(k); }
          const fr = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
          t.frameAt(0, fr);
          log(`OK pista ${def.id}: ${(t.length / 1000).toFixed(2)} km, ${t.checkpoints.length} checkpoints`);
        }

        // 2. input defensiveness (no listeners, no gamepad API assumptions)
        const inp = new InputSystem(() => ({}));
        inp.update(0.016);
        if (inp.steer !== 0 || inp.consume('pause') !== false) throw new Error('input inconsistente');
        log('OK input sin gamepad ni listeners');

        // 3. full AI race on each track (circuit, 1 lap)
        for (const def of TRACKS) {
          const sess = new GameSession({
            trackDef: def,
            carDef: CARS[0],
            aiCarDefs: CARS.filter((c) => !c.locked),
            mode: 'circuit',
            difficulty: DIFFICULTIES.normal,
            quality: QUALITY.low,
            getSettings: () => ({}),
            callbacks: {},
            playerAI: true,
            lapsOverride: 1,
          });
          let frames = 0, nanHit = false, stuckWarned = false;
          const maxFrames = 60 * 300;
          while (sess.state !== 'finished' && frames < maxFrames) {
            sess.update(1 / 60);
            frames++;
            for (const v of sess.vehicles) {
              if (!isFinite(v.pos.x + v.pos.y + v.pos.z + v.speed)) { nanHit = true; break; }
              if (Math.abs(v.d) > 120) { if (!stuckWarned) { log(`AVISO ${def.id}: d=${v.d.toFixed(1)} fuera de pista`); stuckWarned = true; } }
            }
            if (nanHit) break;
            if (frames % 600 === 0) await sleep(0);
          }
          if (nanHit) throw new Error(`${def.id}: NaN in physics`);
          if (sess.state !== 'finished') throw new Error(`${def.id}: did not finish in 300 s (state ${sess.state}, lap ${sess.player.lap})`);
          const r = sess.results;
          log(`OK race ${def.id}: pos ${r.position}/${r.total}, ${(r.bestLapMs / 1000).toFixed(1)} s best lap, ${frames} frames`);
          sess.dispose();
        }

        // 4. sprint finish
        {
          const def = TRACKS[0];
          const sess = new GameSession({
            trackDef: def, carDef: CARS[3], aiCarDefs: CARS.filter((c) => !c.locked),
            mode: 'sprint', difficulty: DIFFICULTIES.easy, quality: QUALITY.low,
            getSettings: () => ({}), callbacks: {}, playerAI: true,
          });
          let frames = 0;
          while (sess.state !== 'finished' && frames < 60 * 300) { sess.update(1 / 60); frames++; if (frames % 600 === 0) await sleep(0); }
          if (sess.state !== 'finished') throw new Error('sprint did not finish');
          log(`OK sprint: pos ${sess.results.position}, finish at ${(def.sprintFrac * 100).toFixed(0)}% of the route`);
          sess.dispose();
        }

        log('AUTOTEST COMPLETO: todo OK');
      } catch (e) {
        log(`FALLO: ${e.message}\n${e.stack}`);
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: '#0a0c12', color: '#cfe3ff', minHeight: '100vh', padding: 24, fontFamily: 'monospace', fontSize: 14 }}>
      <h1>VELOCITY RUSH — autotest {done ? '✓' : '…'}</h1>
      <pre>{lines.join('\n')}</pre>
    </div>
  );
}
