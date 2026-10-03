// All menu / overlay screens (English UI). Gamepad + keyboard navigable.
import { useState, useEffect, useRef } from 'react';
import { CARS } from '../data/cars.js';
import { TRACKS } from '../data/tracks.js';
import { MODES, DIFFICULTIES } from '../game/constants.js';
import { getInput } from './inputSingleton.js';
import { useMenuNav } from './useMenuNav.js';
import { loadRecords, qualifiesForRecords, saveRecord, loadPilotName, savePilotName } from '../data/settings.js';

export function fmtMs(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 1000)).padStart(3, '0')}`;
}

function Logo({ small }) {
  return (
    <div className={small ? 'logo small' : 'logo'}>
      <div className="logo-title">VELOCITY<span>RUSH</span></div>
      {!small && <div className="logo-sub">ARCADE RACING · 100% ORIGINAL</div>}
    </div>
  );
}

function MenuButton({ label, sub, focused, onClick, onHover, danger }) {
  return (
    <button
      className={`btn${focused ? ' focused' : ''}${danger ? ' danger' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <span className="btn-label">{label}</span>
      {sub && <span className="btn-sub">{sub}</span>}
    </button>
  );
}

// ---------------- MAIN MENU ----------------
export function MainMenu({ onPlay, onControls, onSettings, onHelp, onAuthor, unlocked }) {
  const items = [
    { label: 'PLAY', sub: 'Circuit · Sprint · Time Attack', go: onPlay },
    { label: 'CONTROLLER / KEYBOARD', sub: 'Configure controls', go: onControls },
    { label: 'SETTINGS', sub: 'Graphics · sound · camera', go: onSettings },
    { label: 'HOW TO PLAY', sub: 'Quick guide', go: onHelp },
    { label: 'AUTHOR', sub: 'About the creator', go: onAuthor },
  ];
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go());
  return (
    <div className="screen menu-screen">
      <div className="menu-wrap">
        <Logo />
        {unlocked.apexone && <div className="unlock-note">APEX ONE unlocked in your garage</div>}
        <div className="menu-list">
          {items.map((it, i) => (
            <MenuButton key={it.label} label={it.label} sub={it.sub}
              focused={focus === i} onClick={it.go} onHover={() => set(i)} />
          ))}
        </div>
        <div className="menu-hint">↑↓ navigate · ✕ / Enter confirm · PlayStation controller compatible</div>
      </div>
    </div>
  );
}

// ---------------- RACE SETUP FLOW ----------------
const MODE_EN = { circuit: 'CIRCUIT', sprint: 'HIGHWAY SPRINT', timeattack: 'TIME ATTACK' };
const DIFF_EN = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };

function StatBar({ label, v }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <div className="stat-bar"><div className="stat-fill" style={{ width: `${Math.round(v * 100)}%` }} /></div>
    </div>
  );
}

