// match simulation: brawlers, combat, loot, zone, plane drop, airdrops, bots
import * as THREE from 'three';
import { CHARS, ORDER, PET, makeBrawler, animBrawler, kickBrawler } from './chars.js';
import { buildWorld, T, SOLID, BLOCKSHOT, CELL, HALF, N, cx, cz, wx } from './world.js';
import { vcMat, outlined, rnd, clamp } from './util.js';

const NAMES = ['小番茄', '暴走土豆', '奶茶侠', '电光虾', '麻辣烫', '芝士喵', '跳跳糖', '可乐君', '布丁', '雷公蛋', '豆包', '烤肠王', '彩虹糖', '咕噜噜', '小钢炮', '泡泡龙', '大白菜', '橘子汽水', '饭团', '铁锅炖'];
const PHASES = [
  { wait: 32, shrink: 24, r: 62, dps: 400 }, { wait: 28, shrink: 22, r: 38, dps: 600 }, { wait: 24, shrink: 18, r: 22, dps: 900 },
  { wait: 20, shrink: 15, r: 11, dps: 1200 }, { wait: 15, shrink: 14, r: 4, dps: 1600 }, { wait: 10, shrink: 12, r: 0.3, dps: 2200 },
];
const ARMOR_RED = [0, 0.12, 0.2, 0.28], HELM_RED = [0, 0.06, 0.1, 0.15];
const PLANE_ALT = 44, PLANE_SPEED = 13, FALL_V = 13, CHUTE_V = 4.5, FALL_H = 10, CHUTE_H = 7, CHUTE_AT = 16;
const BOT_DIFF = [{ err: 0.32, react: 0.55, cd: 0.9 }, { err: 0.18, react: 0.35, cd: 0.55 }, { err: 0.08, react: 0.2, cd: 0.3 }];
const v2 = (x, z) => ({ x, z });

