// VELOCITY RUSH — application shell / screen state machine.
import { useEffect, useRef, useState, useCallback } from 'react';
import GameCanvas from './ui/GameCanvas.jsx';
import HUD from './ui/HUD.jsx';
import {
  MainMenu, SetupFlow, ControlsScreen, SettingsScreen, HelpScreen,
  PauseOverlay, ResultsScreen, CountdownOverlay, MessageFeed,
} from './ui/screens.jsx';
import { getInput } from './ui/inputSingleton.js';
import { holder } from './game/activeSession.js';
import {
  loadSettings, saveSettings, loadBests, saveBest, loadUnlocks, unlockApexOne,
} from './data/settings.js';

// Keeps gamepad edges flowing on every screen where the race session
// isn't driving (menus, pause, results…): the session pumps input itself
// while racing / counting down / paused / finished.
function MenuInputPump() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = holder.session;
      if (!s || s.state === 'idle') {
        try { getInput().update(dt); } catch { /* noop */ }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [settings, setSettingsState] = useState(loadSettings);
  const settingsRef = useRef(settings);
  const [unlocks, setUnlocks] = useState(loadUnlocks);
  const [bests, setBests] = useState(loadBests);
  const [race, setRace] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [paused, setPaused] = useState(false);
  const [messages, setMessages] = useState([]);
  const [results, setResults] = useState(null);
  const [resultsMeta, setResultsMeta] = useState(null);
  const [fatal, setFatal] = useState(null);

  useEffect(() => {
    const inp = getInput();
    inp.attach();
    return () => inp.detach();
  }, []);

  const updateSettings = useCallback((patch) => {
    const n = { ...settingsRef.current, ...patch };
    settingsRef.current = n;
    setSettingsState(n);
    saveSettings(n);
  }, []);

  const pushMessage = useCallback((m) => {
    setMessages((prev) => [...prev.slice(-4), m]);
    setTimeout(() => setMessages((prev) => prev.filter((x) => x.id !== m.id)), 2400);
  }, []);

  const showCountdown = useCallback((v) => {
    setCountdown(v);
    if (v === 'GO!') setTimeout(() => setCountdown(null), 900);
  }, []);

  const startRace = useCallback((setup) => {
    setRace({ setup, key: Date.now() });
    setResults(null);
    setResultsMeta(null);
    setPaused(false);
    setMessages([]);
    setCountdown(null);
    setFatal(null);
    setScreen('game');
  }, []);

  const handleFinish = useCallback((res) => {
    if (!race) return;
    const ms = race.setup.mode === 'timeattack' ? res.bestLapMs : (res.timeMs ?? res.bestLapMs);
    const newBest = saveBest(race.setup.trackId, race.setup.mode, ms);
    setBests(loadBests());
    let unlockedNow = false;
    if (res.won && !loadUnlocks().apexone) {
      unlockedNow = unlockApexOne();
      setUnlocks(loadUnlocks());
    }
    setResultsMeta({ newBest, unlockedNow });
    setResults(res);
  }, [race]);

  const cbs = useRef({});
  cbs.current = {
    onMessage: pushMessage,
    onCountdown: showCountdown,
    onPause: setPaused,
    onFinish: handleFinish,
    onFatal: setFatal,
  };

  const resume = () => holder.session && holder.session.resumeGame();
  const quitToMenu = () => { setScreen('menu'); setRace(null); setResults(null); setPaused(false); };

  return (
    <div className="app">
      <MenuInputPump />
      {screen === 'menu' && (
        <MainMenu
          unlocked={unlocks}
          onPlay={() => setScreen('setup')}
          onControls={() => setScreen('controls')}
          onSettings={() => setScreen('settings')}
          onHelp={() => setScreen('help')}
        />
      )}
      {screen === 'setup' && (
        <SetupFlow unlocked={unlocks} bests={bests} settings={settings} onSettings={updateSettings}
          onBack={() => setScreen('menu')} onStart={startRace} />
      )}
      {screen === 'controls' && (
        <ControlsScreen settings={settings} onChange={updateSettings} onBack={() => setScreen('menu')} />
      )}
      {screen === 'settings' && (
        <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => setScreen('menu')} />
      )}
      {screen === 'help' && <HelpScreen onBack={() => setScreen('menu')} />}

      {screen === 'game' && race && (
        <div className="game-wrap">
          <GameCanvas key={race.key} setup={race.setup} settingsRef={settingsRef} cbs={cbs.current} />
          {!results && <HUD />}
          <MessageFeed messages={messages} />
          <CountdownOverlay value={countdown} />
          {paused && !results && (
            <PauseOverlay
              onResume={resume}
              onRestart={() => startRace(race.setup)}
              onQuit={quitToMenu}
            />
          )}
          {results && (
            <ResultsScreen
              results={results} setup={race.setup} meta={resultsMeta}
              onRetry={() => startRace(race.setup)}
              onSetup={() => { setScreen('setup'); setRace(null); }}
              onMenu={quitToMenu}
            />
          )}
          {fatal && (
            <div className="overlay">
              <div className="pause-box">
                <h2>ERROR</h2>
                <p>{fatal}</p>
                <button className="btn primary" onClick={quitToMenu}>Back to menu</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
