// 派对突击 - original cute "bean critter" characters (chubby capsule body, big eyes, assorted hats).
// Same API as soldier.js (createSoldier / animateSoldier / animateDeath / resetSoldier ...), simple group animation.
import * as THREE from 'three';
import { Builder, M, between } from './soldier.js';

// 3-step toon ramp shared by every toon material in the game
let RAMP = null;
export function toonRamp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.generateMipmaps = false; RAMP.needsUpdate = true;
  return RAMP;
}
let MAT = null;
export function critterMaterial() { return MAT || (MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })); }

export const BODY_COLORS = [0xff8fb1, 0x7fd6ff, 0xffd45c, 0x9be37a, 0xc59bff, 0xff9a5c, 0x5ce1c6, 0xff6b6b, 0xf7f3e8, 0x8ea8ff];
const TEAM_COLORS = { blue: [0x6fb8ff, 0x5cc8f0, 0x8ea8ff], red: [0xff7a6b, 0xff9a5c, 0xff8fb1] };
export const HATS = ['cone', 'beanie', 'tophat', 'propeller', 'bow', 'sprout', 'none'];
const HAT_COLORS = [0xff4d6d, 0x2ec4b6, 0xffbe0b, 0x3a86ff, 0x8338ec, 0xfb5607, 0x06d6a0];

const sph = (r, w = 14, h = 10, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, ts, tl);
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

