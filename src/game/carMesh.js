// Procedural original sports-car meshes. All shapes are invented;
// silhouettes come from an extruded side profile per body style,
// dressed with a full detail kit (aero, lights, mirrors, detailed wheels).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './utils.js';

// ---------- shared geometries / materials (built once) ----------
let _shared = null;
function shared() {
  if (_shared) return _shared;

  // --- detailed wheel template (axle along X) ---
  const wheel = new THREE.Group();
  const tireGeo = new THREE.TorusGeometry(0.27, 0.115, 10, 24);
  tireGeo.rotateY(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92 }));
  wheel.add(tire);
  // brake disc
  const discGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.85, roughness: 0.45 }));
  wheel.add(disc);
  // 5 spokes, merged into one geometry
  const spokeGeos = [];
  for (let k = 0; k < 5; k++) {
    const s = new THREE.BoxGeometry(0.07, 0.21, 0.1);
    s.translate(0, 0.145, 0);
    s.rotateX((k / 5) * Math.PI * 2);
    spokeGeos.push(s);
  }
  const spokes = new THREE.Mesh(
    mergeGeometries(spokeGeos),
    new THREE.MeshStandardMaterial({ color: 0xb9c2d0, metalness: 0.9, roughness: 0.28 })
  );
  wheel.add(spokes);
  // rim lips on both faces
  const lipGeo = new THREE.TorusGeometry(0.245, 0.032, 8, 24);
  lipGeo.rotateY(Math.PI / 2);
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xd7dee9, metalness: 0.95, roughness: 0.22 });
  for (const lx of [-0.13, 0.13]) {
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.position.x = lx;
    wheel.add(lip);
  }
  // hub
  const hubGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10);
  hubGeo.rotateZ(Math.PI / 2);
  wheel.add(new THREE.Mesh(hubGeo, lipMat));

  // fender arch trim (half torus, rotated to wrap the wheel in the ZY plane)
  const archGeo = new THREE.TorusGeometry(0.47, 0.06, 8, 14, Math.PI);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.7 });

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1622, metalness: 0.9, roughness: 0.12 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, metalness: 0.75, roughness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xcfeaff, emissiveIntensity: 2.4 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.16, 1.1, 8);
  flameGeo.rotateX(-Math.PI / 2); // point backward (-z)
  flameGeo.translate(0, 0, -0.55);
  _shared = { wheel, archGeo, archMat, glassMat, darkMat, chromeMat, headMat, flameMat, flameGeo };
  return _shared;
}

// top-silhouette control points [xFraction(-1..1 front..back), height]
const PROFILES = {
  coupe:   [[1,.3],[.88,.4],[.66,.52],[.4,.6],[.08,.92],[-.22,.95],[-.48,.7],[-.76,.64],[-1,.58]],
  wedge:   [[1,.26],[.8,.34],[.55,.44],[.3,.5],[0,.78],[-.3,.8],[-.6,.6],[-1,.55]],
  hatch:   [[1,.34],[.85,.44],[.6,.56],[.35,.62],[.05,.98],[-.3,1],[-.62,.78],[-1,.7]],
  muscle:  [[1,.36],[.82,.46],[.55,.6],[.3,.64],[0,.82],[-.35,.84],[-.65,.72],[-1,.68]],
  roadster: [[1,.3],[.86,.4],[.62,.52],[.38,.58],[.1,.8],[-.2,.82],[-.5,.62],[-.78,.58],[-1,.54]],
  hyper:   [[1,.24],[.85,.3],[.6,.4],[.35,.46],[.05,.72],[-.25,.74],[-.55,.58],[-.8,.55],[-1,.5]],
};

// interpolated body-top height (world Y) at a given x-fraction
function topYAt(style, fx, low) {
  const pts = PROFILES[style] || PROFILES.coupe;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, h1] = pts[i], [x2, h2] = pts[i + 1];
    if (fx <= x1 && fx >= x2) {
      const t = (x1 - fx) / (x1 - x2 || 1);
      return 0.14 + (h1 + (h2 - h1) * t) * low * 1.9;
    }
  }
  return 0.5;
}

function bodyGeometry(style, len, wide, low) {
  const pts = PROFILES[style] || PROFILES.coupe;
  const shape = new THREE.Shape();
  const hx = len / 2;
  shape.moveTo(hx, 0.14);
  for (const [fx, hh] of pts) shape.lineTo(fx * hx, 0.14 + hh * low * 1.9);
  shape.lineTo(-hx, 0.14);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: wide * 0.86, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -(wide * 0.86) / 2);
  geo.rotateY(-Math.PI / 2); // front (+x in shape) -> +z forward
  return geo;
}

