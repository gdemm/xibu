// Q版大乱斗 — minimal playable loop: hero pick, 5v5 lane, auto-attacks, bots, towers, minion waves, respawn, win/lose.
// Step 2: QWER + Flash per hero (data table SK), status effects, skillshots/zones/dashes, closer camera.
import * as THREE from 'three';
import { createLand } from './land.js';
import { HERO_NAMES, loadHeroes, makeHero } from './heroes.js';
import { createMinimap } from './minimap.js';
import { buildMap, structureMesh, MinionRenderer, Blobs, Bars, FX, laneHalf, TEAM_COL, BUSHES, RELICS, inBush, buildBushes, tickBushes, makeRelic } from './world.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const QUALITY = isTouch ? 'mid' : 'high';
const U = 0.01; // 1 LoL unit = 1 cm

/* ---------------- hero stats (LoL-ish base values, ranges in units) ---------------- */
const STATS = {
  Ahri: { hp: 590, ad: 53, as: .67, range: 550, ms: 330, wu: 0.2, mis: 1750, col: 0xff8fd8 },
  Ashe: { hp: 610, ad: 59, as: .66, range: 600, ms: 325, wu: 0.219, mis: 2000, col: 0x8fe3ff },
  Ezreal: { hp: 600, ad: 62, as: .63, range: 550, ms: 325, wu: 0.188, mis: 2000, col: 0xffe27a },
  Garen: { hp: 690, ad: 69, as: .63, range: 175, ms: 340, wu: 0.2, mis: 0, col: 0xffd45c },
  Jinx: { hp: 630, ad: 59, as: .63, range: 525, ms: 325, wu: 0.169, mis: 2750, col: 0xff6ad5 },
  Lux: { hp: 580, ad: 54, as: .67, range: 550, ms: 330, wu: 0.156, mis: 1200, col: 0xffc21a },
  Sett: { hp: 670, ad: 60, as: .63, range: 125, ms: 340, wu: 0.19, mis: 0, col: 0xffb347 },
  Teemo: { hp: 615, ad: 54, as: .69, range: 500, ms: 330, wu: 0.217, mis: 1300, col: 0x9be37a },
  Yasuo: { hp: 590, ad: 60, as: .70, range: 175, ms: 345, wu: 0.22, mis: 0, col: 0x1fd8e8 },
};
const MINION = {
  melee: { hp: 480, ad: 12, as: 1.25, range: 110, radius: .35 },
  caster: { hp: 300, ad: 24, as: .67, range: 500, radius: .33 },
  siege: { hp: 900, ad: 40, as: 1, range: 300, radius: .55 },
};
const MINION_MS = 3.25, WAVE_EVERY = 30, RESPAWN = 10, FOUNTAIN_X = 52.5;
const TOWER = { range: 7.75, ad: 150, as: .83 };

/* ---------------- forced landscape + fullscreen (from party) ---------------- */
let landReady = false;
const LAND = createLand({ key: 'hexq_forceLand', cls: 'forceLand', hintSel: '#rotateHint', isTouch, onChange: () => { if (landReady) onResize(); } });
const forceLandPortrait = () => LAND.rotated();
const viewSize = () => forceLandPortrait() ? [innerHeight, innerWidth] : [innerWidth, innerHeight];
const gameXY = (cx, cy) => forceLandPortrait() ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy };
const isFull = () => LAND.isFull();
for (const id of ['bFull', 'bFull2']) LAND.bind(id, LAND.toggle);
LAND.bind('bExit', () => LAND.exit());

/* ---------------- renderer / scene ---------------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 400);
function onResize() {
  const [W, H] = viewSize();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.75)); renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  camera.aspect = W / H; camera.fov = W / H < 1.2 ? 55 : 40; camera.updateProjectionMatrix();
}
addEventListener('resize', onResize); onResize(); landReady = true;
buildMap(scene, QUALITY);
const bushObjs = buildBushes(scene, QUALITY);
const G_RELICS = { list: [] }; const RELIC_CD = 22, RELIC_HEAL = .3, RELIC_R = 5; // hx7k2 values: 30% max HP to allied heroes nearby, back after 22 s
const relicObjs = RELICS.map(r => ({ ...r, ready: 0, m: makeRelic(scene, QUALITY) }));
G_RELICS.list = relicObjs;
for (const r of relicObjs) r.m.root.position.set(r.x, 0, r.z);
const minionR = new MinionRenderer(scene, QUALITY, 80), blobs = new Blobs(scene, 120), bars = new Bars(scene, 220), fx = new FX(scene, 200);

/* ---------------- game state ---------------- */
const G = { state: 'pick', t: 0, heroes: [], minions: [], structs: [], proj: [], fxs: [], shots: [], zones: [], walls: [], vis: [], timed: [], kills: [0, 0], nextWave: 3, wave: 0, spawnQ: [], player: null, winner: -1 };
G.relics = G_RELICS.list;
window.__hq = { G, renderer, scene, camera, THREE };
const dirOf = team => team === 0 ? 1 : -1; // direction toward the enemy base along x
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const clampLane = u => { const h = laneHalf(u.x) - 0.45; if (u.z > h) u.z = h; if (u.z < -h) u.z = -h; if (u.x < -55) u.x = -55; if (u.x > 55) u.x = 55; };

function makeStructs() {
  for (const team of [0, 1]) {
    const s = team === 0 ? -1 : 1; let prev = null;
    for (const [kind, x, hp, r] of [['tower', 20, 3000, 1.3], ['tower', 31, 3000, 1.3], ['inhib', 38, 2500, 1.8], ['nexus', 45, 4000, 2.8]]) {
      const grp = structureMesh(kind, team, QUALITY); grp.position.set(s * x, 0, 0); scene.add(grp);
      const e = { kind, team, x: s * x, z: 0, hp, maxHp: hp, radius: r, alive: true, grp, prev, atkCd: 0, target: null, isStruct: true };
      G.structs.push(e); prev = e;
    }
  }
}
const targetable = e => e.alive && (!e.isStruct || !e.prev || !e.prev.alive);

function spawnHero(name, team, slot, isPlayer) {
  const st = STATS[name], h = makeHero(name); scene.add(h.root);
  const e = {
    kind: 'hero', name, team, h, slot, isPlayer, x: 0, z: 0, yaw: 0, hp: st.hp, maxHp: st.hp, ad: st.ad, as: st.as, range: st.range * U, ms: st.ms * U * 1.15,
    radius: .5, col: st.col, melee: st.range <= 200, alive: true, respawnT: 0, atkCd: 0, windT: 0, pend: null, target: null, moving: false,
    laneZ: (slot - 2) * 1.5, think: Math.random() * .2, retreat: false, k: 0, d: 0, cd: [0, 0, 0, 0], fcd: 0, baseRange: st.range * U, wu: st.wu, mis: st.mis * U,
  };
  placeAtFountain(e); G.heroes.push(e); return e;
}
function placeAtFountain(e) {
  const s = e.team === 0 ? -1 : 1, a = e.slot / 5 * Math.PI * 2;
  e.x = s * FOUNTAIN_X + Math.cos(a) * 1.8 - s * 0; e.z = Math.sin(a) * 1.8; e.yaw = s < 0 ? Math.PI / 2 : -Math.PI / 2;
  e.hp = e.maxHp; e.alive = true; e.h.root.visible = true; e.target = null; e.pend = null; e.windT = 0; e.retreat = false;
  e.dash = null; e.dots = []; e.emp = null; for (const k of ST_T) e[k] = 0;
}

function queueWave() {
  G.wave++;
  const types = ['melee', 'melee', 'melee', ...(G.wave % 3 === 0 ? ['siege'] : []), 'caster', 'caster', 'caster'];
  types.forEach((type, i) => { for (const team of [0, 1]) G.spawnQ.push({ at: G.t + i * 0.7, type, team, i }); });
}
const MINION_CAP = 30; // per team alive; waves stop spawning above this (stalemate pile-up guard)
function spawnMinion(type, team, i) {
  let alive = 0; for (const mm of G.minions) if (mm.team === team && mm.alive) alive++;
  if (alive >= MINION_CAP) return;
  const m = MINION[type], s = team === 0 ? -1 : 1;
  G.minions.push({ kind: 'minion', type, team, x: s * 42.5, z: ((i % 3) - 1) * 0.9, yaw: s < 0 ? Math.PI / 2 : -Math.PI / 2, hp: m.hp, maxHp: m.hp, ad: m.ad, as: m.as, range: m.range * U, radius: m.radius, ms: MINION_MS, alive: true, atkCd: 0, windT: 0, pend: null, target: null, moving: false, bob: Math.random() * 6, melee: type === 'melee' });
}

