// 绝地求生 (battle royale) mode: free-for-all, no respawn, loot crates, shrinking safe zone, last one standing wins.
import * as THREE from 'three';
import { bowGeo } from './bow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setupDrop, setupAirdrops, updateAirdrops, airdropGoal, airdropMinimap, dropMinimap, cleanupDrop } from './drop.js';


const NAMES = ['老K', '铁牙', '阿狼', '火锅', '刀疤', '石头', '阿飞', '老周', '小林', '阿杰', '大鱼', '海狗', '黑桃', '钢盔', '螺丝', '锚哥', '浪子', '船长', '水手', '灯塔'];
// zone phases: wait (s) then shrink (s) to radius r; dps outside
// 2026-11: the island is ~2x the area (392 x 392 m): first circles ~1.4x wider, a little more time to rotate (vehicles help)
const PHASES_ISLAND = [
  { wait: 70, shrink: 50, r: 165, dps: 2 },
  { wait: 50, shrink: 40, r: 98, dps: 4 },
  { wait: 42, shrink: 30, r: 52, dps: 7 },
  { wait: 32, shrink: 22, r: 24, dps: 10 },
  { wait: 25, shrink: 15, r: 7, dps: 15 },
  { wait: 20, shrink: 15, r: 1.5, dps: 25 },
];
let PHASES;
const PHASES_SHIP = [
  { wait: 40, shrink: 25, r: 42, dps: 3 },
  { wait: 30, shrink: 20, r: 26, dps: 5 },
  { wait: 25, shrink: 18, r: 15, dps: 8 },
  { wait: 20, shrink: 15, r: 7, dps: 12 },
  { wait: 15, shrink: 15, r: 1.5, dps: 20 },
];
const LOOT = [
  { k: 'rifle', name: '步枪', c: 0x3f8f4f, w: 5 },
  { k: 'sniper', name: '狙击枪', c: 0x4a6fbf, w: 2 },
  { k: 'bow', name: '弓箭', c: 0xb0703a, w: 3 },
  { k: 'scope', lv: 2, name: '2倍镜', c: 0x7fd6ff, w: 2.5 },
  { k: 'scope', lv: 4, name: '4倍镜', c: 0x3a86ff, w: 1.5 },
  { k: 'scope', lv: 8, name: '8倍镜', c: 0xa64dff, w: 0.6 },
  { k: 'ammo', name: '弹药', c: 0xd9a63a, w: 4 },
  { k: 'med', name: '医疗包', c: 0xe8e8e8, w: 3 },
  { k: 'armor', lv: 1, name: '一级甲', c: 0xcfd6dc, w: 3 },
  { k: 'armor', lv: 2, name: '二级甲', c: 0x3a86ff, w: 2 },
  { k: 'armor', lv: 3, name: '三级甲', c: 0xa64dff, w: 0.6 },
  { k: 'helmet', lv: 1, name: '一级头', c: 0xcfd6dc, w: 3 },
  { k: 'helmet', lv: 2, name: '二级头', c: 0x3a86ff, w: 2 },
  { k: 'helmet', lv: 3, name: '三级头', c: 0xa64dff, w: 0.6 },
  { k: 'bag', lv: 1, name: '一级包', c: 0xcfd6dc, w: 3 },
  { k: 'bag', lv: 2, name: '二级包', c: 0x3a86ff, w: 2 },
  { k: 'bag', lv: 3, name: '三级包', c: 0xa64dff, w: 0.6 },
];
export const BAG_CAP = [6, 10, 14, 18];
export const bagCap = (G) => BAG_CAP[Math.max(0, Math.min(3, G.bagLv | 0))];
export function gearName(k, lv) { const d = LOOT.find(x => x.k === k && (x.lv || 0) === (lv || 0)); return d ? d.name : k; }
// damage reduction by armor / helmet level (body / head)
export const GEAR_RED = [0, 0.3, 0.4, 0.55];
const LOOT_GEO = {};
// ground loot shaped like the item: parts merged into one geometry per kind (1 draw call each);
// vertex colour 1 = item colour, darker values = metal / accents
function part(geo, x, y, z, shade = 1, rx = 0, ry = 0, rz = 0) {
  geo = geo.toNonIndexed(); geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3).fill(shade); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv'); return geo;
}
const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d), CY = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);
function lootGeo(k) {
  if (LOOT_GEO[k]) return LOOT_GEO[k];
  const P = [], D = 0.28, M = 0.55;
  if (k === 'rifle') {          // body, stock, barrel, magazine, grip, sight
    P.push(part(BX(0.55, 0.16, 0.1), 0, 0, 0), part(BX(0.3, 0.14, 0.08), -0.42, -0.03, 0), part(CY(0.03, 0.03, 0.45), 0.5, 0.03, 0, D, 0, 0, Math.PI / 2),
      part(BX(0.09, 0.24, 0.07), 0.08, -0.18, 0, D, 0, 0, -0.2), part(BX(0.07, 0.16, 0.07), -0.15, -0.14, 0, D, 0, 0, 0.3), part(BX(0.18, 0.05, 0.05), 0.05, 0.11, 0, D));
  } else if (k === 'sniper') {  // long barrel + scope + bipod-ish stock
    P.push(part(BX(0.6, 0.15, 0.1), 0, 0, 0), part(BX(0.32, 0.17, 0.08), -0.46, -0.03, 0), part(CY(0.028, 0.028, 0.75), 0.66, 0.03, 0, D, 0, 0, Math.PI / 2),
      part(CY(0.055, 0.055, 0.36), 0.05, 0.16, 0, D, 0, 0, Math.PI / 2), part(BX(0.07, 0.14, 0.07), -0.12, -0.12, 0, D, 0, 0, 0.3), part(BX(0.08, 0.14, 0.06), 0.12, -0.13, 0, D));
  } else if (k === 'bow') { LOOT_GEO[k] = bowGeo(); return LOOT_GEO[k]; }
  else if (k === 'scope') {     // tube with fat lens ends + mount
    P.push(part(CY(0.075, 0.075, 0.42, 14), 0, 0.1, 0, 1, 0, 0, Math.PI / 2), part(CY(0.11, 0.075, 0.1, 14), 0.24, 0.1, 0, D, 0, 0, Math.PI / 2), part(CY(0.075, 0.1, 0.08, 14), -0.23, 0.1, 0, D, 0, 0, Math.PI / 2),
      part(BX(0.22, 0.08, 0.1), 0, -0.02, 0, D), part(CY(0.035, 0.035, 0.07), 0, 0.2, 0, M));
  } else if (k === 'ammo') {    // open box with a row of cartridges
    P.push(part(BX(0.5, 0.18, 0.32), 0, 0, 0));
    for (let i = 0; i < 5; i++) { P.push(part(CY(0.03, 0.03, 0.12, 8), -0.18 + i * 0.09, 0.15, 0, 0.9), part(CY(0.005, 0.03, 0.06, 8), -0.18 + i * 0.09, 0.24, 0, 0.6)); }
  } else if (k === 'med') {     // white case, handle, red cross on top (red cross added as child mesh)
    P.push(part(BX(0.55, 0.32, 0.4), 0, 0, 0), part(BX(0.22, 0.06, 0.05), 0, 0.22, 0, D), part(BX(0.05, 0.08, 0.05), -0.1, 0.18, 0, D), part(BX(0.05, 0.08, 0.05), 0.1, 0.18, 0, D));
  } else if (k === 'armor') {   // vest: torso, shoulder straps, plates, collar gap
    P.push(part(BX(0.62, 0.62, 0.22), 0, 0, 0), part(BX(0.14, 0.14, 0.24), -0.22, 0.38, 0), part(BX(0.14, 0.14, 0.24), 0.22, 0.38, 0),
      part(BX(0.4, 0.3, 0.05), 0, 0.02, 0.12, 0.75), part(BX(0.12, 0.08, 0.06), -0.12, -0.2, 0.12, D), part(BX(0.12, 0.08, 0.06), 0.12, -0.2, 0.12, D), part(BX(0.64, 0.06, 0.24), 0, -0.26, 0, 0.6));
  } else if (k === 'helmet') {  // dome + brim + strap + top ridge
    P.push(part(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0), part(CY(0.36, 0.36, 0.035, 18), 0, 0.01, 0, 0.75),
      part(BX(0.04, 0.2, 0.04), -0.27, -0.08, 0, D), part(BX(0.04, 0.2, 0.04), 0.27, -0.08, 0, D), part(BX(0.06, 0.05, 0.5), 0, 0.28, 0, 0.7));
  } else if (k === 'bag') {     // pack body, top lid, two shoulder straps, buckle
    P.push(part(BX(0.5, 0.6, 0.28), 0, 0, 0), part(BX(0.44, 0.16, 0.3), 0, 0.32, 0, 0.8),
      part(BX(0.08, 0.5, 0.06), -0.18, -0.02, 0.18, D), part(BX(0.08, 0.5, 0.06), 0.18, -0.02, 0.18, D),
      part(BX(0.3, 0.08, 0.06), 0, 0.08, 0.18, D), part(BX(0.12, 0.1, 0.04), 0, 0.08, 0.21, M));
  } else P.push(part(BX(0.55, 0.4, 0.4), 0, 0, 0));
  const g = mergeGeometries(P); g.computeVertexNormals();
  g.scale(1.25, 1.25, 1.25);
  return (LOOT_GEO[k] = g);
}
// 2026-11 物资光圈: one instanced, glowing ground ring under every item on the ground (1 draw call for all loot), tinted by item colour
let RING = null; const _rm = new THREE.Matrix4(), _rc = new THREE.Color(), _rw = new THREE.Color(0xffffff);
function lootRings(G, scene) {
  if (!RING) {
    const g = new THREE.RingGeometry(0.62, 0.86, 14); g.rotateX(-Math.PI / 2);
    RING = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), 1024);
    RING.instanceMatrix.setUsage(THREE.DynamicDrawUsage); RING.frustumCulled = false; RING.renderOrder = 1;
  }
  if (RING.parent !== scene) scene.add(RING);
  const pulse = 1 + 0.1 * Math.sin(G.now * 3.2); let n = 0; const pp = G.player?.pos;
  for (const l of G.loot) {
    if (l.taken || l.boxed || !l.m.parent || n >= 1024) continue;
    if (pp) { const dx = l.m.position.x - pp.x, dz = l.m.position.z - pp.z; if (dx * dx + dz * dz > 3600) continue; }   // rings only within 60 m (帧率)
    const s = (l.def.lv >= 3 || l.def.k === 'sniper' ? 1.15 : 1) * pulse;
    _rm.makeScale(s, 1, s).setPosition(l.m.position.x, 0.04, l.m.position.z); RING.setMatrixAt(n, _rm);
    RING.setColorAt(n, _rc.set(l.def.c).lerp(_rw, 0.25)); n++;
  }
  for (const b of G.deathBoxes || []) {   // 死亡盒子: one ring per box (its items have none)
    if (!b.m.visible || n >= 1024) continue;
    _rm.makeScale(1.25 * pulse, 1, 1.25 * pulse).setPosition(b.m.position.x, 0.04, b.m.position.z); RING.setMatrixAt(n, _rm); RING.setColorAt(n, _rc.set(0xffb347)); n++;
  }
  RING.count = n; RING.instanceMatrix.needsUpdate = true; if (RING.instanceColor) RING.instanceColor.needsUpdate = true;
}
const rnd = (a, b) => a + Math.random() * (b - a);
let LOOT_ID = 0;
export function spawnLoot(G, scene, def, x, z, delay = 0) {
  const m = new THREE.Mesh(lootGeo(def.k), new THREE.MeshLambertMaterial({ color: def.c, emissive: def.c, emissiveIntensity: 0.3, vertexColors: def.k !== 'bow' }));
  const y = def.k === 'helmet' ? 0.15 : def.k === 'bow' ? 0.62 : def.k === 'armor' || def.k === 'bag' ? 0.5 : 0.35;
  m.position.set(x, y, z); scene.add(m);
  if (def.k === 'med') { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.42), new THREE.MeshBasicMaterial({ color: 0xff3b4d })); cr.position.y = 0.2; m.add(cr); const cr2 = cr.clone(); cr2.rotation.y = Math.PI / 2; m.add(cr2); }
  const l = { id: ++LOOT_ID, def, m, taken: false, noPick: delay ? G.now + delay : 0 }; G.loot.push(l); return l;
}
export function dropBagItem(G, scene, it, x, z) {
  const def = LOOT.find(d => d.k === it.k && (d.lv || 0) === (it.lv || 0)) || { k: it.k, lv: it.lv, name: it.name, c: 0xcfd6dc, w: 1 };
  const l = spawnLoot(G, scene, def, x, z, 1.5); l.manual = true;   // dropped by the player: never auto-picked by the player (nearby list only)
  return l;
}
// ---------- 死亡掉落 (2026-11): a dead player / bot leaves one crate with everything they carried ----------
// The crate is ONE merged mesh (1 draw call, drawn within 60 m like loot); its items are normal loot entries that are never
// drawn (boxed), parked at the crate, so the nearby list / auto-pickup / bot looting all work unchanged. Max MAX_BOX crates.
const MAX_BOX = 14; let BOX_GEO = null; const BOX_MAT = new THREE.MeshLambertMaterial({ vertexColors: true }), HID_MAT = new THREE.MeshBasicMaterial();
function boxGeo() {
  if (BOX_GEO) return BOX_GEO;
  const P = [], C = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const bx = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y, z); P.push(C(g, c)); };
  bx(1.1, 0.5, 0.7, 0, 0.25, 0, 0x4f6b3a); bx(1.16, 0.12, 0.76, 0, 0.56, 0, 0x3d5530);           // body + lid
  bx(0.08, 0.64, 0.78, -0.36, 0.31, 0, 0x2b2b2b); bx(0.08, 0.64, 0.78, 0.36, 0.31, 0, 0x2b2b2b);  // straps
  bx(0.3, 0.16, 0.02, 0, 0.3, 0.36, 0xffb347);                                                     // orange tag (reads at range)
  bx(0.06, 0.9, 0.06, 0.48, 0.95, -0.28, 0x8a8a8a); bx(0.34, 0.22, 0.02, 0.64, 1.28, -0.28, 0xff7a1a);   // little flag
  return (BOX_GEO = mergeGeometries(P));
}
const defOf = (k, lv) => LOOT.find(d => d.k === k && (d.lv || 0) === (lv || 0));
export function spawnLootDef(G, scene, k, x, z) { const d = LOOT.find(x => x.k === k && (x.lv || 0) <= 1); return d ? spawnLoot(G, scene, d, x, z, 0.5) : null; }
export function deathDrop(G, scene, e) {
  if (!G.br || !e) return null;
  const items = [];
  if (e.isPlayer) {
    for (const k of G.owned || []) { const d = defOf(k); if (d) items.push(d); }
    if ([...(G.owned || [])].some(k => G.ammo[k] && G.ammo[k].reserve > 0 && k !== 'knife')) items.push(defOf('ammo'));
    for (const k of ['armor', 'helmet']) if (e[k]) { const d = defOf(k, e[k]); if (d) items.push(d); }
    if (G.bagLv) { const d = defOf('bag', G.bagLv); if (d) items.push(d); }
    if (G.scope) { const d = defOf('scope', G.scope); if (d) items.push(d); }
    for (const it of G.bag || []) { const d = defOf(it.k, it.lv); if (!d) continue; for (let i = 0; i < Math.min(3, it.n || 1); i++) items.push(d); }
  } else {
    if (e.armed && e.gun) { const d = defOf(e.gun); if (d) items.push(d, defOf('ammo')); }
    for (const k of ['armor', 'helmet']) if (e[k]) { const d = defOf(k, e[k]); if (d) items.push(d); }
    if (Math.random() < 0.4) items.push(defOf('med'));
  }
  if (!items.length) return null;
  G.deathBoxes = G.deathBoxes || [];
  while (G.deathBoxes.length >= MAX_BOX) removeBox(G, scene, G.deathBoxes[0]);
  const x = e.pos.x, z = e.pos.z;
  const m = new THREE.Mesh(boxGeo(), BOX_MAT); m.position.set(x, Math.max(0, e.pos.y || 0), z); m.rotation.y = e.yaw || 0; m.name = 'deathbox'; scene.add(m);
  const box = { m, name: e.name, items: [] };
  for (const def of items) {
    const im = new THREE.Mesh(lootGeo(def.k), HID_MAT); im.position.set(x, 0.35, z);   // never added to the scene: drawn as the crate
    const l = { id: ++LOOT_ID, def, m: im, taken: false, noPick: G.now + 0.8, boxed: box }; G.loot.push(l); box.items.push(l);
  }
  G.deathBoxes.push(box); return box;
}
function removeBox(G, scene, b) {
  scene.remove(b.m); for (const l of b.items) l.taken = true;
  G.deathBoxes = G.deathBoxes.filter(x => x !== b);
}
function updateBoxes(G, scene, cp) {
  if (!G.deathBoxes?.length) return;
  for (const b of G.deathBoxes.slice()) {
    if (b.items.every(l => l.taken)) { removeBox(G, scene, b); continue; }
    if (cp) { const dx = b.m.position.x - cp.x, dz = b.m.position.z - cp.z; b.m.visible = dx * dx + dz * dz < 3600; }
  }
}
const PICK_R2 = 1.4, NEAR_R2 = 2.5 * 2.5;
export const LV_COLOR = [0xcfd6dc, 0xe8eef2, 0x4d9bff, 0xb46bff];
const WEAP = new Set(['rifle', 'sniper', 'bow']);
const SLOT = { armor: 1, helmet: 1, bag: 1, scope: 1 };
const worn = (G, p, k) => k === 'bag' ? G.bagLv | 0 : k === 'scope' ? G.scope | 0 : p[k] | 0;
const medRoom = (G) => G.bag.some(x => x.k === 'med' && (x.n || 1) < 5) || G.bag.length < bagCap(G);
// would the player auto-pick this WORLD item when walking over it? true | false | 'full' (wanted, but the backpack has no room)
function autoWant(G, p, l, h) {
  if (l.manual) return false;
  const k = l.def.k;
  if (SLOT[k]) return l.def.lv > worn(G, p, k);                      // gear / scope: only an upgrade (the old one is swapped out)
  if (WEAP.has(k)) return !G.owned.has(k);                           // a gun only into an empty slot
  if (k === 'ammo') return [...G.owned].some(id => !h.WEAPONS[id].melee);
  if (k === 'med') return medRoom(G) ? true : 'full';
  return false;
}
// loot within 2.5 m of the living, grounded player, nearest first (the nearby-items list; manual-only items included)
export function brNearby(G) {
  const p = G.player, out = []; if (!G.br || !p || !p.alive || p.air) return out;
  for (const l of G.loot) {
    if (l.taken || (l.noPick && G.now < l.noPick)) continue;
    const dx = p.pos.x - l.m.position.x, dz = p.pos.z - l.m.position.z, d = dx * dx + dz * dz;
    if (d <= NEAR_R2 && Math.abs(p.pos.y) <= 1.8) out.push({ l, d });
  }
  return out.sort((a, b) => a.d - b.d).map(o => o.l);
}
// tap in the nearby list: explicit pickup (lower gear goes into the backpack instead of being refused)
export function brPickLoot(G, id, h) {
  const l = brNearby(G).find(x => x.id === id); if (!l) return false;
  take(G, G.player, l, h, true); return l.taken;
}
const ZONE = { name: '安全区', team: 'zone', skin: 'red', kills: 0, isPlayer: false, pos: new THREE.Vector3() };
const ZW = { name: '毒圈' };

