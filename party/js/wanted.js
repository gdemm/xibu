// 迈阿密 玩法 (2026-11, mechanics inspired by open-world crime games, all content original):
// 通缉星级 1-6 (自由模式 6, 吃鸡迈阿密 5), police cruisers (siren, chase over the road network, stop and shoot),
// 抢车 (pull the officer out of a stopped police car), 抢劫便利店 (hold at a shop counter), cash + bank on the HUD.
// Only active on the 迈阿密 map (G.map.variant === 'miami'); the battle-royale rules keep running underneath.
// 自由模式 adds witness-only crimes, identity features, shop cameras and jewellery stores (freeroam.js).
import * as THREE from 'three';
import { spawnVehicles, driveVehicle, poseVehicle, vehicleBox, VTYPES } from './vehicles.js';
import { autoDrive, resetAuto } from './autodrive.js';
import { spawnLootDef } from './br.js';

const COPS_FOR = [0, 1, 1, 2, 3, 4, 5], DECAY = 20, DECAY_FREE = 5, ROB_T = 3, ROB_R = 2.4;
const COP = { name: '警察', team: 'police', cop: true, isPlayer: false, kills: 0, pos: new THREE.Vector3() };
const W_COP = { name: '警察配枪' };
const BURNT = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();

export function setupWanted(G) {
  G.wanted = G.map?.variant === 'miami' ? {
    stars: 0, seenT: 0, decayT: 0, cash: 0, bank: 0, cops: [], spawnT: 2, rob: null, shopCd: new Map(), hitT: 0,
    traits: { face: false, clothes: false, car: false }, carRef: null, hollow: false,
    lastSeen: new THREE.Vector2(), hasSeen: false, searchPt: null,
  } : null;
  renderHud(G);
}
export function addStars(G, h, n, why) {
  const W = G.wanted; if (!W || !G.player?.alive) return;
  const before = W.stars, max = G.free ? 6 : 5;
  W.stars = Math.min(max, W.stars + n); W.decayT = 0;
  if (W.stars > before) h.HUD.centerMsg('通缉 ' + '★'.repeat(W.stars) + (why ? ' · ' + why : ''), 1300);
  renderHud(G);
}
function raise(G, h, n, why, pos) {
  if (G.freeCrime) return G.freeCrime(n, why, pos);
  addStars(G, h, n, why); return true;
}
export function addCash(G, n) { if (!G.wanted) return; G.wanted.cash += n; renderHud(G); }
export function refreshWantedHud(G) { renderHud(G); }
function renderHud(G) {
  const el = document.getElementById('wanted'), c = document.getElementById('cash'); if (!el) return;
  const W = G.wanted; document.body.classList.toggle('gtaMode', !!W);
  const tf = document.getElementById('trFace'), tc = document.getElementById('trCloth'), tv = document.getElementById('trCar');
  if (!W) { if (tf) { tf.className = tc.className = tv.className = ''; } return; }
  const max = G.free ? 6 : 5;
  let html = '';
  for (let i = 1; i <= max; i++) html += `<i class="${i <= W.stars ? 'on' : ''}${i <= W.stars && W.hollow ? ' hollow' : ''}">★</i>`;
  el.innerHTML = html;
  el.classList.toggle('hot', W.stars > 0 && W.seenNow);
  c.textContent = G.free ? `现金 $${W.cash.toLocaleString('en-US')} · 存款 $${(W.bank || 0).toLocaleString('en-US')}` : '$ ' + W.cash.toLocaleString('en-US');
  if (tf) {
    tf.className = W.traits.face ? 'on' : ''; tc.className = W.traits.clothes ? 'on' : ''; tv.className = W.traits.car ? 'on' : '';
  }
}

