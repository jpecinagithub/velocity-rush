// GameCanvas: the 3D race view, built on React Three Fiber.
// <Canvas> owns the WebGL renderer; SessionBridge creates the GameSession
// inside the R3F scene graph and steps it from useFrame.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GameSession } from '../game/session.js';
import { InputSystem } from '../game/input.js';
import { getCar, CARS } from '../data/cars.js';
import { getTrack } from '../data/tracks.js';
import { DIFFICULTIES, QUALITY } from '../game/constants.js';
import { getInput } from './inputSingleton.js';

function resolveQuality(pref) {
  if (pref && QUALITY[pref]) return QUALITY[pref];
  // auto: pick by hardware, with a runtime fps guard inside the bridge
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    return cores >= 8 && mem >= 8 ? QUALITY.high : cores >= 6 ? QUALITY.medium : QUALITY.low;
  } catch { return QUALITY.medium; }
}

function pickAiCars(playerId) {
  const pool = CARS.filter((c) => !c.locked && c.id !== playerId);
  const out = [];
  for (let i = 0; i < 5; i++) out.push(pool[i % pool.length]);
  return out;
}

// Image-based lighting for the whole scene: makes car paint clearcoat,
// chrome and rims read as real metal instead of flat gray. Generated
// locally with RoomEnvironment — no network fetch.
function SceneEnvironment() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  return null;
}

function SessionBridge({ setup, settingsRef, cbs, quality, autoQuality }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setDpr = useThree((s) => s.setDpr);
  const sessionRef = useRef(null);
  const guardRef = useRef({ acc: 0, n: 0, degraded: false });

  useEffect(() => {
    const input = getInput();
    let session = null;
    try {
      session = new GameSession({
        trackDef: getTrack(setup.trackId),
        carDef: getCar(setup.carId),
        aiCarDefs: pickAiCars(setup.carId),
        mode: setup.mode,
        difficulty: DIFFICULTIES[setup.difficulty] || DIFFICULTIES.normal,
        quality,
        getSettings: () => settingsRef.current,
        callbacks: {
          onMessage: cbs.onMessage,
          onCountdown: cbs.onCountdown,
          onPause: cbs.onPause,
          onFinish: cbs.onFinish,
        },
        input,
      });
      session.camMode = settingsRef.current.cameraMode || 0;
      session.attach(scene, camera, input);
    } catch (e) {
      console.error(e);
      if (cbs.onFatal) cbs.onFatal('Error al construir la escena: ' + (e && e.message));
      return;
    }
    sessionRef.current = session;

    // unlock audio on first gesture (browser autoplay policy)
    const unlockAudio = () => { try { session.audio.ensure(); } catch { /* noop */ } };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      try { session.dispose(); } catch { /* noop */ }
      sessionRef.current = null;
    };
    // mount-once per race: scene/camera from R3F are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera]);

  useFrame((_, rawDt) => {
    const session = sessionRef.current;
    if (!session) return;
    const dt = Math.min(rawDt || 0.016, 0.1);
    try {
      session.update(dt);
      session.audio.setMuted(!settingsRef.current.sound);
    } catch (e) {
      console.error('frame error', e);
    }
    // fps guard: if auto quality struggles, drop to dpr 1
    const g = guardRef.current;
    if (autoQuality && !g.degraded) {
      g.acc += dt; g.n++;
      if (g.acc >= 2.5) {
        const fps = g.n / g.acc;
        g.acc = 0; g.n = 0;
        if (fps < 42) { g.degraded = true; try { setDpr(1); } catch { /* noop */ } }
      }
    }
  });

  return null;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function GameCanvas({ setup, settingsRef, cbs }) {
  const [probe] = useState(() => webglAvailable());
  const quality = resolveQuality(settingsRef.current.graphics);
  const autoQuality = !settingsRef.current.graphics || settingsRef.current.graphics === 'auto';

  if (!probe) {
    if (cbs.onFatal) cbs.onFatal('Tu navegador no soporta WebGL, necesario para VELOCITY RUSH.');
    return (
      <div className="game-wrap">
        <div className="overlay">
          <div className="pause-box">
            <h2>SIN WEBGL</h2>
            <p>Tu navegador no soporta WebGL, necesario para VELOCITY RUSH.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-wrap">
      <Canvas
        shadows={quality.shadows > 0}
        dpr={Math.min(window.devicePixelRatio || 1, quality.dpr)}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 70, near: 0.1, far: 6000, position: [0, 40, -80] }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.06;
          if (gl.shadowMap) gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneEnvironment />
        <SessionBridge
          setup={setup}
          settingsRef={settingsRef}
          cbs={cbs}
          quality={quality}
          autoQuality={autoQuality}
        />
      </Canvas>
    </div>
  );
}

// re-exported for tests that want the plain input path without React
export { InputSystem };
