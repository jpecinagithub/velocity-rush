// All menu / overlay screens (Spanish UI). Gamepad + keyboard navigable.
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
      {!small && <div className="logo-sub">CARRERAS ARCADE · 100% ORIGINAL</div>}
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
export function MainMenu({ onPlay, onControls, onSettings, onHelp, unlocked }) {
  const items = [
    { label: 'JUGAR', sub: 'Circuito · Sprint · Contrarreloj', go: onPlay },
    { label: 'MANDO / TECLADO', sub: 'Configurar controles', go: onControls },
    { label: 'AJUSTES', sub: 'Gráficos · sonido · cámara', go: onSettings },
    { label: 'CÓMO JUGAR', sub: 'Guía rápida', go: onHelp },
  ];
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go());
  return (
    <div className="screen menu-screen">
      <div className="menu-wrap">
        <Logo />
        {unlocked.apexone && <div className="unlock-note">APEX ONE desbloqueado en tu garaje</div>}
        <div className="menu-list">
          {items.map((it, i) => (
            <MenuButton key={it.label} label={it.label} sub={it.sub}
              focused={focus === i} onClick={it.go} onHover={() => set(i)} />
          ))}
        </div>
        <div className="menu-hint">↑↓ navegar · ✕ / Enter confirmar · Mando PlayStation compatible</div>
      </div>
    </div>
  );
}