export function setupBR(G, scene, h) {
  // h: { makeEntity, makeBot, setWeapon, HUD, WEAPONS }
  const n = G.opts.brSize || 16;
  cleanup(G, scene);
  const p = h.makeEntity('你', 'p0', true); p.skin = 'blue'; p.armor = 0; p.helmet = 0; G.player = p;
  G.bag = []; G.bagLv = 0; G.bagMsgT = 0;
  const bots = [];
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < n - 1; i++) { const b = h.makeBot(names[i % names.length], 'b' + i, 'party'); b.skin = 'red'; b.armed = false; b.armor = 0; b.helmet = 0; bots.push(b); }
  G.bots = bots; G.entities = [p, ...bots];
  // spread spawns over deck nodes
  PHASES = G.map.kind === 'island' ? PHASES_ISLAND : PHASES_SHIP;
  const deck = G.map.nodes.filter(x => x.deck && x.n.length).map(x => x.p);
  const insideSpots = G.map.nodes.filter(x => x.inside).map(x => x.p);
  const used = [];
  for (const e of G.entities) {
    let sp = null;
    const gap = G.map.kind === 'island' ? 30 : 9;
    for (let t = 0; t < 80; t++) { const c = deck[(Math.random() * deck.length) | 0]; if (used.every(u => u.distanceTo(c) > gap)) { sp = c; break; } }
    sp = sp || deck[(Math.random() * deck.length) | 0]; used.push(sp);
    e.pos.copy(sp); e.vel.set(0, 0, 0); e.hp = 100; e.alive = true; e.yaw = Math.random() * Math.PI * 2; e.pitch = 0; e.protectUntil = G.now + 3;
    e.place = 0;
    if (!e.isPlayer) { h.resetBot(e); }
  }
  // player kit: knife only (no pistol on landing)
  G.owned = new Set(['knife']);
  for (const k of Object.keys(h.WEAPONS)) G.ammo[k] = { mag: 0, reserve: 0 };
  h.setWeapon('knife', true);
  // loot
  G.loot = [];
  const total = LOOT.reduce((s, l) => s + l.w, 0);
  const lootN = Math.round(n * (G.map.kind === 'island' ? 5 : 2.6));
  const lootSpots = [...insideSpots.slice().sort(() => Math.random() - 0.5).slice(0, Math.round(lootN * 0.45)), ...deck.slice().sort(() => Math.random() - 0.5)].slice(0, Math.min(deck.length, lootN));
  for (const s of lootSpots) {
    let r = Math.random() * total, def = LOOT[0]; for (const l of LOOT) { if ((r -= l.w) < 0) { def = l; break; } }
    spawnLoot(G, scene, def, s.x + rnd(-0.6, 0.6), s.z + rnd(-0.6, 0.6));
  }
  // zone
  const zg = new THREE.CylinderGeometry(1, 1, 24, 64, 1, true);
  const zm = new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const zone = new THREE.Mesh(zg, zm); zone.position.y = 10; zone.frustumCulled = false; scene.add(zone);
  const R0 = G.map.kind === 'island' ? Math.ceil(Math.hypot(G.map.bounds.maxX - G.map.bounds.minX, G.map.bounds.maxZ - G.map.bounds.minZ) / 2) + 6 : 70;
  const C0 = G.map.center ? G.map.center.clone() : new THREE.Vector2(0, 0);
  zone.scale.set(R0, G.map.kind === 'island' ? 3 : 1, R0);
  G.br = { phase: -1, stage: 'wait', t: PHASES[0].wait, c: C0.clone(), r: R0, from: { c: C0.clone(), r: R0 }, next: null, mesh: zone, dps: 1, alive: n, tickT: 0 };
  nextPhase(G);
  G.timeLeft = 1e9;
  if (G.free) { zone.visible = false; G.br.stage = 'final'; G.br.next = null; G.br.r = 1e5; return; }   // 自由模式: no zone, no plane, no airdrops
  // 派对版: everyone starts on the plane (island map), airdrops arrive during the match
  if (G.map.kind === 'island') { setupDrop(G, scene); G.br.t += G.drop.duration + 10; setupAirdrops(G, G.drop.duration + 10); }
}

