// Procedural original sports-car meshes. All shapes are invented;
// silhouettes come from an extruded side profile per body style.
import * as THREE from 'three';
import { clamp } from './utils.js';

// shared geometries / materials (built once)
let _shared = null;
function shared() {
  if (_shared) return _shared;
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.32, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9c2d0, metalness: 0.9, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1622, metalness: 0.9, roughness: 0.12 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xbfe8ff, emissiveIntensity: 2.2 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.16, 1.1, 8);
  flameGeo.rotateX(-Math.PI / 2); // point backward (-z)
  flameGeo.translate(0, 0, -0.55);
  _shared = { tireGeo, rimGeo, tireMat, rimMat, glassMat, darkMat, headMat, flameMat, flameGeo };
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

export function buildCarMesh(def, color, quality) {
  const S = shared();
  const b = def.body;
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  group.add(tilt);

  const paint = new THREE.MeshStandardMaterial({
    color, metalness: 0.75, roughness: 0.32,
    emissive: color, emissiveIntensity: 0.06,
  });
  const body = new THREE.Mesh(bodyGeometry(b.style, b.len, b.wide, b.low), paint);
  body.castShadow = true;
  tilt.add(body);

  const glassGeo = glassGeometry(b.style, b.len, b.wide);
  if (glassGeo) {
    const glass = new THREE.Mesh(glassGeo, S.glassMat);
    tilt.add(glass);
  }

  // wheels
  const wheels = [], steerGroups = [];
  const wx = b.wide / 2 - 0.05, wzF = b.len * 0.32, wzR = -b.len * 0.32;
  const wpos = [[-wx, wzF], [wx, wzF], [-wx, wzR], [wx, wzR]];
  let wheelFL, wheelFR;
  wpos.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0.37, z);
    const tire = new THREE.Mesh(S.tireGeo, S.tireMat);
    tire.castShadow = quality && quality.shadows > 0;
    const rim = new THREE.Mesh(S.rimGeo, S.rimMat);
    g.add(tire); g.add(rim);
    tilt.add(g);
    wheels.push(tire, rim);
    if (i < 2) { steerGroups.push(g); if (i === 0) wheelFL = g; else wheelFR = g; }
  });

  // spoiler
  const spMat = S.darkMat;
  if (b.spoiler === 'wing' || b.spoiler === 'active') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.42), b.spoiler === 'active' ? paint : spMat);
    wing.position.set(0, 1.02 + b.low * 0.3, -b.len / 2 + 0.25);
    wing.castShadow = true;
    tilt.add(wing);
    for (const sx of [-0.6, 0.6]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.3), spMat);
      strut.position.set(sx, 0.82 + b.low * 0.3, -b.len / 2 + 0.25);
      tilt.add(strut);
    }
  } else if (b.spoiler === 'lip' || b.spoiler === 'ducktail') {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), spMat);
    lip.position.set(0, 0.72 + b.low, -b.len / 2 + 0.12);
    lip.rotation.x = b.spoiler === 'ducktail' ? -0.35 : 0;
    tilt.add(lip);
  }

  // headlights
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), S.headMat);
    hl.position.set(sx, 0.52, b.len / 2 - 0.02);
    tilt.add(hl);
  }
  // taillight bar (own material instance per car for brake glow)
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.7 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.06), brakeMat);
  tl.position.set(0, 0.62, -b.len / 2 - 0.02);
  tilt.add(tl);

  // exhausts + nitro flames
  const flameL = new THREE.Mesh(S.flameGeo, S.flameMat);
  const flameR = new THREE.Mesh(S.flameGeo, S.flameMat);
  flameL.position.set(-0.35, 0.32, -b.len / 2 - 0.1);
  flameR.position.set(0.35, 0.32, -b.len / 2 - 0.1);
  flameL.visible = flameR.visible = false;
  tilt.add(flameL); tilt.add(flameR);
  for (const sx of [-0.35, 0.35]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 10), S.darkMat);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(sx, 0.32, -b.len / 2 - 0.05);
    tilt.add(ex);
  }

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