/* ---------------- combat ---------------- */
function* enemiesOf(team) {
  for (const e of G.heroes) if (e.team !== team && e.alive && !e.hid) yield e;
  for (const e of G.minions) if (e.team !== team && e.alive) yield e;
  for (const e of G.structs) if (e.team !== team && targetable(e)) yield e;
}
function nearestEnemy(u, radius, kinds) {
  let best = null, bd = Infinity;
  for (const e of enemiesOf(u.team)) {
    if (kinds && !kinds.includes(e.isStruct ? 'struct' : e.kind)) continue;
    const r = radius + e.radius, d = dist2(u, e); if (d < r * r && d < bd) { bd = d; best = e; }
  }
  return best;
}
const inRange = (u, t) => { const r = u.range + t.radius + u.radius; return dist2(u, t) <= r * r; };
function damage(t, dmg, src, noPop) {
  if (!t.alive) return;
  if (t.revealT > 0) dmg *= 1.1;
  if (t.drT > 0) dmg *= 1 - t.dr;
  if (!noPop && t.markT > 0 && src && src === t.markSrc) { t.markT = 0; dmg += 90; G.fxs.push({ x: t.x, z: t.z, y: 1, t: .3, col: 0xffb030, r: 1 }); }
  if (t.shield > 0) { const a = Math.min(t.shield, dmg); t.shield -= a; dmg -= a; }
  t.hp -= dmg;
  // tower aggro: a hero hitting an enemy hero under that hero's tower draws the tower
  if (src?.kind === 'hero' && t.kind === 'hero') for (const s of G.structs) if (s.kind === 'tower' && s.alive && s.team === t.team && dist2(s, src) < TOWER.range ** 2) s.target = src;
  if (t.hp <= 0) kill(t, src);
}
function kill(t, src) {
  t.alive = false; t.hp = 0;
  if (t.kind === 'hero') {
    t.h.root.visible = false; t.respawnT = RESPAWN + Math.min(10, G.t / 60); t.d++;
    if (src?.kind === 'hero') { src.k++; G.kills[src.team]++; }
    feed(src, t); if (t.isPlayer) centerMsg('你被击杀了', 1500);
  } else if (t.isStruct) {
    t.grp.userData.body.visible = false; for (const c of t.grp.children) if (c !== t.grp.userData.rubble) c.visible = false; t.grp.userData.rubble.visible = true;
    centerMsg((t.team === G.player.team ? '我方' : '敌方') + ({ tower: '防御塔', inhib: '水晶', nexus: '主水晶' })[t.kind] + '被摧毁', 1500);
    if (t.kind === 'nexus') endGame(1 - t.team);
  }
}
function startAttack(u, t) {
  if (u.atkCd > 0 || u.windT > 0 || u.stunT > 0 || u.spinT > 0 || u.castT > 0 || u.dash) return;
  if (u.kind === 'hero') u.revealT = G.t;
  const as = u.as * (u.asBuffT > 0 ? 1.5 : 1) * (u.rockets ? .85 : 1);
  u.atkCd = 1 / as; u.windT = (u.wu || .28) / as; // per-hero attack windup u.pend = t;
  u.yaw = Math.atan2(t.x - u.x, t.z - u.z);
  if (u.h) { const d = u.h.actions.attack?.getClip().duration || .6; u.h.play('attack', Math.max(1, d * as * 1.1)); }
}
function landAttack(u) {
  const t = u.pend; u.pend = null; if (!t || !t.alive || !u.alive) return;
  if (u.blindT > 0) { G.fxs.push({ x: t.x, z: t.z, y: 1.2, t: .3, col: 0x806090, r: .4 }); return; } // blinded: miss
  let dmg = u.ad, emp = null;
  if (u.emp && u.emp.n > 0) { emp = u.emp; dmg += emp.dmg; if (--emp.n <= 0) u.emp = null; }
  const on = tt => onAttackHit(u, tt, emp, dmg);
  if (u.melee) { damage(t, dmg, u); on(t); G.fxs.push({ x: t.x, z: t.z, y: .8, t: .18, col: emp ? emp.col : (u.col || 0xffffff), r: emp ? .8 : .45 }); }
  else G.proj.push({ x: u.x + Math.sin(u.yaw) * .5, y: u.kind === 'hero' ? 1.0 : .7, z: u.z + Math.cos(u.yaw) * .5, t, sp: u.kind === 'hero' ? (u.rockets ? 2000 * U : u.mis || 18) : 12, dmg, src: u, col: u.rockets ? 0xff6ad5 : (u.col || TEAM_COL[u.team]), r: u.kind === 'hero' ? (u.rockets ? .3 : .2) : .13, on: u.kind === 'hero' ? on : null });
}
function onAttackHit(u, t, emp, dmg) {
  if (emp?.silence) applyCC(t, { silence: emp.silence }, u);
  if (u.toxicT > 0 && !t.isStruct) applyCC(t, { dot: 18, dotT: 4 }, u);
  if (u.rockets) for (const e of foesIn(u.team, e => e !== t && dist2(e, t) < (1.2 + e.radius) ** 2)) damage(e, dmg * .6, u);
}
// move toward (tx,tz); returns true while moving
function moveTo(u, tx, tz, dt, stopAt = 0.1) {
  const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  if (d <= stopAt) return false;
  if (u.windT > 0 || cantMove(u)) return true; // finish wind-up before moving; rooted/stunned can't move
  const s = Math.min(d, u.ms * msMul(u) * dt); u.x += dx / d * s; u.z += dz / d * s; u.yaw = Math.atan2(dx, dz); u.moving = true; return true;
}
function chaseAttack(u, t, dt) {
  if (inRange(u, t)) startAttack(u, t);
  else moveTo(u, t.x, t.z, dt, 0);
}
function tickAttack(u, dt) {
  if (u.atkCd > 0) u.atkCd -= dt;
  if (u.windT > 0) { u.windT -= dt; if (u.windT <= 0) landAttack(u); }
}

/* ---------------- AI ---------------- */
function frontX(team) { // most advanced own minion, else own first standing tower
  const d = dirOf(team); let f = null;
  for (const m of G.minions) if (m.team === team && m.alive && (f === null || m.x * d > f * d)) f = m.x;
  if (f === null) { for (const s of G.structs) if (s.team === team && s.alive && s.kind === 'tower') { f = s.x + d * 3; break; } }
  return f ?? (team === 0 ? -40 : 40);
}
function enemyTower(team) { for (const s of G.structs) if (s.team !== team && s.alive && s.kind === 'tower') return s; return null; }
function towerSafe(u, x, z) { // is (x,z) outside the next enemy tower, or does it have own minions tanking?
  const t = enemyTower(u.team); if (!t) return true;
  if ((x - t.x) ** 2 + z * z > (TOWER.range + .8) ** 2) return true;
  if (t.target && t.target.kind === 'minion') return true;
  for (const m of G.minions) if (m.team === u.team && m.alive && dist2(m, t) < (TOWER.range - .5) ** 2) return true;
  return false;
}
function updateBushes() {
  for (const u of G.heroes) u.bush = u.alive ? inBush(u.x, u.z) : -1;
  for (const m of G.minions) m.bush = inBush(m.x, m.z);
  for (const u of G.heroes) {
    u.hid = false; if (u.bush < 0) continue;
    // hidden unless an enemy unit stands in the same bush, or the hero attacked/cast in the last second
    if (G.t - (u.revealT || -9) < 1) continue;
    let seen = false;
    for (const e of G.heroes) if (e.team !== u.team && e.alive && e.bush === u.bush) { seen = true; break; }
    if (!seen) for (const m of G.minions) if (m.team !== u.team && m.alive && m.bush === u.bush) { seen = true; break; }
    u.hid = !seen;
  }
  // enemies lose their lock on a hidden hero
  for (const u of [...G.heroes, ...G.minions]) if (u.target?.hid && u.target.team !== u.team) u.target = null;
  if (P.clickT?.hid) P.clickT = null;
}
function updateRelics() {
  for (const r of relicObjs) {
    if (G.t < r.ready) continue;
    const ally = G.heroes.find(u => u.alive && u.hp < u.maxHp * .95 && (u.x - r.x) ** 2 + (u.z - r.z) ** 2 < 1.1 ** 2);
    if (!ally) continue;
    for (const u of G.heroes) if (u.team === ally.team && u.alive && (u.x - r.x) ** 2 + (u.z - r.z) ** 2 < RELIC_R ** 2) {
      const amt = u.maxHp * RELIC_HEAL; u.hp = Math.min(u.maxHp, u.hp + amt);
    }
    r.ready = G.t + RELIC_CD;
    G.fxs.push({ x: r.x, z: r.z, y: .05, t: .5, col: 0x7dff9a, r: RELIC_R * .8, ring: true });
  }
}
function relicFor(u) { // nearest ready relic on the bot's own half, not past enemy tower
  let best = null, bd = 14 * 14;
  for (const r of relicObjs) { if (G.t < r.ready) continue; const d = (u.x - r.x) ** 2 + (u.z - r.z) ** 2; if (d < bd && towerSafe(u, r.x, r.z)) { bd = d; best = r; } }
  return best;
}
function botThink(u, dt) {
  const s = u.team === 0 ? -1 : 1, d = dirOf(u.team);
  if (u.hp < u.maxHp * .3) u.retreat = true;
  if (u.hp < u.maxHp * .6) { const r = relicFor(u); if (r && !(u.target?.kind === 'hero' && inRange(u, u.target) && u.target.hp < u.hp)) { u.retreat = false; moveTo(u, r.x, r.z, dt, .2); return; } }
  if (u.retreat) {
    if (u.hp >= u.maxHp * .9) u.retreat = false;
    else { moveTo(u, s * FOUNTAIN_X, u.laneZ * .5, dt, 1.2); return; }
  }
  u.think -= dt;
  if (u.think <= 0 || !u.target || !u.target.alive) {
    u.think = .25;
    const aggro = u.range + 3;
    let t = nearestEnemy(u, aggro, ['hero']);
    if (t && t.hp > u.hp * 1.8 && !inRange(u, t)) t = null; // don't chase much healthier heroes
    if (!t) t = nearestEnemy(u, aggro, ['minion']) || nearestEnemy(u, u.range + 1, ['struct']);
    if (t && !t.isStruct && !towerSafe(u, t.x, t.z) && !inRange(u, t)) t = null;
    if (t && t.isStruct && !towerSafe(u, u.x, u.z) && t.kind === 'tower') t = null;
    u.target = t;
  }
  if (u.target && u.target.alive) { chaseAttack(u, u.target, dt); return; }
  u.target = null;
  let gx = frontX(u.team) - d * (u.melee ? 1 : 3.5);
  const gz = u.laneZ;
  if (!towerSafe(u, gx, gz)) { const t = enemyTower(u.team); gx = t.x - d * (TOWER.range + 1.5); }
  moveTo(u, gx, gz, dt, .6);
}
function minionThink(m, dt) {
  m.think = (m.think || 0) - dt;
  if (m.think <= 0 || !m.target || !m.target.alive) {
    m.think = .3;
    m.target = nearestEnemy(m, Math.max(5.5, m.range + 1), ['minion', 'hero']) || nearestEnemy(m, m.range + 1.5, ['struct']);
  }
  if (m.target && m.target.alive) { chaseAttack(m, m.target, dt); return; }
  m.target = null;
  moveTo(m, (m.team === 0 ? 1 : -1) * 47, m.z * .98, dt, 0);
}
function towerThink(s, dt) {
  if (s.atkCd > 0) s.atkCd -= dt;
  if (s.target && (!s.target.alive || dist2(s, s.target) > (TOWER.range + s.target.radius) ** 2)) s.target = null;
  if (!s.target) s.target = nearestEnemy({ team: s.team, x: s.x, z: s.z }, TOWER.range, ['minion']) || nearestEnemy({ team: s.team, x: s.x, z: s.z }, TOWER.range, ['hero']);
  if (s.target && s.atkCd <= 0) {
    s.atkCd = 1 / TOWER.as;
    G.proj.push({ x: s.x, y: 4.4, z: s.z, t: s.target, sp: 16, dmg: s.target.kind === 'minion' ? s.target.maxHp * .45 : TOWER.ad, src: s, col: s.team === 0 ? 0x7fc4ff : 0xff8a6a, r: .35 });
  }
}