export function SetupFlow({ unlocked, bests, settings, onSettings, onBack, onStart }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('circuit');
  const [difficulty, setDifficulty] = useState('normal');
  const [carId, setCarId] = useState('vortex');
  const [trackId, setTrackId] = useState('azure');
  const [irow, setIrow] = useState(0);
  const [padState, setPadState] = useState({ on: false, id: '' });
  const irowRef = useRef(0);
  irowRef.current = irow;

  const steps = ['MODE', 'CAR', 'TRACK', 'CONTROLS', 'READY'];
  const LAST = 4;

  const next = () => setStep((s) => Math.min(LAST, s + 1));
  const prev = () => { if (step === 0) onBack(); else setStep((s) => s - 1); };
  const begin = () => onStart({ mode, difficulty, carId, trackId });

  const setSetting = (k, v) => onSettings({ [k]: v });
  const adjust = (dir) => {
    const r = irowRef.current;
    if (r === 0) setSetting('steerSensitivity', Math.min(100, Math.max(10, settings.steerSensitivity + dir * 5)));
    else if (r === 1) setSetting('deadzone', Math.min(0.4, Math.max(0.05, +(settings.deadzone + dir * 0.02).toFixed(2))));
  };

  // gamepad: confirm advances on steps 0-2 via card pick; back goes back
  const cardCount = step === 0 ? 3 : step === 1 ? CARS.length : step === 2 ? TRACKS.length : 1;
  const [focus, setFocus] = useMenuNav(cardCount,
    (i) => {
      if (step === 0) setMode(Object.keys(MODES)[i]);
      else if (step === 1) { const c = CARS[i]; if (!c.locked || unlocked.apexone) setCarId(c.id); }
      else if (step === 2) setTrackId(TRACKS[i].id);
      else if (step === LAST) begin();
      if (step < 3) next();
    },
    { cols: step === 1 ? 3 : 1, onBack: prev, enabled: step !== 3 });

  // bespoke nav for the MANDO step: up/down moves between rows,
  // left/right adjusts sliders, confirm continues
  useEffect(() => {
    if (step !== 3) return;
    const id = setInterval(() => {
      const inp = getInput();
      if (inp.consume('up')) setIrow((r) => (r + 2) % 3);
      if (inp.consume('down')) setIrow((r) => (r + 1) % 3);
      if (inp.consume('left')) adjust(-1);
      if (inp.consume('right')) adjust(1);
      if (inp.consume('confirm') && irowRef.current === 2) next();
      if (inp.consume('back')) prev();
      const on = inp.padConnected, pid = inp.padId;
      setPadState((p) => (p.on === on && p.id === pid ? p : { on, id: pid }));
    }, 110);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="screen">
      <div className="setup-wrap">
        <div className="setup-head">
          <button className="back-link" onClick={prev}>← Back</button>
          <div className="steps">
            {steps.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</span>)}
          </div>
          <div className="setup-spacer" />
        </div>

        {step === 0 && (
          <>
            <h2>Choose your mode</h2>
            <div className="card-grid">
              {Object.values(MODES).map((m, i) => (
                <button key={m.id} className={`card${mode === m.id ? ' selected' : ''}${focus === i ? ' focused' : ''}`}
                  onClick={() => { setMode(m.id); }} onMouseEnter={() => setFocus(i)} onDoubleClick={next}>
                  <div className="card-title">{MODE_EN[m.id]}</div>
                  <div className="card-desc">{m.id === 'circuit' ? 'Classic race: 2 laps against 5 rivals.' : m.id === 'sprint' ? 'Point to point through dense traffic.' : 'You vs the clock: 3 laps, your best lap is saved.'}</div>
                  <div className="card-meta">{m.id === 'timeattack' ? 'Solo' : '6 racers'}</div>
                </button>
              ))}
            </div>
            {mode !== 'timeattack' && (
              <div className="seg-row">
                <span>AI difficulty:</span>
                <div className="seg">
                  {Object.values(DIFFICULTIES).map((d) => (
                    <button key={d.id} className={difficulty === d.id ? 'on' : ''} onClick={() => setDifficulty(d.id)}>{DIFF_EN[d.id]}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2>Choose your car</h2>
            <div className="card-grid cars">
              {CARS.map((c, i) => {
                const locked = c.locked && !unlocked.apexone;
                return (
                  <button key={c.id} disabled={locked}
                    className={`card${carId === c.id ? ' selected' : ''}${focus === i ? ' focused' : ''}${locked ? ' locked' : ''}`}
                    onClick={() => !locked && setCarId(c.id)} onMouseEnter={() => setFocus(i)} onDoubleClick={next}>
                    <div className="car-swatch" style={{ background: `#${c.color.toString(16).padStart(6, '0')}` }} />
                    <div className="card-title">{c.name}</div>
                    <div className="card-desc">{locked ? '🔒 Win any race to unlock this hypercar.' : c.tagline}</div>
                    {!locked && (
                      <div className="stats">
                        <StatBar label="SPD" v={c.stats.topSpeed / 96} />
                        <StatBar label="ACC" v={c.stats.accel / 33} />
                        <StatBar label="HDL" v={c.stats.handling} />
                        <StatBar label="BRK" v={c.stats.braking / 36} />
                        <StatBar label="N₂O" v={c.stats.nitro / 1.3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Choose the track</h2>
            <div className="card-grid">
              {TRACKS.map((t, i) => {
                const best = bests[`${t.id}:${mode}`];
                return (
                  <button key={t.id} className={`card${trackId === t.id ? ' selected' : ''}${focus === i ? ' focused' : ''}`}
                    onClick={() => setTrackId(t.id)} onMouseEnter={() => setFocus(i)} onDoubleClick={next}>
                    <div className={`track-swatch ${t.env}`} />
                    <div className="card-title">{t.name}</div>
                    <div className="card-desc">{t.desc}</div>
                    <div className="chips">{t.features.map((f) => <span key={f} className="chip">{f}</span>)}</div>
                    <div className="card-meta">Record: {fmtMs(best)}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Controls</h2>
            <div className={`pad-status${padState.on ? ' on' : ''}`}>
              <span className="dot" />
              {padState.on ? `Controller detected: ${padState.id.slice(0, 42)}` : 'No controller detected — keyboard is ready'}
            </div>
            <p className="menu-hint" style={{ textAlign: 'left', maxWidth: 560 }}>
              Keyboard and controller work at the same time. On the controller: left stick to steer,
              R2 accelerate, L2 brake, ✕ nitro, ▢ drift, △ camera, ○ back, Options pause.
            </p>
            {[
              { label: 'Steering sensitivity', val: settings.steerSensitivity, fmt: (v) => `${v}`,
                set: (v) => setSetting('steerSensitivity', Math.min(100, Math.max(10, Math.round(v)))),
                min: 10, max: 100, stepv: 1 },
              { label: 'Controller dead zone', val: Math.round(settings.deadzone * 100), fmt: (v) => `${v} %`,
                set: (v) => setSetting('deadzone', Math.min(0.4, Math.max(0.05, +(v / 100).toFixed(2)))),
                min: 5, max: 40, stepv: 1 },
            ].map((r, i) => (
              <div key={r.label} className="form-row" style={irow === i ? { borderColor: 'var(--cyan)' } : null}
                onClick={() => setIrow(i)}>
                <span>{r.label}</span>
                <button className="kbd" onClick={(e) => { e.stopPropagation(); setIrow(i); r.set(r.val - 5 * r.stepv); }}>−</button>
                <input type="range" min={r.min} max={r.max} step={r.stepv} value={r.val}
                  onChange={(e) => r.set(+e.target.value)} />
                <button className="kbd" onClick={(e) => { e.stopPropagation(); setIrow(i); r.set(r.val + 5 * r.stepv); }}>+</button>
                <b>{r.fmt(r.val)}</b>
              </div>
            ))}
            <button className={`btn primary big${irow === 2 ? ' focused' : ''}`}
              onClick={next} onMouseEnter={() => setIrow(2)}>Continue →</button>
          </>
        )}

        {step === LAST && (
          <div className="ready-box">
            <h2>Ready?</h2>
            <div className="ready-rows">
              <div><span>Mode</span><b>{MODE_EN[mode]}{mode !== 'timeattack' ? ` · ${DIFF_EN[difficulty]}` : ''}</b></div>
              <div><span>Car</span><b>{CARS.find((c) => c.id === carId).name}</b></div>
              <div><span>Track</span><b>{TRACKS.find((t) => t.id === trackId).name}</b></div>
              <div><span>Controller</span><b>{padState.on ? '🎮 ' + padState.id.slice(0, 24) : '⌨️ Keyboard'}</b></div>
            </div>
            <button className="btn primary big" onClick={begin}>RACE!</button>
            <div className="menu-hint">W/↑ accelerate · S/↓ brake · A/D steer · Space drift · Shift nitro · C camera · R reset · P pause</div>
          </div>
        )}

        <div className="setup-foot">
          {step < LAST
            ? <button className="btn primary" onClick={next}>Next →</button>
            : null}
        </div>
      </div>
    </div>
  );
}

// ---------------- CONTROLS ----------------
const MAP_ROWS = [
  ['Accelerate', 'W / ↑', 'R2 (trigger)'],
  ['Brake / reverse', 'S / ↓', 'L2 (trigger)'],
  ['Steer', 'A · D / ← →', 'Left stick'],
  ['Drift (handbrake)', 'Space', '▢ Square'],
  ['Nitro', 'Shift', '✕ Cross'],
  ['Change camera', 'C', '△ Triangle'],
  ['Reset car', 'R', '—'],
  ['Pause', 'P / Esc', 'Options'],
  ['Back (menus)', '—', '○ Circle'],
];

function Seg({ options, value, onPick }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

export function ControlsScreen({ settings, onChange, onBack }) {
  const [padInfo, setPadInfo] = useState({ connected: false, id: '' });
  const [live, setLive] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      const inp = getInput();
      setPadInfo({ connected: inp.padConnected, id: inp.padId });
      setLive(inp.padConnected ? { steer: inp.steer, accel: inp.accelerate, brake: inp.brake } : null);
    }, 400);
    return () => clearInterval(id);
  }, []);

  const set = (k, v) => onChange({ [k]: v });
  return (
    <div className="screen">
      <div className="setup-wrap narrow">
        <div className="setup-head">
          <button className="back-link" onClick={onBack}>← Back</button>
          <h2>Controller / Keyboard</h2>
          <div className="setup-spacer" />
        </div>

        <div className="form-row"><span>Preferred input</span>
          <Seg options={[['auto', 'Auto'], ['keyboard', 'Keyboard'], ['gamepad', 'Controller']]} value={settings.controlType} onPick={(v) => set('controlType', v)} />
        </div>
        <div className="form-row"><span>Steering sensitivity</span>
          <input type="range" min="10" max="100" value={settings.steerSensitivity} onChange={(e) => set('steerSensitivity', +e.target.value)} />
          <b>{settings.steerSensitivity}</b>
        </div>
        <div className="form-row"><span>Stick dead zone</span>
          <input type="range" min="0.05" max="0.4" step="0.01" value={settings.deadzone} onChange={(e) => set('deadzone', +e.target.value)} />
          <b>{settings.deadzone.toFixed(2)}</b>
        </div>
        <div className="form-row"><span>Keyboard smoothing</span>
          <Seg options={[['low', 'Fast'], ['medium', 'Medium'], ['high', 'Smooth']]} value={settings.steerSmoothing} onPick={(v) => set('steerSmoothing', v)} />
        </div>
        <div className="form-row"><span>Controller vibration</span>
          <Seg options={[[true, 'Yes'], [false, 'No']]} value={settings.vibration} onPick={(v) => set('vibration', v)} />
        </div>
        <div className="form-row"><span>Camera shake</span>
          <Seg options={[['off', 'Off'], ['low', 'Low'], ['high', 'High']]} value={settings.cameraShake} onPick={(v) => set('cameraShake', v)} />
        </div>

        <h3>Controller status</h3>
        <div className={`pad-status${padInfo.connected ? ' on' : ''}`}>
          <span className="dot" />
          {padInfo.connected ? `Connected: ${padInfo.id.slice(0, 42)}` : 'No controller detected — press any button on the controller'}
        </div>
        {live && (
          <div className="live-pad">
            <div>Steer <div className="stat-bar"><div className="stat-fill" style={{ width: `${Math.abs(live.steer) * 100}%` }} /></div></div>
            <div>Throttle <div className="stat-bar"><div className="stat-fill" style={{ width: `${live.accel * 100}%` }} /></div></div>
            <div>Brake <div className="stat-bar"><div className="stat-fill" style={{ width: `${live.brake * 100}%` }} /></div></div>
          </div>
        )}

        <h3>Controller mapping (PlayStation style)</h3>
        <table className="map-table">
          <tbody>
            {MAP_ROWS.map(([a, kb, pad]) => (
              <tr key={a}><td>{a}</td><td><span className="kbd">{kb}</span></td><td><span className="kbd">{pad}</span></td></tr>
            ))}
          </tbody>
        </table>
        <div className="menu-hint">Keyboard always works as a backup, even with a controller connected.</div>
      </div>
    </div>
  );
}

// ---------------- SETTINGS ----------------
export function SettingsScreen({ settings, onChange, onBack }) {
  const set = (k, v) => onChange({ [k]: v });
  return (
    <div className="screen">
      <div className="setup-wrap narrow">
        <div className="setup-head">
          <button className="back-link" onClick={onBack}>← Back</button>
          <h2>Settings</h2>
          <div className="setup-spacer" />
        </div>
        <div className="form-row"><span>Graphics quality</span>
          <Seg options={[['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} value={settings.graphics} onPick={(v) => set('graphics', v)} />
        </div>
        <div className="form-row"><span>Sound</span>
          <Seg options={[[true, 'Yes'], [false, 'No']]} value={settings.sound} onPick={(v) => set('sound', v)} />
        </div>
        <div className="form-row"><span>Music</span>
          <Seg options={[[true, 'Yes'], [false, 'No']]} value={settings.music} onPick={(v) => set('music', v)} />
        </div>
        <div className="form-row"><span>Starting camera</span>
          <Seg options={[[0, 'Close'], [1, 'Far'], [2, 'Hood']]} value={settings.cameraMode} onPick={(v) => set('cameraMode', v)} />
        </div>
        <div className="menu-hint">Auto quality adapts to your hardware and lowers resolution if the frame rate drops.</div>
      </div>
    </div>
  );
}

// ---------------- HELP ----------------
export function HelpScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="setup-wrap narrow">
        <div className="setup-head">
          <button className="back-link" onClick={onBack}>← Back</button>
          <h2>How to play</h2>
          <div className="setup-spacer" />
        </div>
        <div className="help">
          <h3>Goal</h3>
          <p>Circuit: complete 2 laps and finish first. Sprint: reach the finish before your 5 rivals while dodging traffic. Time attack: set your best lap.</p>
          <h3>Nitro</h3>
          <p>Nitro refills on its own: overtake rivals, ride their slipstream, graze traffic without touching it (near miss), hit checkpoints, jump, and drive cleanly at high speed. Press Shift or ✕ to burn it.</p>
          <h3>Slipstream</h3>
          <p>If you tuck in behind another car you'll see "SLIPSTREAM": free speed. Leaving the slipstream with a full meter gives you an extra boost.</p>
          <h3>Drift</h3>
          <p>Hold Space or ▢ through tight corners to drift. Controlled drifting also refills nitro.</p>
          <h3>Tips</h3>
          <ul>
            <li>Brake before the corner, not inside it.</li>
            <li>Blue arches are checkpoints: they grant nitro.</li>
            <li>If you get stuck, the car resets itself. You can also press R.</li>
            <li>In sprint, traffic is your enemy and your ally: use it for the slipstream.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------- AUTHOR ----------------
const AUTHOR_EMAIL = 'jpecina@gmail.com';

export function AuthorScreen({ onBack }) {
  return (
    <div className="screen">
      <div className="setup-wrap narrow">
        <div className="setup-head">
          <button className="back-link" onClick={onBack}>← Back</button>
          <h2>Author</h2>
          <div className="setup-spacer" />
        </div>
        <div className="help">
          <h3>Jon Peciña</h3>
          <p>AI Engineer · Creator of VELOCITY RUSH</p>
          <p>Jon Peciña is an Industrial Engineer (UNAV) with a Master in Full Stack Development (UNIR). After 22 years in corporate finance — as controller, finance director and financial accountant in Spain, the Netherlands and Peru — he converted to AI Engineering, building complete applications accelerated by AI.</p>
          <p>VELOCITY RUSH is his original arcade racing game: every car, track and sound is made from scratch. No licensed assets, no placeholders.</p>
          <h3>Contact</h3>
          <p>Questions, feedback or ideas — happy to hear from you.</p>
          <p><a className="btn primary" href={`mailto:${AUTHOR_EMAIL}`}>✉ {AUTHOR_EMAIL}</a></p>
        </div>
      </div>
    </div>
  );
}

// ---------------- OVERLAYS ----------------
export function CountdownOverlay({ value }) {
  if (value == null) return null;
  return <div className="countdown" key={value}>{value}</div>;
}

export function MessageFeed({ messages }) {
  return (
    <div className="msg-feed">
      {messages.map((m) => (
        <div key={m.id} className={`msg${m.cls ? ' ' + m.cls : ''}`}>
          <div className="msg-text">{m.text}</div>
          {m.sub && <div className="msg-sub">{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function PauseOverlay({ onResume, onRestart, onQuit }) {
  const items = [
    { label: 'RESUME', go: onResume },
    { label: 'RESTART RACE', go: onRestart },
    { label: 'QUIT TO MENU', go: onQuit, danger: true },
  ];
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go());
  return (
    <div className="overlay">
      <div className="pause-box">
        <h2>PAUSED</h2>
        {items.map((it, i) => (
          <MenuButton key={it.label} label={it.label} danger={it.danger}
            focused={focus === i} onClick={it.go} onHover={() => set(i)} />
        ))}
        <div className="menu-hint">P / Esc or Options to resume</div>
      </div>
    </div>
  );
}

export function ResultsScreen({ results, setup, meta, onRetry, onSetup, onMenu }) {
  if (!results) return null;
  const car = CARS.find((c) => c.id === setup.carId);
  const track = TRACKS.find((t) => t.id === setup.trackId);
  const isCircuit = setup.mode === 'circuit';
  const inputRef = useRef(null);
  // Circuit: if the total time makes the track's top 10, ask for the pilot's nickname first.
  const [phase, setPhase] = useState(() =>
    (isCircuit && results.timeMs != null && qualifiesForRecords(setup.trackId, results.timeMs)) ? 'entry' : 'done');
  const [nick, setNick] = useState(() => loadPilotName() || 'DRIVER');
  const [typing, setTyping] = useState(false);
  const [savedRank, setSavedRank] = useState(-1);
  const [records, setRecords] = useState(() => (isCircuit ? loadRecords(setup.trackId) : []));

  const doSave = () => {
    const rank = saveRecord(setup.trackId, {
      name: nick, ms: results.timeMs, carId: setup.carId, difficulty: setup.difficulty,
    });
    savePilotName(nick);
    setRecords(loadRecords(setup.trackId));
    setSavedRank(rank);
    inputRef.current?.blur();
    setPhase('done');
  };

  const items = phase === 'entry'
    ? [
        { label: 'SAVE RECORD', go: doSave },
        { label: 'SKIP', go: () => setPhase('done') },
      ]
    : [
        { label: 'RETRY', go: onRetry },
        { label: 'CHANGE MODE / CAR', go: onSetup },
        { label: 'MAIN MENU', go: onMenu },
      ];
  // While the nickname field has focus, gamepad/arrow menu navigation is disabled so typing works.
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go(), { enabled: !typing });
  const pos = results.position;
  const ord = pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : `${pos}th`;

  const recordCar = (r) => {
    const c = CARS.find((x) => x.id === r.carId);
    return c ? c.name : '—';
  };

  return (
    <div className="overlay">
      <div className="results-box">
        <div className={`results-pos p${pos}`}>{ord}</div>
        <div className="results-title">{results.won ? 'VICTORY!' : pos <= 3 ? 'PODIUM!' : 'RACE FINISHED'}</div>
        <div className="results-sub">{MODE_EN[setup.mode]} · {track.name} · {car.name}</div>
        {meta?.newBest && <div className="badge-newbest">★ NEW RECORD ★</div>}
        {meta?.unlockedNow && <div className="badge-unlock">APEX ONE UNLOCKED IN YOUR GARAGE</div>}
        {phase === 'entry' && (
          <div className="record-entry">
            <div className="record-entry-title">YOU MADE THE CIRCUIT TOP 10!</div>
            <div className="record-entry-sub">Your time: <b>{fmtMs(results.timeMs)}</b> — enter the driver's nickname</div>
            <input
              ref={inputRef}
              className="nick-input"
              value={nick}
              maxLength={12}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setNick(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSave(); }}
            />
            {items.map((it, i) => (
              <MenuButton key={it.label} label={it.label} focused={focus === i} onClick={it.go} onHover={() => set(i)} />
            ))}
          </div>
        )}
        <div className="results-rows">
          {results.timeMs != null && <div><span>Total time</span><b>{fmtMs(results.timeMs)}</b></div>}
          <div><span>Best lap</span><b>{fmtMs(results.bestLapMs)}</b></div>
          <div><span>Top speed</span><b>{results.topSpeedKmh} km/h</b></div>
          <div><span>Overtakes</span><b>{results.overtakes}</b></div>
          <div><span>Near misses</span><b>{results.nearMisses} (+{results.nearScore} pts)</b></div>
          <div><span>Nitro used</span><b>{results.nitroUsed.toFixed(1)} s</b></div>
        </div>
        {isCircuit && records.length > 0 && (
          <div className="records-table">
            <div className="records-title">BEST TIMES · {track.name}</div>
            {records.map((r, i) => (
              <div key={i} className={`record-row${i === savedRank ? ' hl' : ''}`}>
                <span className="record-pos">{i + 1}.</span>
                <span className="record-name">{r.name}</span>
                <span className="record-time">{fmtMs(r.ms)}</span>
                <span className="record-car">{recordCar(r)}</span>
              </div>
            ))}
          </div>
        )}
        {isCircuit && records.length === 0 && phase === 'done' && (
          <div className="records-empty">No times recorded on this track yet.</div>
        )}
        {phase === 'done' && items.map((it, i) => (
          <MenuButton key={it.label} label={it.label} focused={focus === i} onClick={it.go} onHover={() => set(i)} />
        ))}
      </div>
    </div>
  );
}
