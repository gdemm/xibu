// 绝地求生 (battle royale) mode: free-for-all, no respawn, loot crates, shrinking safe zone, last one standing wins.
import * as THREE from 'three';
import { bowGeo } from './bow.js';
import { setupDrop, setupAirdrops, updateAirdrops, airdropGoal, airdropMinimap, dropMinimap, cleanupDrop } from './drop.js';


const NAMES = ['老K', '铁牙', '阿狼', '火锅', '刀疤', '石头', '阿飞', '老周', '小林', '阿杰', '大鱼', '海狗', '黑桃', '钢盔', '螺丝', '锚哥', '浪子', '船长', '水手', '灯塔'];
// zone phases: wait (s) then shrink (s) to radius r; dps outside
const PHASES_ISLAND = [
  { wait: 60, shrink: 40, r: 120, dps: 2 },
  { wait: 45, shrink: 30, r: 70, dps: 4 },
  { wait: 40, shrink: 25, r: 38, dps: 7 },
  { wait: 30, shrink: 20, r: 18, dps: 10 },
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
];
// damage reduction by armor / helmet level (body / head)
export const GEAR_RED = [0, 0.3, 0.4, 0.55];
const LOOT_GEO = {};
function lootGeo(k) {
  if (LOOT_GEO[k]) return LOOT_GEO[k];
  let g;
  if (k === 'helmet') { g = new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); }
  else if (k === 'armor') g = new THREE.BoxGeometry(0.6, 0.62, 0.24);
  else if (k === 'rifle' || k === 'sniper') g = new THREE.BoxGeometry(1.0, 0.22, 0.3);
  else if (k === 'bow') g = bowGeo();
  else if (k === 'scope') { g = new THREE.CylinderGeometry(0.09, 0.11, 0.5, 10); g.rotateZ(Math.PI / 2); }
  else if (k === 'ammo') g = new THREE.BoxGeometry(0.45, 0.3, 0.35);
  else g = new THREE.BoxGeometry(0.55, 0.4, 0.4);
  return (LOOT_GEO[k] = g);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const ZONE = { name: '安全区', team: 'zone', skin: 'red', kills: 0, isPlayer: false, pos: new THREE.Vector3() };
const ZW = { name: '毒圈' };

export function setupBR(G, scene, h) {
  // h: { makeEntity, makeBot, setWeapon, HUD, WEAPONS }
  const n = G.opts.brSize || 16;
  cleanup(G, scene);
  const p = h.makeEntity('你', 'p0', true); p.skin = 'blue'; p.armor = 0; p.helmet = 0; G.player = p;
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
    const m = new THREE.Mesh(lootGeo(def.k), new THREE.MeshLambertMaterial({ color: def.c, emissive: def.c, emissiveIntensity: 0.45 }));
    m.position.set(s.x + rnd(-0.6, 0.6), def.k === 'helmet' ? 0.15 : def.k === 'bow' ? 0.62 : 0.35, s.z + rnd(-0.6, 0.6)); scene.add(m);
    if (def.k === 'med') { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.42), new THREE.MeshBasicMaterial({ color: 0xff3b4d })); cr.position.y = 0.2; m.add(cr); const cr2 = cr.clone(); cr2.rotation.y = Math.PI / 2; m.add(cr2); }
    G.loot.push({ def, m, taken: false });
  }
  // zone
  const zg = new THREE.CylinderGeometry(1, 1, 24, 64, 1, true);
  const zm = new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const zone = new THREE.Mesh(zg, zm); zone.position.y = 10; zone.frustumCulled = false; scene.add(zone);
  const R0 = G.map.kind === 'island' ? 205 : 70;
  zone.scale.set(R0, G.map.kind === 'island' ? 3 : 1, R0);
  G.br = { phase: -1, stage: 'wait', t: PHASES[0].wait, c: new THREE.Vector2(0, 0), r: R0, from: { c: new THREE.Vector2(0, 0), r: R0 }, next: null, mesh: zone, dps: 1, alive: n, tickT: 0 };
  nextPhase(G);
  G.timeLeft = 1e9;
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
    for (const l of G.loot) { if (l.taken || l.def.k === 'med' || l.def.k === 'ammo' || l.def.k === 'scope' || ((l.def.k === 'armor' || l.def.k === 'helmet') && (bot[l.def.k] || 0) >= l.def.lv)) continue; const d = l.m.position.distanceTo(bot.pos); if (d < bd) { bd = d; best = l; } }
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
  for (const l of G.loot) {
    if (l.taken) continue;
    l.m.rotation.y += dt * 1.2;
    for (const e of G.entities) {
      if (!e.alive || e.air) continue;
      if ((l.def.k === 'armor' || l.def.k === 'helmet') && (e[l.def.k] || 0) >= l.def.lv) continue;
      if (l.def.k === 'scope' && (!e.isPlayer || (G.scope | 0) >= l.def.lv)) continue;   // scopes: player only, upgrades only
      const dx = e.pos.x - l.m.position.x, dz = e.pos.z - l.m.position.z;
      if (dx * dx + dz * dz > 1.4 || Math.abs(e.pos.y - 0) > 1.5) continue;
      if (!e.isPlayer && (l.def.k === 'ammo' || (l.def.k === 'med' && e.hp > 70))) continue;
      take(G, e, l, h); break;
    }
  }
}

function take(G, e, l, h) {
  const k = l.def.k; l.taken = true; l.m.visible = false;
  if (k === 'scope') { G.scope = l.def.lv; h.sfx.reload?.(); h.HUD.centerMsg('装备 ' + l.def.name + ' · 步枪/弓箭/狙击开镜生效', 1300); return; }
  if (k === 'armor' || k === 'helmet') { e[k] = l.def.lv; if (e.isPlayer) { h.sfx.reload?.(); h.HUD.centerMsg('装备 ' + l.def.name, 900); } return; }
  if (!e.isPlayer) {
    if (k === 'med') e.hp = Math.min(100, e.hp + 50);
    else { e.armed = true; e.gun = k; }
    return;
  }
  const W = h.WEAPONS;
  if (k === 'med') { if (e.hp >= 100) { l.taken = false; l.m.visible = true; return; } e.hp = Math.min(100, e.hp + 50); }
  else if (k === 'ammo') { for (const id of G.owned) if (!W[id].melee) G.ammo[id].reserve += W[id].pick || W[id].mag * 2; }
  else {
    const first = !G.owned.has(k); G.owned.add(k);
    G.ammo[k].reserve += first ? W[k].reserve / 2 : W[k].mag * 2;
    if (first) { G.ammo[k].mag = W[k].mag; h.setWeapon(k); }
  }
  h.sfx.reload?.(); h.HUD.centerMsg('拾取 ' + l.def.name + (k === 'med' ? ' +50' : ''), 900);
}

export function brKilled(G, t, h) {
  const B = G.br;
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
  for (const l of G.loot || []) { scene.remove(l.m); l.m.material.dispose(); }
  G.loot = [];
  if (G.br?.mesh) scene.remove(G.br.mesh);
  G.br = null;
}