/* ---------------- status effects (heroes + minions) ---------------- */
const ST_T = ['stunT', 'rootT', 'slowT', 'hasteT', 'blindT', 'silenceT', 'shieldT', 'drT', 'markT', 'revealT', 'airT', 'spinT', 'asBuffT', 'toxicT', 'castT'];
function tickStatus(u, dt) {
  for (const k of ST_T) if (u[k] > 0) u[k] -= dt;
  if (!(u.shieldT > 0)) u.shield = 0;
  if (u.emp && (u.emp.t -= dt) <= 0) u.emp = null;
  if (u.dots && u.dots.length) for (let i = u.dots.length - 1; i >= 0; i--) { const d = u.dots[i]; d.t -= dt; damage(u, d.dps * dt, d.src, true); if (d.t <= 0 || !u.alive) u.dots.splice(i, 1); }
}
const cantMove = u => u.stunT > 0 || u.rootT > 0;
const msMul = u => (u.slowT > 0 ? 1 - u.slow : 1) * (u.hasteT > 0 ? 1 + u.haste : 1);
function applyCC(t, o, src) {
  if (!t.alive || !o) return;
  if (o.air) { t.airT = Math.max(t.airT || 0, o.air); t.airDur = t.airT; o = { ...o, stun: Math.max(o.stun || 0, o.air) }; }
  if (o.stun) { t.stunT = Math.max(t.stunT || 0, o.stun); t.pend = null; t.windT = 0; if (t.dash && !t.dash.unstop) t.dash = null; }
  if (o.root) t.rootT = Math.max(t.rootT || 0, o.root);
  if (o.slow) { t.slow = o.slow; t.slowT = Math.max(t.slowT || 0, o.slowT || 1.5); }
  if (o.blind) t.blindT = o.blind;
  if (o.silence) t.silenceT = o.silence;
  if (o.reveal) t.revealT = o.reveal;
  if (o.mark) { t.markT = o.mark; t.markSrc = src; }
  if (o.dot) (t.dots || (t.dots = [])).push({ dps: o.dot, t: o.dotT || 3, src });
}
function hitU(t, dmg, src, o) { if (!t.alive) return; if (dmg > 0) damage(t, t.kind === 'minion' && o?.minionMul ? dmg * o.minionMul : dmg, src); applyCC(t, o, src); }
function* foes(team) { for (const e of G.heroes) if (e.team !== team && e.alive) yield e; for (const e of G.minions) if (e.team !== team && e.alive) yield e; }
const inLine = (e, x, z, dx, dz, len, w) => { const rx = e.x - x, rz = e.z - z, a = rx * dx + rz * dz; if (a < -e.radius || a > len + e.radius) return false; return Math.abs(rx * dz - rz * dx) <= w / 2 + e.radius; };
const inCone = (e, x, z, dx, dz, len, half) => { const rx = e.x - x, rz = e.z - z, d = Math.hypot(rx, rz); if (d > len + e.radius) return false; return d < .4 || (rx * dx + rz * dz) / d >= Math.cos(half); };
function foesIn(team, test) { const a = []; for (const e of foes(team)) if (test(e)) a.push(e); return a; }
function nearFoes(u, r, n = 9) { // heroes first, then minions, nearest first
  const a = foesIn(u.team, e => !e.hid && dist2(u, e) < (r + e.radius) ** 2);
  a.sort((p, q) => (p.kind === 'hero' ? 0 : 1e4) + dist2(u, p) - ((q.kind === 'hero' ? 0 : 1e4) + dist2(u, q))); return a.slice(0, n);
}
function foeHeroNear(x, z, team, r, test) { let b = null, bd = r * r; for (const e of G.heroes) if (e.team !== team && e.alive && !e.hid && (!test || test(e))) { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; b = e; } } return b; }
const clampPt = (x, z) => { const p = { x, z }; clampLane(p); return p; };
const vis = (o) => { o.t = o.dur = o.dur || .3; G.vis.push(o); };
const later = (d, fn) => G.timed.push({ at: G.t + d, fn });

/* skill primitives */
function shot(u, dx, dz, o) { // linear skillshot
  const s = { x: u.x + dx * .4, z: u.z + dz * .4, y: o.y || 1, dx, dz, sp: o.sp, len: o.len, trav: 0, w: o.w ?? .7, team: u.team, src: u, dmg: o.dmg || 0, cc: o.cc, col: o.col, r: o.r || .3,
    hits: o.hits || new Set(), pierce: o.pierce ?? 1, ret: !!o.ret, back: false, heroOnly: !!o.heroOnly, accel: o.accel || 0, onHit: o.onHit, onEnd: o.onEnd, look: o.look };
  G.shots.push(s); return s;
}
function homing(u, t, o) { later(o.delay || 0, () => { if (u.alive && t.alive) G.proj.push({ x: u.x, y: 1, z: u.z, t, sp: o.sp || 12, dmg: o.dmg, src: u, col: o.col, r: o.r || .22, on: o.on }); }); }
function dash(u, dx, dz, dist, o = {}) { const p = clampPt(u.x + dx * dist, u.z + dz * dist); u.dash = { tx: p.x, tz: p.z, sp: o.sp || 20, hits: new Set(), ...o }; u.yaw = Math.atan2(dx, dz); u.target = null; P.moveTo = u.isPlayer ? null : P.moveTo; return true; }
function blink(u, dx, dz, dist, col) { vis({ k: 'ring', x: u.x, z: u.z, r: .9, col, dur: .35 }); const p = clampPt(u.x + dx * dist, u.z + dz * dist); u.x = p.x; u.z = p.z; u.yaw = Math.atan2(dx, dz); vis({ k: 'ring', x: u.x, z: u.z, r: .9, col, dur: .35 }); }
function aoe(u, x, z, r, dmg, cc, col, o = {}) { for (const e of foesIn(u.team, e => (e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.radius) ** 2)) { if (o.heroOnly && e.kind !== 'hero') continue; hitU(e, dmg, u, cc); } vis({ k: 'disc', x, z, r, col, dur: .35 }); }
function zone(u, o) { const zn = { team: u.team, src: u, acc: 0, armT: 0, ...o }; G.zones.push(zn); return zn; }
function stepDash(u, dt) {
  const D = u.dash, dx = D.tx - u.x, dz = D.tz - u.z, d = Math.hypot(dx, dz), s = Math.min(d, D.sp * dt);
  if (d > 1e-3) { u.x += dx / d * s; u.z += dz / d * s; }
  if (D.hitR) for (const e of foes(u.team)) if (!D.hits.has(e) && dist2(u, e) < (D.hitR + e.radius) ** 2) { D.hits.add(e); hitU(e, D.dmg || 0, u, D.cc); }
  if (D.carry) { if (D.carry.alive) { D.carry.x = u.x + Math.sin(u.yaw) * .9; D.carry.z = u.z + Math.cos(u.yaw) * .9; D.carry.stunT = Math.max(D.carry.stunT || 0, .2); } }
  u.moving = true;
  if (d - s < .05) { u.dash = null; D.onEnd?.(); }
}