const GEO = {};
// chubby round critter: wide pear body + big round head with little round ears (hitbox ~0.64 x 1.8)
const HY = 1.3, HR = 0.45;
function bodyGeo(color, hat, hatColor) {
  const key = color + '|' + hat + '|' + hatColor; if (GEO[key]) return GEO[key];
  const B = new Builder();
  const belly = mix(color, 0xffffff, 0.55), dark = 0x2a2230, inner = mix(color, 0xff7aa2, 0.45);
  B.add(sph(0.52, 18, 12), M(0, 0.56, 0, 0, 0, 0, 1, 0.94, 0.92), color);                       // round tummy
  B.add(sph(0.34, 14, 10), M(0, 0.52, -0.27, 0, 0, 0, 1, 1.05, 0.7), belly);                    // belly patch
  B.add(sph(HR, 18, 12), M(0, HY, 0, 0, 0, 0, 1, 0.95, 0.95), color);                          // big round head
  for (const s of [-1, 1]) {
    B.add(sph(0.13, 10, 8), M(s * 0.3, HY + 0.33, 0.02, 0, 0, 0, 1, 1, 0.6), color);          // round ear
    B.add(sph(0.08, 8, 6), M(s * 0.3, HY + 0.33, -0.04, 0, 0, 0, 1, 1, 0.4), inner);          // inner ear
    B.add(sph(0.12, 14, 10), M(s * 0.16, HY + 0.03, -0.355, 0, 0, 0, 1, 1.15, 0.6), 0xffffff); // eye white
    B.add(sph(0.075, 10, 8), M(s * 0.155, HY + 0.02, -0.415, 0, 0, 0, 1, 1.2, 0.5), dark);     // pupil
    B.add(sph(0.026, 6, 4), M(s * 0.13, HY + 0.065, -0.45), 0xffffff);                         // sparkle
    B.add(sph(0.075, 8, 6), M(s * 0.29, HY - 0.12, -0.3, 0, 0, 0, 1, 0.6, 0.5), 0xff7aa2);     // blush
  }
  B.add(sph(0.05, 8, 6), M(0, HY - 0.08, -0.43, 0, 0, 0, 1.2, 0.8, 0.6), mix(color, 0x000000, 0.45)); // tiny nose
  B.add(new THREE.TorusGeometry(0.05, 0.015, 5, 10, Math.PI), M(0, HY - 0.15, -0.41, 0, 0, Math.PI), dark); // smile
  const hc = hatColor, hc2 = mix(hatColor, 0xffffff, 0.6), T = HY + HR * 0.95;
  if (hat === 'cone') {
    B.add(new THREE.ConeGeometry(0.19, 0.42, 12), M(0.07, T + 0.17, 0, 0, 0, -0.2), hc);
    B.add(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 12), M(0.035, T - 0.02, 0, 0, 0, -0.2), hc2);
    B.add(sph(0.065, 8, 6), M(0.15, T + 0.38, 0), 0xffffff);
  } else if (hat === 'beanie') {
    B.add(sph(0.47, 16, 8, 0, Math.PI / 2), M(0, HY + 0.06, 0, 0, 0, 0, 1, 0.95, 1), hc);
    B.add(new THREE.CylinderGeometry(0.475, 0.475, 0.11, 18), M(0, HY + 0.1, 0), hc2);
    B.add(sph(0.1, 8, 6), M(0, T + 0.12, 0), hc2);
  } else if (hat === 'tophat') {
    B.add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), M(0, T - 0.04, 0), 0x2b2b38);
    B.add(new THREE.CylinderGeometry(0.21, 0.23, 0.34, 14), M(0, T + 0.14, 0), 0x2b2b38);
    B.add(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 14), M(0, T + 0.02, 0), hc);
  } else if (hat === 'propeller') {
    B.add(sph(0.43, 16, 6, 0, Math.PI / 2), M(0, HY + 0.12, 0, 0, 0, 0, 1, 0.9, 1), hc);
    B.add(new THREE.BoxGeometry(0.3, 0.03, 0.22), M(0, HY + 0.14, -0.44, -0.2), hc2);
    B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), M(0, T + 0.08, 0), 0x666677);
    B.add(new THREE.BoxGeometry(0.46, 0.02, 0.08), M(0, T + 0.15, 0, 0, 0.6, 0), 0xffbe0b);
    B.add(new THREE.BoxGeometry(0.46, 0.02, 0.08), M(0, T + 0.15, 0, 0, -0.97, 0), 0xff4d6d);
  } else if (hat === 'bow') {
    for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.11, 0.2, 8), M(0.12 + s * 0.11, T - 0.04, -0.05, 0, 0, s * Math.PI / 2), hc);
    B.add(sph(0.06, 8, 6), M(0.12, T - 0.04, -0.05), hc2);
  } else if (hat === 'sprout') {
    B.add(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 6), M(0, T + 0.07, 0), 0x3f9b3a);
    for (const s of [-1, 1]) B.add(sph(0.09, 8, 6), M(s * 0.09, T + 0.18, 0, 0, 0, s * 0.6, 1.5, 0.45, 0.8), 0x66d158);
  }
  const g = B.build(false); g.userData.tris = B.tris; return (GEO[key] = g);
}
function footGeo(color) {
  const key = 'foot' + color; if (GEO[key]) return GEO[key];
  const B = new Builder(); B.add(sph(0.15, 10, 6), M(0, 0, -0.05, 0, 0, 0, 1, 0.6, 1.35), mix(color, 0x000000, 0.25));
  return (GEO[key] = B.build(false));
}
function armGeo(color) { // two round hands + chunky cartoon blaster, pivot at shoulder height, forward = -Z
  const key = 'arm' + color; if (GEO[key]) return GEO[key];
  const B = new Builder();
  const X = 0.42, V = (x, y, z) => new THREE.Vector3(x, y, z);
  B.add(new THREE.BoxGeometry(0.13, 0.17, 0.5), M(X, 0, -0.5), 0x3a3f58);                   // receiver
  B.add(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 10), M(X, 0.02, -0.87, Math.PI / 2), 0xffa62b); // barrel
  B.add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), M(X, 0.02, -1.02, Math.PI / 2), 0xff4d6d);  // muzzle ring
  B.add(new THREE.BoxGeometry(0.08, 0.16, 0.1), M(X, -0.12, -0.36, 0.3), 0x2b2b38);          // grip
  B.add(new THREE.BoxGeometry(0.1, 0.11, 0.18), M(X, 0.14, -0.53), 0x5ce1c6);               // sight
  B.add(new THREE.BoxGeometry(0.1, 0.14, 0.2), M(X, -0.02, -0.17), 0xffa62b);               // stock
  let t = between(V(0.4, 0.02, -0.05), V(X + 0.02, -0.08, -0.32));
  B.add(new THREE.CapsuleGeometry(0.075, Math.max(0.01, t.len), 3, 8), t.m, color);          // right arm
  B.add(sph(0.1, 10, 8), M(X + 0.02, -0.08, -0.33), color);                                  // right hand
  t = between(V(-0.38, 0.02, -0.2), V(X - 0.08, -0.05, -0.66));
  B.add(new THREE.CapsuleGeometry(0.07, Math.max(0.01, t.len), 3, 8), t.m, color);           // left arm reaching to the foregrip
  B.add(sph(0.095, 10, 8), M(X - 0.08, -0.05, -0.67), color);                                // left hand
  const g = B.build(false); return (GEO[key] = g);
}
let FLASH = null;
function flashGeo() {
  if (FLASH) return FLASH;
  const B = new Builder();
  B.add(new THREE.PlaneGeometry(0.22, 0.4), M(0, 0, -0.14, Math.PI / 2), 0xffffff);
  B.add(new THREE.PlaneGeometry(0.22, 0.4), M(0, 0, -0.14, Math.PI / 2, 0, Math.PI / 2), 0xffffff);
  B.add(new THREE.CircleGeometry(0.15, 8), M(0, 0, 0), 0xffffff);
  return (FLASH = B.build(false));
}
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(0.45, 14); blobGeo.rotateX(-Math.PI / 2);
const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
const puffGeo = new THREE.IcosahedronGeometry(0.22, 0);