// ---------------- RACE SETUP FLOW ----------------
const MODE_ES = { circuit: 'CIRCUITO', sprint: 'SPRINT EN AUTOPISTA', timeattack: 'CONTRARRELOJ' };
const DIFF_ES = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };

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

  const steps = ['MODO', 'COCHE', 'CIRCUITO', 'MANDO', 'LISTO'];
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
          <button className="back-link" onClick={prev}>← Atrás</button>
          <div className="steps">
            {steps.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</span>)}
          </div>
          <div className="setup-spacer" />
        </div>

        {step === 0 && (
          <>
            <h2>Elige el modo</h2>
            <div className="card-grid">
              {Object.values(MODES).map((m, i) => (
                <button key={m.id} className={`card${mode === m.id ? ' selected' : ''}${focus === i ? ' focused' : ''}`}
                  onClick={() => { setMode(m.id); }} onMouseEnter={() => setFocus(i)} onDoubleClick={next}>
                  <div className="card-title">{MODE_ES[m.id]}</div>
                  <div className="card-desc">{m.id === 'circuit' ? 'Carrera clásica: 2 vueltas contra 5 rivales.' : m.id === 'sprint' ? 'De punto a punto entre tráfico denso.' : 'Tú contra el crono: 3 vueltas, tu mejor vuelta se guarda.'}</div>
                  <div className="card-meta">{m.id === 'timeattack' ? 'En solitario' : '6 pilotos'}</div>
                </button>
              ))}
            </div>
            {mode !== 'timeattack' && (
              <div className="seg-row">
                <span>Dificultad IA:</span>
                <div className="seg">
                  {Object.values(DIFFICULTIES).map((d) => (
                    <button key={d.id} className={difficulty === d.id ? 'on' : ''} onClick={() => setDifficulty(d.id)}>{DIFF_ES[d.id]}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2>Elige tu coche</h2>
            <div className="card-grid cars">
              {CARS.map((c, i) => {
                const locked = c.locked && !unlocked.apexone;
                return (
                  <button key={c.id} disabled={locked}
                    className={`card${carId === c.id ? ' selected' : ''}${focus === i ? ' focused' : ''}${locked ? ' locked' : ''}`}
                    onClick={() => !locked && setCarId(c.id)} onMouseEnter={() => setFocus(i)} onDoubleClick={next}>
                    <div className="car-swatch" style={{ background: `#${c.color.toString(16).padStart(6, '0')}` }} />
                    <div className="card-title">{c.name}</div>
                    <div className="card-desc">{locked ? '🔒 Gana cualquier carrera para desbloquear este hipercoche.' : c.tagline}</div>
                    {!locked && (
                      <div className="stats">
                        <StatBar label="VEL" v={c.stats.topSpeed / 96} />
                        <StatBar label="ACE" v={c.stats.accel / 33} />
                        <StatBar label="CUR" v={c.stats.handling} />
                        <StatBar label="FRE" v={c.stats.braking / 36} />
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
            <h2>Elige el circuito</h2>
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
                    <div className="card-meta">Récord: {fmtMs(best)}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Controles</h2>
            <div className={`pad-status${padState.on ? ' on' : ''}`}>
              <span className="dot" />
              {padState.on ? `Mando detectado: ${padState.id.slice(0, 42)}` : 'Sin mando detectado — el teclado está listo'}
            </div>
            <p className="menu-hint" style={{ textAlign: 'left', maxWidth: 560 }}>
              Teclado y mando funcionan a la vez. En el mando: stick izquierdo para girar,
              R2 acelerar, L2 frenar, ✕ nitro, ▢ derrape, △ cámara, ○ atrás, Options pausa.
            </p>
            {[
              { label: 'Sensibilidad de giro', val: settings.steerSensitivity, fmt: (v) => `${v}`,
                set: (v) => setSetting('steerSensitivity', Math.min(100, Math.max(10, Math.round(v)))),
                min: 10, max: 100, stepv: 1 },
              { label: 'Zona muerta del mando', val: Math.round(settings.deadzone * 100), fmt: (v) => `${v} %`,
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
              onClick={next} onMouseEnter={() => setIrow(2)}>Continuar →</button>
          </>
        )}

        {step === LAST && (
          <div className="ready-box">
            <h2>¿Listo?</h2>
            <div className="ready-rows">
              <div><span>Modo</span><b>{MODE_ES[mode]}{mode !== 'timeattack' ? ` · ${DIFF_ES[difficulty]}` : ''}</b></div>
              <div><span>Coche</span><b>{CARS.find((c) => c.id === carId).name}</b></div>
              <div><span>Circuito</span><b>{TRACKS.find((t) => t.id === trackId).name}</b></div>
              <div><span>Mando</span><b>{padState.on ? '🎮 ' + padState.id.slice(0, 24) : '⌨️ Teclado'}</b></div>
            </div>
            <button className="btn primary big" onClick={begin}>¡A CORRER!</button>
            <div className="menu-hint">W/↑ acelerar · S/↓ frenar · A/D girar · Espacio derrape · Shift nitro · C cámara · R recolocar · P pausa</div>
          </div>
        )}

        <div className="setup-foot">
          {step < LAST
            ? <button className="btn primary" onClick={next}>Siguiente →</button>
            : null}
        </div>
      </div>
    </div>
  );
}

// ---------------- CONTROLS ----------------
const MAP_ROWS = [
  ['Acelerar', 'W / ↑', 'R2 (gatillo)'],
  ['Frenar / marcha atrás', 'S / ↓', 'L2 (gatillo)'],
  ['Girar', 'A · D / ← →', 'Stick izquierdo'],
  ['Derrape (freno de mano)', 'Espacio', '▢ Cuadrado'],
  ['Nitro', 'Shift', '✕ Cruz'],
  ['Cambiar cámara', 'C', '△ Triángulo'],
  ['Recolocar coche', 'R', '—'],
  ['Pausa', 'P / Esc', 'Options'],
  ['Atrás (menús)', '—', '○ Círculo'],
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
          <button className="back-link" onClick={onBack}>← Atrás</button>
          <h2>Mando / Teclado</h2>
          <div className="setup-spacer" />
        </div>

        <div className="form-row"><span>Entrada preferida</span>
          <Seg options={[['auto', 'Auto'], ['keyboard', 'Teclado'], ['gamepad', 'Mando']]} value={settings.controlType} onPick={(v) => set('controlType', v)} />
        </div>
        <div className="form-row"><span>Sensibilidad de giro</span>
          <input type="range" min="10" max="100" value={settings.steerSensitivity} onChange={(e) => set('steerSensitivity', +e.target.value)} />
          <b>{settings.steerSensitivity}</b>
        </div>
        <div className="form-row"><span>Zona muerta del stick</span>
          <input type="range" min="0.05" max="0.4" step="0.01" value={settings.deadzone} onChange={(e) => set('deadzone', +e.target.value)} />
          <b>{settings.deadzone.toFixed(2)}</b>
        </div>
        <div className="form-row"><span>Suavizado de teclado</span>
          <Seg options={[['low', 'Rápido'], ['medium', 'Medio'], ['high', 'Suave']]} value={settings.steerSmoothing} onPick={(v) => set('steerSmoothing', v)} />
        </div>
        <div className="form-row"><span>Vibración del mando</span>
          <Seg options={[[true, 'Sí'], [false, 'No']]} value={settings.vibration} onPick={(v) => set('vibration', v)} />
        </div>
        <div className="form-row"><span>Sacudida de cámara</span>
          <Seg options={[['off', 'No'], ['low', 'Poca'], ['high', 'Mucha']]} value={settings.cameraShake} onPick={(v) => set('cameraShake', v)} />
        </div>

        <h3>Estado del mando</h3>
        <div className={`pad-status${padInfo.connected ? ' on' : ''}`}>
          <span className="dot" />
          {padInfo.connected ? `Conectado: ${padInfo.id.slice(0, 42)}` : 'Ningún mando detectado — pulsa cualquier botón del mando'}
        </div>
        {live && (
          <div className="live-pad">
            <div>Giro <div className="stat-bar"><div className="stat-fill" style={{ width: `${Math.abs(live.steer) * 100}%` }} /></div></div>
            <div>Acelerador <div className="stat-bar"><div className="stat-fill" style={{ width: `${live.accel * 100}%` }} /></div></div>
            <div>Freno <div className="stat-bar"><div className="stat-fill" style={{ width: `${live.brake * 100}%` }} /></div></div>
          </div>
        )}

        <h3>Mapeo del mando (estilo PlayStation)</h3>
        <table className="map-table">
          <tbody>
            {MAP_ROWS.map(([a, kb, pad]) => (
              <tr key={a}><td>{a}</td><td><span className="kbd">{kb}</span></td><td><span className="kbd">{pad}</span></td></tr>
            ))}
          </tbody>
        </table>
        <div className="menu-hint">El teclado funciona siempre como respaldo, incluso con mando conectado.</div>
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
          <button className="back-link" onClick={onBack}>← Atrás</button>
          <h2>Ajustes</h2>
          <div className="setup-spacer" />
        </div>
        <div className="form-row"><span>Calidad gráfica</span>
          <Seg options={[['auto', 'Auto'], ['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta']]} value={settings.graphics} onPick={(v) => set('graphics', v)} />
        </div>
        <div className="form-row"><span>Sonido</span>
          <Seg options={[[true, 'Sí'], [false, 'No']]} value={settings.sound} onPick={(v) => set('sound', v)} />
        </div>
        <div className="form-row"><span>Música</span>
          <Seg options={[[true, 'Sí'], [false, 'No']]} value={settings.music} onPick={(v) => set('music', v)} />
        </div>
        <div className="form-row"><span>Cámara inicial</span>
          <Seg options={[[0, 'Cercana'], [1, 'Lejana'], [2, 'Capó']]} value={settings.cameraMode} onPick={(v) => set('cameraMode', v)} />
        </div>
        <div className="menu-hint">La calidad Auto elige según tu equipo y baja la resolución si el ritmo cae.</div>
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
          <button className="back-link" onClick={onBack}>← Atrás</button>
          <h2>Cómo jugar</h2>
          <div className="setup-spacer" />
        </div>
        <div className="help">
          <h3>Objetivo</h3>
          <p>Circuito: completa 2 vueltas y cruza primero. Sprint: llega a la meta antes que tus 5 rivales esquivando tráfico. Contrarreloj: marca tu mejor vuelta.</p>
          <h3>Nitro</h3>
          <p>El nitro se recarga solo: adelanta rivales, pégate a su rebufo, roza el tráfico sin tocarlo (near miss), pasa por checkpoints, salta y conduce limpio a alta velocidad. Pulsa Shift o ✕ para quemarlo.</p>
          <h3>Rebufo</h3>
          <p>Si te pegas detrás de otro coche verás “REBUFO”: ganas velocidad gratis. Al salir del rebufo con el medidor lleno recibes un impulso extra.</p>
          <h3>Derrape</h3>
          <p>Mantén Espacio o ▢ en curvas cerradas para derrapar. Derrapar de forma controlada también recarga nitro.</p>
          <h3>Consejos</h3>
          <ul>
            <li>Frena antes de la curva, no dentro de ella.</li>
            <li>Los arcos azules son checkpoints: dan nitro.</li>
            <li>Si te quedas atascado, el coche se recoloca solo. También con R.</li>
            <li>En el sprint, el tráfico es tu enemigo y tu aliado: úsalo para el rebufo.</li>
          </ul>
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
    { label: 'REANUDAR', go: onResume },
    { label: 'REINICIAR CARRERA', go: onRestart },
    { label: 'SALIR AL MENÚ', go: onQuit, danger: true },
  ];
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go());
  return (
    <div className="overlay">
      <div className="pause-box">
        <h2>PAUSA</h2>
        {items.map((it, i) => (
          <MenuButton key={it.label} label={it.label} danger={it.danger}
            focused={focus === i} onClick={it.go} onHover={() => set(i)} />
        ))}
        <div className="menu-hint">P / Esc o Options para reanudar</div>
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
  const [nick, setNick] = useState(() => loadPilotName() || 'PILOTO');
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
        { label: 'GUARDAR RÉCORD', go: doSave },
        { label: 'OMITIR', go: () => setPhase('done') },
      ]
    : [
        { label: 'REINTENTAR', go: onRetry },
        { label: 'CAMBIAR MODO / COCHE', go: onSetup },
        { label: 'MENÚ PRINCIPAL', go: onMenu },
      ];
  // While the nickname field has focus, gamepad/arrow menu navigation is disabled so typing works.
  const [focus, set] = useMenuNav(items.length, (i) => items[i].go(), { enabled: !typing });
  const pos = results.position;

  const recordCar = (r) => {
    const c = CARS.find((x) => x.id === r.carId);
    return c ? c.name : '—';
  };

  return (
    <div className="overlay">
      <div className="results-box">
        <div className={`results-pos p${pos}`}>{pos}º</div>
        <div className="results-title">{results.won ? '¡VICTORIA!' : pos <= 3 ? '¡PODIO!' : 'CARRERA TERMINADA'}</div>
        <div className="results-sub">{MODE_ES[setup.mode]} · {track.name} · {car.name}</div>
        {meta?.newBest && <div className="badge-newbest">★ NUEVO RÉCORD ★</div>}
        {meta?.unlockedNow && <div className="badge-unlock">APEX ONE DESBLOQUEADO EN TU GARAJE</div>}
        {phase === 'entry' && (
          <div className="record-entry">
            <div className="record-entry-title">¡ENTRAS EN EL TOP 10 DEL CIRCUITO!</div>
            <div className="record-entry-sub">Tu tiempo: <b>{fmtMs(results.timeMs)}</b> — escribe el nickname del piloto</div>
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
          {results.timeMs != null && <div><span>Tiempo total</span><b>{fmtMs(results.timeMs)}</b></div>}
          <div><span>Mejor vuelta</span><b>{fmtMs(results.bestLapMs)}</b></div>
          <div><span>Velocidad máx.</span><b>{results.topSpeedKmh} km/h</b></div>
          <div><span>Adelantamientos</span><b>{results.overtakes}</b></div>
          <div><span>Near miss</span><b>{results.nearMisses} (+{results.nearScore} pts)</b></div>
          <div><span>Nitro usado</span><b>{results.nitroUsed.toFixed(1)} s</b></div>
        </div>
        {isCircuit && records.length > 0 && (
          <div className="records-table">
            <div className="records-title">MEJORES TIEMPOS · {track.name}</div>
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
          <div className="records-empty">Aún no hay tiempos registrados en este circuito.</div>
        )}
        {phase === 'done' && items.map((it, i) => (
          <MenuButton key={it.label} label={it.label} focused={focus === i} onClick={it.go} onHover={() => set(i)} />
        ))}
      </div>
    </div>
  );
}