/* per-hero QWER: kind dir|point|self|target; range in m; ai = bot cast range vs heroes (0 = never), wave = bots also use on minions */
// saturated per-hero FX colours (FX.vivid also clamps lightness so stacked effects stay tinted, not white)
const C = { Ahri: 0xff3fae, Ashe: 0x2fb6ff, Ez: 0xffb21a, Garen: 0xffc81e, GarenB: 0x3f7fd8, Jinx: 0xff2fa8, JinxB: 0x2f9dff, Lux: 0xffc21a, LuxP: 0xff5fc8, Sett: 0xff7a1a, Teemo: 0x4fd02f, TeemoP: 0x9a3fd8, Yasuo: 0x1fd8e8 };
const SK = {
  Ahri: [
    { n: '欺诈宝珠', cd: 6, range: 8.8, kind: 'dir', ai: 8.5, wave: true, fn: (u, dx, dz) => shot(u, dx, dz, { len: 8.8, sp: 14, w: 1, dmg: 75, ret: true, pierce: 99, col: 0x8fd0ff, r: .38 }) },
    { n: '狐火', cd: 9, range: 6, kind: 'self', ai: 6, fn: u => { const ts = nearFoes(u, 6, 3); for (let i = 0; i < 3; i++) if (ts.length) homing(u, ts[i % ts.length], { dmg: 45, col: C.Ahri, sp: 11, delay: i * .12 }); vis({ k: 'ring', x: u.x, z: u.z, r: 1.2, col: C.Ahri, follow: u }); } },
    { n: '魅惑', cd: 11, range: 9.75, kind: 'dir', ai: 9, fn: (u, dx, dz) => shot(u, dx, dz, { len: 9.75, sp: 16, w: .7, dmg: 60, cc: { stun: 1.2 }, col: 0xff4fa8, r: .3 }) },
    { n: '灵魄突袭', cd: 30, range: 4.5, kind: 'dir', ai: 8, fn: (u, dx, dz) => dash(u, dx, dz, 4.5, { sp: 22, onEnd: () => { const ts = nearFoes(u, 6, 3); ts.forEach((t, i) => homing(u, t, { dmg: 70, col: C.Ahri, sp: 14, delay: i * .08 })); } }) },
  ],
  Ashe: [
    { n: '射手专注', cd: 10, kind: 'self', ai: 6, fn: u => { u.asBuffT = 4; vis({ k: 'ring', x: u.x, z: u.z, r: 1, col: C.Ashe, follow: u, dur: .5 }); } },
    { n: '万箭齐发', cd: 8, range: 8, kind: 'dir', ai: 7.5, wave: true, fn: (u, dx, dz) => { const hits = new Set(), a0 = Math.atan2(dx, dz); for (let i = -3; i <= 3; i++) { const a = a0 + i * .13; shot(u, Math.sin(a), Math.cos(a), { len: 8, sp: 20, w: .35, dmg: 65, cc: { slow: .4, slowT: 2 }, hits, col: C.Ashe, r: .14 }); } } },
    { n: '鹰击长空', cd: 12, range: 20, kind: 'point', ai: 0, fn: (u, dx, dz, dist) => shot(u, dx, dz, { len: Math.max(3, dist), sp: 18, w: 0, pierce: 0, col: 0x6fd0ff, r: .3, y: 2.2, onEnd: s => { zone(u, { x: s.x, z: s.z, r: 5, dur: 5, col: 0x6fd0ff, tick: .25, onTick: z => { for (const e of foesIn(u.team, e => (e.x - z.x) ** 2 + (e.z - z.z) ** 2 < 25)) applyCC(e, { reveal: 1 }, u); } }); } }) },
    { n: '魔法水晶箭', cd: 40, range: 50, kind: 'dir', ai: 16, low: .7, fn: (u, dx, dz) => shot(u, dx, dz, { len: 50, sp: 16, w: 1.2, heroOnly: true, col: 0x9fe8ff, r: .55, onHit: (t, s) => { hitU(t, 200, u, { stun: 1 + Math.min(2.5, s.trav / 10) }); aoe(u, t.x, t.z, 2.5, 0, { slow: .5, slowT: 2 }, 0x9fe8ff); } }) },
  ],
  Ezreal: [
    { n: '秘术射击', cd: 4.5, range: 11.5, kind: 'dir', ai: 11, wave: true, fn: (u, dx, dz) => shot(u, dx, dz, { len: 11.5, sp: 20, w: .6, dmg: 100, col: C.Ez, r: .25, onHit: t => { hitU(t, 100, u); for (let i = 0; i < 4; i++) u.cd[i] = Math.max(0, u.cd[i] - 1.5); } }) },
    { n: '精华跃动', cd: 9, range: 11.5, kind: 'dir', ai: 11, fn: (u, dx, dz) => shot(u, dx, dz, { len: 11.5, sp: 17, w: .8, heroOnly: true, cc: { mark: 4 }, col: 0xffb030, r: .32 }) },
    { n: '奥术跃迁', cd: 14, range: 4.75, kind: 'dir', ai: 0, fn: (u, dx, dz) => { blink(u, dx, dz, 4.75, C.Ez); const t = nearFoes(u, 7.5, 1)[0]; if (t) homing(u, t, { dmg: 75, col: C.Ez, sp: 16 }); } },
    { n: '精准弹幕', cd: 40, range: 45, kind: 'dir', ai: 16, low: .7, fn: (u, dx, dz) => { u.rootT = Math.max(u.rootT || 0, .6); later(.6, () => u.alive && shot(u, dx, dz, { len: 45, sp: 20, w: 1.8, dmg: 220, pierce: 99, cc: { minionMul: .5 }, col: 0xffe27a, r: .7 })); } },
  ],
  Garen: [
    { n: '致命打击', cd: 7, kind: 'self', ai: 5, fn: u => { u.haste = .35; u.hasteT = 1.5; u.emp = { dmg: 60, n: 1, t: 4.5, silence: 1.5, col: C.Garen }; } },
    { n: '勇气', cd: 14, kind: 'self', ai: 4, fn: u => { u.dr = .35; u.drT = 3; u.shield = 70; u.shieldT = 1.5; } },
    { n: '审判', cd: 9, kind: 'self', ai: 2.5, wave: true, fn: u => { u.spinT = 3; u.spinAcc = 0; } },
    { n: '德玛西亚正义', cd: 40, range: 4.5, kind: 'target', ai: 4.5, low: .5, fn: (u, dx, dz, dist, tx, tz) => { const t = foeHeroNear(tx, tz, u.team, 5, e => dist2(u, e) < 5.2 ** 2); if (!t) return false; u.yaw = Math.atan2(t.x - u.x, t.z - u.z); vis({ k: 'beam', x: t.x, z: t.z, y: 0, yaw: 0, len: .9, w: .9, h: 8, col: C.Garen, dur: .5, up: true }); later(.35, () => t.alive && hitU(t, 150 + (t.maxHp - t.hp) * .35, u)); } },
  ],
  Jinx: [
    { n: '枪炮交响曲', cd: .8, kind: 'self', ai: 0, fn: u => { u.rockets = !u.rockets; u.range = u.baseRange + (u.rockets ? 1.8 : 0); centerMsgIf(u, u.rockets ? '火箭炮' : '机枪'); } },
    { n: '震荡电磁波', cd: 8, range: 14.5, kind: 'dir', ai: 13, fn: (u, dx, dz) => { u.rootT = Math.max(u.rootT || 0, .45); later(.45, () => u.alive && shot(u, dx, dz, { len: 14.5, sp: 30, w: .6, dmg: 100, cc: { slow: .5, slowT: 2 }, col: 0x7fd8ff, r: .22 })); } },
    { n: '嚼火者手雷', cd: 14, range: 9, kind: 'point', ai: 8, fn: (u, dx, dz, dist, tx, tz) => { for (let i = -1; i <= 1; i++) { const p = clampPt(tx + dz * i * 1.2, tz - dx * i * 1.2); zone(u, { x: p.x, z: p.z, r: .7, dur: 5, armT: .5, trap: true, col: 0xff7a30, onTrig: z => { aoe(u, z.x, z.z, 1, 70, { root: 1.5 }, 0xff7a30); } }); } } },
    { n: '超究极死神飞弹', cd: 40, range: 55, kind: 'dir', ai: 16, low: .6, fn: (u, dx, dz) => shot(u, dx, dz, { len: 55, sp: 14, accel: 9, w: 1.3, heroOnly: true, col: 0xff4fa8, r: .5, onHit: t => aoe(u, t.x, t.z, 2.5, 200 + (t.maxHp - t.hp) * .2, null, 0xff4fa8), onEnd: null }) },
  ],
  Lux: [
    { n: '光之束缚', cd: 9, range: 11.75, kind: 'dir', ai: 11, fn: (u, dx, dz) => shot(u, dx, dz, { len: 11.75, sp: 13, w: .7, dmg: 80, pierce: 2, cc: { root: 2 }, col: C.Lux, r: .3 }) },
    { n: '曲光屏障', cd: 12, kind: 'self', ai: 6, fn: u => { for (const a of G.heroes) if (a.team === u.team && a.alive && dist2(a, u) < 36) { a.shield = 80; a.shieldT = 3; } vis({ k: 'ring', x: u.x, z: u.z, r: 6, col: C.Lux, dur: .5 }); } },
    { n: '透光奇点', cd: 10, range: 11, kind: 'point', ai: 10, wave: true, fn: (u, dx, dz, dist, tx, tz) => zone(u, { x: tx, z: tz, r: 3, dur: 3, col: C.Lux, tick: .2, onTick: z => { for (const e of foesIn(u.team, e => (e.x - z.x) ** 2 + (e.z - z.z) ** 2 < 9)) applyCC(e, { slow: .35, slowT: .3 }, u); }, onEnd: z => aoe(u, z.x, z.z, 3, 90, null, C.Lux) }) },
    { n: '终极闪光', cd: 40, range: 34, kind: 'dir', ai: 16, fn: (u, dx, dz) => { u.rootT = Math.max(u.rootT || 0, .9); const x = u.x, z = u.z, yaw = Math.atan2(dx, dz); vis({ k: 'beam', x, z, y: .9, yaw, len: 34, w: .15, h: .15, col: C.Lux, dur: .9 }); later(.9, () => { for (const e of foesIn(u.team, e => inLine(e, x, z, dx, dz, 34, 1.6))) hitU(e, 250, u, { minionMul: .6 }); vis({ k: 'beam', x, z, y: .9, yaw, len: 34, w: .75, h: .45, col: C.LuxP, dur: .35 }); }); } },
  ],
  Sett: [
    { n: '屈人之威', cd: 7, kind: 'self', ai: 4, fn: u => { u.haste = .3; u.hasteT = 1.5; u.emp = { dmg: 45, n: 2, t: 5, col: C.Sett }; } },
    { n: '蓄意轰拳', cd: 12, range: 7.9, kind: 'dir', ai: 6.5, wave: true, fn: (u, dx, dz) => { u.rootT = Math.max(u.rootT || 0, .6); const x = u.x, z = u.z, yaw = Math.atan2(dx, dz); vis({ k: 'cone', x, z, yaw, len: 7.9, half: .5, col: C.Sett, dur: .6, faint: true }); later(.6, () => { for (const e of foesIn(u.team, e => inCone(e, x, z, dx, dz, 7.9, .5))) hitU(e, inLine(e, x, z, dx, dz, 7.9, 1.6) ? 150 : 70, u); vis({ k: 'cone', x, z, yaw, len: 7.9, half: .5, col: C.Sett, dur: .3 }); }); } },
    { n: '强手裂颅', cd: 12, range: 4.9, kind: 'dir', ai: 4.5, fn: (u, dx, dz) => { const ts = foesIn(u.team, e => inLine(e, u.x - dx * 4.9, u.z - dz * 4.9, dx, dz, 9.8, 1.8)); for (const e of ts) { const ex = e.x - u.x, ez = e.z - u.z, d = Math.hypot(ex, ez) || 1; e.x = u.x + ex / d * .9; e.z = u.z + ez / d * .9; hitU(e, 60, u, { stun: 1 }); } vis({ k: 'beam', x: u.x - dx * 4.9, z: u.z - dz * 4.9, y: .5, yaw: Math.atan2(dx, dz), len: 9.8, w: .7, h: .05, col: C.Sett, dur: .3 }); } },
    { n: '叹为观止', cd: 45, range: 4, kind: 'target', ai: 4, fn: (u, dx, dz, dist, tx, tz) => { const t = foeHeroNear(tx, tz, u.team, 5, e => dist2(u, e) < 4.5 ** 2); if (!t) return false; const ax = t.x - u.x, az = t.z - u.z, d = Math.hypot(ax, az) || 1; return dash(u, ax / d, az / d, 5.5, { sp: 12, carry: t, unstop: true, onEnd: () => aoe(u, u.x + Math.sin(u.yaw) * .9, u.z + Math.cos(u.yaw) * .9, 2.5, 200, { slow: .5, slowT: 1 }, C.Sett) }); } },
  ],
  Teemo: [
    { n: '致盲吹箭', cd: 7, range: 6.8, kind: 'target', ai: 6.8, fn: (u, dx, dz, dist, tx, tz) => { const t = nearFoes({ team: u.team, x: tx, z: tz }, 2.5, 1)[0] || nearFoes(u, 6.8, 1)[0]; if (!t || dist2(u, t) > 7.3 ** 2) return false; u.yaw = Math.atan2(t.x - u.x, t.z - u.z); homing(u, t, { dmg: 80, col: 0xb0ff60, sp: 15, on: tt => applyCC(tt, { blind: 2 }, u) }); } },
    { n: '小莫突击', cd: 12, kind: 'self', ai: 6, fn: u => { u.haste = .55; u.hasteT = 3; } },
    { n: '毒性射击', cd: 10, kind: 'self', ai: 6, wave: true, fn: u => { u.toxicT = 6; } },
    { n: '种蘑菇', cd: 6, range: 6, kind: 'point', ai: 5, fn: (u, dx, dz, dist, tx, tz) => { const mine = G.zones.filter(z => z.shroom && z.src === u); if (mine.length >= 3) mine[0].dur = 0; zone(u, { x: tx, z: tz, r: .9, dur: 40, armT: 1, trap: true, shroom: true, col: 0x7fe050, onTrig: z => aoe(u, z.x, z.z, 2, 0, { dot: 40, dotT: 4, slow: .4, slowT: 2 }, 0x7fe050) }); } },
  ],
  Yasuo: [
    { n: '斩钢闪', cd: 3, range: 4.75, kind: 'dir', ai: 4.5, wave: true, anim: u => u.qStack >= 2 ? 'q3' : 'q', fn: (u, dx, dz) => {
      if (!(u.qStackT > 0)) u.qStack = 0;
      if (u.qStack >= 2) { u.qStack = 0; shot(u, dx, dz, { len: 9, sp: 15, w: 1, dmg: 90, pierce: 99, cc: { air: 1 }, col: C.Yasuo, r: .5, look: 'tornado' }); return; }
      const ts = foesIn(u.team, e => inLine(e, u.x, u.z, dx, dz, 4.75, .9)); for (const e of ts) hitU(e, 80, u);
      if (ts.length) { u.qStack++; u.qStackT = 6; }
      vis({ k: 'beam', x: u.x, z: u.z, y: .9, yaw: Math.atan2(dx, dz), len: 4.75, w: .25, h: .25, col: C.Yasuo, dur: .2 }); } },
    { n: '风之障壁', cd: 18, range: 1.5, kind: 'dir', ai: 0, fn: (u, dx, dz) => { G.walls.push({ x: u.x + dx * 1.5, z: u.z + dz * 1.5, nx: dx, nz: dz, half: 2, team: u.team, t: 4 }); } },
    { n: '踏前斩', cd: 3.5, range: 4.75, kind: 'dir', ai: 4.75, fn: (u, dx, dz) => dash(u, dx, dz, 4.75, { sp: 18, hitR: .8, dmg: 70 }) },
    { n: '狂风绝息斩', cd: 35, range: 12, kind: 'target', ai: 12, fn: (u, dx, dz, dist, tx, tz) => { let t = foeHeroNear(tx, tz, u.team, 14, e => e.airT > 0 && dist2(u, e) < 144); if (!t) t = foeHeroNear(u.x, u.z, u.team, 6); if (!t) return false; blink(u, Math.sin(u.yaw), Math.cos(u.yaw), 0, C.Yasuo); u.x = t.x - .8; u.z = t.z; clampLane(u); u.yaw = Math.atan2(t.x - u.x, t.z - u.z); aoe(u, t.x, t.z, 2.5, 200, { air: 1.2 }, C.Yasuo, { heroOnly: true }); } },
  ],
};
SK.Ezreal.forEach(d => d.col = C.Ez);
const FLASH = { n: '闪现', cd: 90, range: 4, kind: 'dir' };
function centerMsgIf(u, t) { if (u.isPlayer) centerMsg(t, 700); }
function autoTarget(u, d) {
  const r = (d.range || 6) + 1;
  return foeHeroNear(u.x, u.z, u.team, r) || nearFoes(u, r, 1)[0] || null;
}
// slot 0..3 = QWER, 4 = flash. aim = world point or null (auto: nearest enemy in range, else facing)
function castSlot(u, i, aim) {
  if (!u.alive || u.stunT > 0 || u.dash || G.state !== 'play') return false;
  const d = i === 4 ? FLASH : SK[u.name][i];
  if (i === 4 ? u.fcd > 0 : u.cd[i] > 0) return false;
  u.revealT = G.t;
  if (u.silenceT > 0 && i !== 4) return false;
  let tx, tz;
  if (aim) { tx = aim.x; tz = aim.z; }
  else if (i === 4) { tx = u.x + Math.sin(u.yaw); tz = u.z + Math.cos(u.yaw); }
  else { const t = d.kind === 'self' ? null : autoTarget(u, d); if (t) { tx = t.x; tz = t.z; } else { tx = u.x + Math.sin(u.yaw) * (d.range || 1); tz = u.z + Math.cos(u.yaw) * (d.range || 1); } }
  let dx = tx - u.x, dz = tz - u.z, dist = Math.hypot(dx, dz);
  if (dist < .05) { dx = Math.sin(u.yaw); dz = Math.cos(u.yaw); dist = 0; } else { dx /= dist; dz /= dist; }
  dist = Math.min(dist, d.range || 0);
  if (i === 4) { blink(u, dx, dz, 4, 0xfff6a0); u.fcd = FLASH.cd; u.windT = 0; u.pend = null; return true; }
  if (d.kind !== 'self') u.yaw = Math.atan2(dx, dz);
  const ok = d.fn(u, dx, dz, dist, u.x + dx * dist, u.z + dz * dist);
  if (ok === false) { if (u.isPlayer) centerMsg('范围内没有目标', 600); return false; }
  u.cd[i] = d.cd; u.windT = 0; u.pend = null; u.castT = .25;
  u.h.play(typeof d.anim === 'function' ? d.anim(u) : (d.anim || 'qwer'[i]), 1.25);
  return true;
}
function botSkills(u, dt) {
  u.skT = (u.skT || 0) - dt; if (u.skT > 0 || u.retreat) return;
  u.skT = .35 + Math.random() * .4;
  const sk = SK[u.name], order = [3, 2, 1, 0].sort(() => Math.random() - .5);
  for (const i of order) {
    const d = sk[i]; if (!d.ai || u.cd[i] > 0) continue;
    let t = foeHeroNear(u.x, u.z, u.team, d.ai);
    if (t && d.low && t.hp > t.maxHp * d.low) t = null;
    if (!t && d.wave && i < 3) { const m = nearFoes(u, Math.min(d.ai, 6), 1)[0]; if (m && m.kind === 'minion' && Math.random() < .3) t = m; }
    if (!t) continue;
    if (t.kind === 'hero' && !towerSafe(u, t.x, t.z) && d.kind === 'dir' && (d.range || 0) < 6 && i !== 1) continue; // no dive dashes under tower
    if (castSlot(u, i, d.kind === 'self' ? null : { x: t.x, z: t.z })) return;
  }
  if (u.fcd <= 0 && u.hp < u.maxHp * .2 && foeHeroNear(u.x, u.z, u.team, 4)) castSlot(u, 4, { x: u.x - dirOf(u.team) * 4, z: u.z });
}
// segment p0->p1 crosses an enemy wind wall?
function blockedByWall(team, x0, z0, x1, z1) {
  for (const w of G.walls) {
    if (w.team === team) continue;
    const s0 = (x0 - w.x) * w.nx + (z0 - w.z) * w.nz, s1 = (x1 - w.x) * w.nx + (z1 - w.z) * w.nz;
    if ((s0 > 0) === (s1 > 0)) continue;
    const k = s0 / (s0 - s1), ix = x0 + (x1 - x0) * k, iz = z0 + (z1 - z0) * k;
    if (Math.abs((ix - w.x) * -w.nz + (iz - w.z) * w.nx) <= w.half) return true;
  }
  return false;
}
function stepSkills(dt) {
  for (let i = G.timed.length - 1; i >= 0; i--) if (G.t >= G.timed[i].at) { const f = G.timed[i].fn; G.timed.splice(i, 1); f(); }
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i]; let done = false;
    s.sp += s.accel * dt;
    let dx = s.dx, dz = s.dz;
    if (s.back) { const bx = s.src.x - s.x, bz = s.src.z - s.z, bd = Math.hypot(bx, bz); if (bd < .6 || !s.src.alive) { G.shots.splice(i, 1); continue; } dx = bx / bd; dz = bz / bd; }
    const st = s.sp * dt, x0 = s.x, z0 = s.z; s.x += dx * st; s.z += dz * st; s.trav += st;
    if (blockedByWall(s.team, x0, z0, s.x, s.z)) { vis({ k: 'disc', x: s.x, z: s.z, r: .6, col: C.Yasuo, dur: .25 }); G.shots.splice(i, 1); continue; }
    if (s.w > 0 && s.pierce > 0) for (const e of foes(s.team)) {
      if (s.hits.has(e) || (s.heroOnly && e.kind !== 'hero')) continue;
      if (!inLine(e, x0, z0, dx, dz, st, s.w)) continue;
      s.hits.add(e); if (s.onHit) s.onHit(e, s); else hitU(e, s.dmg, s.src, s.cc);
      G.fxs.push({ x: e.x, z: e.z, y: .9, t: .2, col: s.col, r: s.r * 2 });
      if (--s.pierce <= 0) { done = true; break; }
    }
    if (!done && !s.back && s.trav >= s.len) { if (s.ret) { s.back = true; s.hits = new Set(); s.pierce = 99; } else { s.onEnd?.(s); done = true; } }
    if (done) G.shots.splice(i, 1);
  }
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i]; z.dur -= dt; z.armT -= dt;
    if (z.tick) { z.acc += dt; if (z.acc >= z.tick) { z.acc -= z.tick; z.onTick(z); } }
    if (z.trap && z.armT <= 0) { for (const e of foes(z.team)) if ((e.x - z.x) ** 2 + (e.z - z.z) ** 2 < (z.r + e.radius) ** 2) { z.onTrig(z); z.dur = -1; z.trapped = true; break; } }
    if (z.dur <= 0) { if (!z.trapped) z.onEnd?.(z); G.zones.splice(i, 1); }
  }
  for (let i = G.walls.length - 1; i >= 0; i--) if ((G.walls[i].t -= dt) <= 0) G.walls.splice(i, 1);
  for (let i = G.vis.length - 1; i >= 0; i--) if ((G.vis[i].t -= dt) <= 0) G.vis.splice(i, 1);
}
function drawSkills() {
  for (const s of G.shots) {
    if (s.look === 'tornado') { for (let k = 0; k < 3; k++) fx.orbAt(s.x + Math.sin(G.t * 20 + k * 2) * .2, .4 + k * .45, s.z + Math.cos(G.t * 20 + k * 2) * .2, .35 + k * .12, s.col, .8); }
    else { fx.orbAt(s.x, s.y, s.z, s.r, s.col, 1); fx.orbAt(s.x - s.dx * s.r * 1.6, s.y, s.z - s.dz * s.r * 1.6, s.r * .6, s.col, .5); }
  }
  for (const z of G.zones) {
    if (z.trap) { fx.orbAt(z.x, .15, z.z, z.shroom ? .28 : .22, z.col, z.armT > 0 ? .4 : .9); if (z.shroom) fx.ringAt(z.x, z.z, z.r, z.col, .25); else fx.ringAt(z.x, z.z, z.r, z.col, .6); }
    else { fx.discAt(z.x, z.z, z.r, z.col, .08); fx.ringAt(z.x, z.z, z.r, z.col, .7); }
  }
  for (const w of G.walls) { const yaw = Math.atan2(-w.nz, w.nx) + Math.PI / 2, ex = -w.nz * w.half, ez = w.nx * w.half; fx.beamAt(w.x - ex, 0, w.z - ez, Math.atan2(ex, ez), w.half * 2, .18, 2.2, C.Yasuo, .45); }
  for (const v of G.vis) {
    const a = Math.min(1, v.t / v.dur * 1.5), x = v.follow ? v.follow.x : v.x, z = v.follow ? v.follow.z : v.z;
    if (v.k === 'ring') fx.ringAt(x, z, v.r * (1.15 - .15 * v.t / v.dur), v.col, a);
    else if (v.k === 'disc') fx.discAt(x, z, v.r, v.col, a * .28);
    else if (v.k === 'beam') { if (v.up) { for (let k = 0; k < 4; k++) fx.orbAt(x, .3 + k * .55 + 3 * v.t / v.dur, z, .3 - k * .04, v.col, a); fx.ringAt(x, z, 1.2, v.col, a); } else fx.beamAt(x, v.y, z, v.yaw, v.len, v.w, v.h, v.col, a * (v.faint ? .4 : 1)); }
    else if (v.k === 'cone') for (let k = -3; k <= 3; k++) fx.beamAt(x, .3, z, v.yaw + k * v.half / 3, v.len, .2, .06, v.col, a * (v.faint ? .35 : .9));
  }
  // status markers
  for (const u of G.heroes) {
    if (!u.alive) continue; const top = u.h.height + .75 + (u.airY || 0);
    if (u.stunT > 0) for (let k = 0; k < 3; k++) { const a = G.t * 5 + k * 2.1; fx.orbAt(u.x + Math.cos(a) * .35, top, u.z + Math.sin(a) * .35, .08, 0xffe060, 1); }
    if (u.rootT > 0 && !u.isPlayer) fx.ringAt(u.x, u.z, .7, C.Lux, .9);
    if (u.slowT > 0) fx.ringAt(u.x, u.z, .6, 0x2f8fff, .7);
    if (u.shield > 0) { fx.ringAt(u.x, u.z, .8, C.Lux, .85, .9); fx.ringAt(u.x, u.z, .7, C.LuxP, .6, .35); } // shield: waist + ankle ring instead of a white sphere over the hero
    if (u.drT > 0) fx.ringAt(u.x, u.z, 1, C.Garen, .5, .5);
    if (u.blindT > 0) fx.orbAt(u.x, top, u.z, .16, 0x403060, 1);
    if (u.markT > 0) fx.ringAt(u.x, u.z, .9, 0xffb030, .8, .4);
    if (u.revealT > 0) fx.ringAt(u.x, u.z, 1.05, 0x6fd0ff, .6, .1);
    if (u.silenceT > 0) fx.orbAt(u.x, top + .2, u.z, .1, 0xff4040, 1);
    if (u.spinT > 0) { fx.ringAt(u.x, u.z, 1.8, C.Garen, .85, .3); fx.discAt(u.x, u.z, 1.8, C.GarenB, .09); }
    if (u.emp) fx.orbAt(u.x + Math.sin(u.yaw) * .4, .9, u.z + Math.cos(u.yaw) * .4, .18, u.emp.col, 1);
    if (u.toxicT > 0 || u.asBuffT > 0 || u.hasteT > 0) fx.ringAt(u.x, u.z, .55, u.toxicT > 0 ? 0x7fe050 : u.asBuffT > 0 ? C.Ashe : 0xffffff, .5, .15);
    if (u.dots?.length) fx.orbAt(u.x, top - .2, u.z, .1, 0x7fe050, 1);
    if (u.rockets && u.isPlayer) fx.ringAt(u.x, u.z, u.range, 0xff6ad5, .15);
  }
  for (const m of G.minions) { if (m.stunT > 0) fx.orbAt(m.x, 1.2 + (m.airT > 0 ? .6 : 0), m.z, .1, 0xffe060, 1); else if (m.rootT > 0) fx.ringAt(m.x, m.z, .5, C.Lux, .8); }
  // aim indicator
  const pl = G.player;
  if (pl?.alive && P.aim && P.aim.drag) {
    const d = P.aim.slot === 4 ? FLASH : SK[pl.name][P.aim.slot], a = P.aim.pt; if (!a) return;
    const dx = a.x - pl.x, dz = a.z - pl.z, yaw = Math.atan2(dx, dz);
    if (d.range) fx.ringAt(pl.x, pl.z, Math.min(d.range, 14), 0xffffff, .25);
    if (d.kind === 'point' || d.kind === 'target') fx.ringAt(a.x, a.z, d.kind === 'target' ? 1 : 1.5, 0x9fe8ff, .9);
    else if (d.kind === 'dir') fx.beamAt(pl.x, .08, pl.z, yaw, Math.min(d.range || 4, 16), .5, .04, 0x9fe8ff, .5);
  }
}