// ---------- police cruisers ----------
function roadSpawn(G, p) {
  const roads = G.map.roads; let best = null, bd = 1e9;
  for (let i = 0; i < 24; i++) {
    const [x0, z0, x1, z1] = roads[(Math.random() * roads.length) | 0], horiz = x1 - x0 > z1 - z0;
    const x = horiz ? x0 + 4 + Math.random() * (x1 - x0 - 8) : (x0 + x1) / 2, z = horiz ? (z0 + z1) / 2 : z0 + 4 + Math.random() * (z1 - z0 - 8);
    const d = Math.hypot(x - p.pos.x, z - p.pos.z), score = Math.abs(d - 75);
    if (d > 45 && score < bd && !G.vehicles.some(v => Math.hypot(v.pos.x - x, v.pos.z - z) < 8)) { bd = score; best = { x, z, yaw: horiz ? Math.PI / 2 : 0 }; }
  }
  return best;
}
function spawnCop(G, h) {
  const p = G.player, s = roadSpawn(G, p); if (!s) return;
  const [v] = spawnVehicles(h.scene, { kind: 'island', vehicleSpots: [['police', s.x, s.z, Math.atan2(-(p.pos.x - s.x), -(p.pos.z - s.z))]] });
  h.toonify?.(v.mesh);
  v.driver = COP; v.cop = { hp: 120, fireT: 1.5 }; v.siren = true; G.vehicles.push(v); G.wanted.cops.push(v);
}
function removeCop(G, h, v) { G.wanted.cops = G.wanted.cops.filter(c => c !== v); G.vehicles = G.vehicles.filter(c => c !== v); h.scene.remove(v.mesh); }
function wreckCop(G, h, v) {
  v.cop = null; v.siren = false; v.driver = null; v.dead = true; v.speed = 0; poseVehicle(v, 0);
  v.mesh.traverse(o => { if (o.isMesh) o.material = BURNT; });
  G.wanted.cops = G.wanted.cops.filter(c => c !== v);
  raise(G, h, 1, '击毁警车', v.pos); addCash(G, 150);
}
// player bullet vs police cars (called from playerShoot with the shot ray)
export function shotCops(G, h, origin, dir, w) {
  const W = G.wanted; if (!W || !W.cops.length || w.melee) return;
  _ray.set(origin, dir); const wallD = G.map.rayWorld(origin, dir, w.range || 120);
  for (const v of W.cops) {
    const b = vehicleBox(v), hit = _ray.intersectBox(b, _hit); if (!hit) continue;
    if (hit.distanceTo(origin) > wallD) continue;
    v.cop.hp -= w.dmg * 0.6; h.addSpark?.(hit.clone(), 0xffe08a);
    if (G.now > W.hitT) { W.hitT = G.now + 4; raise(G, h, 1, '袭警', v.pos); }
    if (v.cop.hp <= 0) wreckCop(G, h, v);
    return;
  }
}
// a stopped police car can be stolen: the officer is pulled out (called from main.js nearestCar / toggleCar)
export function canJack(v) { if (v.civ) return Math.abs(v.speed) < 6 && !v.dead; return v.driver === COP && Math.abs(v.speed) < 3 && !v.dead; }
export function jack(G, h, v) { if (v.civ) { G.onCivJack?.(G, h, v); return; } G.wanted.cops = G.wanted.cops.filter(c => c !== v); v.cop = null; v.siren = false; v.driver = null; resetAuto(v); raise(G, h, 1, '抢警车', v.pos); }

// ---------- shops ----------
export function nearShop(G) {
  const W = G.wanted, p = G.player; if (!W || !p?.alive || p.air) return null;
  for (const s of G.map.shops || []) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < ROB_R && (W.shopCd.get(s) || 0) < G.now) return s;
  return null;
}
export function robStart(G) {
  if (G.free && G.freeRobStart) { G.freeRobStart(G); return; }
  const s = nearShop(G); if (s) G.wanted.rob = { s, t: 0 };
}
export function robStop(G, h) {
  if (G.free && G.freeRobStop) { G.freeRobStop(G, h); return; }
  if (G.wanted?.rob) { G.wanted.rob = null; h.HUD.centerMsg('抢劫中断', 700); }
}
function robDone(G, h, s) {
  const W = G.wanted; W.rob = null; W.shopCd.set(s, G.now + 90);
  const cash = 300 + ((Math.random() * 7) | 0) * 100; addCash(G, cash);
  for (const k of ['ammo', 'med', Math.random() < 0.5 ? 'armor' : 'rifle']) spawnLootDef(G, h.scene, k, s.x + (Math.random() - 0.5) * 2, s.z + 0.6 + Math.random());
  h.sfx?.kill?.(); h.HUD.centerMsg('抢劫成功 +$' + cash, 1300);
  addStars(G, h, 2, '抢劫便利店');
}