function nextPhase(G) {
  const B = G.br; B.phase++;
  const ph = PHASES[B.phase];
  if (!ph) { B.stage = 'final'; B.next = null; return; }
  const ang = Math.random() * Math.PI * 2, off = (B.r - ph.r) * Math.sqrt(Math.random()) * 0.9;
  const c = new THREE.Vector2(B.c.x + Math.cos(ang) * off, B.c.y + Math.sin(ang) * off);
  // keep the new zone on the ship deck
  const BD = G.map.bounds; c.x = Math.max(BD.minX + 4, Math.min(BD.maxX - 4, c.x)); c.y = Math.max(BD.minZ + 3, Math.min(BD.maxZ - 3, c.y));
  B.next = { c, r: ph.r }; B.stage = 'wait'; B.t = ph.wait; B.from = { c: B.c.clone(), r: B.r };
}

export function brOutside(G, e, margin = 0) { const B = G.br; return Math.hypot(e.pos.x - B.c.x, e.pos.z - B.c.y) > B.r - margin; }

// patrol goal for a bot: unarmed -> nearest crate; else a node inside the (next) safe zone
export function brGoal(bot, G) {
  const B = G.br;
  const ad = airdropGoal(bot, G); if (ad && (!bot.armed || bot.gun !== 'sniper')) return ad;
  if (!bot.armed) {
    let best = null, bd = G.map.kind === 'island' ? 45 : 30;
    for (const l of G.loot) { if (l.taken || l.def.k === 'med' || l.def.k === 'ammo' || l.def.k === 'scope' || l.def.k === 'bag' || ((l.def.k === 'armor' || l.def.k === 'helmet') && (bot[l.def.k] || 0) >= l.def.lv)) continue; const d = l.m.position.distanceTo(bot.pos); if (d < bd) { bd = d; best = l; } }
    if (best) return best.m.position.clone().setY(0);
  }
  const z = B.next || { c: B.c, r: B.r };
  const nodes = G.map.nodes;
  for (let i = 0; i < 30; i++) { const nn = nodes[(Math.random() * nodes.length) | 0]; if (!nn.n.length) continue; const nd = nn.p; if (Math.hypot(nd.x - z.c.x, nd.z - z.c.y) < Math.max(2, z.r * 0.8)) return nd; }
  let best = nodes[0].p, bd = 1e9;
  for (const nd of nodes) { if (!nd.n.length) continue; const d = Math.hypot(nd.p.x - z.c.x, nd.p.z - z.c.y); if (d < bd) { bd = d; best = nd.p; } }
  return best;
}