/* ---------------- input ---------------- */
const P = { jx: 0, jz: 0, keys: {}, atkHeld: false, moveTo: null, clickT: null };
const joy = { id: null, cx: 0, cy: 0 };
const knob = $('joyKnob'), base = $('joyBase');
function joyStart(e) {
  const g = gameXY(e.clientX, e.clientY), [W] = viewSize();
  if (g.x > W * .45 || joy.id !== null) return false;
  joy.id = e.pointerId; const r = base.getBoundingClientRect(), c = gameXY(r.left + r.width / 2, r.top + r.height / 2);
  joy.cx = c.x; joy.cy = c.y; joyMove(e); return true;
}
function joyMove(e) {
  if (e.pointerId !== joy.id) return;
  const g = gameXY(e.clientX, e.clientY); let dx = g.x - joy.cx, dy = g.y - joy.cy; const d = Math.hypot(dx, dy), R = 50;
  if (d > R) { dx = dx / d * R; dy = dy / d * R; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; P.jx = dx / R; P.jz = dy / R; P.moveTo = null; P.clickT = null;
}
function joyEnd(e) { if (e.pointerId !== joy.id) return; joy.id = null; P.jx = P.jz = 0; knob.style.transform = ''; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function groundAt(cx, cy) {
  const g = gameXY(cx, cy), [W, H] = viewSize(); ndc.set(g.x / W * 2 - 1, -(g.y / H) * 2 + 1);
  ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit) ? hit : null;
}
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  if (e.pointerType === 'touch') { joyStart(e); return; }
  const p = groundAt(e.clientX, e.clientY); if (!p) return;
  let best = null, bd = 1.3 ** 2;
  for (const en of enemiesOf(G.player.team)) { const d = (en.x - p.x) ** 2 + (en.z - p.z) ** 2 - en.radius ** 2; if (d < bd) { bd = d; best = en; } }
  if (best) { P.clickT = best; P.moveTo = null; } else { P.moveTo = { x: p.x, z: p.z }; P.clickT = null; G.fxs.push({ x: p.x, z: p.z, y: .05, t: .35, col: 0x7dff9a, r: .5, ring: true }); }
});
addEventListener('pointermove', joyMove); addEventListener('pointerup', joyEnd); addEventListener('pointercancel', joyEnd);
canvas.addEventListener('contextmenu', e => e.preventDefault());
const bAtk = $('bAtk');
bAtk.addEventListener('pointerdown', e => { e.preventDefault(); P.atkHeld = true; bAtk.classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) bAtk.addEventListener(ev, () => { P.atkHeld = false; bAtk.classList.remove('on'); });
// skill buttons: tap = auto-cast (nearest enemy in range, else facing); drag from the button = aim
const SKB = ['sQ', 'sW', 'sE', 'sR', 'sF'];
function aimPoint(slot, dxs, dys) {
  const pl = G.player, d = slot === 4 ? FLASH : SK[pl.name][slot], len = Math.hypot(dxs, dys) || 1, f = Math.min(1, len / 70);
  const r = d.kind === 'point' || d.kind === 'target' ? Math.max(.5, f * (d.range || 4)) : (d.range || 4);
  return { x: pl.x + dxs / len * r, z: pl.z + dys / len * r }; // camera has no yaw: screen right = +x, screen down = +z
}
SKB.forEach((id, slot) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); if (G.state !== 'play') return;
    const g = gameXY(e.clientX, e.clientY); P.aim = { id: e.pointerId, slot, sx: g.x, sy: g.y, drag: false, pt: null };
    try { b.setPointerCapture(e.pointerId); } catch (er) {}
  });
  b.addEventListener('pointermove', e => {
    const A = P.aim; if (!A || A.id !== e.pointerId) return;
    const g = gameXY(e.clientX, e.clientY), dx = g.x - A.sx, dy = g.y - A.sy;
    if (Math.hypot(dx, dy) > 14) { A.drag = true; A.pt = aimPoint(slot, dx, dy); }
  });
  const up = e => {
    const A = P.aim; if (!A || A.id !== e.pointerId) return; P.aim = null;
    if (e.type === 'pointercancel') return;
    const g = gameXY(e.clientX, e.clientY), dx = g.x - A.sx, dy = g.y - A.sy;
    if (A.drag && Math.hypot(dx, dy) < 12) return; // dragged back onto the button = cancel
    castSlot(G.player, slot, A.drag ? aimPoint(slot, dx, dy) : null);
  };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
});
let mouseG = null;
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { const p = groundAt(e.clientX, e.clientY); mouseG = p ? { x: p.x, z: p.z } : null; } });
const KEY_SLOT = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3, KeyD: 4, KeyF: 4 };
addEventListener('keydown', e => {
  P.keys[e.code] = true; if (e.code === 'Space') P.atkHeld = true;
  if (KEY_SLOT[e.code] !== undefined && !e.repeat && G.state === 'play') castSlot(G.player, KEY_SLOT[e.code], mouseG);
});
addEventListener('keyup', e => { P.keys[e.code] = false; if (e.code === 'Space') P.atkHeld = false; });