const pick = (a) => a[(Math.random() * a.length) | 0];
// skin: 'blue' | 'red' (team tints) | 'player' | anything else (random party colours)
export function createSoldier(skin = 'party', variant) {
  const color = variant?.color ?? (skin === 'player' ? 0xffc86b : TEAM_COLORS[skin] ? pick(TEAM_COLORS[skin]) : pick(BODY_COLORS));
  const hat = variant?.hat ?? (skin === 'player' ? 'cone' : pick(HATS));
  const hatColor = variant?.hatColor ?? (skin === 'player' ? 0xff4d6d : pick(HAT_COLORS));
  const mat = critterMaterial();
  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  const body = new THREE.Mesh(bodyGeo(color, hat, hatColor), mat); root.add(body);
  const footL = new THREE.Mesh(footGeo(color), mat), footR = new THREE.Mesh(footGeo(color), mat);
  footL.position.set(-0.22, 0.08, 0); footR.position.set(0.22, 0.08, 0); root.add(footL, footR);
  const arms = new THREE.Group(); arms.position.set(0, 0.8, 0); root.add(arms);
  const armMesh = new THREE.Mesh(armGeo(color), mat); arms.add(armMesh);
  const muzzle = new THREE.Mesh(flashGeo(), flashMat); muzzle.position.set(0.42, 0.02, -1.07); muzzle.visible = false; arms.add(muzzle);
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.03; g.add(blob);
  const puffs = new THREE.Group(); puffs.visible = false; g.add(puffs);
  for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(puffGeo, puffMat); const a = i / 7 * Math.PI * 2; p.userData.d = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.8, Math.sin(a)); puffs.add(p); }
  for (const m of [body, footL, footR, armMesh]) m.frustumCulled = true;
  g.userData = { skin, color, hat, hatColor, root, body, footL, footR, arms, armMesh, muzzle, blob, puffs, mesh: body, phase: Math.random() * 6, moveK: 0, crouchK: 0, aimK: 0, kick: 0, t: Math.random() * 10, pitch: 0, tris: body.geometry.userData.tris };
  return g;
}
export function soldierTris(team) { return bodyGeo(BODY_COLORS[0], 'cone', HAT_COLORS[0]).userData.tris; }
export function setSoldierLOD() {}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
// o: { moveX, moveZ, speed, yaw, crouch, aim, pitch, reload (-1 | 0..1), air: 'fall'|'chute'|null }
export function animateSoldier(g, dt, o) {
  const u = g.userData;
  u.t += dt;
  const ml = Math.hypot(o.moveX, o.moveZ), moving = ml > 0.1;
  u.moveK += ((moving ? 1 : 0) - u.moveK) * Math.min(1, dt * 8);
  u.crouchK += ((o.crouch ? 1 : 0) - u.crouchK) * Math.min(1, dt * 10);
  u.aimK += ((o.aim ? 1 : 0) - u.aimK) * Math.min(1, dt * (o.aim ? 12 : 4));
  u.kick = Math.max(0, u.kick - dt * 10);
  u.pitch += ((o.aim ? o.pitch : 0) - u.pitch) * Math.min(1, dt * 10);
  const mk = u.moveK, ck = u.crouchK, ak = u.aimK;
  u.phase += dt * (moving ? 7 + o.speed * ml * 1.2 : 0);
  const ph = u.phase, w = Math.sin(ph);
  const breathe = Math.sin(u.t * 2.2) * 0.025 * (1 - mk);
  // waddle: side-to-side rock + hop
  u.root.rotation.set(o.air === 'fall' ? -1.1 : 0, 0, w * 0.16 * mk + (o.air === 'chute' ? Math.sin(u.t * 2) * 0.08 : 0));
  u.root.position.set(0, Math.abs(Math.cos(ph)) * 0.07 * mk, o.air === 'fall' ? 0.6 : 0);
  const sy = lerp(1, 0.76, ck) * (1 + breathe), sxz = lerp(1, 1.1, ck) * (1 - breathe * 0.5);
  u.body.scale.set(sxz, sy, sxz);
  // feet step forward/back and lift
  const air = !!o.air;
  u.footL.position.set(-0.22, 0.08 + Math.max(0, Math.cos(ph)) * 0.09 * mk + (air ? -0.02 : 0), w * 0.2 * mk + (air ? 0.12 : 0));
  u.footR.position.set(0.22, 0.08 + Math.max(0, -Math.cos(ph)) * 0.09 * mk + (air ? -0.02 : 0), -w * 0.2 * mk + (air ? 0.12 : 0));
  // arms + blaster: lowered <-> aimed, recoil, reload tilt
  const rl = o.reload >= 0 ? Math.sin(Math.PI * o.reload) : 0;
  u.arms.position.set(0, lerp(0.8, 0.66, ck) + Math.abs(Math.cos(ph)) * 0.03 * mk, u.kick * 0.06);
  u.arms.rotation.set(air ? (o.air === 'chute' ? 1.9 : 0.4) : lerp(-0.55, u.pitch, ak) + u.kick * 0.18 - rl * 0.5, lerp(0.25, 0, ak), rl * 0.7);
}
export function soldierFired(g) { g.userData.kick = 1; }

