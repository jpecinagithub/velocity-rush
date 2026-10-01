// In-race HUD. Reads the live session at 60fps and mutates the DOM
// directly — zero React state churn during racing.
import { useEffect, useRef } from 'react';
import { holder } from '../game/activeSession.js';
import { fmtMs } from './screens.jsx';

export default function HUD() {
  const posRef = useRef(null), lapRef = useRef(null), timeRef = useRef(null);
  const splitsRef = useRef(null), speedRef = useRef(null), gearRef = useRef(null);
  const nitroFillRef = useRef(null), nitroWrapRef = useRef(null), slipRef = useRef(null);
  const warnRef = useRef(null), driftRef = useRef(null), mapRef = useRef(null);
  const sprintRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const map = mapRef.current;
    const mctx = map.getContext('2d');
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sess = holder.session;
      if (!sess || !sess.hud) return;
      const h = sess.hud, p = sess.player;

      if (posRef.current) posRef.current.textContent = `${h.pos}/${h.total}`;
      if (sprintRef.current) {
        sprintRef.current.textContent = sess.mode.sprint ? `META ${(h.sprintToGo / 1000).toFixed(1)} km` : `VUELTA ${h.lap}/${h.laps}`;
      }
      if (timeRef.current) timeRef.current.textContent = fmtMs(h.timeMs);
      if (splitsRef.current) {
        const parts = [];
        if (h.lastLap) parts.push(`ÚLT ${fmtMs(h.lastLap * 1000)}`);
        if (h.bestLap) parts.push(`MEJOR ${fmtMs(h.bestLap * 1000)}`);
        splitsRef.current.textContent = parts.join(' · ');
      }
      if (speedRef.current) speedRef.current.textContent = h.speedKmh;
      if (gearRef.current) gearRef.current.textContent = h.gear;
      if (nitroFillRef.current) nitroFillRef.current.style.width = `${Math.round(h.nitro * 100)}%`;
      if (nitroWrapRef.current) nitroWrapRef.current.classList.toggle('active', h.nitroActive);
      if (slipRef.current) slipRef.current.style.display = h.slip ? 'block' : 'none';
      if (warnRef.current) warnRef.current.style.display = h.wrongWay ? 'block' : 'none';
      if (driftRef.current) driftRef.current.style.display = h.drift ? 'block' : 'none';

      // minimap
      const md = sess.mapData;
      const W = map.width, H = map.height, pad = 10;
      mctx.clearRect(0, 0, W, H);
      const sx = (W - pad * 2) / Math.max(1, md.maxX - md.minX);
      const sz = (H - pad * 2) / Math.max(1, md.maxZ - md.minZ);
      const sc = Math.min(sx, sz);
      const ox = pad + ((W - pad * 2) - (md.maxX - md.minX) * sc) / 2;
      const oz = pad + ((H - pad * 2) - (md.maxZ - md.minZ) * sc) / 2;
      const X = (x) => ox + (x - md.minX) * sc;
      const Z = (z) => oz + (z - md.minZ) * sc;
      mctx.lineWidth = 4; mctx.strokeStyle = 'rgba(160,180,200,0.85)';
      mctx.beginPath();
      for (let i = 0; i < md.xs.length; i++) {
        const x = X(md.xs[i]), z = Z(md.zs[i]);
        if (i === 0) mctx.moveTo(x, z); else mctx.lineTo(x, z);
      }
      mctx.closePath(); mctx.stroke();
      // traffic dots
      mctx.fillStyle = 'rgba(150,150,150,0.8)';
      for (const t of sess.traffic.cars) {
        if (!t.active || !t.visual) continue;
        mctx.fillRect(X(t.visual.position.x) - 1, Z(t.visual.position.z) - 1, 2, 2);
      }
      // rivals
      for (const v of sess.vehicles) {
        if (v === p) continue;
        mctx.fillStyle = '#ff4d5e';
        mctx.beginPath(); mctx.arc(X(v.pos.x), Z(v.pos.z), 3, 0, 7); mctx.fill();
      }
      // player
      mctx.fillStyle = '#29e6ff';
      mctx.beginPath(); mctx.arc(X(p.pos.x), Z(p.pos.z), 4, 0, 7); mctx.fill();
      mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(X(p.pos.x), Z(p.pos.z), 5.5, 0, 7); mctx.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="hud">
      <div className="hud-tl">
        <div className="pos-big" ref={posRef}>–/–</div>
        <div className="lap-line" ref={sprintRef}>VUELTA –/–</div>
      </div>
      <div className="hud-tc">
        <div className="time" ref={timeRef}>0:00.000</div>
        <div className="splits" ref={splitsRef}></div>
      </div>
      <div className="hud-tr">
        <canvas ref={mapRef} className="minimap" width="150" height="150" />
      </div>
      <div className="hud-bl">
        <div className="nitro-wrap" ref={nitroWrapRef}>
          <div className="nitro-label">NITRO</div>
          <div className="nitro-bar"><div className="nitro-fill" ref={nitroFillRef} /></div>
        </div>
        <div className="slip" ref={slipRef} style={{ display: 'none' }}>REBUFO</div>
      </div>
      <div className="hud-br">
        <div className="speedo"><span ref={speedRef}>0</span><small>km/h</small></div>
        <div className="gear" ref={gearRef}>1</div>
      </div>
      <div className="hud-warn" ref={warnRef} style={{ display: 'none' }}>¡DIRECCIÓN CONTRARIA!</div>
      <div className="hud-drift" ref={driftRef} style={{ display: 'none' }}>DERAPE</div>
    </div>
  );
}