function playerTick(u, dt) {
  let mx = P.jx, mz = P.jz;
  // QWER/D/F are skills now, so keyboard movement is arrows only (plus click-to-move)
  if (P.keys.ArrowUp) mz -= 1; if (P.keys.ArrowDown) mz += 1;
  if (P.keys.ArrowLeft) mx -= 1; if (P.keys.ArrowRight) mx += 1;
  const m = Math.hypot(mx, mz);
  if (m > .15) {
    P.moveTo = null; P.clickT = null; u.target = null;
    if (u.windT <= 0 && !cantMove(u)) { const k = Math.min(1, m) / m * msMul(u); u.x += mx * k * u.ms * dt; u.z += mz * k * u.ms * dt; u.yaw = Math.atan2(mx, mz); u.moving = true; }
    return;
  }
  if (P.clickT && P.clickT.alive && targetable(P.clickT)) { chaseAttack(u, P.clickT, dt); return; }
  P.clickT = null;
  if (P.moveTo) { if (!moveTo(u, P.moveTo.x, P.moveTo.z, dt, .15)) P.moveTo = null; return; }
  // attack button: acquire with a little chase (heroes first); idle: auto-attack whatever is in range
  if (P.atkHeld) {
    if (!u.target || !u.target.alive || !targetable(u.target)) u.target = nearestEnemy(u, u.range + 2.5, ['hero']) || nearestEnemy(u, u.range + 2.5, ['minion', 'struct']);
    if (u.target) chaseAttack(u, u.target, dt);
    return;
  }
  const t = (u.target && u.target.alive && inRange(u, u.target)) ? u.target : nearestEnemy(u, u.range + u.radius, null);
  u.target = t; if (t && inRange(u, t)) startAttack(u, t);
}