export function updateBR(G, dt, h) {
  const B = G.br;
  // zone timeline
  if (B.stage !== 'final') {
    B.t -= dt;
    if (B.stage === 'wait' && B.t <= 0) { B.stage = 'shrink'; B.t = PHASES[B.phase].shrink; B.from = { c: B.c.clone(), r: B.r }; h.HUD.centerMsg('安全区开始缩小！', 1800); }
    else if (B.stage === 'shrink') {
      const ph = PHASES[B.phase], k = 1 - Math.max(0, B.t) / ph.shrink;
      B.c.lerpVectors(B.from.c, B.next.c, k); B.r = B.from.r + (B.next.r - B.from.r) * k; B.dps = ph.dps;
      if (B.t <= 0) nextPhase(G);
    }
  }
  B.mesh.position.x = B.c.x; B.mesh.position.z = B.c.y; B.mesh.scale.set(B.r, B.mesh.scale.y, B.r);
  // zone damage once per 0.5s
  B.tickT -= dt;
  if (B.tickT <= 0) {
    B.tickT = 0.5;
    for (const e of G.entities) if (e.alive && !e.air && brOutside(G, e)) h.damage(e, B.dps * 0.5, ZONE, ZW, false, true);
  }
  if (G.airdropPlan) updateAirdrops(G, dt, h.scene, h);
  const outside = G.player.alive && !G.player.air && brOutside(G, G.player);
  h.$('dmg').classList.toggle('zone', outside);
  // loot pickup
  const cp = h.camera ? h.camera.position : G.player?.pos;
  updateBoxes(G, h.scene, cp);
  lootRings(G, h.scene);
  for (const l of G.loot) {
    if (l.taken) continue;
    if (!l.boxed) {
      if (cp) { const dx = l.m.position.x - cp.x, dz = l.m.position.z - cp.z; l.m.visible = dx * dx + dz * dz < 3600; }   // items drawn within 60 m, like their rings (帧率)
      l.m.rotation.y += dt * 1.2;
    }
    if (l.noPick && G.now < l.noPick) continue;
    for (const e of G.entities) {
      if (!e.alive || e.air) continue;
      const dx = e.pos.x - l.m.position.x, dz = e.pos.z - l.m.position.z;
      if (dx * dx + dz * dz > PICK_R2 || Math.abs(e.pos.y - 0) > 1.5) continue;
      if (e.isPlayer) {                                     // auto-pickup rules (everything else waits in the nearby list)
        const w = autoWant(G, e, l, h);
        if (w === 'full') { if (!l.fullMsg) { l.fullMsg = true; bagFull(G, h); } continue; }
        if (!w) continue;
        take(G, e, l, h); break;
      }
      if (l.def.k === 'bag' || l.def.k === 'scope') continue;                                       // bags / scopes: player only
      if ((l.def.k === 'armor' || l.def.k === 'helmet') && (e[l.def.k] || 0) >= l.def.lv) continue;   // bots skip gear no better than worn
      if (l.def.k === 'ammo' || (l.def.k === 'med' && e.hp > 70)) continue;
      take(G, e, l, h); break;
    }
  }
}

