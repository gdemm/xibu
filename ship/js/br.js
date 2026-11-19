// 绝地求生 (battle royale) mode: free-for-all, no respawn, loot crates, shrinking safe zone, last one standing wins.
import * as THREE from 'three';


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
  { k: 'ammo', name: '弹药', c: 0xd9a63a, w: 4 },
  { k: 'med', name: '医疗包', c: 0xe8e8e8, w: 3 },
];
const rnd = (a, b) => a + Math.random() * (b - a);
const ZONE = { name: '安全区', team: 'zone', skin: 'red', kills: 0, isPlayer: false, pos: new THREE.Vector3() };
const ZW = { name: '毒圈' };

export function setupBR(G, scene, h) {
  // h: { makeEntity, makeBot, setWeapon, HUD, WEAPONS }
  const n = G.opts.brSize || 16;
  cleanup(G, scene);
  const p = h.makeEntity('你', 'p0', true); p.skin = 'blue'; G.player = p;
  const bots = [];
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < n - 1; i++) { const b = h.makeBot(names[i % names.length], 'b' + i, 'red'); b.skin = 'red'; b.armed = false; bots.push(b); }
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
  // player kit: knife + pistol only
  G.owned = new Set(['pistol', 'knife']);
  for (const k of Object.keys(h.WEAPONS)) G.ammo[k] = { mag: 0, reserve: 0 };
  G.ammo.pistol = { mag: 12, reserve: 24 };
  h.setWeapon('pistol', true);
  // loot
  const lootGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5);
  G.loot = [];
  const total = LOOT.reduce((s, l) => s + l.w, 0);
  const lootN = Math.round(n * (G.map.kind === 'island' ? 4 : 2.2));
  const lootSpots = [...insideSpots.slice().sort(() => Math.random() - 0.5).slice(0, Math.round(lootN * 0.45)), ...deck.slice().sort(() => Math.random() - 0.5)].slice(0, Math.min(deck.length, lootN));
  for (const s of lootSpots) {
    let r = Math.random() * total, def = LOOT[0]; for (const l of LOOT) { if ((r -= l.w) < 0) { def = l; break; } }
    const m = new THREE.Mesh(lootGeo, new THREE.MeshLambertMaterial({ color: def.c, emissive: def.c, emissiveIntensity: 0.35 }));
    m.position.set(s.x + rnd(-0.6, 0.6), 0.3, s.z + rnd(-0.6, 0.6)); scene.add(m);
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
  if (!bot.armed) {
    let best = null, bd = G.map.kind === 'island' ? 45 : 30;
    for (const l of G.loot) { if (l.taken || l.def.k === 'med' || l.def.k === 'ammo') continue; const d = l.m.position.distanceTo(bot.pos); if (d < bd) { bd = d; best = l; } }
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
    for (const e of G.entities) if (e.alive && brOutside(G, e)) h.damage(e, B.dps * 0.5, ZONE, ZW, false, true);
  }
  const outside = G.player.alive && brOutside(G, G.player);
  h.$('dmg').classList.toggle('zone', outside);
  // loot pickup
  for (const l of G.loot) {
    if (l.taken) continue;
    l.m.rotation.y += dt * 1.2;
    for (const e of G.entities) {
      if (!e.alive) continue;
      const dx = e.pos.x - l.m.position.x, dz = e.pos.z - l.m.position.z;
      if (dx * dx + dz * dz > 1.4 || Math.abs(e.pos.y - 0) > 1.5) continue;
      if (!e.isPlayer && (l.def.k === 'ammo' || (l.def.k === 'med' && e.hp > 70))) continue;
      take(G, e, l, h); break;
    }
  }
}

function take(G, e, l, h) {
  const k = l.def.k; l.taken = true; l.m.visible = false;
  if (!e.isPlayer) {
    if (k === 'med') e.hp = Math.min(100, e.hp + 50);
    else { e.armed = true; e.gun = k; }
    return;
  }
  const W = h.WEAPONS;
  if (k === 'med') { if (e.hp >= 100) { l.taken = false; l.m.visible = true; return; } e.hp = Math.min(100, e.hp + 50); }
  else if (k === 'ammo') { for (const id of G.owned) if (!W[id].melee) G.ammo[id].reserve += W[id].mag * 2; }
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
  return { place, win: place === 1, title: place === 1 ? '大吉大利 今晚吃鸡' : `第 ${place} 名` };
}

export function brBoardHTML(G, title) {
  const rows = G.entities.slice().sort((a, b) => (a.alive ? 0 : a.place || 99) - (b.alive ? 0 : b.place || 99) || b.kills - a.kills)
    .map(e => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.alive ? '存活' : '#' + e.place}</td><td>${e.name}</td><td>${e.kills}</td></tr>`).join('');
  return `${title ? `<h2>${title}</h2>` : ''}<div class="sbWrap"><div class="sbTeam red" style="max-height:60vh;overflow:auto"><h3>绝地求生 <b>存活 ${G.br.alive}</b></h3><table><tr><th>名次</th><th>玩家</th><th>击杀</th></tr>${rows}</table></div></div>`;
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
  if (B.next && B.stage !== 'final') { ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(mx(B.next.c.x), mz(B.next.c.y), B.next.r * sx, B.next.r * sz, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
}

export function cleanup(G, scene) {
  for (const l of G.loot || []) { scene.remove(l.m); l.m.material.dispose(); }
  G.loot = [];
  if (G.br?.mesh) scene.remove(G.br.mesh);
  G.br = null;
}
