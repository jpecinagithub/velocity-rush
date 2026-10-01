// Procedural environments for the three tracks. Everything is generated;
// no external assets. Road, tunnels, bridges, guardrails, vegetation,
// buildings, signs and water are all instanced for performance.
import * as THREE from 'three';
import { mulberry32 as seededRng } from './utils.js';

function makeCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const ENV_STYLE = {
  coast:   { top: 0x2f7fd0, horizon: 0xcfe9f5, fog: 0xbfe0f0, fogNear: 160, fogFar: 1700,
             ground: 0xd3b57e, sun: 0xfff2dd, sunI: 1.25, hemiSky: 0xbfe3f5, hemiGnd: 0x8a7a55, hemiI: 0.55 },
  mountain:{ top: 0x4a7ab5, horizon: 0xf0d3a0, fog: 0xd9c9a4, fogNear: 130, fogFar: 1350,
             ground: 0x5a6b42, sun: 0xffd9a8, sunI: 1.05, hemiSky: 0xcfd8ea, hemiGnd: 0x4a4a38, hemiI: 0.5 },
  neon:    { top: 0x04050d, horizon: 0x2c0f45, fog: 0x0a0a18, fogNear: 90, fogFar: 950,
             ground: 0x0b0d14, sun: 0x8fb4ff, sunI: 0.35, hemiSky: 0x4a2a8a, hemiGnd: 0x0a0a12, hemiI: 0.7 },
};