// death: squash, flop over with a bounce, then pop into a puff of cloud
export function animateDeath(g, t) {
  const u = g.userData;
  if (!u.dying) {
    u.dying = true; u.deathDir = Math.random() < 0.5 ? 1 : -1;
    u.fadeMat = critterMaterial().clone(); u.fadeMat.transparent = true;
    for (const m of [u.body, u.footL, u.footR, u.armMesh]) m.material = u.fadeMat;
  }
  const k1 = clamp(t / 0.15, 0, 1), k2 = clamp((t - 0.1) / 0.4, 0, 1);
  let tip = 1.5 * k2 * k2;
  if (t > 0.5) tip = 1.5 + 0.12 * Math.sin((t - 0.5) * 20) * Math.exp(-(t - 0.5) * 8);
  u.root.rotation.set(0, 0, u.deathDir * tip);
  u.root.position.set(0, 0.25 * Math.sin(Math.PI * k2) , 0);
  u.body.scale.set(1 + 0.25 * (1 - k1) * k1 * 4, 1 - 0.25 * k1 * (1 - k2), 1 + 0.2 * k1 * (1 - k2));
  u.muzzle.visible = false;
  // pop
  const pk = clamp((t - 1.1) / 0.5, 0, 1);
  if (pk > 0) {
    const s = pk < 0.25 ? 1 + pk * 0.8 : Math.max(0.001, 1.2 * (1 - (pk - 0.25) / 0.75));
    u.root.scale.setScalar(s);
    u.puffs.visible = true;
    u.puffs.children.forEach((p) => { p.position.copy(p.userData.d).multiplyScalar(0.3 + pk * 1.1); p.position.y += 0.4; p.scale.setScalar(1 + pk * 1.5); });
    puffMat.opacity = 0.9;
    u.fadeMat.opacity = 1 - clamp((pk - 0.3) / 0.5, 0, 1);
  }
  u.blob.visible = pk < 0.5;
  if (pk >= 1) u.puffs.visible = false;
}
export function resetSoldier(g) {
  const u = g.userData; if (!u.dying) return;
  u.dying = false; const m = critterMaterial();
  for (const x of [u.body, u.footL, u.footR, u.armMesh]) x.material = m;
  u.fadeMat?.dispose(); u.fadeMat = null; u.blob.visible = true; u.puffs.visible = false;
  u.root.rotation.set(0, 0, 0); u.root.position.set(0, 0, 0); u.root.scale.setScalar(1); u.body.scale.setScalar(1);
}