function bagAdd(G, it) {
  if (it.k === 'med') { const s = G.bag.find(x => x.k === 'med' && (x.n || 1) < 5); if (s) { s.n = (s.n || 1) + (it.n || 1); return true; } }
  if (G.bag.length >= bagCap(G)) return false;
  G.bag.push(it); return true;
}
function bagFull(G, h) {
  if (G.now < (G.bagMsgT || 0)) return;
  G.bagMsgT = G.now + 1.5; h.HUD.centerMsg('背包已满', 1100);
}

function take(G, e, l, h, manual = false) {
  const k = l.def.k, def = l.def;
  const got = () => { l.taken = true; l.m.visible = false; };
  if (!e.isPlayer && (k === 'armor' || k === 'helmet')) { got(); e[k] = def.lv; return; }
  if (e.isPlayer && SLOT[k]) {
    const old = worn(G, e, k);
    if (old && def.lv <= old && k !== 'bag') {             // not an upgrade (only reachable by tapping it): into the backpack
      if (!bagAdd(G, { k, lv: def.lv, name: def.name })) { bagFull(G, h); return; }
      got(); h.sfx.reload?.(); h.HUD.centerMsg('拾取 ' + def.name + ' · 已放入背包', 900); return;
    }
    if (k === 'bag' && G.bag.length > BAG_CAP[def.lv]) { h.HUD.centerMsg('背包物品太多，换不下 ' + def.name, 1200); return; }
    got();
    if (k === 'bag') G.bagLv = def.lv; else if (k === 'scope') G.scope = def.lv; else e[k] = def.lv;
    if (old) dropBagItem(G, h.scene, { k, lv: old, name: gearName(k, old) }, e.pos.x, e.pos.z);   // swapped-out piece: on the ground, manual-only
    h.sfx.reload?.();
    h.HUD.centerMsg('装备 ' + def.name + (k === 'bag' ? ' · 容量 ' + bagCap(G) + ' 格' : k === 'scope' && !old ? ' · 步枪/弓箭/狙击开镜生效' : ''), 1100);
    return;
  }
  if (!e.isPlayer) {
    got();
    if (k === 'med') e.hp = Math.min(100, e.hp + 50);
    else { e.armed = true; e.gun = k; }
    return;
  }
  const W = h.WEAPONS;
  if (k === 'med') {
    if (!bagAdd(G, { k, name: def.name, n: 1 })) { bagFull(G, h); return; }
    got(); h.sfx.reload?.(); h.HUD.centerMsg('拾取 ' + def.name + ' · 已放入背包', 900); return;
  }
  got();
  if (k === 'ammo') { for (const id of G.owned) if (!W[id].melee) G.ammo[id].reserve = Math.max(0, G.ammo[id].reserve + (W[id].pick || W[id].mag * 2)); }
  else {
    const first = !G.owned.has(k); G.owned.add(k);
    G.ammo[k].reserve = Math.max(0, G.ammo[k].reserve + (first ? W[k].reserve / 2 : W[k].mag * 2));
    if (first) { G.ammo[k].mag = W[k].mag; h.setWeapon(k); }
  }
  h.sfx.reload?.(); h.HUD.centerMsg('拾取 ' + def.name, 900);
}

