// 2026-11 自由模式路人 v2: the same animated KayKit (CC0) chibi characters as the player, unarmed, in our own Miami palettes.
// Same API as peds.js (createPeds / dressPed / posePed / flushPeds / disposePeds) plus dt; peds.js stays as the fallback
// when the character GLBs failed to load. Perf: beyond 60 m a ped is hidden; beyond 24 m it uses the low-detail soldier LOD
// and its animation runs every 3rd frame.
import * as THREE from 'three';
import { createSoldier, animateSoldier, animateDeath, resetSoldier, setSoldierLOD, charsReady } from './critter.js';

// [char, look] - look '' = the model's own atlas; aloha / beach / street are our pre-baked recolours
export const PED_LOOKS = [
  ['Protagonist_A', ''], ['Protagonist_B', ''], ['Hiker', ''], ['Witch', ''], ['Rogue', ''], ['Survivalist', ''],
  ['ActionFigure', 'aloha'], ['ActionFigure', 'beach'], ['ActionFigure', 'street'], ['Farmer_B', 'aloha'], ['Farmer_B', 'beach'], ['Farmer_B', 'street'],
];
export const PED_CHARS = [...new Set(PED_LOOKS.map(l => l[0]))];
const HIDE = 60 * 60, LO = 24 * 24;
const phoneGeo = new THREE.BoxGeometry(0.07, 0.13, 0.016), phoneMat = new THREE.MeshBasicMaterial({ color: 0x15151c });

export function createPeds(scene, n) {
  if (!charsReady()) return null;
  return { scene, list: new Array(n).fill(null), frame: 0, models: true };
}
export function dressPed(P, i, ped) {
  if (P.list[i]) { P.scene.remove(P.list[i]); }
  const [char, look] = PED_LOOKS[(Math.random() * PED_LOOKS.length) | 0];
  const g = createSoldier('party', { char, look, hat: 'none', gun: undefined });
  g.visible = false; P.scene.add(g); P.list[i] = g;
  const u = g.userData;
  // phone in the right hand (shown while texting / reporting)
  const ph = new THREE.Mesh(phoneGeo, phoneMat); ph.visible = false;
  const hs = u.bones?.handslotr; if (hs) { const s = 1 / (u.model?.scale.x || 1); ph.scale.setScalar(s); ph.position.set(0, 0.05 * s, 0.04 * s); hs.add(ph); }
  u.phoneMesh = ph;
  ped.look = ped.look || {}; ped.look.talker = Math.random() < 0.22; ped.look.char = char;
  u.deadT0 = 0;
}
export function posePed(P, i, ped, far, dt = 1 / 60, pp = null) {
  const g = P.list[i]; if (!g) return;
  const u = g.userData;
  const d2 = pp ? (ped.pos.x - pp.x) ** 2 + (ped.pos.z - pp.z) ** 2 : 0;
  if ((!ped.alive && ped.deadT <= 0) || d2 > HIDE) { g.visible = false; if (u.dying && ped.alive) resetSoldier(g); return; }
  g.visible = true;
  g.position.set(ped.pos.x, 0, ped.pos.z);
  if (!ped.alive) {                               // lying where they fell (die clip held on its last frame, no puff)
    if (!u.dying) u.deadT0 = 0;
    u.deadT0 += dt; animateDeath(g, Math.min(u.deadT0, 1.0)); u.phoneMesh.visible = false; return;
  }
  if (u.dying) resetSoldier(g);
  g.rotation.set(0, ped.yaw + Math.PI, 0);
  const lo = d2 > LO; setSoldierLOD(g, lo);
  u.acc = (u.acc || 0) + dt;
  if (lo && (P.frame + i) % 3) return;
  const step = u.acc; u.acc = 0;
  const run = ped.fleeT > 0 || ped.fight > 0 || ped.jog, mv = ped.moving;
  const mx = mv ? Math.sin(ped.yaw) : 0, mz = mv ? Math.cos(ped.yaw) : 0;
  u.phoneMesh.visible = !!ped.phone;
  animateSoldier(g, Math.min(step, 0.1), { moveX: mx, moveZ: mz, speed: mv ? (run ? 4.2 : 1.2) : 0, yaw: g.rotation.y, wep: 'none', cheer: !!ped.cheer && !mv, firing: false, crouch: false, aim: false, pitch: 0, reload: -1, ground: true, vy: 0 });
}
export function flushPeds(P) { P.frame++; }
export function disposePeds(P, scene) {
  if (!P) return;
  for (const g of P.list) if (g) scene.remove(g);
  P.list.length = 0;
}