export function buildEnvironment(scene, track, envId, quality, trackDef, getPlayerPos) {
  const st = ENV_STYLE[envId] || ENV_STYLE.coast;
  const rng = seededRng(trackDef.id.length * 7919 + envId.length * 131);
  const root = new THREE.Group();
  const disposables = [];
  const reg = (o) => { disposables.push(o); return o; };
  const L = track.length, half = track.roadHalf, N = track.N;
  const fr = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() };
  const at = (s) => track.frameAt(s, fr);
  // per-sample flags: sample i -> s = (i/N)*L
  const flagAt = (i, arr) => !!arr[((i % N) + N) % N];

  // ---- sky dome ----
  const skyMat = reg(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(st.top) }, hor: { value: new THREE.Color(st.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 hor;
      void main(){ float h=normalize(vP).y;
        vec3 c = h>=0.0 ? mix(hor, top, pow(clamp(h*1.6,0.0,1.0),0.75))
                        : mix(hor, hor*0.35, clamp(-h*3.0,0.0,1.0));
        gl_FragColor=vec4(c,1.0); }`,
  }));
  const sky = new THREE.Mesh(reg(new THREE.SphereGeometry(3200, 24, 12)), skyMat);
  root.add(sky);

  if (envId === 'neon') {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = 0.12 + rng() * 1.4, r = 3000;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const g = reg(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    root.add(new THREE.Points(g, reg(new THREE.PointsMaterial({ color: 0xbfd4ff, size: 6, sizeAttenuation: false, fog: false }))));
  }

  scene.fog = new THREE.Fog(st.fog, st.fogNear, st.fogFar);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(st.hemiSky, st.hemiGnd, st.hemiI);
  const sun = new THREE.DirectionalLight(st.sun, st.sunI);
  const sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
  if (quality.shadows > 0) {
    sun.castShadow = true;
    const sm = quality.shadows === 2 ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
  }
  scene.add(hemi); scene.add(sun); scene.add(sun.target);

  // ---- track bounds / ground ----
  let cx = 0, cz = 0, maxD = 0;
  const NS = 200;
  for (let i = 0; i < NS; i++) { at((i / NS) * L); cx += fr.pos.x; cz += fr.pos.z; }
  cx /= NS; cz /= NS;
  for (let i = 0; i < NS; i++) { at((i / NS) * L); maxD = Math.max(maxD, Math.hypot(fr.pos.x - cx, fr.pos.z - cz)); }
  const ground = new THREE.Mesh(
    reg(new THREE.CircleGeometry(maxD + 160, 48)),
    reg(new THREE.MeshStandardMaterial({ color: st.ground, roughness: 1 }))
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.05, cz);
  ground.receiveShadow = true;
  root.add(ground);

  // ---- ocean (coast) ----
  let oceanTex = null;
  if (envId === 'coast') {
    oceanTex = makeCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#1b6aa8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.04 + rng() * 0.08})`;
        g.lineWidth = 1 + rng() * 2;
        const y = rng() * h;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.1 + i) * 4);
        g.stroke();
      }
    });
    oceanTex.wrapS = oceanTex.wrapT = THREE.RepeatWrapping;
    oceanTex.repeat.set(60, 60);
    const ocean = new THREE.Mesh(
      reg(new THREE.PlaneGeometry(7000, 7000)),
      reg(new THREE.MeshStandardMaterial({ color: 0x2a86c8, roughness: 0.3, metalness: 0.15, map: oceanTex }))
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(cx, -2.4, cz);
    root.add(ocean);
  }

  // ---- road ribbon ----
  const roadTex = makeCanvas(256, 256, (g, w, h) => {
    const dark = envId === 'neon';
    g.fillStyle = dark ? '#15161c' : '#33363b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${dark ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const sh = w * 0.115;
    g.fillStyle = dark ? '#101116' : '#2b2d31';
    g.fillRect(0, 0, sh, h); g.fillRect(w - sh, 0, w, h);
    g.fillStyle = envId === 'neon' ? '#29e6ff' : '#e8e8e8';
    g.fillRect(sh + 2, 0, 5, h); g.fillRect(w - sh - 7, 0, 5, h);
    g.fillStyle = envId === 'neon' ? '#ff3fd4' : '#d8d8d8';
    for (const fx of [1 / 3, 2 / 3]) {
      const x = w * fx;
      for (let y = 0; y < h; y += 64) g.fillRect(x - 2, y, 4, 34);
    }
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.anisotropy = 8;
  {
    const W = half + 3.2;
    const positions = new Float32Array((N + 1) * 2 * 3);
    const uvs = new Float32Array((N + 1) * 2 * 2);
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const px = track.px[i], py = track.py[i], pz = track.pz[i];
      let sx = track.tz[i], sz = -track.tx[i];
      const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      positions.set([px + sx * W, py + 0.04, pz + sz * W], i * 6);
      positions.set([px - sx * W, py + 0.04, pz - sz * W], i * 6 + 3);
      const v = ((i / N) * L) / 26;
      uvs.set([0, v, 1, v], i * 4);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = reg(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const matOpts = { map: roadTex, roughness: envId === 'neon' ? 0.35 : 0.9, metalness: envId === 'neon' ? 0.4 : 0 };
    if (envId === 'neon') { matOpts.emissive = 0xffffff; matOpts.emissiveMap = roadTex; matOpts.emissiveIntensity = 0.35; }
    const road = new THREE.Mesh(geo, reg(new THREE.MeshStandardMaterial(matOpts)));
    road.receiveShadow = quality.shadows > 0;
    root.add(road);
  }

  // ---- tunnel / bridge ranges from per-sample flags ----
  const ranges = [];
  {
    let cur = null;
    for (let i = 0; i <= N; i += 4) {
      const s = (i / N) * L;
      const kind = flagAt(i, track.tunnel) ? 'tunnel' : (flagAt(i, track.bridge) ? 'bridge' : null);
      if (kind && (!cur || cur.kind !== kind)) { if (cur) { cur.s1 = s; ranges.push(cur); } cur = { kind, s0: s }; }
      else if (!kind && cur) { cur.s1 = s; ranges.push(cur); cur = null; }
    }
    if (cur) { cur.s1 = L; ranges.push(cur); }
  }
  const inRange = (s, kind) => ranges.some((r) => r.kind === kind && s >= r.s0 - 4 && s <= r.s1 + 4);

  // instancing helper
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, transforms, colors) {
    if (!transforms.length) return null;
    const m = new THREE.InstancedMesh(reg(geo), reg(mat), transforms.length);
    transforms.forEach((t, i) => {
      dummy.position.set(t.p[0], t.p[1], t.p[2]);
      dummy.rotation.set(t.r ? t.r[0] : 0, t.r ? t.r[1] : 0, t.r ? t.r[2] : 0);
      dummy.scale.set(t.s[0], t.s[1], t.s[2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colors && colors[i]) m.setColorAt(i, colors[i]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    root.add(m);
    return m;
  }

  // ---- guardrails ----
  {
    const T = [];
    for (let s = 0; s < L; s += 8) {
      if (inRange(s, 'tunnel')) continue;
      at(s);
      const yaw = Math.atan2(fr.tan.x, fr.tan.z);
      for (const sd of [-1, 1]) {
        T.push({ p: [fr.pos.x + fr.side.x * sd * (half + 2.4), fr.pos.y + 0.55, fr.pos.z + fr.side.z * sd * (half + 2.4)], r: [0, yaw, 0], s: [1, 1, 1] });
      }
    }
    instanced(new THREE.BoxGeometry(0.22, 0.75, 8.2),
      new THREE.MeshStandardMaterial({ color: envId === 'neon' ? 0x3a4a5a : 0x9aa2ac, metalness: 0.7, roughness: 0.4 }), T);
  }

  // ---- bridges: girders + pillars ----
  for (const r of ranges) {
    if (r.kind !== 'bridge') continue;
    const T = [];
    for (let s = r.s0; s < r.s1; s += 8) {
      at(s);
      const yaw = Math.atan2(fr.tan.x, fr.tan.z);
      for (const sd of [-1, 1])
        T.push({ p: [fr.pos.x + fr.side.x * sd * (half + 2.7), fr.pos.y + 0.8, fr.pos.z + fr.side.z * sd * (half + 2.7)], r: [0, yaw, 0], s: [1, 1, 1] });
    }
    instanced(new THREE.BoxGeometry(0.5, 1.5, 8.4),
      new THREE.MeshStandardMaterial({ color: envId === 'neon' ? 0x223344 : 0x7a6a55, metalness: 0.4, roughness: 0.6 }), T);
    const P = [];
    for (let s = r.s0 + 10; s < r.s1; s += 48) {
      at(s);
      const hgt = Math.max(8, fr.pos.y + 10);
      P.push({ p: [fr.pos.x, fr.pos.y - hgt / 2 - 1, fr.pos.z], r: [0, 0, 0], s: [1, hgt, 1] });
    }
    instanced(new THREE.BoxGeometry(3, 1, 3),
      new THREE.MeshStandardMaterial({ color: 0x6a625a, roughness: 0.8 }), P);
  }

  // ---- tunnels: arches, walls, light strips ----
  for (const r of ranges) {
    if (r.kind !== 'tunnel') continue;
    const A = [], Wl = [], Li = [];
    for (let s = r.s0 - 6; s < r.s1 + 6; s += 10) {
      at(s);
      const yaw = Math.atan2(fr.tan.x, fr.tan.z);
      A.push({ p: [fr.pos.x, fr.pos.y - 0.3, fr.pos.z], r: [0, yaw, 0], s: [1, 1, 1] });
      for (const sd of [-1, 1])
        Wl.push({ p: [fr.pos.x + fr.side.x * sd * (half + 3.4), fr.pos.y + 1.4, fr.pos.z + fr.side.z * sd * (half + 3.4)], r: [0, yaw, 0], s: [1, 1, 1] });
    }
    for (let s = r.s0; s < r.s1; s += 20) {
      at(s);
      Li.push({ p: [fr.pos.x, fr.pos.y + half + 4.6, fr.pos.z], r: [0, Math.atan2(fr.tan.x, fr.tan.z), 0], s: [1, 1, 1] });
    }
    instanced(new THREE.TorusGeometry(half + 3.2, 0.8, 8, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.85 }), A);
    instanced(new THREE.BoxGeometry(0.5, 3.4, 10.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }), Wl);
    instanced(new THREE.BoxGeometry(1.6, 0.18, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xcfe8ff, emissiveIntensity: 2.4 }), Li);
  }

  // ---- lamps ----
  {
    const every = envId === 'neon' ? 38 : 52;
    const poles = [], heads = [], headCols = [];
    const cA = new THREE.Color(envId === 'neon' ? 0x29e6ff : 0xffe9b8);
    const cB = new THREE.Color(0xff3fd4);
    let k = 0;
    for (let s = 0; s < L; s += every) {
      if (inRange(s, 'tunnel')) continue;
      at(s);
      const sd = (k % 2 === 0) ? 1 : -1; k++;
      const bx = fr.pos.x + fr.side.x * sd * (half + 4.2), bz = fr.pos.z + fr.side.z * sd * (half + 4.2);
      poles.push({ p: [bx, fr.pos.y + 3.4, bz], s: [1, 1, 1] });
      heads.push({ p: [bx - fr.side.x * sd * 1.1, fr.pos.y + 6.8, bz - fr.side.z * sd * 1.1], s: [1, 1, 1] });
      headCols.push(envId === 'neon' && k % 2 ? cB : cA);
    }
    instanced(new THREE.CylinderGeometry(0.12, 0.16, 6.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.6, roughness: 0.5 }), poles);
    instanced(new THREE.BoxGeometry(1.3, 0.22, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 2.2 }), heads, headCols);
  }

  // ---- vegetation / rocks ----
  if (envId === 'coast' || envId === 'mountain') {
    const isPalm = envId === 'coast';
    const trunks = [], crowns = [];
    for (let s = 0; s < L; s += 24) {
      if (inRange(s, 'tunnel') || inRange(s, 'bridge')) continue;
      if (rng() < 0.35) continue;
      at(s);
      const sd = rng() < 0.5 ? -1 : 1;
      const d = half + 9 + rng() * 46;
      const sc = 0.8 + rng() * 0.9;
      const bx = fr.pos.x + fr.side.x * sd * d, bz = fr.pos.z + fr.side.z * sd * d;
      trunks.push({ p: [bx, fr.pos.y + 2 * sc, bz], r: [0, rng() * 6.28, (rng() - 0.5) * 0.1], s: [sc, sc, sc] });
      crowns.push({ p: [bx, fr.pos.y + (isPalm ? 4.6 : 4.2) * sc, bz], r: [0, rng() * 6.28, 0], s: [sc, sc, sc] });
    }
    instanced(new THREE.CylinderGeometry(0.22, 0.34, 4.2, 7),
      new THREE.MeshStandardMaterial({ color: isPalm ? 0x8a6a48 : 0x5a4632, roughness: 0.95 }), trunks);
    if (isPalm) {
      instanced(new THREE.ConeGeometry(2.6, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.9 }), crowns);
    } else {
      instanced(new THREE.ConeGeometry(2.1, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c5a34, roughness: 0.95 }), crowns);
      const c2 = crowns.map((t) => ({ p: [t.p[0], t.p[1] + 1.9 * t.s[1], t.p[2]], r: t.r, s: [t.s[0] * 0.68, t.s[1] * 0.68, t.s[2] * 0.68] }));
      instanced(new THREE.ConeGeometry(2.1, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x356b3e, roughness: 0.95 }), c2);
      const R = [];
      for (let s = 0; s < L; s += 30) {
        if (inRange(s, 'tunnel')) continue;
        if (rng() < 0.5) continue;
        at(s);
        const sd = rng() < 0.5 ? -1 : 1, d = half + 7 + rng() * 30, sc = 0.8 + rng() * 2.6;
        R.push({ p: [fr.pos.x + fr.side.x * sd * d, fr.pos.y + sc * 0.3, fr.pos.z + fr.side.z * sd * d], r: [rng() * 3, rng() * 3, 0], s: [sc, sc * 0.75, sc] });
      }
      instanced(new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.95, flatShading: true }), R);
    }
  }

  // ---- neon city: buildings + signs ----
  const signMats = [];
  if (envId === 'neon') {
    const winTex = makeCanvas(128, 256, (g, w, h) => {
      g.fillStyle = '#0c0e16'; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 8; y += 16) for (let x = 8; x < w - 8; x += 14) {
        if (rng() < 0.45) {
          const cols = ['#29e6ff', '#ff3fd4', '#ffd23f', '#9dff6e'];
          g.fillStyle = cols[Math.floor(rng() * cols.length)];
          g.fillRect(x, y, 8, 9);
        }
      }
    });
    const B = [];
    for (let s = 0; s < L; s += 30) {
      if (inRange(s, 'tunnel')) continue;
      at(s);
      const sd = rng() < 0.5 ? -1 : 1;
      const d = half + 20 + rng() * 60;
      const bw = 12 + rng() * 14, bh = 16 + rng() * 52, bd = 12 + rng() * 14;
      B.push({ p: [fr.pos.x + fr.side.x * sd * d, fr.pos.y + bh / 2 - 0.5, fr.pos.z + fr.side.z * sd * d], r: [0, Math.atan2(fr.tan.x, fr.tan.z) + (rng() - 0.5) * 0.4, 0], s: [bw, bh, bd] });
    }
    instanced(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.7, metalness: 0.2, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55 }), B);

    const words = ['VELOCITY', 'NITRO', 'TURBO', 'APEX', 'RUSH', 'NEON', 'OVERDRIVE', 'PULSE'];
    const wcols = ['#29e6ff', '#ff3fd4', '#ffd23f', '#9dff6e'];
    let wi = 0;
    for (let s = 60; s < L && wi < 14; s += 210, wi++) {
      if (inRange(s, 'tunnel') || inRange(s, 'bridge')) continue;
      at(s);
      const sd = wi % 2 === 0 ? 1 : -1;
      const col = wcols[wi % wcols.length];
      const tex = makeCanvas(512, 128, (g, w, h) => {
        g.fillStyle = 'rgba(5,5,12,0.85)'; g.fillRect(0, 0, w, h);
        g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
        g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = col; g.shadowBlur = 24;
        g.fillStyle = col; g.fillText(words[wi % words.length], w / 2, h / 2 + 2);
      });
      const m = reg(new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
      signMats.push(m);
      const sign = new THREE.Mesh(reg(new THREE.PlaneGeometry(16, 4)), m);
      const yaw = Math.atan2(fr.tan.x, fr.tan.z);
      sign.position.set(fr.pos.x + fr.side.x * sd * (half + 9), fr.pos.y + 9, fr.pos.z + fr.side.z * sd * (half + 9));
      sign.rotation.y = yaw + (sd > 0 ? -Math.PI / 2 : Math.PI / 2);
      root.add(sign);
    }
  }

  // ---- harbor cranes + containers (coast) ----
  if (envId === 'coast') {
    const craneMat = reg(new THREE.MeshStandardMaterial({ color: 0xc8542e, roughness: 0.6, metalness: 0.3 }));
    for (let k = 0; k < 4; k++) {
      at(560 + k * 90);
      const sd = -1, d = half + 34;
      const bx = fr.pos.x + fr.side.x * sd * d, bz = fr.pos.z + fr.side.z * sd * d;
      const yaw = Math.atan2(fr.tan.x, fr.tan.z);
      const crane = new THREE.Group();
      const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(reg(geo), mat); m.position.set(x, y, z); crane.add(m); };
      add(new THREE.BoxGeometry(6, 3, 6), craneMat, 0, 1.5, 0);
      add(new THREE.BoxGeometry(2.4, 26, 2.4), craneMat, 0, 16, 0);
      add(new THREE.BoxGeometry(2, 2, 30), craneMat, 0, 29, 6);
      add(new THREE.BoxGeometry(2, 2, 12), craneMat, 0, 29, -12);
      add(new THREE.CylinderGeometry(0.06, 0.06, 12, 6), reg(new THREE.MeshStandardMaterial({ color: 0x222222 })), 0, 23, 12);
      add(new THREE.BoxGeometry(2.2, 2.2, 2.2), craneMat, 0, 17, 12);
      crane.position.set(bx, fr.pos.y, bz);
      crane.rotation.y = yaw + 0.4;
      root.add(crane);
    }
    const contCols = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98].map((c) => new THREE.Color(c));
    const C = [], CC = [];
    for (let k = 0; k < 70; k++) {
      at(520 + rng() * 420);
      const sd = rng() < 0.6 ? -1 : 1;
      const d = half + 16 + rng() * 26;
      const stack = 1 + Math.floor(rng() * 3);
      for (let lv = 0; lv < stack; lv++) {
        C.push({ p: [fr.pos.x + fr.side.x * sd * d + (rng() - 0.5) * 8, fr.pos.y + 1.3 + lv * 2.6, fr.pos.z + fr.side.z * sd * d + (rng() - 0.5) * 8],
                 r: [0, Math.atan2(fr.tan.x, fr.tan.z) + (rng() - 0.5) * 0.3, 0], s: [1, 1, 1] });
        CC.push(contCols[Math.floor(rng() * contCols.length)]);
      }
    }
    instanced(new THREE.BoxGeometry(2.4, 2.6, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.2 }), C, CC);
  }

  // ---- road signs ----
  {
    const tex = makeCanvas(128, 128, (g, w, h) => {
      g.fillStyle = '#0a4fa8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(w * 0.62, h * 0.2); g.lineTo(w * 0.85, h * 0.5); g.lineTo(w * 0.62, h * 0.8);
      g.lineTo(w * 0.62, h * 0.64); g.lineTo(w * 0.2, h * 0.64); g.lineTo(w * 0.2, h * 0.36); g.lineTo(w * 0.62, h * 0.36);
      g.closePath(); g.fill();
    });
    const P = [], Pn = [];
    for (let s = 150; s < L; s += 320) {
      if (inRange(s, 'tunnel')) continue;
      at(s);
      const sd = 1;
      P.push({ p: [fr.pos.x + fr.side.x * sd * (half + 5), fr.pos.y + 1.6, fr.pos.z + fr.side.z * sd * (half + 5)], s: [1, 1, 1] });
      Pn.push({ p: [fr.pos.x + fr.side.x * sd * (half + 5), fr.pos.y + 3.9, fr.pos.z + fr.side.z * sd * (half + 5)], r: [0, Math.atan2(fr.tan.x, fr.tan.z) + Math.PI, 0], s: [1, 1, 1] });
    }
    instanced(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x555c66, metalness: 0.6, roughness: 0.5 }), P);
    instanced(new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 }), Pn);
  }

  // ---- checkpoint arches / start gantry / sprint finish ----
  const bannerTex = (text, bg, fg) => makeCanvas(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2);
  });
  const arch = (s, text, big) => {
    at(s);
    const yaw = Math.atan2(fr.tan.x, fr.tan.z);
    const grp = new THREE.Group();
    const postMat = reg(new THREE.MeshStandardMaterial({ color: envId === 'neon' ? 0x1a2030 : 0x39404a, metalness: 0.5, roughness: 0.5 }));
    const Wd = half + (big ? 2.5 : 1.5), Ht = big ? 8 : 6.6;
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(reg(new THREE.BoxGeometry(0.7, Ht, 0.7)), postMat);
      post.position.set(fr.side.x * sd * Wd, Ht / 2, fr.side.z * sd * Wd);
      grp.add(post);
    }
    const banner = new THREE.Mesh(reg(new THREE.PlaneGeometry(Wd * 2 + 0.7, big ? 2.2 : 1.5)),
      reg(new THREE.MeshBasicMaterial({ map: bannerTex(text, envId === 'neon' ? '#12041f' : '#101418', envId === 'neon' ? '#29e6ff' : '#ffd23f'), side: THREE.DoubleSide })));
    banner.position.set(0, Ht - (big ? 1.1 : 0.75), 0);
    banner.rotation.y = Math.PI;
    grp.add(banner);
    grp.position.copy(fr.pos);
    grp.rotation.y = yaw;
    root.add(grp);
  };
  track.checkpoints.forEach((s, i) => arch(s, `CHECKPOINT ${i + 1}`, false));
  arch(4, 'VELOCITY RUSH', true);
  if (track.sprintFinishS > 0) arch(track.sprintFinishS, 'FINISH', true);

  scene.add(root);

  // ---- per-frame ----
  let t = 0;
  const pp = new THREE.Vector3();
  function update(dt) {
    t += dt;
    if (oceanTex) oceanTex.offset.y = (t * 0.008) % 1;
    for (let i = 0; i < signMats.length; i++) {
      signMats[i].opacity = 0.72 + 0.28 * Math.abs(Math.sin(t * 2.2 + i * 1.7));
    }
    if (getPlayerPos) {
      getPlayerPos(pp);
      sun.position.set(pp.x + sunDir.x * 150, pp.y + sunDir.y * 150, pp.z + sunDir.z * 150);
      sun.target.position.copy(pp);
      sun.target.updateMatrixWorld();
      sky.position.set(pp.x, 0, pp.z);
    }
  }

  function dispose() {
    scene.remove(root);
    scene.remove(hemi); scene.remove(sun); scene.remove(sun.target);
    scene.fog = null;
    for (const d of disposables) { if (d && d.dispose) { try { d.dispose(); } catch { /* noop */ } } }
  }

  return { update, dispose };
}