export function brKilled(G, t, h) {
  const B = G.br;
  deathDrop(G, h.scene, t);
  const alive = G.entities.filter(e => e.alive).length; B.alive = alive;
  t.place = alive + 1;
  if (t.isPlayer) { setTimeout(() => h.endMatch(), 2200); h.$('respawnIn').textContent = `你获得了第 ${t.place} 名`; return; }
  if (alive <= 1) { const w = G.entities.find(e => e.alive); if (w) w.place = 1; setTimeout(() => h.endMatch(), 1200); }
}

export function brResult(G) {
  const p = G.player; const place = p.alive ? 1 : p.place;
  return { place, win: place === 1, title: place === 1 ? '🎉 派对之王！第 1 名' : `第 ${place} 名` };
}

export function brBoardHTML(G, title) {
  const rows = G.entities.slice().sort((a, b) => (a.alive ? 0 : a.place || 99) - (b.alive ? 0 : b.place || 99) || b.kills - a.kills)
    .map(e => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.alive ? '存活' : '#' + e.place}</td><td>${e.name}</td><td>${e.kills}</td></tr>`).join('');
  return `${title ? `<h2>${title}</h2>` : ''}<div class="sbWrap"><div class="sbTeam red" style="max-height:60vh;overflow:auto"><h3>派对吃鸡 <b>存活 ${G.br.alive}</b></h3><table><tr><th>名次</th><th>玩家</th><th>击杀</th></tr>${rows}</table></div></div>`;
}

export function brHud(G) {
  const B = G.br; let s;
  if (G.free) return { left: '自由模式', right: '击杀 ' + G.player.kills, mid: G.freeMask ? '已戴面具' : '' };
  if (B.stage === 'final') s = '最终安全区';
  else s = (B.stage === 'wait' ? '安全区将在 ' : '安全区缩小中 ') + Math.max(0, Math.ceil(B.t)) + ' 秒' + (B.stage === 'wait' ? ' 后缩小' : '');
  return { left: '存活 ' + G.entities.filter(e => e.alive).length, right: '击杀 ' + G.player.kills, mid: s };
}

export function brMinimap(G, ctx, mx, mz, sx, sz) {
  const B = G.br;
  ctx.strokeStyle = '#7fc0ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(mx(B.c.x), mz(B.c.y), B.r * sx, B.r * sz, 0, 0, 7); ctx.stroke();
  dropMinimap(G, ctx, mx, mz); airdropMinimap(G, ctx, mx, mz);
  if (B.next && B.stage !== 'final') { ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(mx(B.next.c.x), mz(B.next.c.y), B.next.r * sx, B.next.r * sz, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
}

export function cleanup(G, scene) {
  cleanupDrop(G, scene);
  for (const l of G.loot || []) { scene.remove(l.m); if (!l.boxed) l.m.material.dispose(); }
  for (const b of G.deathBoxes || []) scene.remove(b.m); G.deathBoxes = [];
  G.loot = []; G.bag = []; G.bagLv = 0; G.bagMsgT = 0;
  if (RING) { RING.count = 0; if (RING.parent) RING.parent.remove(RING); }
  if (G.br?.mesh) scene.remove(G.br.mesh);
  G.br = null;
}