// ---------- per frame ----------
export function updateWanted(G, dt, h) {
  const W = G.wanted; if (!W) return;
  const p = G.player;
  if (!G.free) {
    // 吃鸡迈阿密: the original hold-to-rob convenience store loop
    const rb = document.getElementById('bRob'), shop = nearShop(G);
    if (rb) { rb.classList.toggle('hidden', !(shop || W.rob) || !!h.inCar()); }
    if (W.rob) {
      if (!p.alive || h.inCar() || Math.hypot(W.rob.s.x - p.pos.x, W.rob.s.z - p.pos.z) > ROB_R + 0.6) robStop(G, h);
      else { W.rob.t += dt; const pc = Math.min(100, Math.round(W.rob.t / ROB_T * 100)); if (rb) rb.style.setProperty('--p', pc + '%'); if (W.rob.t >= ROB_T) robDone(G, h, W.rob.s); }
    } else if (rb) rb.style.setProperty('--p', '0%');
  }
  if (!p.alive) { for (const v of W.cops) v.siren = false; return; }
  // keep the right number of cruisers around
  W.spawnT -= dt;
  if (W.spawnT <= 0) { W.spawnT = 3; if (W.cops.length < COPS_FOR[W.stars]) spawnCop(G, h); }
  // police AI
  let seen = false; W.seenNow = false;
  for (const v of W.cops.slice()) {
    const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
    if (!W.stars) { // called off: drive away, vanish far out
      if (d > 70) { removeCop(G, h, v); continue; }
      v.siren = false; driveVehicle(v, dt, 0, 0, G.map, G.vehicles); poseVehicle(v, dt); continue;
    }
    _o.set(v.pos.x, 1.4, v.pos.z); _t.set(p.pos.x, p.pos.y + 1.2, p.pos.z);
    v.cop.losT = (v.cop.losT || 0) - dt; if (v.cop.losT <= 0) { v.cop.losT = 0.25; v.cop.los = d < 90 && G.map.hasLOS(_o, _t); }
    if (v.cop.los && d < 70) { seen = true; W.lastSeen.set(p.pos.x, p.pos.z); W.hasSeen = true; }
    const target = h.inCar() ? h.inCar().pos : p.pos;
    // 看不到你时: drive to the last place the suspect was seen, then search around it
    let dest = target;
    if (!v.cop.los) {
      dest = W.hasSeen ? { x: W.lastSeen.x, z: W.lastSeen.y } : { x: p.pos.x, z: p.pos.z };
      const dd = Math.hypot(dest.x - v.pos.x, dest.z - v.pos.z);
      if (dd < 9) { if (!W.searchPt || G.now > (W.searchT || 0)) { W.searchT = G.now + 7; const a = Math.random() * 6.28, r = 10 + Math.random() * 18; W.searchPt = { x: dest.x + Math.cos(a) * r, z: dest.z + Math.sin(a) * r }; } dest = W.searchPt; }
    }
    let thr = 0, st = 0;
    if (d > 16 || !v.cop.los) { const r = autoDrive(v, dt, G.map, G.vehicles, dest, { cruise: (v.cop.los ? 15 : 11) + W.stars * 2, arrive: 8 }); thr = r.thr; st = r.st; }
    else thr = v.speed > 0.5 ? -1 : 0;
    const hit = driveVehicle(v, dt, thr, st, G.map, G.vehicles);
    if (hit > 8 && h.inCar() && Math.hypot(h.inCar().pos.x - v.pos.x, h.inCar().pos.z - v.pos.z) < 7) h.damage(p, hit * 0.8, COP, { name: '警车撞击' }, false, true);
    poseVehicle(v, dt);
    // shoot from the car when close and in sight
    v.cop.fireT -= dt;
    if (v.cop.los && d < 32 && Math.abs(v.speed) < 4 && v.cop.fireT <= 0) {
      v.cop.fireT = 0.75 - W.stars * 0.07;
      _d.subVectors(_t, _o).normalize(); h.tracer?.(_o.clone(), _t.clone().addScaledVector(_d, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5), (Math.random() - 0.5) * 1.5)));
      h.sfx?.shotFar?.(Math.max(0.05, 1 - d / 40) * 0.5);
      if (Math.random() < 0.3 + W.stars * 0.05) { COP.pos.copy(v.pos); h.damage(p, 6 + W.stars, COP, W_COP, false); }
    }
  }
  // stars drop: 自由模式 with no matching identity feature drops every 5 s, otherwise the usual 20 s
  if (seen) { W.decayT = 0; W.seenNow = true; }
  else if (W.stars) {
    W.decayT += dt;
    const matching = !G.free || (W.traits.face && !G.freeMask) || W.traits.clothes || (W.traits.car && h.inCar() === W.carRef);
    const wait = G.free && !matching ? DECAY_FREE : DECAY;
    if (W.decayT > wait) {
      W.decayT = 0; W.stars--;
      if (!W.stars) { W.traits.face = W.traits.clothes = W.traits.car = false; W.carRef = null; W.hollow = false; }
      h.HUD.centerMsg(W.stars ? '通缉降为 ' + '★'.repeat(W.stars) : '摆脱通缉', 1200);
    }
  }
  W.hudT = (W.hudT || 0) - dt; if (W.hudT <= 0) { W.hudT = 0.25; renderHud(G); }
}
export const COP_ENTITY = COP;
export { VTYPES };