function glassGeometry(style, len, wide) {
  // cabin glass: smaller extrude of the roof area
  const pts = PROFILES[style] || PROFILES.coupe;
  const cabin = pts.filter(([fx]) => fx < 0.42 && fx > -0.62);
  if (cabin.length < 2) return null;
  const shape = new THREE.Shape();
  const hx = len / 2;
  shape.moveTo(cabin[0][0] * hx, 0.14 + cabin[0][1] * 0.62 * 1.9 + 0.1);
  for (const [fx, hh] of cabin) shape.lineTo(fx * hx, 0.14 + hh * 0.62 * 1.9 + 0.08);
  shape.lineTo(cabin[cabin.length - 1][0] * hx, 0.3);
  shape.lineTo(cabin[0][0] * hx, 0.3);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: wide * 0.7, bevelEnabled: false });
  geo.translate(0, 0, -(wide * 0.7) / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function box(w, h, d, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  return m;
}

export function buildCarMesh(def, color, quality) {
  const S = shared();
  const b = def.body;
  const hx = b.len / 2;
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  group.add(tilt);

  // car paint with clearcoat
  const paint = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.65, roughness: 0.28,
    clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: color, emissiveIntensity: 0.05,
  });
  const accent = new THREE.MeshStandardMaterial({ color: def.accent ?? 0xffffff, metalness: 0.6, roughness: 0.35 });

  const body = new THREE.Mesh(bodyGeometry(b.style, b.len, b.wide, b.low), paint);
  body.castShadow = true;
  tilt.add(body);

  // ---- racing stripe over hood and trunk (accent color) ----
  for (const [fx0, fx1] of [[0.58, 1.0], [-1.0, -0.58]]) {
    const z0 = fx0 * hx, z1 = fx1 * hx;
    const y0 = topYAt(b.style, fx0, b.low) + 0.075, y1 = topYAt(b.style, fx1, b.low) + 0.075;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const seg = box(0.36, 0.025, len + 0.08, accent, 0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = Math.atan2(-(y1 - y0), z1 - z0);
    tilt.add(seg);
  }

  // ---- glasshouse + painted roof panel ----
  const glassGeo = glassGeometry(b.style, b.len, b.wide);
  if (glassGeo) tilt.add(new THREE.Mesh(glassGeo, S.glassMat));
  const roofY = topYAt(b.style, -0.08, b.low);
  const roof = box(b.wide * 0.6, 0.06, hx * 0.52, paint, 0, roofY + 0.045, -0.08 * hx);
  tilt.add(roof);

  // ---- front aero: splitter, intakes, grille, LED headlights ----
  // (front face sits at z ~= hx + 0.06 because of the extrude bevel)
  const noseY = topYAt(b.style, 0.93, b.low);
  const faceZ = hx + 0.055;
  tilt.add(box(b.wide * 0.94, 0.07, 0.4, S.darkMat, 0, 0.1, hx + 0.02)); // splitter
  tilt.add(box(b.wide * 0.4, 0.15, 0.1, S.darkMat, 0, 0.27, faceZ)); // grille
  for (const sx of [-1, 1]) {
    tilt.add(box(0.52, 0.2, 0.12, S.darkMat, sx * b.wide * 0.3, 0.3, faceZ)); // intake
    const hl = box(0.52, 0.09, 0.08, S.headMat, sx * b.wide * 0.31, 0.14 + (noseY - 0.14) * 0.55, faceZ + 0.01);
    hl.rotation.y = -sx * 0.12;
    tilt.add(hl); // slim LED headlight
  }

  // ---- hood scoop / vents for aggressive styles ----
  if (b.style === 'muscle' || b.style === 'wedge') {
    const sy = topYAt(b.style, 0.55, b.low);
    tilt.add(box(0.56, 0.09, 0.72, paint, 0, sy + 0.06, 0.55 * hx));
    tilt.add(box(0.4, 0.05, 0.12, S.darkMat, 0, sy + 0.09, 0.55 * hx + 0.3));
  }

  // ---- side skirts + mirrors ----
  for (const sx of [-1, 1]) {
    tilt.add(box(0.1, 0.13, b.len * 0.52, S.darkMat, sx * (b.wide * 0.43 + 0.03), 0.17, 0));
    tilt.add(box(0.34, 0.025, 0.05, accent, sx * (b.wide * 0.43 + 0.03), 0.245, 0)); // accent blade
    tilt.add(box(0.16, 0.035, 0.06, S.darkMat, sx * (b.wide * 0.43 + 0.05), 0.97, 0.3 * hx)); // stalk
    tilt.add(box(0.1, 0.1, 0.17, paint, sx * (b.wide * 0.43 + 0.13), 0.99, 0.3 * hx)); // housing
  }

  // ---- wheels: steer groups -> spin groups (cloned template) + calipers + arch trims ----
  const wheels = [], steerGroups = [];
  const wx = b.wide / 2 - 0.05, wzF = b.len * 0.32, wzR = -b.len * 0.32;
  let wheelFL, wheelFR;
  [[-wx, wzF], [wx, wzF], [-wx, wzR], [wx, wzR]].forEach(([x, z], i) => {
    const steer = new THREE.Group();
    steer.position.set(x, 0.385, z);
    const spin = S.wheel.clone();
    spin.children[0].castShadow = quality && quality.shadows > 0;
    steer.add(spin);
    const caliper = box(0.3, 0.11, 0.09, accent, 0, 0.1, 0.02);
    steer.add(caliper);
    const arch = new THREE.Mesh(S.archGeo, S.archMat);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(x, 0.385, z);
    tilt.add(arch);
    tilt.add(steer);
    wheels.push(spin);
    if (i < 2) { steerGroups.push(steer); if (i === 0) wheelFL = steer; else wheelFR = steer; }
  });

  // ---- rear: diffuser + fins, full-width taillight bar, chrome exhausts ----
  tilt.add(box(b.wide * 0.82, 0.2, 0.3, S.darkMat, 0, 0.22, -hx + 0.02)); // diffuser
  const finGeos = [];
  for (const fx of [-0.3, -0.1, 0.1, 0.3]) {
    const f = new THREE.BoxGeometry(0.045, 0.18, 0.26);
    f.translate(fx * b.wide, 0.22, -hx + 0.02);
    finGeos.push(f);
  }
  tilt.add(new THREE.Mesh(mergeGeometries(finGeos), S.darkMat));
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.7 });
  tilt.add(box(b.wide * 0.8, 0.1, 0.07, brakeMat, 0, 0.64, -hx - 0.075)); // LED bar
  const tipGeos = [];
  const nTips = (b.style === 'muscle' || b.style === 'hyper') ? 4 : 2;
  for (let k = 0; k < nTips; k++) {
    const tx = (k - (nTips - 1) / 2) * 0.24;
    const t = new THREE.CylinderGeometry(0.075, 0.088, 0.26, 12);
    t.rotateX(Math.PI / 2);
    t.translate(tx, 0.3, -hx - 0.06);
    tipGeos.push(t);
  }
  tilt.add(new THREE.Mesh(mergeGeometries(tipGeos), S.chromeMat));
  // nitro flames (toggled by session)
  const flameL = new THREE.Mesh(S.flameGeo, S.flameMat);
  const flameR = new THREE.Mesh(S.flameGeo, S.flameMat);
  flameL.position.set(-0.24, 0.3, -hx - 0.12);
  flameR.position.set(0.24, 0.3, -hx - 0.12);
  flameL.visible = flameR.visible = false;
  tilt.add(flameL); tilt.add(flameR);

  // ---- spoiler ----
  if (b.spoiler === 'wing' || b.spoiler === 'active') {
    const wy = 1.04 + b.low * 0.3, wz = -hx + 0.28;
    const blade = box(1.72, 0.06, 0.44, b.spoiler === 'active' ? paint : S.darkMat, 0, wy, wz);
    blade.rotation.x = -0.08;
    tilt.add(blade);
    for (const sx of [-0.82, 0.82]) {
      tilt.add(box(0.05, 0.3, 0.46, S.darkMat, sx, wy - 0.13, wz)); // endplate
      tilt.add(box(0.08, 0.52, 0.3, S.darkMat, sx * 0.72, wy - 0.28, wz)); // strut
    }
  } else if (b.spoiler === 'lip' || b.spoiler === 'ducktail') {
    const lipY = topYAt(b.style, -0.9, b.low) + 0.06;
    const lip = box(1.62, 0.06, 0.32, paint, 0, lipY, -hx + 0.16);
    lip.rotation.x = b.spoiler === 'ducktail' ? -0.35 : -0.06;
    tilt.add(lip);
  }

  // ---- subtle accent underglow ----
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(b.wide * 1.15, b.len * 0.85),
    new THREE.MeshBasicMaterial({ color: def.accent ?? 0xffffff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  tilt.add(glow);

  return { group, tilt, wheels, wheelFL, wheelFR, brakeMat, flameL, flameR, paint };
}

// ---------- civilian traffic (cheap, shared geo/mat) ----------
let _traf = null;
function trafficShared() {
  if (_traf) return _traf;
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffedb8, emissiveIntensity: 1.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff2222, emissiveIntensity: 1.4 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242f, metalness: 0.8, roughness: 0.25 });
  _traf = { headMat, tailMat, skirtMat, glassMat };
  return _traf;
}

export function buildTrafficMesh(type, color) {
  const S = trafficShared();
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(type.w, type.h * 0.62, type.len), paint);
  body.position.y = type.h * 0.42;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.86, type.h * 0.4, type.len * 0.45), S.glassMat);
  cabin.position.set(0, type.h * 0.62 + type.h * 0.2, -type.len * 0.05);
  g.add(cabin);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.96, 0.3, type.len * 0.94), S.skirtMat);
  skirt.position.y = 0.22;
  g.add(skirt);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.7, 0.12, 0.06), S.headMat);
  hl.position.set(0, type.h * 0.45, type.len / 2 + 0.01);
  g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.7, 0.12, 0.06), S.tailMat);
  tl.position.set(0, type.h * 0.45, -type.len / 2 - 0.01);
  g.add(tl);
  return g;
}