export function createGame(scene, FX, H) {
  // H: { killFeed(k,v,me), msg(text,ms), onEnd(), dmgNum(x,y,z,amt,col) }
  const G = { scene, FX, ents: [], projs: [], lobs: [], items: [], storms: [], drops: [], now: 0, state: 'plane', diff: 1, aliveCount: 0 };

  function setup(opts) {
    G.world = buildWorld(scene); G.opts = opts; G.diff = opts.diff ?? 1; G.now = 0; G.over = false; G.placeSeq = opts.n;
    const kinds = []; for (let i = 0; i < opts.n - 1; i++) kinds.push(ORDER[(Math.random() * ORDER.length) | 0]);
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    G.player = makeEnt(opts.kind, '你', true);
    for (let i = 0; i < opts.n - 1; i++) makeEnt(kinds[i], names[i % names.length], false);
    // plane route
    const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x), off = rnd(-25, 25);
    G.plane = { a: dir.clone().multiplyScalar(-HALF - 30).addScaledVector(side, off).setY(PLANE_ALT), b: dir.clone().multiplyScalar(HALF + 30).addScaledVector(side, off).setY(PLANE_ALT), dir, k: 0, pos: new THREE.Vector3() };
    G.plane.len = G.plane.a.distanceTo(G.plane.b);
    const kIn = (HALF + 30 - (HALF - 12)) / G.plane.len; G.plane.k0 = kIn; G.plane.k1 = 1 - kIn;
    FX.plane.visible = true; FX.plane.rotation.y = Math.atan2(dir.x, dir.z);
    for (const e of G.ents) { e.air = 'plane'; e.mesh.visible = false; if (!e.isPlayer) e.jumpK = rnd(G.plane.k0 + 0.03, G.plane.k1 - 0.05); }
    // zone
    if (opts.fastZone) for (const ph of PHASES) { ph.wait /= 4; ph.shrink /= 4; }
    G.zone = { phase: -1, stage: 'wait', t: 0, c: new THREE.Vector2(rnd(-10, 10), rnd(-10, 10)), r: 112, from: null, next: null, dps: 300 };
    nextPhase(); G.zone.t += G.plane.len / PLANE_SPEED;
    G.dropTimes = [G.plane.len / PLANE_SPEED + 45, G.plane.len / PLANE_SPEED + 105, G.plane.len / PLANE_SPEED + 165, G.plane.len / PLANE_SPEED + 215];
    G.state = 'plane';
  }

  function makeEnt(kind, name, isPlayer, owner) {
    const d = kind === PET.kind ? { hp: CHARS.granny.sup.hp, speed: 6.4, range: 3 } : CHARS[kind];
    const mesh = makeBrawler(kind, true); scene.add(mesh);
    if (isPlayer) { // own translucent-capable material so hiding in bushes can fade only us
      const mat = vcMat().clone(); mat.transparent = true; mesh.traverse(o => { if (o.isMesh && o.material === vcMat()) o.material = mat; }); mesh.userData.mat = mat;
    }
    const e = {
      id: G.ents.length, kind, def: d, name, isPlayer, pos: new THREE.Vector3(), yaw: 0, hp: d.hp, baseHp: d.hp, maxHp: d.hp, cubes: 0, armor: 0, helmet: 0,
      ammo: 3, superC: 0, lastDmgT: -9, lastAtkT: -9, alive: true, air: null, mesh, r: kind === PET.kind ? 0.85 : 0.6, team: owner ? owner.team : G.ents.length,
      kills: 0, place: 0, vel: new THREE.Vector3(), slowT: 0, revealT: 0, inBush: false, queue: [], action: null, moving: 0, owner: owner || null,
      bot: isPlayer ? null : { think: 0, goal: null, mode: 'loot', strafe: 1, strafeT: 0, nextShot: 0, stuckT: 0, lastPos: new THREE.Vector3(), wander: null, tgt: null, seen: 0 },
      chute: null, dmgMul: 1,
    };
    if (kind === PET.kind) { e.pet = true; e.life = 22; e.maxHp = e.hp = CHARS.granny.sup.hp; }
    G.ents.push(e); return e;
  }

  // ---------------- zone ----------------
  function nextPhase() {
    const Z = G.zone; Z.phase++; const ph = PHASES[Z.phase];
    if (!ph) { Z.stage = 'final'; Z.next = null; return; }
    const ang = Math.random() * Math.PI * 2, off = Math.max(0, (Z.r - ph.r)) * Math.sqrt(Math.random()) * 0.6;
    const c = new THREE.Vector2(Z.c.x + Math.cos(ang) * off, Z.c.y + Math.sin(ang) * off); const lim = HALF - 10 - ph.r * 0.5; c.x = clamp(c.x, -lim, lim); c.y = clamp(c.y, -lim, lim);
    Z.next = { c, r: ph.r }; Z.stage = 'wait'; Z.t = ph.wait; Z.from = { c: Z.c.clone(), r: Z.r };
  }
  function updateZone(dt) {
    const Z = G.zone; if (Z.stage === 'final') return; Z.t -= dt;
    if (Z.stage === 'wait' && Z.t <= 0) { Z.stage = 'shrink'; Z.t = PHASES[Z.phase].shrink; Z.dur = Z.t; Z.dps = PHASES[Z.phase].dps; H.msg('毒雾开始扩散！', 1500); }
    else if (Z.stage === 'shrink') { const k = 1 - Math.max(0, Z.t) / Z.dur; Z.c.lerpVectors(Z.from.c, Z.next.c, k); Z.r = Z.from.r + (Z.next.r - Z.from.r) * k; if (Z.t <= 0) nextPhase(); }
  }
  const outside = (e, m = 0) => Math.hypot(e.pos.x - G.zone.c.x, e.pos.z - G.zone.c.y) > G.zone.r - m;

  // ---------------- damage ----------------
  function damage(t, amt, src, kx = 0, kz = 0) {
    let byZone = false; if (src === 'zone') { byZone = true; src = null; }
    if (!t.alive || t.air || t.protect > G.now || (t.isPlayer && G.opts.god)) return 0;
    const red = Math.min(0.5, ARMOR_RED[t.armor] + HELM_RED[t.helmet]); const d = Math.round(amt * (1 - red));
    t.hp -= d; t.lastDmgT = G.now; t.revealT = G.now + 1.2;
    if (kx || kz) { t.vel.x += kx; t.vel.z += kz; }
    if (src && !src.pet && src.def.superCost && src !== t) src.superC = Math.min(1, src.superC + amt / src.def.superCost);
    else if (src && src.pet && src.owner && src.owner.alive) src.owner.superC = Math.min(1, src.owner.superC + amt / src.owner.def.superCost * 0.5);
    H.dmgNum(t.pos.x + 0.9, 3.3, t.pos.z, d, t.isPlayer ? '#ff5a5a' : (src && (src.isPlayer || src.owner?.isPlayer) ? '#ffffff' : '#ffd0d0'), t.id);
    FX.burst(t.pos.x, 1.2, t.pos.z, 0xffffff, 4, 4, 0.12, 0.3);
    if (t.hp <= 0) kill(t, src, byZone);
    return d;
  }
  function kill(t, src, byZone) {
    t.alive = false; t.hp = 0; t.mesh.visible = false;
    FX.burst(t.pos.x, 1, t.pos.z, 0xffd23f, 22, 8, 0.25, 0.8);
    if (t.pet) return;
    const real = src && src.owner ? src.owner : src;
    if (real && real !== t && !real.pet) real.kills++;
    t.place = alive().length + 1;
    // drop cubes (at least one) + a med kit
    const n = Math.max(1, t.cubes); for (let i = 0; i < n; i++) spawnItem('cube', 0, t.pos.x + rnd(-1, 1), t.pos.z + rnd(-1, 1));
    if (Math.random() < 0.5) spawnItem('med', 0, t.pos.x + rnd(-1, 1), t.pos.z + rnd(-1, 1));
    for (const p of G.ents) if (p.pet && p.owner === t && p.alive) kill(p, null);
    H.killFeed(real && real !== t ? real.name : (byZone ? '毒雾' : '意外'), t.name, t.isPlayer || real?.isPlayer);
    checkEnd();
  }
  const alive = () => G.ents.filter(e => e.alive && !e.pet);
  function checkEnd() {
    const a = alive(); G.aliveCount = a.length;
    if (G.over) return;
    if (!G.player.alive) { G.over = true; G.result = { place: G.player.place, kills: G.player.kills }; setTimeout(() => H.onEnd(G.result), 1600); return; }
    if (a.length === 1) { G.over = true; G.player.place = 1; G.result = { place: 1, kills: G.player.kills }; H.msg('大吉大利，今晚吃鸡！', 3000); setTimeout(() => H.onEnd(G.result), 2200); }
  }
  // damage a world cell (crates, power boxes, walls if allowed); returns true if it blocks
  function hitCell(x, z, amt, breakWalls) {
    const W = G.world, i = cx(x), j = cz(z); if (!W.inb(i, j)) return true; const q = W.idx(i, j), t = W.type[q];
    if (!BLOCKSHOT(t)) return false;
    if (t === T.WALL && !breakWalls) return true;
    W.hp[q] -= breakWalls ? 1e9 : amt;
    if (W.hp[q] <= 0) {
      const col = t === T.WALL ? 0xe76f51 : t === T.CRATE ? 0xd99a4e : 0x7b3fb0; FX.burst(wx(i), 0.8, wx(j), col, 12, 6, 0.22, 0.6);
      W.remove(i, j);
      if (t === T.BOX) spawnItem('cube', 0, wx(i), wx(j));
      if (t === T.CRATE && Math.random() < 0.55) { const r = Math.random(); if (r < 0.3) spawnItem('med', 0, wx(i), wx(j)); else spawnItem(r < 0.65 ? 'armor' : 'helmet', Math.random() < 0.7 ? 1 : 2, wx(i), wx(j)); }
    } else FX.burst(x, 0.8, z, 0xfff3e0, 3, 3, 0.1, 0.25);
    return true;
  }
  // ---------------- items ----------------
  function spawnItem(kind, lv, x, z) {
    const m = outlined(FX.itemGeo[kind], kind === 'cube' || kind === 'med' ? vcMat() : new THREE.MeshToonMaterial({ color: FX.lvCol[lv], emissive: FX.lvCol[lv], emissiveIntensity: 0.25 }), 0.05);
    [x, z] = G.world.freeNear(x, z); m.position.set(x, 0.7, z); scene.add(m);
    G.items.push({ kind, lv, pos: m.position, mesh: m, t: Math.random() * 6, born: G.now });
  }
  function pickup(e) {
    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i]; if (G.now - it.born < 0.4) continue; const d = Math.hypot(it.pos.x - e.pos.x, it.pos.z - e.pos.z); if (d > 1.1) continue;
      let ok = false;
      if (it.kind === 'cube') { e.cubes++; e.maxHp = e.baseHp + 400 * e.cubes; e.hp += 400; e.dmgMul = 1 + 0.1 * e.cubes; ok = true; }
      else if (it.kind === 'armor' && it.lv > e.armor) { e.armor = it.lv; ok = true; }
      else if (it.kind === 'helmet' && it.lv > e.helmet) { e.helmet = it.lv; ok = true; }
      else if (it.kind === 'med' && e.hp < e.maxHp * 0.9) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.4); ok = true; FX.burst(e.pos.x, 1, e.pos.z, 0x5dff7a, 10, 3, 0.16, 0.6); }
      if (ok) { if (e.isPlayer) H.msg({ cube: '能量晶 +1 ⚡', armor: it.lv + '级护甲', helmet: it.lv + '级头盔', med: '医疗包 +40%' }[it.kind], 900); FX.burst(it.pos.x, 0.8, it.pos.z, 0xffd23f, 8, 4, 0.14, 0.4); scene.remove(it.mesh); G.items.splice(i, 1); }
    }
  }
  function spawnLoot() {
    const W = G.world; let n = 0;
    for (let t = 0; t < 4000 && n < 70; t++) { const i = 3 + ((Math.random() * (N - 6)) | 0), j = 3 + ((Math.random() * (N - 6)) | 0); if (W.type[W.idx(i, j)] !== T.G) continue; const r = Math.random(); if (r < 0.25) spawnItem('med', 0, wx(i), wx(j)); else if (r < 0.62) spawnItem('armor', r < 0.5 ? 1 : 2, wx(i), wx(j)); else spawnItem('helmet', r < 0.85 ? 1 : 2, wx(i), wx(j)); n++; }
  }

  // ---------------- attacks ----------------
  function shoot(e, ox, oz, dx, dz, a, range, isSup) {
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    G.projs.push({ x: ox + dx * 0.6, z: oz + dz * 0.6, dx, dz, sp: a.speed, left: range, dmg: a.dmg * e.dmgMul, r: a.r, col: a.col, owner: e, pierce: !!a.pierce, breakWalls: !!a.breakWalls, knock: a.knock || 0, hit: a.pierce ? new Set() : null, wave: a.kind === 'wave', y: 1.0 });
  }
  function canAct(e) { return e.alive && !e.air && !e.action; }
  function attack(e, dx, dz, dist) {
    if (!canAct(e) || e.ammo < 1 || e.queue.length) return false;
    const def = e.def, a = def.atk; e.ammo -= 1; e.lastAtkT = G.now; e.revealT = G.now + 1.0;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; e.yaw = Math.atan2(dx, dz); kickBrawler(e.mesh);
    if (a.kind === 'spread') { for (let i = 0; i < a.n; i++) { const ang = (i / (a.n - 1) - 0.5) * a.spread; const c = Math.cos(ang), s = Math.sin(ang); shoot(e, e.pos.x, e.pos.z, dx * c + dz * s, -dx * s + dz * c, a, def.range * (0.85 + Math.random() * 0.15)); } }
    else if (a.kind === 'burst') { for (let i = 0; i < a.n; i++) e.queue.push({ t: G.now + i * a.gap, dx, dz, a, range: def.range }); }
    else if (a.kind === 'punch') { for (let i = 0; i < a.n; i++) e.queue.push({ t: G.now + i * a.gap, dx, dz, a, punch: true, alt: i % 2 === 1 }); }
    else if (a.kind === 'wave') shoot(e, e.pos.x, e.pos.z, dx, dz, a, def.range);
    else if (a.kind === 'lob') { const d = clamp(dist ?? def.range, 2, def.range); G.lobs.push({ x0: e.pos.x, z0: e.pos.z, x1: e.pos.x + dx * d, z1: e.pos.z + dz * d, t: 0, T: a.flight, a, owner: e, col: a.col }); }
    return true;
  }
  function superAtk(e, dx, dz, dist) {
    if (!canAct(e) || e.superC < 1) return false;
    const s = e.def.sup; e.superC = 0; e.lastAtkT = G.now; e.revealT = G.now + 1.0;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; e.yaw = Math.atan2(dx, dz); kickBrawler(e.mesh);
    if (s.kind === 'blast') { for (let i = 0; i < s.n; i++) { const ang = (i / (s.n - 1) - 0.5) * s.spread; const c = Math.cos(ang), sn = Math.sin(ang); shoot(e, e.pos.x, e.pos.z, dx * c + dz * sn, -dx * sn + dz * c, s, s.range); } FX.burst(e.pos.x + dx, 1, e.pos.z + dz, 0xff7b2e, 14, 6, 0.2, 0.4); }
    else if (s.kind === 'burst') { for (let i = 0; i < s.n; i++) e.queue.push({ t: G.now + i * s.gap, dx, dz, a: s, range: s.range }); }
    else if (s.kind === 'charge') { e.action = { type: 'charge', dx, dz, left: s.dist, hit: new Set() }; }
    else if (s.kind === 'leap') { const d = clamp(dist ?? s.dist, 2, s.dist); let tx = e.pos.x + dx * d, tz = e.pos.z + dz * d; [tx, tz] = G.world.freeNear(tx, tz); e.action = { type: 'leap', x0: e.pos.x, z0: e.pos.z, x1: tx, z1: tz, t: 0, T: 0.65 }; }
    else if (s.kind === 'pet') { for (const p of G.ents) if (p.pet && p.owner === e && p.alive) kill(p, null); const p = makeEnt(PET.kind, e.name + '的' + PET.name, false, e); let [x, z] = G.world.freeNear(e.pos.x + dx * 2, e.pos.z + dz * 2); p.pos.set(x, 0, z); p.mesh.visible = true; p.yaw = e.yaw; p.dmgMul = e.dmgMul; FX.burst(x, 1, z, 0xff8a2a, 18, 6, 0.25, 0.6); }
    else if (s.kind === 'storm') { const d = clamp(dist ?? e.def.range, 2, e.def.range); G.lobs.push({ x0: e.pos.x, z0: e.pos.z, x1: e.pos.x + dx * d, z1: e.pos.z + dz * d, t: 0, T: s.flight, a: s, owner: e, col: s.col, storm: true }); }
    return true;
  }
  function doPunch(e, q) {
    const a = q.a, def = e.def; kickBrawler(e.mesh, q.alt);
    const range = e.pet ? 2.6 : def.range;
    for (const t of G.ents) {
      if (!t.alive || t.team === e.team || t.air) continue; const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d > range + t.r) continue; const ang = Math.acos(clamp((dx * q.dx + dz * q.dz) / (d || 1), -1, 1)); if (ang > (a.arc || 1.2) && d > 1) continue;
      damage(t, a.dmg * e.dmgMul, e, q.dx * 2, q.dz * 2);
    }
    for (let s = 0.8; s <= range; s += 0.7) if (hitCell(e.pos.x + q.dx * s, e.pos.z + q.dz * s, a.dmg * e.dmgMul, false)) break;
    FX.burst(e.pos.x + q.dx * 1.8, 1.1, e.pos.z + q.dz * 1.8, a.col || 0xffffff, 5, 4, 0.15, 0.25);
  }
  function explode(x, z, radius, dmg, owner, col, knock = 0) {
    FX.burst(x, 0.6, z, col, 16, 7, 0.22, 0.5);
    for (const t of G.ents) { if (!t.alive || t.team === owner.team || t.air) continue; const d = Math.hypot(t.pos.x - x, t.pos.z - z); if (d < radius + t.r) { const k = knock / Math.max(0.5, d); damage(t, dmg, owner, (t.pos.x - x) * k, (t.pos.z - z) * k); } }
    for (let dz = -radius; dz <= radius; dz += CELL) for (let dx = -radius; dx <= radius; dx += CELL) if (dx * dx + dz * dz <= radius * radius) hitCell(x + dx, z + dz, dmg * 0.6, false);
  }

  // ---------------- per-frame ----------------
  function update(dt, input) {
    G.now += dt;
    if (G.state === 'plane' || G.state === 'play') { updatePlane(dt, input); updateZone(dt); }
    for (const e of G.ents) if (e.alive) updateEnt(e, dt, input);
    updateProjs(dt); updateLobs(dt); updateStorms(dt); updateDrops(dt);
    // item bobbing
    for (const it of G.items) { it.t += dt; it.mesh.position.y = 0.7 + Math.sin(it.t * 3) * 0.15; it.mesh.rotation.y += dt * 1.6; }
    FX.updateParts(dt);
  }
  function updatePlane(dt, input) {
    const P = G.plane; if (P.k > 1.2) { FX.plane.visible = false; return; }
    P.k += dt * PLANE_SPEED / P.len; P.pos.lerpVectors(P.a, P.b, P.k); FX.plane.position.copy(P.pos);
    for (const p of FX.props) p.rotation.z += dt * 30;
    for (const e of G.ents) if (e.air === 'plane') {
      e.pos.copy(P.pos);
      if ((!e.isPlayer && P.k >= e.jumpK) || P.k >= P.k1) { jump(e); if (e.isPlayer && !input.jumped) H.msg('航线结束，自动跳伞！', 1500); }
    }
    if (G.state === 'plane' && !G.ents.some(e => e.air)) { G.state = 'play'; spawnLoot(); }
  }
  function jump(e) { e.air = 'fall'; e.pos.copy(G.plane.pos); e.pos.y -= 2; e.vel.set(0, 0, 0); e.mesh.visible = true; if (!e.chute) e.chute = FX.makeChute(); if (!e.isPlayer) { const sp = landSpot(e); e.landX = sp[0]; e.landZ = sp[1]; } }
  G.playerJump = () => { const p = G.player; if (p.air === 'plane' && G.plane.k > G.plane.k0) { jump(p); return true; } if (p.air === 'fall') { p.air = 'chute'; return true; } return false; };
  function landSpot(e) { for (let t = 0; t < 30; t++) { const a = Math.random() * Math.PI * 2, d = rnd(12, 60); const x = clamp(e.pos.x + Math.cos(a) * d, -HALF + 8, HALF - 8), z = clamp(e.pos.z + Math.sin(a) * d, -HALF + 8, HALF - 8); if (!SOLID(G.world.at(x, z))) return [x, z]; } return G.world.freeNear(e.pos.x, e.pos.z); }

  function airStep(e, dt, mx, mz) {
    const fall = e.air === 'fall', hs = fall ? FALL_H : CHUTE_H, vs = fall ? FALL_V : CHUTE_V;
    e.vel.x += (mx * hs - e.vel.x) * Math.min(1, dt * 3); e.vel.z += (mz * hs - e.vel.z) * Math.min(1, dt * 3);
    e.pos.x = clamp(e.pos.x + e.vel.x * dt, -HALF + 4, HALF - 4); e.pos.z = clamp(e.pos.z + e.vel.z * dt, -HALF + 4, HALF - 4); e.pos.y -= vs * dt;
    if (fall && e.pos.y < CHUTE_AT) e.air = 'chute';
    if (e.chute) { e.chute.visible = e.air === 'chute'; e.chute.position.copy(e.pos); e.chute.rotation.set(e.vel.z * 0.03, 0, -e.vel.x * 0.03); }
    if (e.pos.y <= 0) { e.pos.y = 0; e.air = null; e.vel.set(0, 0, 0); if (e.chute) e.chute.visible = false; const [x, z] = G.world.freeNear(e.pos.x, e.pos.z); e.pos.x = x; e.pos.z = z; e.protect = G.now + 1.5; e.landT = G.now; FX.burst(x, 0.3, z, 0xffffff, 10, 4, 0.2, 0.4); if (e.isPlayer) H.msg('落地！搜集能量晶和装备', 1600); }
  }

  function updateEnt(e, dt, input) {
    const def = e.def;
    if (e.air) {
      if (e.air === 'plane') return;
      let mx = 0, mz = 0;
      if (e.isPlayer && !input.auto) { mx = input.mx; mz = input.mz; }
      else { const tx = e.isPlayer ? (e.landX ?? (e.landX = landSpot(e)[0], e.landX)) : e.landX, tz = e.isPlayer ? (e.landZ ?? (e.landZ = landSpot(e)[1], e.landZ)) : e.landZ; const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz); if (d > 0.5) { mx = dx / d * Math.min(1, d / 4); mz = dz / d * Math.min(1, d / 4); } }
      if (mx || mz) e.yaw = Math.atan2(mx, mz);
      airStep(e, dt, mx, mz); poseMesh(e, dt, 0); return;
    }
    // ammo reload + regen
    if (!e.pet) {
      if (e.ammo < 3) e.ammo = Math.min(3, e.ammo + dt / def.reload);
      if (G.now - e.lastDmgT > 3 && G.now - e.lastAtkT > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * dt);
    } else { e.life -= dt; if (e.life <= 0 || !e.owner.alive) { kill(e, null); return; } }
    // zone damage
    if (outside(e)) { e.zoneT = (e.zoneT || 0) + dt; if (e.zoneT > 1) { e.zoneT = 0; damage(e, G.zone.dps, 'zone'); if (!e.alive) return; } } else e.zoneT = 0.7;
    // queued shots / punches
    while (e.queue.length && e.queue[0].t <= G.now) { const q = e.queue.shift(); if (q.punch) doPunch(e, q); else { const j = q.a.jitter || 0; shoot(e, e.pos.x, e.pos.z, q.dx + rnd(-j, j), q.dz + rnd(-j, j), q.a, q.range); kickBrawler(e.mesh); } }
    // special movement
    let mvx = 0, mvz = 0, spd = def.speed * (e.slowT > G.now ? 0.55 : 1);
    if (e.action) {
      const A = e.action;
      if (A.type === 'charge') {
        const st = Math.min(A.left, 22 * dt); A.left -= st; e.pos.x += A.dx * st; e.pos.z += A.dz * st;
        hitCell(e.pos.x + A.dx * 0.9, e.pos.z + A.dz * 0.9, 1e9, true);
        for (const t of G.ents) if (t.alive && t.team !== e.team && !t.air && !A.hit.has(t) && Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) < 1.4) { A.hit.add(t); damage(t, def.sup.dmg * e.dmgMul, e, A.dx * def.sup.knock, A.dz * def.sup.knock); }
        if (SOLID(G.world.at(e.pos.x + A.dx * 0.7, e.pos.z + A.dz * 0.7)) || A.left <= 0) e.action = null;
        G.world.collide(e.pos, e.r); poseMesh(e, dt, 9); return;
      }
      if (A.type === 'leap') {
        A.t += dt; const k = Math.min(1, A.t / A.T); e.pos.x = A.x0 + (A.x1 - A.x0) * k; e.pos.z = A.z0 + (A.z1 - A.z0) * k; e.pos.y = Math.sin(k * Math.PI) * 4;
        if (k >= 1) { e.pos.y = 0; e.action = null; explode(e.pos.x, e.pos.z, def.sup.radius, def.sup.dmg * e.dmgMul, e, 0xe63946, def.sup.knock); for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 4) hitCell(e.pos.x + dx * CELL, e.pos.z + dz * CELL, 1e9, true); G.world.collide(e.pos, e.r); }
        poseMesh(e, dt, 0); return;
      }
    }
    if (e.isPlayer && !input.auto) { mvx = input.mx; mvz = input.mz; if (input.aiming) e.aimYaw = input.aimYaw; }
    else { const m = botThink(e, dt); mvx = m.x; mvz = m.z; }
    const ml = Math.hypot(mvx, mvz); if (ml > 1) { mvx /= ml; mvz /= ml; }
    e.pos.x += (mvx * spd + e.vel.x) * dt; e.pos.z += (mvz * spd + e.vel.z) * dt;
    e.vel.multiplyScalar(Math.max(0, 1 - dt * 7));
    G.world.collide(e.pos, e.r);
    if (ml > 0.1 && !e.queue.length && G.now - e.lastAtkT > 0.35) e.yaw = turn(e.yaw, Math.atan2(mvx, mvz), dt * 14);
    e.inBush = G.world.at(e.pos.x, e.pos.z) === T.BUSH;
    if (!e.pet) pickup(e);
    poseMesh(e, dt, ml * spd);
  }
  const turn = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, k); };
  function poseMesh(e, dt, speed) {
    const m = e.mesh; m.position.set(e.pos.x, e.pos.y, e.pos.z); m.rotation.y = e.yaw; animBrawler(m, dt, speed);
    // squash & stretch: landing / hit / attack
    const u = m.userData, hitK = Math.max(0, 1 - (G.now - e.lastDmgT) * 6), atk = u.kick;
    const sy = 1 + Math.sin(u.t * 2) * 0.04 * Math.min(1, speed / 5) - hitK * 0.12 + atk * 0.06, sxz = 1 / Math.sqrt(sy);
    u.inner.scale.set(sxz, sy, sxz);
    if (e.air === 'fall') u.inner.rotation.x = 0.6; else u.inner.rotation.x = 0;
  }
  G.visibleTo = (t, viewer) => { if (t.team === viewer.team) return true; if (!t.inBush || t.revealT > G.now) return true; return Math.hypot(t.pos.x - viewer.pos.x, t.pos.z - viewer.pos.z) < 3.4; };

  function updateProjs(dt) {
    const W = G.world;
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i]; const st = p.sp * dt; p.x += p.dx * st; p.z += p.dz * st; p.left -= st; let dead = p.left <= 0;
      if (!dead && (p.wave ? false : BLOCKSHOT(W.at(p.x, p.z)))) { hitCell(p.x, p.z, p.dmg, p.breakWalls); if (!(p.pierce && p.breakWalls)) dead = true; }
      if (!dead && p.wave && BLOCKSHOT(W.at(p.x, p.z))) { hitCell(p.x, p.z, p.dmg, false); }
      if (!dead) for (const t of G.ents) {
        if (!t.alive || t.team === p.owner.team || t.air || (p.hit && p.hit.has(t))) continue;
        if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < t.r + p.r) { damage(t, p.dmg, p.owner, p.dx * p.knock, p.dz * p.knock); if (p.hit) p.hit.add(t); else { dead = true; break; } }
      }
      if (dead) { if (p.shard !== true) FX.burst(p.x, 1, p.z, p.col, 3, 3, 0.1, 0.2); G.projs.splice(i, 1); }
    }
  }
  function updateLobs(dt) {
    for (let i = G.lobs.length - 1; i >= 0; i--) {
      const L = G.lobs[i]; L.t += dt; if (L.t < L.T) continue; G.lobs.splice(i, 1);
      const a = L.a, o = L.owner;
      if (L.storm) { const m = new THREE.Mesh(FX.stormGeo, FX.stormMat); m.position.set(L.x1, 0.09, L.z1); m.scale.setScalar(a.radius); m.renderOrder = 2; scene.add(m); G.storms.push({ x: L.x1, z: L.z1, r: a.radius, t: a.time, owner: o, dmg: a.dmg * o.dmgMul, mesh: m, tick: 0 }); FX.burst(L.x1, 1, L.z1, 0x9fe7ff, 20, 6, 0.2, 0.6); continue; }
      explode(L.x1, L.z1, a.radius, a.dmg * o.dmgMul, o, 0xe8f7ff);
      for (let k = 0; k < a.shards; k++) { const an = k / a.shards * Math.PI * 2 + Math.random() * 0.3; G.projs.push({ x: L.x1, z: L.z1, dx: Math.cos(an), dz: Math.sin(an), sp: 16, left: a.shardRange, dmg: a.shardDmg * o.dmgMul, r: 0.18, col: a.shardCol || 0x9fe7ff, owner: o, pierce: false, hit: null, y: 0.7, shard: true }); }
    }
  }
  function updateStorms(dt) {
    for (let i = G.storms.length - 1; i >= 0; i--) {
      const s = G.storms[i]; s.t -= dt; s.tick -= dt; s.mesh.rotation.y += dt;
      if (Math.random() < 0.6) FX.burst(s.x + rnd(-s.r, s.r) * 0.7, 2.5, s.z + rnd(-s.r, s.r) * 0.7, 0xffffff, 1, 1, 0.12, 0.6);
      if (s.tick <= 0) { s.tick = 0.5; for (const t of G.ents) if (t.alive && t.team !== s.owner.team && !t.air && Math.hypot(t.pos.x - s.x, t.pos.z - s.z) < s.r + t.r) { damage(t, s.dmg * 0.5, s.owner); t.slowT = G.now + 0.8; } }
      if (s.t <= 0) { scene.remove(s.mesh); G.storms.splice(i, 1); }
    }
  }
  // ---------------- airdrops ----------------
  function updateDrops(dt) {
    if (G.state === 'play' && G.dropTimes.length && G.now >= G.dropTimes[0]) {
      G.dropTimes.shift(); const Z = G.zone, tgt = Z.next || Z; let x = 0, z = 0;
      for (let t = 0; t < 30; t++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * tgt.r * 0.75; x = tgt.c.x + Math.cos(a) * d; z = tgt.c.y + Math.sin(a) * d; if (!SOLID(G.world.at(x, z))) break; }
      [x, z] = G.world.freeNear(x, z);
      const m = outlined(FX.dropGeo, vcMat(), 0.06); m.position.set(x, 38, z); scene.add(m);
      const ch = FX.makeChute(); ch.visible = true; ch.scale.setScalar(1.3);
      const beam = new THREE.Mesh(FX.beamGeo, FX.beamMat); beam.position.set(x, 30, z); scene.add(beam);
      G.drops.push({ x, z, y: 38, mesh: m, chute: ch, beam, landed: false });
      H.msg('空投补给来了！看小地图黄点', 2000);
    }
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i];
      if (!d.landed) { d.y -= 5 * dt; if (d.y <= 0) { d.y = 0; d.landed = true; d.chute.visible = false; FX.burst(d.x, 0.5, d.z, 0xffd23f, 16, 5, 0.25, 0.5); } d.mesh.position.y = d.y; d.chute.position.set(d.x, d.y + 1.2, d.z); continue; }
      d.beam.material.opacity = 0.2 + Math.sin(G.now * 4) * 0.1;
      for (const e of G.ents) if (e.alive && !e.air && !e.pet && Math.hypot(e.pos.x - d.x, e.pos.z - d.z) < 1.8) {
        scene.remove(d.mesh); scene.remove(d.beam); scene.remove(d.chute); G.drops.splice(i, 1);
        FX.burst(d.x, 1, d.z, 0xffd23f, 30, 8, 0.3, 0.8);
        spawnItem('cube', 0, d.x + 1, d.z); spawnItem('cube', 0, d.x - 1, d.z); spawnItem('armor', 3, d.x, d.z + 1.2); spawnItem('helmet', 3, d.x, d.z - 1.2); spawnItem('med', 0, d.x + 1, d.z + 1);
        if (e.isPlayer) H.msg('打开了空投！', 1200); break;
      }
    }
  }

  // ---------------- bots ----------------
  function nearestEnemy(e, maxD) { let best = null, bd = maxD; for (const t of G.ents) { if (!t.alive || t.team === e.team || t.air) continue; const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z); if (d < bd && G.visibleTo(t, e)) { bd = d; best = t; } } return best; }
  G.nearestEnemy = nearestEnemy;
  function steer(e, dx, dz) {
    const L = Math.hypot(dx, dz); if (L < 0.01) return v2(0, 0); dx /= L; dz /= L;
    for (const a of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) { const c = Math.cos(a), s = Math.sin(a), x = dx * c + dz * s, z = -dx * s + dz * c; let ok = true; for (const k of [0.9, 1.7]) { const t = G.world.at(e.pos.x + x * k, e.pos.z + z * k); if (SOLID(t)) { ok = false; break; } } if (ok) return v2(x, z); }
    return v2(-dx, -dz);
  }
  function botThink(e, dt) {
    const b = e.bot || (e.bot = { think: 0, mode: 'loot', strafe: 1, strafeT: 0, nextShot: 0, stuckT: 0, lastPos: e.pos.clone(), seen: 0 });
    const D = BOT_DIFF[G.diff], def = e.def;
    if (e.pet) { // robo-dog pet: chase nearest enemy around owner, bite
      const t = nearestEnemy(e, 11), o = e.owner; let gx, gz;
      if (t) { gx = t.pos.x - e.pos.x; gz = t.pos.z - e.pos.z; if (Math.hypot(gx, gz) < 2.4 && G.now > b.nextShot) { b.nextShot = G.now + 0.8; doPunch(e, { a: { dmg: CHARS.granny.sup.dmg, arc: 1.3, col: 0xff8a2a }, dx: gx / Math.hypot(gx, gz), dz: gz / Math.hypot(gx, gz) }); e.yaw = Math.atan2(gx, gz); } }
      else { gx = o.pos.x - e.pos.x; gz = o.pos.z - e.pos.z; if (Math.hypot(gx, gz) < 2.5) return v2(0, 0); }
      return steer(e, gx, gz);
    }
    b.think -= dt; b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = rnd(0.8, 2); }
    if (b.think <= 0) {
      b.think = rnd(0.15, 0.3);
      // stuck detection
      if (b.lastPos.distanceTo(e.pos) < 0.25 && b.want) { b.stuckT += 0.25; } else b.stuckT = 0; b.lastPos.copy(e.pos);
      if (b.stuckT > 0.8) { b.unstuck = G.now + 0.8; b.uDir = Math.random() * Math.PI * 2; b.stuckT = 0; b.wander = null; }
      const Z = G.zone, safe = Z.stage === 'shrink' || (Z.stage === 'wait' && Z.t < 10) ? (Z.next || Z) : Z;
      const dzC = Math.hypot(e.pos.x - safe.c.x, e.pos.z - safe.c.y);
      b.tgt = nearestEnemy(e, Math.max(10, def.range + 3));
      if (b.tgt && G.now - (e.landT || 0) < 14 && G.now - e.lastDmgT > 2 && Math.hypot(b.tgt.pos.x - e.pos.x, b.tgt.pos.z - e.pos.z) > 6) b.tgt = null;
      if (b.tgt && !b.seen) b.seen = G.now + D.react; if (!b.tgt) b.seen = 0;
      if (outside(e, -0.5) || dzC > safe.r * 0.92) b.mode = 'zone';
      else if (b.tgt && e.hp < e.maxHp * 0.3 && b.tgt.hp > e.hp * 1.4) b.mode = 'flee';
      else if (b.tgt) b.mode = 'fight';
      else b.mode = 'loot';
      b.safe = safe;
      if (b.mode === 'loot') {
        let best = null, bd = 26;
        for (const it of G.items) { const d = Math.hypot(it.pos.x - e.pos.x, it.pos.z - e.pos.z); const want = it.kind === 'cube' || (it.kind === 'armor' && it.lv > e.armor) || (it.kind === 'helmet' && it.lv > e.helmet) || (it.kind === 'med' && e.hp < e.maxHp * 0.8); if (want && d < bd && Math.hypot(it.pos.x - safe.c.x, it.pos.z - safe.c.y) < safe.r) { bd = d; best = { x: it.pos.x, z: it.pos.z }; } }
        for (const d0 of G.drops) if (d0.landed) { const d = Math.hypot(d0.x - e.pos.x, d0.z - e.pos.z); if (d < 40 && d < bd + 10) { bd = d; best = { x: d0.x, z: d0.z }; } }
        if (!best) { // nearest power box / crate
          const W = G.world, i0 = cx(e.pos.x), j0 = cz(e.pos.z);
          for (let r = 1; r < 14 && !best; r++) for (let dj = -r; dj <= r && !best; dj++) for (let di = -r; di <= r; di++) { if (Math.abs(di) !== r && Math.abs(dj) !== r) continue; const i = i0 + di, j = j0 + dj; if (!W.inb(i, j)) continue; const t = W.type[W.idx(i, j)]; if (t === T.BOX || (t === T.CRATE && r < 5)) { best = { x: wx(i), z: wx(j), box: true }; break; } }
        }
        if (!best) { if (!b.wander || Math.hypot(b.wander.x - e.pos.x, b.wander.z - e.pos.z) < 2) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * safe.r * 0.7; b.wander = { x: safe.c.x + Math.cos(a) * d, z: safe.c.y + Math.sin(a) * d }; } best = b.wander; }
        b.goal = best;
      }
    }
    let mx = 0, mz = 0; b.want = true;
    if (b.unstuck > G.now) return v2(Math.cos(b.uDir), Math.sin(b.uDir));
    const t = b.tgt && b.tgt.alive ? b.tgt : null;
    if (b.mode === 'zone') { const s = b.safe; return steer(e, s.c.x - e.pos.x, s.c.y - e.pos.z); }
    if (b.mode === 'flee' && t) { const s = b.safe; let fx = e.pos.x - t.pos.x, fz = e.pos.z - t.pos.z; const fl = Math.hypot(fx, fz) || 1; fx = fx / fl + (s.c.x - e.pos.x) * 0.02; fz = fz / fl + (s.c.y - e.pos.z) * 0.02; botShoot(e, t, D); return steer(e, fx, fz); }
    if (b.mode === 'fight' && t) {
      const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1, pref = def.range < 5 ? 0.5 : def.range * 0.62;
      const fwd = d > pref + 1 ? 1 : d < pref - 1.5 ? -0.8 : 0;
      mx = dx / d * fwd + (-dz / d) * b.strafe * 0.8; mz = dz / d * fwd + (dx / d) * b.strafe * 0.8;
      if (G.now > b.seen) botShoot(e, t, D);
      return steer(e, mx, mz);
    }
    if (b.goal) {
      const gx = b.goal.x - e.pos.x, gz = b.goal.z - e.pos.z, d = Math.hypot(gx, gz);
      if (b.goal.box) { const range = def.atk.kind === 'lob' ? def.range * 0.9 : Math.min(def.range * 0.8, 7); if (d < range && G.now > b.nextShot && e.ammo >= 1) { b.nextShot = G.now + D.cd + 0.2; attack(e, gx, gz, d); } if (d < Math.max(1.6, range * 0.6)) { b.want = false; return v2(0, 0); } }
      if (d < 0.3) { b.want = false; return v2(0, 0); }
      return steer(e, gx, gz);
    }
    b.want = false; return v2(0, 0);
  }
  function botShoot(e, t, D) {
    const b = e.bot, def = e.def; if (G.now < b.nextShot) return;
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    // super
    if (e.superC >= 1) { const s = def.sup; const sr = s.kind === 'charge' || s.kind === 'leap' ? s.dist : s.kind === 'pet' ? 12 : (s.range || def.range); if (d < sr) { superAtk(e, dx, dz, d); b.nextShot = G.now + 0.4; return; } }
    if (d > def.range * 0.98 || e.ammo < 1) return;
    if (def.atk.kind !== 'lob' && G.world.lineBlocked(e.pos.x, e.pos.z, t.pos.x, t.pos.z) && Math.random() < 0.8) return;
    // lead + error
    const lead = def.atk.speed ? d / def.atk.speed : 0.3; const tx = t.pos.x + (t.lastVx || 0) * lead, tz = t.pos.z + (t.lastVz || 0) * lead;
    const ang = Math.atan2(tx - e.pos.x, tz - e.pos.z) + rnd(-D.err, D.err);
    attack(e, Math.sin(ang), Math.cos(ang), Math.hypot(tx - e.pos.x, tz - e.pos.z));
    b.nextShot = G.now + D.cd * rnd(0.6, 1.4);
  }
  // remember velocity for leading
  G.trackVel = (dt) => { for (const e of G.ents) { if (e._px !== undefined && dt > 0) { e.lastVx = (e.pos.x - e._px) / dt; e.lastVz = (e.pos.z - e._pz) / dt; } e._px = e.pos.x; e._pz = e.pos.z; } };

  function cleanup() {
    for (const e of G.ents) { scene.remove(e.mesh); if (e.chute) scene.remove(e.chute); }
    for (const it of G.items) scene.remove(it.mesh);
    for (const s of G.storms) scene.remove(s.mesh);
    for (const d of G.drops) { scene.remove(d.mesh); scene.remove(d.beam); scene.remove(d.chute); }
    if (G.world) { for (const e of Object.values(G.world.I)) { scene.remove(e.m); if (e.o) scene.remove(e.o); e.m.dispose(); e.o?.dispose(); } scene.remove(G.world.ground); scene.remove(G.world.sea); G.world.ground.material.map.dispose(); }
    G.ents = []; G.projs = []; G.lobs = []; G.items = []; G.storms = []; G.drops = []; G.world = null; FX.plane.visible = false; FX.parts.length = 0;
  }
  Object.assign(G, { setup, update, attack, superAtk, cleanup, alive, outside, PHASES });
  return G;
}