/* ---------------- HUD ---------------- */
let centerTO = 0;
function centerMsg(t, ms) { const c = $('center'); c.textContent = t; clearTimeout(centerTO); centerTO = setTimeout(() => c.textContent = '', ms); }
const CN = { Ahri: '阿狸', Ashe: '艾希', Ezreal: '伊泽', Garen: '盖伦', Jinx: '金克丝', Lux: '拉克丝', Sett: '瑟提', Teemo: '提莫', Yasuo: '亚索' };
function nm(e) { if (!e) return '?'; if (e.kind === 'hero') return (e.isPlayer ? '你' : CN[e.name]); return e.isStruct ? '防御塔' : '小兵'; }
function feed(src, t) {
  const d = document.createElement('div'); d.className = 'kf';
  d.innerHTML = `<span class="${src?.team === 0 ? 'b' : 'r'}">${nm(src)}</span> 击杀 <span class="${t.team === 0 ? 'b' : 'r'}">${nm(t)}</span>`;
  $('feed').prepend(d); setTimeout(() => d.classList.add('out'), 3500); setTimeout(() => d.remove(), 4200);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}
function endGame(winTeam) {
  if (G.state !== 'play') return; G.state = 'end'; G.winner = winTeam;
  const win = winTeam === G.player.team; $('endTxt').textContent = win ? '胜利' : '失败'; $('endTxt').style.color = win ? '#ffd45c' : '#ff7a7a';
  setTimeout(() => $('end').classList.remove('hidden'), 1200);
}
$('bAgain').addEventListener('click', () => location.reload());

/* ---------------- pick screen ---------------- */
const grid = $('heroGrid');
HERO_NAMES.forEach((n, i) => {
  const b = document.createElement('button'); b.disabled = true; b.dataset.n = n; b.style.backgroundPosition = `${i * 12.5}% 0`;
  b.innerHTML = `<span>${CN[n]}</span>`; b.addEventListener('click', () => startMatch(n)); grid.appendChild(b);
});
loadHeroes('./assets/heroes', (d, n) => { $('loadTxt').textContent = `加载英雄 ${d}/${n}`; })
  .then(() => { $('loadTxt').textContent = '点击头像开始'; for (const b of grid.children) b.disabled = false; window.__hq.ready = true; })
  .catch(e => { $('loadTxt').textContent = '加载失败：' + e.message; console.error(e); });

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startMatch(name, lineup) {
  if (G.state !== 'pick') return;
  makeStructs();
  const others = shuffle(HERO_NAMES.filter(n => n !== name));
  let blue = [name, ...others.slice(0, 4)], red = shuffle([...others.slice(4), ...others.slice(0, 4)]).slice(0, 5);
  if (lineup) { blue = [name, ...lineup.blue]; red = lineup.red; } // test hook
  blue.forEach((n, i) => { const e = spawnHero(n, 0, i, i === 0); if (i === 0) G.player = e; });
  red.forEach((n, i) => spawnHero(n, 1, i, false));
  $('mePort').style.backgroundPosition = `${HERO_NAMES.indexOf(name) * 12.5}% 0`;
  const row = HERO_NAMES.indexOf(name);
  const rim = '#' + STATS[name].col.toString(16).padStart(6, '0');
  SKB.forEach((id, i) => { const b = $(id); if (i < 4) b.style.setProperty('--rim', rim); b.style.backgroundPosition = i < 4 ? `${i * 25}% ${row * 100 / 9}%` : `0% 100%`; b.title = i < 4 ? SK[name][i].n : FLASH.n; });
  $('pick').classList.add('hidden'); $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden'); if (!isTouch) $('touch').classList.add('desk');
  G.state = 'play'; G.t = 0; G.nextWave = 3; centerMsg('欢迎来到 Q版大乱斗', 1800);
}

/* ---------------- main loop ---------------- */
const camT = new THREE.Vector3(0, 0, 0);
camera.position.set(0, 30, 30); camera.lookAt(0, 0, 0);
function separate() {
  const all = []; for (const e of G.heroes) if (e.alive) all.push(e); for (const e of G.minions) if (e.alive) all.push(e);
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j], r = (a.radius + b.radius) * .85, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), p = (r - d) / d * .5; a.x -= dx * p; a.z -= dz * p; b.x += dx * p; b.z += dz * p; }
    }
    for (const s of G.structs) {
      if (!s.alive) continue; const r = a.radius + s.radius, dx = a.x - s.x, dz = a.z - s.z, d2 = dx * dx + dz * dz;
      if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-3; a.x = s.x + dx / d * r; a.z = s.z + dz / d * r; }
    }
    clampLane(a);
  }
}
function step(dt) {
  G.t += dt;
  if (G.t >= G.nextWave) { queueWave(); G.nextWave += WAVE_EVERY; }
  for (let i = G.spawnQ.length - 1; i >= 0; i--) { const q = G.spawnQ[i]; if (G.t >= q.at) { spawnMinion(q.type, q.team, q.i); G.spawnQ.splice(i, 1); } }
  for (const u of G.heroes) {
    u.moving = false;
    if (!u.alive) { u.respawnT -= dt; if (u.respawnT <= 0) placeAtFountain(u); continue; }
    tickStatus(u, dt); if (!u.alive) continue;
    for (let i = 0; i < 4; i++) if (u.cd[i] > 0) u.cd[i] -= dt; if (u.fcd > 0) u.fcd -= dt;
    if (u.spinT > 0) { u.spinAcc += dt; if (u.spinAcc >= .5) { u.spinAcc -= .5; for (const e of foesIn(u.team, e => dist2(e, u) < (1.8 + e.radius) ** 2)) damage(e, 28, u); } }
    if (u.dash) stepDash(u, dt);
    else if (!(u.stunT > 0)) {
      tickAttack(u, dt);
      if (u.isPlayer) playerTick(u, dt); else { botSkills(u, dt); if (!u.dash) botThink(u, dt); }
    }
    // fountains: own heals, enemy burns
    const s = u.team === 0 ? -1 : 1;
    if ((u.x - s * FOUNTAIN_X) ** 2 + u.z * u.z < 36) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .15 * dt);
    if ((u.x + s * FOUNTAIN_X) ** 2 + u.z * u.z < 36) damage(u, 600 * dt, null);
  }
  for (const m of G.minions) { m.moving = false; if (!m.alive) continue; tickStatus(m, dt); if (!m.alive || m.stunT > 0) continue; tickAttack(m, dt); minionThink(m, dt); }
  G.minions = G.minions.filter(m => m.alive);
  for (const s of G.structs) if (s.alive && s.kind === 'tower') towerThink(s, dt);
  separate();
  updateBushes();
  updateRelics();
  stepSkills(dt);
  for (let i = G.proj.length - 1; i >= 0; i--) {
    const p = G.proj[i], t = p.t;
    if (!t.alive) { G.proj.splice(i, 1); continue; }
    if (G.walls.length && p.src.team !== undefined && blockedByWall(p.src.team, p.x, p.z, p.x + (t.x - p.x) * .2, p.z + (t.z - p.z) * .2) && Math.hypot(t.x - p.x, t.z - p.z) > .5) { G.proj.splice(i, 1); continue; }
    const ty = t.isStruct ? 1.5 : (t.kind === 'hero' ? .8 : .45), dx = t.x - p.x, dy = ty - p.y, dz = t.z - p.z, d = Math.hypot(dx, dy, dz), s = p.sp * dt;
    if (d <= s + .2) { damage(t, p.dmg, p.src); if (p.on) p.on(t, p); G.fxs.push({ x: t.x, z: t.z, y: ty, t: .2, col: p.col, r: p.r * 2.2 }); G.proj.splice(i, 1); }
    else { p.x += dx / d * s; p.y += dy / d * s; p.z += dz / d * s; }
  }
  for (let i = G.fxs.length - 1; i >= 0; i--) { G.fxs[i].t -= dt; if (G.fxs[i].t <= 0) G.fxs.splice(i, 1); }
}
function draw(dt) {
  const pl = G.player;
  if (pl) { camT.x += (Math.max(-46, Math.min(46, pl.x)) - camT.x) * Math.min(1, dt * 6); camT.z += (pl.z * .5 - camT.z) * Math.min(1, dt * 6); }
  const portrait = camera.aspect < 1.2;
  // closer ARAM-mobile framing: ~46° pitch, ~12.5 m from the hero (was 15.5 up / 10.5 back, ~56°) -> hero ≈ 1/8 screen height
  camera.position.set(camT.x, portrait ? 15 : 9, camT.z + (portrait ? 11 : 8.6)); camera.lookAt(camT.x, 0, camT.z - .9);
  blobs.begin(); bars.begin(camera); fx.begin(); minionR.begin();
  for (const u of G.heroes) {
    if (!u.alive) continue;
    u.airY = u.airT > 0 ? Math.sin(Math.PI * Math.min(1, 1 - u.airT / (u.airDur || 1))) * 1.1 : 0;
    const hidden = u.hid && pl && u.team !== pl.team; u.h.root.visible = !hidden; if (hidden) continue;
    u.h.root.position.set(u.x, u.airY, u.z); u.h.root.rotation.y = u.yaw;
    if (u.oneShot === undefined) u.oneShot = 0;
    if (u.h.oneShotT <= 0) u.h.play(u.moving ? 'run' : 'idle', u.moving ? 1.15 : 1);
    const far = Math.abs(u.x - camT.x) > 11;
    u.h.update(dt, far); u.h.setOutline(!far && QUALITY !== 'low');
    blobs.add(u.x, u.z, 1.3);
    const col = u.isPlayer ? 0x5be06a : (u.team === pl.team ? 0x4fb0ff : 0xff4b4b);
    bars.bar(u.x, u.h.height + .45, u.z, 1.2, .13, u.hp / u.maxHp, col);
  }
  for (const m of G.minions) {
    const y = m.moving ? Math.abs(Math.sin(G.t * 11 + m.bob)) * .08 : 0;
    minionR.add(m.type, m.team, m.x, y, m.z, m.yaw, m.type === 'siege' ? 1 : 1.1);
    blobs.add(m.x, m.z, m.type === 'siege' ? 1.4 : .8);
    bars.bar(m.x, m.type === 'siege' ? 1.5 : 1.3, m.z, .6, .07, m.hp / m.maxHp, m.team === pl?.team ? 0x4fb0ff : 0xff4b4b);
  }
  for (const s of G.structs) {
    if (!s.alive) continue;
    const h = { tower: 6.0, inhib: 3.5, nexus: 5.6 }[s.kind];
    bars.bar(s.x, h, s.z, 2, .18, s.hp / s.maxHp, targetable(s) ? (s.team === pl?.team ? 0x4fb0ff : 0xff4b4b) : 0x8a8a8a);
    if (s.kind === 'tower' && s.target && s.target.alive) fx.ringAt(s.x, s.z, TOWER.range, s.team === 0 ? 0x3d8bff : 0xff4b4b, .25);
  }
  for (const p of G.proj) fx.orbAt(p.x, p.y, p.z, p.r, p.col, 1);
  drawSkills();
  for (const f of G.fxs) { if (f.ring) fx.ringAt(f.x, f.z, f.r * (1.4 - f.t), f.col, f.t * 2.5); else fx.orbAt(f.x, f.y, f.z, f.r * (1.2 - f.t * 2), f.col, f.t * 4); }
  tickBushes(bushObjs, G, pl, dt);
  // health relics: bobbing orb when ready, faint pad while recharging
  for (const r of relicObjs) { const on = G.t >= r.ready; r.m.orb.visible = on; r.m.orb.position.y = .75 + Math.sin(G.t * 2.4 + r.x) * .12; r.m.orb.rotation.y = G.t * 1.2; r.m.pad.material.opacity = on ? .55 : .12; }
  if (pl?.alive) { fx.ringAt(pl.x, pl.z, .75, 0x5be06a, .8); if (P.clickT?.alive) fx.ringAt(P.clickT.x, P.clickT.z, P.clickT.radius + .3, 0xff4b4b, .8); }
  blobs.end(); bars.end(); fx.end(); minionR.end();
  renderer.render(scene, camera);
  if (minimap && G.state !== 'pick') minimap.tick(dt);
}
function hudTick() {
  const pl = G.player; if (!pl) return;
  $('kB').textContent = G.kills[0]; $('kR').textContent = G.kills[1];
  const s = G.t | 0; $('clock').textContent = `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('meHp').textContent = pl.alive ? `${Math.ceil(pl.hp)} / ${pl.maxHp}` : `复活 ${Math.ceil(pl.respawnT)}s`;
  $('meFill').style.width = (pl.hp / pl.maxHp * 100) + '%';
  SKB.forEach((id, i) => {
    const b = $(id), cd = i < 4 ? pl.cd[i] : pl.fcd, max = i < 4 ? SK[pl.name][i].cd : FLASH.cd, on = cd > 0;
    b.style.setProperty('--p', on ? (cd / max).toFixed(3) : 0); b.classList.toggle('cd', on); b.classList.toggle('lock', !pl.alive || pl.silenceT > 0 || pl.stunT > 0);
    b.dataset.t = on ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
  });
}
const minimap = createMinimap({ canvas: $('mm'), G, camera, heroNames: HERO_NAMES }); window.__hq.minimap = minimap;
let last = performance.now(), fpsN = 0, fpsT = 0, hudT = 0;
window.__hq.castSlot = castSlot; window.__hq.SK = SK;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.state === 'play') step(dt);
  else if (G.state === 'end') { for (const u of G.heroes) if (u.alive && u.windT > 0) tickAttack(u, dt); }
  draw(dt);
  window.__hq.info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  fpsN++; fpsT += dt; if (fpsT >= .5) { const f = fpsN / fpsT; $('fps').textContent = `${f.toFixed(0)} FPS · ${renderer.info.render.calls} dc`; window.__hq.fps = f; fpsN = 0; fpsT = 0; }
  hudT += dt; if (hudT > .15) { hudT = 0; hudTick(); }
}
requestAnimationFrame(loop);
window.__hq.startMatch = startMatch; window.__hq.step = step; window.__hq.P = P;
