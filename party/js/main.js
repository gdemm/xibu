// 派对突击 (party build of 货轮突击) - main: renderer, match flow, player, input, settings
import * as THREE from 'three';
import { buildMap, moveEntity } from './map.js';
import { buildIsland } from './island.js';
import { WEAPONS, ORDER, buildViewmodels, MUZZLE } from './weapons.js';
import { createBotMesh, updateBot, eyeOf } from './bots.js';
import { animateDeath, resetSoldier, animateSoldier, soldierTris, createSoldier, soldierHit } from './critter.js';
import { toonRamp } from './critter.js';
import { lobbyChars } from './lobbychars.js';
import { playerJump, airStep, updateDrop } from './drop.js';
import { partyLook, toonify } from './party.js';
import { spawnVehicles, driveVehicle, flyVehicle, poseVehicle, inFootprint, vehicleBox, exitSpot } from './vehicles.js';
import { sfx, unlockAudio } from './audio.js';
import * as HUD from './hud.js';
import { initArrows, clearArrows, shootArrow, updateArrows } from './bow.js';
import { setupBR, updateBR, brKilled, brResult, brBoardHTML, brGoal, cleanup as brCleanup, GEAR_RED, bagCap, gearName, dropBagItem } from './br.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------------- forced landscape fallback + HUD layout ----------------
let forceLandOn = false;
const forceLandPortrait = () => forceLandOn && innerHeight > innerWidth;
const viewSize = () => forceLandPortrait() ? [innerHeight, innerWidth] : [innerWidth, innerHeight];
const gameXY = (cx, cy) => forceLandPortrait() ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy };
const isUI = (t) => !!(t?.closest?.('#lobby,#settings,#topBtns,#rotateHint') || t?.closest?.('button'));
function setForceLand(on) {
  forceLandOn = !!on;
  document.body.classList.toggle('forceLand', forceLandOn);
  try { forceLandOn ? localStorage.setItem('party_forceLand', '1') : localStorage.removeItem('party_forceLand'); } catch (e) {}
  onResize(); syncFullBtns();
  HUD.centerMsg(forceLandOn ? '已切换横屏' : '已恢复竖屏', 1200);
}
try { forceLandOn = localStorage.getItem('party_forceLand') === '1'; if (forceLandOn) document.body.classList.add('forceLand'); } catch (e) {}
let HUDL = {};
try { HUDL = JSON.parse(localStorage.getItem('party_hud_layout') || '{}') || {}; } catch (e) {}
let hudEdit = false;

// ---------------- settings ----------------
const DEF = { quality: isTouch ? 'mid' : 'high', fps: 60, sens: 1, showFps: 0, tp: 1 };
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem('partyfps.settings') || '{}') }; } catch (e) {}
const saveS = () => { try { localStorage.setItem('partyfps.settings', JSON.stringify(S)); } catch (e) {} };

// ---------------- renderer ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
function applyPixelRatio() {
  const cap = isTouch ? { low: 1, mid: 1.25, high: 1.5 }[S.quality] : { low: 1, mid: 1.5, high: 2 }[S.quality];
  const [W, H] = viewSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.setSize(W, H, false);
}
const scene = new THREE.Scene();
let baseFov = 75;
function updateBaseFov() {
  const [W, H] = viewSize(), aspect = W / H;
  baseFov = Math.min(75, 2 * Math.atan(Math.tan(50 * Math.PI / 180) / aspect) * 180 / Math.PI);
}
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 520);
camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.2); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const VM = buildViewmodels();
for (const k of ORDER) vmRoot.add(VM.models[k]);
function onResize() { applyPixelRatio(); const [W, H] = viewSize(); camera.aspect = vmCamera.aspect = W / H; updateBaseFov(); camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix(); applyHudLayout(); }
addEventListener('resize', onResize); onResize();

// ---------------- game state ----------------
const BLUE_NAMES = ['阿杰', '小林', '老周', '石头', '阿飞'];
const RED_NAMES = ['老K', '铁牙', '阿狼', '火锅', '刀疤'];
const G = window.__game = {
  state: 'lobby', entities: [], bots: [], player: null, scores: { blue: 0, red: 0 }, timeLeft: 600, now: 0,
  diff: 'normal', target: 30, map: null, weapon: WEAPONS.rifle, ammo: {}, reloading: false, fps: 0, opts: null,
  bag: [], bagLv: 0, bagMsgT: 0,
};
let builtQuality = null;
let BRH = null; // battle-royale helpers, filled after functions are defined
const tracers = [];

function buildWorld(kind = 'ship') {
  // clear old world
  for (let i = scene.children.length - 1; i >= 0; i--) { const o = scene.children[i]; scene.remove(o); o.traverse?.(c => { c.geometry?.dispose?.(); }); }
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8a7a5a, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4dc, 2.0); sun.position.set(-40, 60, 25); scene.add(sun);
  G.map = kind === 'island' ? buildIsland(scene, S.quality) : buildMap(scene, S.quality);
  builtQuality = S.quality + kind;
  scene.fog = new THREE.Fog(0xbfe6ff, 45, { low: 140, mid: 190, high: 260 }[S.quality]);
  G.sky = partyLook(scene, S.quality, kind);
  tracers.length = 0;
  const tm = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, tm.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 });
  }
  sparks.length = 0;
  const sg = new THREE.PlaneGeometry(0.25, 0.25);
  initArrows(scene);
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); sparks.push({ m, t: 0 }); }
}
const sparks = [];
let tracerI = 0, sparkI = 0;
function addTracer(a, b) {
  const tr = tracers[tracerI++ % tracers.length]; if (!tr) return;
  const p = tr.l.geometry.attributes.position.array; p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
  tr.l.geometry.attributes.position.needsUpdate = true; tr.l.visible = true; tr.t = 0.07; tr.l.material.opacity = 0.9;
}
function addSpark(p, color = 0xffd080) {
  const s = sparks[sparkI++ % sparks.length]; if (!s) return;
  s.m.position.copy(p); s.m.material.color.setHex(color); s.m.visible = true; s.t = 0.12; s.m.scale.setScalar(1); s.m.lookAt(camera.position);
}

function makeEntity(name, team, isPlayer) {
  return {
    name, team, isPlayer, hp: 100, alive: false, kills: 0, deaths: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, crouch: false, onGround: true, lastFired: -9, respawnAt: 0, protectUntil: 0, lastHurt: -9, lastAttacker: null,
  };
}
function makeBot(name, team, skin) {
  const b = makeEntity(name, team, false);
  Object.assign(b, {
    mesh: createBotMesh(skin || team), thinkT: Math.random() * 0.3, path: null, pathI: 0, target: null, reactT: 0, lastSeen: new THREE.Vector3(), lostT: 0,
    aiState: 'patrol', coverUntil: 0, nextCoverOK: 0, strafeT: 0, strafeDir: 1, crouchFire: false, nextShot: 0, burstLeft: 4, shotsFired: 0,
    lastProgPos: new THREE.Vector3(), stuckT: 0, anim: 0, deadT: 0,
  });
  scene.add(b.mesh); return b;
}

function respawn(e) {
  const enemies = G.entities.filter(o => o.alive && o.team !== e.team);
  const list = G.map.spawns[e.team].slice().sort(() => Math.random() - 0.5);
  let sp = list[0];
  for (const p of list) { if (!enemies.some(o => o.pos.distanceTo(p) < 12) && !G.entities.some(o => o !== e && o.alive && o.pos.distanceTo(p) < 1.2)) { sp = p; break; } }
  e.pos.copy(sp); e.pos.x += (Math.random() - 0.5) * 0.6; e.vel.set(0, 0, 0);
  e.hp = 100; e.alive = true; e.crouch = false; e.onGround = true; e.protectUntil = G.now + 1.5;
  e.yaw = e.team === 'blue' ? -Math.PI / 2 : Math.PI / 2; e.pitch = 0;
  if (e.isPlayer) {
    for (const k of ORDER) G.ammo[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    setWeapon('rifle', true); G.reloading = false; P.scoped = false; P.recoil = 0; if (P.body) resetSoldier(P.body);
    $('deathScr').classList.add('hidden');
  } else {
    resetSoldier(e.mesh); e.mesh.visible = true; e.mesh.rotation.set(0, e.yaw, 0); e.mesh.position.copy(e.pos);
    e.aiState = 'patrol'; e.path = null; e.target = null; e.burstLeft = 4; e.lastSeen.copy(e.pos);
  }
}

function startMatch(opts) {
  G.paused = false; closeBag(); $('settings').classList.add('hidden');
  opts = { team: 'blue', size: 5, target: 30, diff: 'normal', ...(opts || {}) };
  G.opts = opts;
  const mapKind = opts.mode === 'br' && opts.brMap !== 'ship' ? 'island' : 'ship';
  if (!G.map || builtQuality !== S.quality + mapKind) buildWorld(mapKind);
  const mmEl = $('minimap'); if (mapKind === 'island') { mmEl.width = mmEl.height = 300; mmEl.classList.add('sq'); } else { mmEl.width = 400; mmEl.height = 104; mmEl.classList.remove('sq'); }
  document.body.classList.toggle('brIsland', mapKind === 'island');
  for (const b of G.bots) scene.remove(b.mesh);
  brCleanup(G, scene);
  for (const v of G.vehicles || []) scene.remove(v.mesh);
  G.vehicles = opts.mode === 'br' ? spawnVehicles(scene, G.map) : [];
  for (const v of G.vehicles) toonify(v.mesh);
  P.inCar = null; if (P.body) { scene.remove(P.body); P.body = null; }
  G.mode = opts.mode || 'tdm'; G.owned = null; P.runLock = false; P.sprint = false; G.scope = 0; P.draw = 0; clearArrows();
  G.quality = S.quality; VM.setTeam(opts.mode === 'br' ? 'blue' : opts.team);
  if (G.mode === 'br') {
    G.diff = opts.diff; G.scores = { blue: 0, red: 0 }; G.now = G.now || 0;
    setupBR(G, scene, BRH);
    makeBody();
    $('target').textContent = '';
    $('lobby').classList.add('hidden'); $('endScr').classList.add('hidden'); $('scoreboard').classList.add('hidden'); $('deathScr').classList.add('hidden');
    $('hud').classList.remove('hidden'); $('topBtns').classList.remove('hidden'); $('touch').classList.toggle('hidden', !isTouch);
    document.body.classList.add('br');
    G.state = 'playing';
    HUD.centerMsg(G.drop ? '派对开始！点「跳伞」选择落点' : '派对吃鸡 · 搜集物资，活到最后', 2600);
    return;
  }
  document.body.classList.remove('br');
  G.diff = opts.diff; G.target = +opts.target; G.scores = { blue: 0, red: 0 }; G.timeLeft = 600;
  const p = makeEntity('你', opts.team, true); G.player = p;
  const bots = [];
  const mine = opts.team === 'blue' ? BLUE_NAMES : RED_NAMES, theirs = opts.team === 'blue' ? RED_NAMES : BLUE_NAMES;
  const tagMine = opts.team === 'blue' ? '海鹰-' : '赤鲨-', tagTheirs = opts.team === 'blue' ? '赤鲨-' : '海鹰-';
  const enemyTeam = opts.team === 'blue' ? 'red' : 'blue';
  for (let i = 0; i < opts.size - 1; i++) bots.push(makeBot(tagMine + mine[i], opts.team));
  for (let i = 0; i < opts.size; i++) bots.push(makeBot(tagTheirs + theirs[i], enemyTeam));
  G.bots = bots; G.entities = [p, ...bots];
  for (const t of ['blue', 'red']) { const tb = bots.filter(b => b.team === t); if (tb.length >= 2) tb[1].gun = 'bow'; }   // one archer per team
  for (const e of G.entities) respawn(e);
  makeBody();
  $('target').textContent = `目标 ${G.target} 击杀`;
  $('lobby').classList.add('hidden'); $('endScr').classList.add('hidden'); $('scoreboard').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('topBtns').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  G.state = 'playing';
  HUD.centerMsg(`团队死斗 · 先达到 ${G.target} 击杀获胜`, 2200);
}
G.startMatch = startMatch;

function endMatch() {
  if (G.state !== 'playing') return;
  G.state = 'ended'; P.firing = false; P.scoped = false; closeBag();
  if (document.pointerLockElement) document.exitPointerLock();
  if (G.mode === 'br') {
    const r = brResult(G); const t = $('endTitle'); t.textContent = r.title; t.className = r.win ? 'win' : 'lose';
    $('endBoard').innerHTML = brBoardHTML(G, ''); $('deathScr').classList.add('hidden');
    $('endScr').classList.remove('hidden'); $('touch').classList.add('hidden'); $('scope').style.display = 'none'; return;
  }
  const my = G.player.team, other = my === 'blue' ? 'red' : 'blue';
  const res = G.scores[my] > G.scores[other] ? 'win' : G.scores[my] < G.scores[other] ? 'lose' : 'draw';
  const t = $('endTitle'); t.textContent = { win: '胜 利', lose: '失 败', draw: '平 局' }[res]; t.className = res === 'win' ? 'win' : 'lose';
  HUD.updateHud(G);
  $('endBoard').innerHTML = HUD.scoreboardHTML(G, '');
  $('endScr').classList.remove('hidden'); $('touch').classList.add('hidden'); $('scope').style.display = 'none';
}

// ---------------- combat ----------------
const _ray = new THREE.Ray(), _hv = new THREE.Vector3();
const _body = new THREE.Box3(), _head = new THREE.Box3();
function hitBoxes(e) {
  // matches the drawn KayKit character (critter.js, measured): neck at 0.92 m (crouch 0.72), head ~0.80 m tall (crouch 0.84), ~0.8 m wide
  const top = e.crouch ? 0.72 : 0.92, hh = e.crouch ? 0.84 : 0.80, hw = 0.4;
  _body.min.set(e.pos.x - 0.36, e.pos.y, e.pos.z - 0.36); _body.max.set(e.pos.x + 0.36, e.pos.y + top, e.pos.z + 0.36);
  _head.min.set(e.pos.x - hw, e.pos.y + top, e.pos.z - hw); _head.max.set(e.pos.x + hw, e.pos.y + top + hh, e.pos.z + hw);
}
G.fire = function (shooter, origin, dir, weaponId, dmgScale = 1, muzzle) {
  const w = WEAPONS[weaponId];
  const worldD = G.map.rayWorld(origin, dir, w.range);
  _ray.set(origin, dir);
  let best = null, bd = worldD, head = false;
  for (const e of G.entities) {
    if (e === shooter || !e.alive || e.team === shooter.team || e.air) continue;
    hitBoxes(e);
    let h = _ray.intersectBox(_head, _hv); if (h) { const d = h.distanceTo(origin); if (d < bd) { bd = d; best = e; head = true; } }
    h = _ray.intersectBox(_body, _hv); if (h) { const d = h.distanceTo(origin); if (d < bd - 0.001 || (best === e && d < bd + 0.05 && !head)) { if (d < bd) { bd = d; best = e; head = false; } } }
  }
  const end = origin.clone().addScaledVector(dir, bd);
  if (!w.melee) {
    addTracer(muzzle || origin.clone().addScaledVector(dir, 0.6), end);
    if (best) addSpark(end, 0xff4a3a); else if (bd < w.range) addSpark(end);
  }
  shooter.lastFired = G.now;
  const vol = shooter.isPlayer ? 1 : Math.max(0.05, 1 - origin.distanceTo(camera.position) / 70) * 0.6;
  sfx.shot(weaponId, vol);
  if (best) damage(best, w.dmg * (head ? w.head : 1) * dmgScale * (1 - (GEAR_RED[(head ? best.helmet : best.armor) | 0] || 0)), shooter, w, head);
  return { hit: best, head, point: end };
};

// segment test for projectiles (arrows): world + enemy hit boxes, distance along dir up to len
G.traceSeg = function (shooter, origin, dir, len) {
  let bd = G.map.rayWorld(origin, dir, len), best = null, head = false;
  _ray.set(origin, dir);
  for (const e of G.entities) {
    if (e === shooter || !e.alive || e.team === shooter.team || e.air) continue;
    hitBoxes(e);
    let h = _ray.intersectBox(_head, _hv); if (h) { const d = h.distanceTo(origin); if (d < bd) { bd = d; best = e; head = true; } }
    h = _ray.intersectBox(_body, _hv); if (h) { const d = h.distanceTo(origin); if (d < bd) { bd = d; best = e; head = false; } }
  }
  return { d: bd, ent: best, head };
};
const ARROW_H = {
  trace: (s, o, d, l) => G.traceSeg(s, o, d, l),
  hit(ent, head, dmg, shooter, point) {
    addSpark(point, 0xff4a3a); sfx.thunk(Math.max(0.1, 1 - point.distanceTo(camera.position) / 50));
    const red = GEAR_RED[(head ? ent.helmet : ent.armor) | 0] || 0;
    damage(ent, dmg * (head ? WEAPONS.bow.head : 1) * (1 - red), shooter, WEAPONS.bow, head);
    G.arrowHits = (G.arrowHits || 0) + 1;
  },
  miss(point) { addSpark(point, 0xd9c79a); sfx.thunk(Math.max(0.05, 1 - point.distanceTo(camera.position) / 40) * 0.6); },
};
G.shootArrow = (shooter, origin, dir, k, dmgScale) => {
  const vol = shooter.isPlayer ? 1 : Math.max(0.03, 1 - origin.distanceTo(camera.position) / 40) * 0.6;
  sfx.twang(vol); return shootArrow(shooter, origin, dir, k, dmgScale);
};
function damage(t, amount, attacker, w, head, zone) {
  if (!t.alive || G.state !== 'playing' || (!zone && G.now < t.protectUntil)) return;
  t.hp -= amount; t.lastHurt = G.now; t.lastAttacker = attacker;
  if (!zone && amount > 0) { const m = t.isPlayer ? P.body : t.mesh; if (m && m.visible) soldierHit(m); }
  if (t.isPlayer) { $('dmg').style.opacity = 1; setTimeout(() => $('dmg').style.opacity = 0, 140); sfx.hurt(); }
  if (attacker.isPlayer && t.hp > 0 && !zone) { HUD.hitMarker(head ? 'head' : 'hit'); head ? sfx.head() : sfx.hit(); }
  if (!t.isPlayer && attacker !== t && t.alive && !zone) { t.lastSeen.copy(attacker.pos); }
  if (t.hp <= 0) kill(t, attacker, w, head);
}
function kill(t, attacker, w, head) {
  t.alive = false; t.hp = 0; t.deaths++; attacker.kills++; if (G.mode !== 'br') G.scores[attacker.team]++;
  t.respawnAt = G.mode === 'br' ? Infinity : G.now + 3; t.deadT = G.now;
  HUD.killFeed(attacker, t, w.name, head);
  if (t.isPlayer) {
    if (P.inCar) leaveCar(true);
    P.firing = false; P.scoped = false; G.reloading = false; P.draw = 0; closeBag();
    $('deathBy').textContent = attacker.team === 'zone' ? '你倒在了安全区外' : `击败你的是 ${attacker.name}${head ? '（爆头）' : ''}`; $('deathScr').classList.remove('hidden');
  }
  if (attacker.isPlayer) { HUD.hitMarker('kill'); sfx.kill(); HUD.centerMsg(head ? `爆头！击杀 ${t.name}` : `击杀 ${t.name}`, 1100); }
  if (G.mode === 'br') { brKilled(G, t, BRH); return; }
  if (G.scores[attacker.team] >= G.target) endMatch();
}
BRH = {
  makeEntity, makeBot: (n, t, skin) => makeBot(n, t, skin), setWeapon, HUD, WEAPONS, sfx, $, endMatch,
  damage: (t, a, att, w, head, zone) => damage(t, a, att, w, head, zone), scene,
  resetBot: (e) => { resetSoldier(e.mesh); e.mesh.visible = true; e.mesh.rotation.set(0, e.yaw, 0); e.mesh.position.copy(e.pos); e.aiState = 'patrol'; e.path = null; e.target = null; e.burstLeft = 4; e.lastSeen.copy(e.pos); },
};
G.brGoal = brGoal;
const DROPH = { HUD, animate: (m, dt, o) => animateSoldier(m, dt, o) };
G.debugKillBot = function () {
  if (G.state !== 'playing') return null;
  const enemy = G.player.team === 'blue' ? 'red' : 'blue';
  let b = G.bots.find(x => x.team === enemy && x.alive);
  if (G.mode === 'br') b = G.bots.find(x => x.alive);
  if (!b) { if (G.mode === 'br') return null; b = G.bots.find(x => x.team === enemy); respawn(b); }
  b.protectUntil = 0; kill(b, G.player, WEAPONS.rifle, true);
  return b.name;
};

// ---------------- third person & vehicles ----------------
G.solidsNear = (pos) => {
  const base = G.map.near ? G.map.near(pos) : G.map.solids;
  if (!G.vehicles?.length) return base;
  const out = base.slice(); for (const v of G.vehicles) if (v !== P.inCar && Math.abs(v.pos.x - pos.x) < 14 && Math.abs(v.pos.z - pos.z) < 14) out.push(vehicleBox(v));
  return out;
};
const thirdPerson = () => !!P.inCar || !!G.player?.air || (S.tp && !P.scoped);
function makeBody() { if (P.body) scene.remove(P.body); P.body = createSoldier(G.mode === 'br' ? 'player' : G.player.team); P.body.visible = false; scene.add(P.body); $('bView')?.classList.toggle('on', !!S.tp); }
function poseBody(dt, mx, mz, speed, seated) {
  const b = P.body; if (!b) return;
  b.visible = G.player.alive && thirdPerson() && !(P.inCar && (P.inCar.type === 'bus' || P.inCar.type === 'truck'));
  if (!b.visible) return;
  b.position.copy(G.player.pos); b.rotation.set(0, G.player.yaw, 0);
  if (seated) { const v = P.inCar; b.rotation.set(0, v.yaw, v.lean, 'YXZ'); b.position.y += { jeep: 0.55, moto: 0.45, bike: 0.5 }[v.type] || 0.5; if (v.type === 'jeep') { b.position.x += Math.cos(v.yaw) * -0.45; b.position.z += -Math.sin(v.yaw) * -0.45; } }
  animateSoldier(b, dt, { moveX: seated ? 0 : mx, moveZ: seated ? 0 : mz, speed, yaw: b.rotation.y, crouch: !!seated || G.player.crouch, aim: !seated, seat: !!seated, bow: !!G.weapon.bow, draw: P.draw, nocked: G.ammo.bow?.mag > 0, pitch: G.player.pitch * 0.6, ground: seated ? true : G.player.onGround, vy: G.player.vel.y, reload: G.reloading ? 1 - Math.max(0, G.reloadEnd - G.now) / G.weapon.reload : -1 });
}
const _cd = new THREE.Vector3(), _cp = new THREE.Vector3();
function chaseCam(x, y, z, dist, side, up) {
  const p = G.player; _q.set(p.pitch, p.yaw, 0);
  _cp.set(x, y + up, z);
  const right = new THREE.Vector3(1, 0, 0).applyEuler(_q); _cp.addScaledVector(right, side);
  _cd.set(0, 0, 1).applyEuler(_q);
  const d = Math.min(dist, G.map.rayWorld(_cp, _cd, dist + 0.4) - 0.35);
  camera.position.copy(_cp).addScaledVector(_cd, Math.max(0.4, d)); if (camera.position.y < 0.3) camera.position.y = 0.3;
  camera.rotation.set(p.pitch, p.yaw, 0);
}
function nearestCar() {
  const p = G.player; let best = null, bd = 1e9;
  for (const v of G.vehicles || []) { if (v.driver) continue; if (!inFootprint(v, p.pos.x, p.pos.z, 2.2)) continue; const d = v.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = v; } }
  return best;
}
function toggleCar() {
  if (G.state !== 'playing' || !G.player?.alive) return;
  if (P.inCar) { leaveCar(); return; }
  const v = nearestCar(); if (!v) return;
  P.inCar = v; v.driver = G.player; P.scoped = false; P.firing = false; G.reloading = false; G.player.crouch = false;
  G.player.yaw = v.yaw; G.player.pitch = -0.18; HUD.centerMsg(v.T.name + (v.T.fly ? ' · 按住「升」「降」控制高度，摇杆前进转向' : ' · 摇杆前后油门刹车，左右转向'), 2000);
}
function leaveCar(force) {
  const v = P.inCar; if (!v) return;
  if (force && v.T.fly) { v.alt = 0; v.speed = 0; poseVehicle(v, 0); }
  if (v.T.fly && (v.alt || 0) > 2.5) { HUD.centerMsg('太高了，先降落再下机', 1200); return; }
  P.inCar = null; v.driver = null; P.liftUp = P.liftDown = false;
  const fr = (x, z) => G.solidsNear({ x, z }).every(b => !(x + 0.5 > b.min.x && x - 0.5 < b.max.x && z + 0.5 > b.min.z && z - 0.5 < b.max.z && b.max.y > 0.3)) && !inFootprint(v, x, z, 0.5);
  G.player.pos.copy(exitSpot(v, fr)); G.player.vel.set(0, 0, 0);
}
function toggleView() { S.tp = S.tp ? 0 : 1; saveS(); const b = $('bView'); if (b) b.classList.toggle('on', !!S.tp); HUD.centerMsg(S.tp ? '第三人称' : '第一人称', 800); }
function updateCarButton() {
  const b = $('bCar'); if (!b) return;
  const show = G.player?.alive && !G.player.air && (P.inCar || nearestCar());
  b.classList.toggle('hidden', !show); if (show) b.textContent = P.inCar ? '下车' : '上车';
  const hint = $('carHint'); if (hint) { hint.classList.toggle('hidden', !show || isTouch); if (show) hint.textContent = (P.inCar ? 'F 下车' : 'F 上车 ' + nearestCar()?.T.name); }
  document.body.classList.toggle('driving', !!P.inCar); document.body.classList.toggle('heli', !!P.inCar?.T.fly);
}
function updateDriving(dt) {
  const p = G.player, v = P.inCar;
  const thr = Math.max(-1, Math.min(1, -P.joyY + (P.keys.KeyW ? 1 : 0) - (P.keys.KeyS ? 1 : 0)));
  const st = Math.max(-1, Math.min(1, P.joyX + (P.keys.KeyD ? 1 : 0) - (P.keys.KeyA ? 1 : 0)));
  const prevYaw = v.yaw;
  const lift = (P.liftUp || P.keys.Space ? 1 : 0) - (P.liftDown || P.keys.KeyC ? 1 : 0);
  const hit = v.T.fly ? flyVehicle(v, dt, Math.abs(thr) > 0.15 ? thr : 0, Math.abs(st) > 0.1 ? st : 0, lift, G.map) : driveVehicle(v, dt, Math.abs(thr) > 0.15 ? thr : 0, Math.abs(st) > 0.1 ? st : 0, G.map, G.vehicles);
  if (hit > 12) damage(p, (hit - 12) * 3, p, { name: '撞车' }, false, true);
  p.yaw += v.yaw - prevYaw; // camera follows the turn
  p.pos.set(v.pos.x, v.alt || 0, v.pos.z); p.vel.set(0, 0, 0); p.onGround = true; p.moving = Math.abs(v.speed) > 0.5;
  // run over
  if (!v.T.fly && Math.abs(v.speed) > 4) for (const e of G.entities) {
    if (e === p || !e.alive || G.now < (e.carHitT || 0)) continue;
    if (!inFootprint(v, e.pos.x, e.pos.z, 0.45)) continue;
    e.carHitT = G.now + 0.6; damage(e, Math.abs(v.speed) * 6 * v.T.hitK, p, { name: v.T.name }, false);
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw); e.pos.x += fx * 1.5; e.pos.z += fz * 1.5; e.vel.y = 4;
  }
  poseVehicle(v, dt);
  chaseCam(v.pos.x, (v.alt || 0) + v.T.seatY, v.pos.z, v.T.cam, 0, 0.6);
  poseBody(dt, 0, 0, 0, true);
  $('scope').style.display = 'none'; $('cross').style.display = 'none';
  if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
  const kmh = Math.round(Math.abs(v.speed) * 3.6); const sp = $('speedo'); if (sp) sp.textContent = kmh + ' km/h' + (v.T.fly ? ' · 高度 ' + Math.round(v.alt || 0) + ' m' : '');
}

// ---------------- plane / parachute (player) ----------------
function updateAir(dt) {
  const p = G.player; P.scoped = false; P.firing = false;
  $('scope').style.display = 'none'; $('cross').style.display = 'none';
  if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
  if (p.air === 'plane') {
    const D = G.drop; _q.set(Math.min(0.2, p.pitch), p.yaw, 0); _cd.set(0, 0, 1).applyEuler(_q);
    camera.position.copy(D.pos).addScaledVector(_cd, 26).y += 6; camera.rotation.set(Math.min(0.2, p.pitch) - 0.12, p.yaw, 0);
    if (P.body) P.body.visible = false;
  } else {
    let fx = 0, fz = 0;
    if (P.keys.KeyW || P.keys.ArrowUp) fz += 1; if (P.keys.KeyS || P.keys.ArrowDown) fz -= 1; if (P.keys.KeyD || P.keys.ArrowRight) fx += 1; if (P.keys.KeyA || P.keys.ArrowLeft) fx -= 1;
    fx += P.joyX; fz += -P.joyY; const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const res = airStep(G, p, dt, -sy * fz + cy * fx, -cy * fz - sy * fx);
    _q.set(p.pitch, p.yaw, 0); _cd.set(0, 0, 1).applyEuler(_q);
    const dist = p.air === 'fall' ? 5.5 : 7;
    camera.position.set(p.pos.x, p.pos.y + 1.4, p.pos.z).addScaledVector(_cd, dist); camera.position.y += 1.2; camera.rotation.set(p.pitch - 0.1, p.yaw, 0);
    if (P.body) { P.body.visible = true; P.body.position.copy(p.pos); P.body.rotation.set(0, p.yaw, 0); animateSoldier(P.body, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: p.yaw, crouch: false, aim: false, pitch: 0, reload: -1, air: p.air }); }
    if (res === 'landed') { HUD.centerMsg('成功着陆！快去找装备', 1400); p.moving = false; }
  }
  const sp = $('speedo'); if (sp) sp.textContent = p.air === 'plane' ? '飞行中 · 选择跳伞点' : `高度 ${Math.max(0, Math.round(p.pos.y))} m` + (p.air === 'fall' ? ' · 自动开伞 30m' : '');
}
function ejectOrOpen() {
  if (G.state !== 'playing' || !G.player?.air) return false;
  const r = playerJump(G, scene); if (r === 'jump') { HUD.centerMsg('跳伞！摇杆控制方向', 1200); G.player.yaw = G.drop.yaw; G.player.pitch = -0.5; }
  return true;
}
function updateAirButton() {
  const p = G.player, b = $('bEject'); const air = !!(p?.alive && p.air);
  document.body.classList.toggle('air', air);
  if (!b) return;
  b.classList.toggle('hidden', !(air && p.air !== 'chute')); if (air) b.textContent = p.air === 'plane' ? '跳伞' : '开伞';
  const hint = $('carHint'); if (hint && air && !isTouch) { hint.classList.toggle('hidden', p.air === 'chute'); hint.textContent = p.air === 'plane' ? 'F 跳伞' : 'F 开伞'; }
}

// ---------------- player ----------------
const VMB = G.VMB = { rifle: [0.2, -0.21, -0.52, 0.05], sniper: [0.2, -0.2, -0.5, 0.05], pistol: [0.15, -0.16, -0.42, 0.04], knife: [0.2, -0.19, -0.42, 0.12], bow: [0, 0, 0, 0] };
const P = { firing: false, fireLatch: false, scoped: false, recoil: 0, nextShot: 0, jumpQ: false, lookX: 0, lookY: 0, joyX: 0, joyY: 0, keys: {}, bob: 0, eye: 1.6, kick: 0, switchT: 0, streak: 0, lastShotT: 0, aimAt: null, debugFireUntil: 0, draw: 0, sprint: false, runLock: false };
function setWeapon(id, silent) {
  const w = WEAPONS[id]; G.weapon = w; G.reloading = false; P.scoped = false;
  for (const k of ORDER) VM.models[k].visible = k === id;
  VM.models[id].add(VM.flash); VM.flash.position.set(0, id === 'pistol' ? 0.03 : 0.022, MUZZLE[id] || 0); P.draw = 0;
  P.nextShot = G.now + (silent ? 0 : 0.35); P.switchT = silent ? 0 : 0.35;
  $('bScope').classList.toggle('hidden', !(id === 'sniper' || id === 'rifle' || id === 'bow'));
}
function cycleWeapon(dir = 1) { let i = ORDER.indexOf(G.weapon.id); for (let n = 0; n < ORDER.length; n++) { i = (i + dir + ORDER.length) % ORDER.length; if (!G.owned || G.owned.has(ORDER[i])) return setWeapon(ORDER[i]); } }
function startReload() {
  const w = G.weapon, a = G.ammo[w.id];
  if (a.reserve < 0) a.reserve = 0;
  if (w.melee || G.reloading || a.mag >= w.mag || a.reserve <= 0 || !G.player.alive) return;
  G.reloading = true; G.reloadEnd = G.now + w.reload; P.scoped = false; sfx.reload();
}
function toggleScope() { if (!G.player?.alive) return; if (G.weapon.scope || G.weapon.id === 'rifle' || G.weapon.bow) P.scoped = !P.scoped; }
// scope overlay (black circle): sniper always; rifle / bow with a 4x or 8x scope picked up
const scopeOverlay = () => P.scoped && (G.weapon.scope || (G.scope | 0) >= 4);
function scopeFov() {
  const w = G.weapon, sc = G.scope | 0, k = baseFov / 75;
  if (!P.scoped) return (w.bow && P.draw > 0 ? 75 - 7 * P.draw : 75) * k;
  if (w.scope) return (sc >= 8 ? 75 / 8 : 20) * k;
  return (sc ? 75 / sc : (w.bow ? 60 : 52)) * k;
}
// 弓箭: hold fire to draw, release to loose
function bowTick(dt) {
  const w = G.weapon, a = G.ammo.bow;
  if (P.firing && G.state === 'playing') {
    if (G.reloading || G.now < P.nextShot) return;
    if (a.mag <= 0) { if (P.draw === 0) { if (a.reserve > 0) startReload(); else { sfx.empty(); P.nextShot = G.now + 0.4; } } return; }
    if (P.draw === 0) sfx.draw();
    P.draw = Math.min(1, P.draw + dt / w.charge);
  } else if (P.draw > 0) {
    const k = P.draw; P.draw = 0;
    if (k >= 0.12 && a.mag > 0 && G.state === 'playing') playerLoose(k);
  }
}
function playerLoose(k) {
  const w = G.weapon, a = G.ammo.bow, p = G.player;
  const moving = Math.hypot(P.joyX, P.joyY) > 0.2 || keysMoving();
  let spread = w.spread * (1.6 - k) + (moving ? w.moveSpread : 0) + (p.onGround ? 0 : 0.05);
  if (P.scoped) spread *= 0.4; if (p.crouch) spread *= 0.7;
  _q.set(p.pitch + (Math.random() - 0.5) * 2 * spread, p.yaw + (Math.random() - 0.5) * 2 * spread, 0);
  _dir.set(0, 0, -1).applyEuler(_q);
  let origin = camera.position.clone();
  if (thirdPerson()) {
    const far = G.map.rayWorld(origin, _dir, w.range); const aim = origin.clone().addScaledVector(_dir, Math.max(far, 4));
    origin = new THREE.Vector3(p.pos.x, p.pos.y + P.eye, p.pos.z); _dir.subVectors(aim, origin).normalize(); if (P.body) P.body.userData.kick = 1;
  }
  G.shootArrow(p, origin.addScaledVector(_dir, 0.4), _dir.clone(), k, 1);
  a.mag--; P.nextShot = G.now + w.rate; P.kick = 0.5; P.lastShotT = G.now;
  G.arrowsShot = (G.arrowsShot || 0) + 1;
  if (a.mag === 0 && a.reserve > 0) setTimeout(() => { if (G.weapon.bow) startReload(); }, 150);
}

const _dir = new THREE.Vector3(), _q = new THREE.Euler(0, 0, 0, 'YXZ');
function playerShoot() {
  const w = G.weapon, a = G.ammo[w.id], p = G.player;
  if (!w.melee && a.mag <= 0) { if (a.reserve > 0) startReload(); else sfx.empty(); P.nextShot = G.now + 0.3; return; }
  const moving = Math.hypot(P.joyX, P.joyY) > 0.2 || keysMoving();
  if (G.now - P.lastShotT > 0.35) P.streak = 0;
  let spread = w.spread + (moving ? w.moveSpread : 0) + (p.onGround ? 0 : 0.06);
  if (w.id === 'sniper' && P.scoped) spread = w.scopedSpread + (moving ? 0.01 : 0);
  if (w.id === 'rifle') spread += Math.min(0.025, P.streak * 0.0025) * (P.scoped ? 0.5 : 1);
  if (p.crouch) spread *= 0.6;
  _q.set(p.pitch + (Math.random() - 0.5) * 2 * spread, p.yaw + (Math.random() - 0.5) * 2 * spread, 0);
  _dir.set(0, 0, -1).applyEuler(_q);
  let origin = camera.position.clone(), muzzle = camera.position.clone().add(new THREE.Vector3(0.18, -0.15, -0.6).applyEuler(_q));
  if (thirdPerson()) { // aim where the crosshair points, shoot from the player's eye
    const far = G.map.rayWorld(origin, _dir, w.range); const aim = origin.clone().addScaledVector(_dir, Math.max(far, 4));
    origin = new THREE.Vector3(p.pos.x, p.pos.y + P.eye, p.pos.z); _dir.subVectors(aim, origin).normalize();
    muzzle = origin.clone().addScaledVector(_dir, 0.7); if (P.body) P.body.userData.kick = 1;
  }
  G.fire(p, origin, _dir.clone(), w.id, 1, muzzle);
  if (!w.melee) a.mag--;
  P.streak++; P.lastShotT = G.now;
  P.nextShot = G.now + w.rate;
  if (!w.auto) P.fireLatch = true;
  // recoil
  const k = w.kick * (P.scoped ? 0.6 : 1) * (p.crouch ? 0.7 : 1);
  p.pitch += k; P.recoil += k; p.yaw += (Math.random() - 0.5) * k * 0.6;
  P.kick = w.melee ? 0.6 : 1;
  if (!w.melee) { VM.flash.visible = true; VM.flash.rotation.z = Math.random() * 3; P.flashT = 0.04; }
  if (w.id === 'sniper') P.scoped = false;
  if (!w.melee && a.mag === 0 && a.reserve > 0) setTimeout(() => startReload(), 250);
}
const keysMoving = () => P.keys.KeyW || P.keys.KeyA || P.keys.KeyS || P.keys.KeyD;

function updatePlayer(dt) {
  const p = G.player;
  if (!p.alive) {
    if (G.mode !== 'br') $('respawnIn').textContent = `${Math.max(0, p.respawnAt - G.now).toFixed(1)} 秒后在舱室复活`;
    camera.position.y += (p.pos.y + 0.4 - camera.position.y) * Math.min(1, dt * 3);
    if (P.body) P.body.visible = false;   // death cam sits at the body: hide it
    return;
  }
  // look
  const sensK = (isTouch ? 0.0058 : 0.0022) * S.sens * (camera.fov / 75);
  p.yaw -= P.lookX * sensK; p.pitch -= P.lookY * sensK; P.lookX = P.lookY = 0;
  // debug auto-aim (testing only)
  if (P.aimAt && G.now < P.debugFireUntil && P.aimAt.alive) {
    const e = camera.position, t = P.aimAt.pos; const dx = t.x - e.x, dz = t.z - e.z, dy = t.y + 1.25 - e.y;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.firing = true;
  } else if (P.aimAt && G.now >= P.debugFireUntil) { P.aimAt = null; P.firing = false; }
  // recoil recovery
  const rec = Math.min(P.recoil, dt * 0.12); p.pitch -= rec; P.recoil -= rec;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  if (p.air) { updateAir(dt); return; }
  if (P.inCar) { updateDriving(dt); return; }
  // move
  let fx = 0, fz = 0;
  if (P.keys.KeyW) fz += 1; if (P.keys.KeyS) fz -= 1; if (P.keys.KeyD) fx += 1; if (P.keys.KeyA) fx -= 1;
  fx += P.joyX; fz += -P.joyY;
  if (P.runLock) { fx = 0; fz = 1; }
  const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let speed = G.weapon.melee ? 6.8 : G.weapon.id === 'sniper' ? 5.4 : 6.0;
  const running = (P.sprint || P.runLock || P.keys.ShiftLeft) && fz > 0.5 && !p.crouch && !P.scoped;
  if (running) speed *= 1.45; p.running = running;
  if (p.crouch) speed *= 0.5; if (P.scoped) speed *= 0.55; if (P.draw > 0) speed *= 0.7;
  const mx = (-sy * fz + cy * fx) * speed * dt, mz = (-cy * fz - sy * fx) * speed * dt;
  if (P.jumpQ && p.onGround) { p.vel.y = 6.8; }
  P.jumpQ = false;
  moveEntity(p, mx, mz, dt, G.solidsNear(p.pos));
  p.moving = l > 0.1;
  // eye / camera
  const eyeT = p.crouch ? 1.05 : 1.6; P.eye += (eyeT - P.eye) * Math.min(1, dt * 12);
  P.bob += dt * (p.moving && p.onGround ? speed * 1.6 : 0);
  camera.position.set(p.pos.x, p.pos.y + P.eye + Math.sin(P.bob * 2) * 0.03, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  if (thirdPerson()) chaseCam(p.pos.x, p.pos.y + P.eye, p.pos.z, 3.6, 1.0, 0.32);
  poseBody(dt, l > 0.1 ? (-sy * fz + cy * fx) : 0, l > 0.1 ? (-cy * fz - sy * fx) : 0, speed);
  const wantFov = scopeFov();
  if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
  // reload
  if (G.reloading && G.now >= G.reloadEnd) {
    const a = G.ammo[G.weapon.id], need = G.weapon.mag - a.mag, take = Math.max(0, Math.min(need, a.reserve));
    a.mag += take; a.reserve = Math.max(0, a.reserve - take); G.reloading = false;
  }
  // shoot
  if (!P.firing) P.fireLatch = false;
  if (G.weapon.bow) bowTick(dt);
  else if (P.firing && !P.fireLatch && G.now >= P.nextShot && !G.reloading && G.state === 'playing') playerShoot();
  const bb = $('bowBar'); if (bb) { const on = G.weapon.bow && P.draw > 0; bb.style.display = on ? 'block' : 'none'; if (on) { bb.firstChild.style.width = (P.draw * 100).toFixed(0) + '%'; bb.classList.toggle('full', P.draw >= 1); } }
  if (G.weapon.bow) { const a = G.ammo.bow, nk = a.mag > 0 && (!G.reloading || G.reloadEnd - G.now < 0.3); VM.models.bow.userData.setDraw(P.draw, nk); }
  // viewmodel
  P.kick = Math.max(0, P.kick - dt * 9); P.switchT = Math.max(0, P.switchT - dt);
  const vm = VM.models[G.weapon.id];
  const bx = Math.sin(P.bob) * 0.012, by = Math.abs(Math.cos(P.bob)) * 0.012;
  const rl = G.reloading ? Math.sin(Math.min(1, (G.reloadEnd - G.now) / G.weapon.reload) * Math.PI) : 0;
  const VB = VMB[G.weapon.id] || VMB.rifle;
  vm.position.set(VB[0] + bx, VB[1] - by - P.switchT * 0.8 - rl * 0.15, VB[2] + P.kick * 0.06);
  vm.rotation.set(P.kick * 0.08 + rl * 0.5, VB[3], rl * 0.3);
  if (G.weapon.melee) vm.rotation.x -= P.kick * 0.9;
  if (P.flashT > 0) { P.flashT -= dt; if (P.flashT <= 0) VM.flash.visible = false; }
  $('scope').style.display = scopeOverlay() ? 'block' : 'none';
  $('cross').style.display = scopeOverlay() ? 'none' : 'block';
}

G.debugAimAndFire = function (hold = 0.5) {
  const p = G.player; if (!p.alive) respawn(p);
  const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z);
  let tgt = G.bots.filter(b => b.alive && b.team !== p.team).find(b => G.map.hasLOS(eye, new THREE.Vector3(b.pos.x, b.pos.y + 1.3, b.pos.z)));
  if (!tgt) { // move player to a spot with line of sight to the nearest enemy
    const enemies = G.bots.filter(b => b.alive && b.team !== p.team);
    if (!enemies.length) return null;
    tgt = enemies[0];
    const th = new THREE.Vector3(tgt.pos.x, tgt.pos.y + 1.3, tgt.pos.z);
    const nodes = G.map.nodes.filter(n => n.deck).map(n => n.p).sort((a, b) => a.distanceTo(tgt.pos) - b.distanceTo(tgt.pos));
    const spot = nodes.find(n => n.distanceTo(tgt.pos) > 7 && G.map.hasLOS(new THREE.Vector3(n.x, 1.6, n.z), th));
    if (spot) p.pos.set(spot.x, 0, spot.z);
  }
  P.aimAt = tgt; P.debugFireUntil = G.now + hold;
  return tgt.name;
};

// debug (testing only): switch to the bow and draw-release at the nearest visible enemy
G.debugBow = function (hold = 1.0) {
  const p = G.player; if (!p.alive) respawn(p);
  if (G.owned) G.owned.add('bow');
  if (G.ammo.bow.mag < 1) G.ammo.bow.mag = 1; G.ammo.bow.reserve = Math.max(G.ammo.bow.reserve, 5);
  setWeapon('bow', true);
  return G.debugAimAndFire(hold);
};
G.P = P;
// debug: line two soldiers up in front of a free camera (screenshots only)
G.debugShowcase = function (pose = 'idle') {
  const blue = G.bots.find(b => b.team === 'blue'), red = G.bots.find(b => b.team === 'red');
  G.state = 'showcase'; $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const sp = G.map.spawns.blue[0];
  for (const b of G.bots) b.mesh.visible = b === blue || b === red;
  const base = new THREE.Vector3(sp.x, 0, sp.z);
  // find a direction with free space
  let best = null;
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
    let free = 0; for (let d = 0.5; d < 7; d += 0.5) { if (G.map.hasLOS(new THREE.Vector3(base.x, 1.2, base.z), new THREE.Vector3(base.x + dx * d, 1.2, base.z + dz * d))) free = d; else break; }
    if (!best || free > best.free) best = { free, dx, dz };
  }
  const { dx, dz } = best, sx = -dz, sz = dx;
  blue.pos.set(base.x + sx * 0.55, base.y, base.z + sz * 0.55); red.pos.set(base.x - sx * 0.55, base.y, base.z - sz * 0.55);
  const yawFace = Math.atan2(-dx, -dz); // face toward camera
  G.showcase = [blue, red]; G.showcasePose = pose;
  for (const b of G.showcase) { b.alive = true; b.yaw = yawFace + (b === blue ? 0.35 : -0.35); b.mesh.position.copy(b.pos); b.mesh.rotation.set(0, b.yaw, 0); resetSoldier(b.mesh); b.mesh.visible = true; }
  camera.position.set(base.x + dx * 3.1, 1.25, base.z + dz * 3.1); camera.fov = 50; camera.updateProjectionMatrix();
  camera.lookAt(base.x, 0.95, base.z);
  return { free: best.free, tris: { blueHi: soldierTris('blue', false), blueLo: soldierTris('blue', true), redHi: soldierTris('red', false), redLo: soldierTris('red', true) } };
};
// debug: close-up of the player's critter plus a few bots, camera in front (screenshots only)
G.debugCloseup = function (pose = 'idle', ang = 0, dist = 4.6) {
  const p = G.player; G.state = 'showcase';
  const bs = G.bots.filter(b => b.alive).slice(0, 3);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw);
  const items = [{ mesh: P.body, yaw: p.yaw }];
  P.body.visible = true; P.body.position.copy(p.pos); 
  bs.forEach((b, i) => { const o = [-1.3, 1.3, 0][i], back = i === 2 ? 1.4 : 0.6; b.pos.set(p.pos.x + sx * o - fx * back, p.pos.y, p.pos.z + sz * o - fz * back); b.yaw = p.yaw + (i - 1) * 0.3; b.mesh.visible = true; b.mesh.position.copy(b.pos); b.mesh.rotation.set(0, b.yaw, 0); resetSoldier(b.mesh); items.push({ mesh: b.mesh, yaw: b.yaw }); });
  P.body.rotation.set(0, p.yaw, 0);
  G.showcase = items; G.showcasePose = pose;
  const ca = Math.cos(ang), sa = Math.sin(ang), cfx = fx * ca + sx * sa, cfz = fz * ca + sz * sa;
  camera.position.set(p.pos.x + cfx * dist, p.pos.y + 1.45, p.pos.z + cfz * dist); camera.fov = 55; camera.updateProjectionMatrix();
  camera.lookAt(p.pos.x, p.pos.y + 0.95, p.pos.z);
  return bs.map(b => b.mesh.userData.hat);
};
G.showcaseTick = function (dt) {
  for (const b of G.showcase) { const p = G.showcasePose; b.mesh.rotation.set(0, b.yaw, 0);
    animateSoldier(b.mesh, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: b.yaw, crouch: p === 'crouch', aim: p === 'aim' || p === 'crouch' || p === 'bow', pitch: 0, reload: p === 'reload' ? 0.3 : -1, bow: p === 'bow', draw: G.showcaseDraw ?? 1 }); }
};
G.vmTris = () => Object.fromEntries(ORDER.map(k => [k, VM.models[k].userData.tris]));
G.setVmTeam = (t) => VM.setTeam(t);

// ---------------- input: desktop ----------------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (G.state === 'playing') showScoreboard(true); return; }
  P.keys[e.code] = true;
  if (G.state !== 'playing') return;
  if (e.code === 'Space') { P.jumpQ = true; e.preventDefault(); }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') G.player.crouch = true;
  if (e.code === 'KeyR') startReload();
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code); if (n >= 0 && (!G.owned || G.owned.has(ORDER[n]))) setWeapon(ORDER[n]);
  if (e.code === 'KeyQ') cycleWeapon(1);
  if (e.code === 'KeyF') { if (!ejectOrOpen()) toggleCar(); }
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyB' && !e.repeat) toggleBag();
});
addEventListener('keyup', (e) => {
  P.keys[e.code] = false;
  if (e.code === 'Tab') showScoreboard(false);
  if ((e.code === 'KeyC' || e.code === 'ControlLeft') && G.player) G.player.crouch = false;
});
canvas.addEventListener('mousedown', (e) => {
  unlockAudio();
  if (isTouch || G.state !== 'playing') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) P.firing = true; if (e.button === 2) toggleScope();
});
addEventListener('mouseup', (e) => { if (e.button === 0 && !isTouch) P.firing = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { P.lookX += e.movementX; P.lookY += e.movementY; } });
addEventListener('wheel', (e) => { if (G.state === 'playing' && !isTouch) cycleWeapon(e.deltaY > 0 ? 1 : -1); });

// ---------------- input: touch ----------------
const touchLayer = $('touch'), joyBase = $('joyBase'), joyKnob = $('joyKnob');
const T = new Map();
function btnDown(btn, el) {
  if (hudEdit) return;
  el?.classList.add('pressed');
  if (btn === 'fire') P.firing = true;
  else if (btn === 'jump') P.jumpQ = true;
  else if (btn === 'crouch') { G.player.crouch = !G.player.crouch; el.classList.toggle('on', G.player.crouch); }
  else if (btn === 'reload') startReload();
  else if (btn === 'switch') cycleWeapon(1);
  else if (btn === 'scope') toggleScope();
  else if (btn === 'car') toggleCar();
  else if (btn === 'eject') ejectOrOpen();
  else if (btn === 'view') toggleView();
  else if (btn === 'bag') toggleBag();
  else if (btn === 'up') P.liftUp = true;
  else if (btn === 'down') P.liftDown = true;
}
touchLayer.addEventListener('touchstart', (e) => {
  if (hudEdit || isUI(e.target)) return;
  e.preventDefault(); unlockAudio();
  if (G.state !== 'playing') return;
  const [W, H] = viewSize();
  for (const t of e.changedTouches) {
    const p = gameXY(t.clientX, t.clientY);
    const el = t.target.closest && t.target.closest('[data-btn]');
    if (el) { const btn = el.dataset.btn; T.set(t.identifier, { type: 'btn', btn, el, x: p.x, y: p.y }); btnDown(btn, el); continue; }
    if (p.x < W * 0.4) {
      let ox = p.x, oy = p.y; const L = HUDL.joyBase;
      if (L) { ox = L.x / 100 * W; oy = L.y / 100 * H; }
      else { joyBase.style.left = p.x + 'px'; joyBase.style.top = p.y + 'px'; }
      T.set(t.identifier, { type: 'joy', ox, oy }); P.runLock = false; P.sprint = false; joyBase.classList.remove('run', 'lock');
      joyBase.classList.remove('hidden'); joyKnob.style.transform = '';
    } else T.set(t.identifier, { type: 'look', x: p.x, y: p.y });
  }
}, { passive: false });
touchLayer.addEventListener('touchmove', (e) => {
  if (hudEdit || isUI(e.target)) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = T.get(t.identifier); if (!s) continue;
    const p = gameXY(t.clientX, t.clientY);
    if (s.type === 'joy') {
      let dx = p.x - s.ox, dy = p.y - s.oy; const d = Math.hypot(dx, dy), R = 50;
      // long pull upward past the ring = run mode; release there = keep running
      P.sprint = dy < -R * 1.7 && Math.abs(dx) < -dy * 0.6; joyBase.classList.toggle('run', P.sprint);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      P.joyX = dx / R; P.joyY = dy / R; joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (s.type === 'look' || (s.type === 'btn' && s.btn === 'fire')) {
      P.lookX += p.x - s.x; P.lookY += p.y - s.y; s.x = p.x; s.y = p.y;
    }
  }
}, { passive: false });
function touchEnd(e) {
  if (hudEdit) return;
  for (const t of e.changedTouches) {
    const s = T.get(t.identifier); if (!s) continue; T.delete(t.identifier);
    if (s.type === 'joy') { P.joyX = P.joyY = 0; if (P.sprint) { P.runLock = true; HUD.centerMsg && HUD.centerMsg('自动奔跑中，碰摇杆取消', 1200); } P.sprint = false; joyBase.classList.remove('run'); joyBase.classList.add('hidden'); }
    if (s.type === 'btn') { if (s.btn === 'up') P.liftUp = false; if (s.btn === 'down') P.liftDown = false; s.el.classList.remove('pressed'); if (s.btn === 'fire' && ![...T.values()].some(v => v.btn === 'fire')) P.firing = false; }
  }
}
touchLayer.addEventListener('touchend', touchEnd); touchLayer.addEventListener('touchcancel', touchEnd);

// ---------------- UI wiring ----------------
const lobbyOpts = { mode: 'br', team: 'blue', size: 5, target: 30, diff: 'normal', brSize: 16, brMap: 'island' };
document.querySelectorAll('#lobby .seg').forEach(seg => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach(x => x.classList.remove('on', 'blue', 'red'));
  b.classList.add('on'); if (seg.dataset.k === 'team') b.classList.add(b.dataset.v);
  const v = b.dataset.v; lobbyOpts[seg.dataset.k] = isNaN(+v) ? v : +v;
  if (seg.dataset.k === 'mode') document.getElementById('lobby').classList.toggle('brMode', v === 'br');
}));
$('btnStart').addEventListener('click', () => { unlockAudio(); startMatch({ ...lobbyOpts }); });
let lastFullTap = 0;
async function goFull() {
  if (forceLandOn) { setForceLand(false); return; }
  let ok = false;
  try {
    if (!isFull()) {
      const rf = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (rf) { await Promise.race([rf.call(document.documentElement, { navigationUI: 'hide' }), new Promise((_, rj) => setTimeout(rj, 900))]); ok = isFull(); }
    } else ok = true;
  } catch (e) {}
  let locked = false;
  try { if (screen.orientation?.lock) { await Promise.race([screen.orientation.lock('landscape'), new Promise((_, rj) => setTimeout(rj, 900))]); locked = true; } } catch (e) {}
  if (!locked && innerWidth > innerHeight) locked = true;
  if (!ok || (!locked && isTouch)) setForceLand(true);
}
function fullTap() { const n = performance.now(); if (n - lastFullTap < 400) return; lastFullTap = n; goFull(); }
for (const id of ['btnFull', 'btnFull2', 'tFull', 'lFull']) { const b = $(id); if (b) { b.addEventListener('pointerup', fullTap); b.addEventListener('click', fullTap); } }
function showScoreboard(on) {
  $('sbPanel').innerHTML = (G.mode === 'br' ? brBoardHTML(G, '战绩') : HUD.scoreboardHTML(G, '战绩')) + '<button class="close" id="sbClose">关闭</button>';
  $('scoreboard').classList.toggle('hidden', !on);
  $('sbClose').onclick = () => showScoreboard(false);
}
$('tSb').addEventListener('click', () => showScoreboard($('scoreboard').classList.contains('hidden')));
$('scoreboard').addEventListener('click', (e) => { if (e.target.id === 'scoreboard') showScoreboard(false); });
// backpack panel
function renderBag() {
  const p = G.player, cap = bagCap(G);
  $('bagCount').textContent = G.bag.length + '/' + cap;
  const eq = (k, label, val, can) => `<span>${label} ${val || '-'}${can && val ? `<button data-bag="unequip" data-slot="${k}">卸下</button>` : ''}</span>`;
  $('bagEquip').innerHTML = '<b>已装备</b>' + eq('helmet', '头盔', p.helmet ? 'Lv' + p.helmet : '', true) + eq('armor', '护甲', p.armor ? 'Lv' + p.armor : '', true)
    + eq('bag', '背包', G.bagLv ? 'Lv' + G.bagLv : '', false) + eq('scope', '倍镜', G.scope ? G.scope + 'x' : '', true);
  let html = '';
  for (let i = 0; i < G.bag.length; i++) {
    const it = G.bag[i], nm = it.k === 'med' ? `${it.name} ×${it.n || 1}` : it.name;
    const act = it.k === 'med' ? `<button data-bag="use" data-i="${i}"${p.hp >= 100 ? ' disabled' : ''}>使用</button>` : `<button data-bag="equip" data-i="${i}">装备</button>`;
    html += `<div class="bagRow"><span class="bagName">${nm}</span><span class="bagBtns">${act}<button data-bag="drop" data-i="${i}">丢弃</button></span></div>`;
  }
  $('bagList').innerHTML = html || '<div class="bagEmpty">背包是空的</div>';
}
function openBag() {
  if (G.mode !== 'br' || G.state !== 'playing' || G.paused || !G.player?.alive || G.player.air) return;
  renderBag(); $('bagPanel').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBag() { $('bagPanel').classList.add('hidden'); }
function toggleBag() { $('bagPanel').classList.contains('hidden') ? openBag() : closeBag(); }
function bagAction(act, i, slot) {
  const p = G.player; if (!p?.alive || !G.br) return;
  if (act === 'use') {
    const it = G.bag[i]; if (!it || it.k !== 'med' || p.hp >= 100) return;
    p.hp = Math.min(100, p.hp + 50);
    if ((it.n || 1) > 1) it.n--; else G.bag.splice(i, 1);
    sfx.reload?.(); HUD.centerMsg('使用 医疗包 +50', 900);
  } else if (act === 'equip') {
    const it = G.bag[i]; if (!it || it.k === 'med') return;
    if (it.k === 'scope') { const old = G.scope | 0; G.scope = it.lv; if (old) G.bag[i] = { k: it.k, lv: old, name: gearName(it.k, old) }; else G.bag.splice(i, 1); }
    else { const old = p[it.k] | 0; p[it.k] = it.lv; if (old) G.bag[i] = { k: it.k, lv: old, name: gearName(it.k, old) }; else G.bag.splice(i, 1); }
    sfx.reload?.(); HUD.centerMsg('装备 ' + it.name, 900);
  } else if (act === 'drop') {
    const it = G.bag[i]; if (!it) return;
    const one = it.k === 'med' ? { k: it.k, name: it.name, n: 1 } : it;
    if (it.k === 'med' && (it.n || 1) > 1) it.n--; else G.bag.splice(i, 1);
    dropBagItem(G, scene, one, p.pos.x, p.pos.z); HUD.centerMsg('丢弃 ' + it.name, 800);
  } else if (act === 'unequip') {
    if (slot !== 'helmet' && slot !== 'armor' && slot !== 'scope') return;
    const lv = slot === 'scope' ? (G.scope | 0) : (p[slot] | 0); if (!lv) return;
    if (G.bag.length >= bagCap(G)) { HUD.centerMsg('背包已满', 1100); return; }
    G.bag.push({ k: slot, lv, name: gearName(slot, lv) });
    if (slot === 'scope') G.scope = 0; else p[slot] = 0;
    sfx.reload?.(); HUD.centerMsg('卸下 ' + gearName(slot, lv), 900);
  } else return;
  renderBag();
}
$('bagPanel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'bagClose') { closeBag(); return; }
  if (b.dataset.bag) bagAction(b.dataset.bag, +b.dataset.i, b.dataset.slot);
});
document.addEventListener('pointerdown', (e) => {
  if ($('bagPanel').classList.contains('hidden') || e.target.closest?.('[data-btn="bag"]')) return;
  if (!e.target.closest?.('.bagCard')) closeBag();
}, true);
// ---------------- HUD custom layout ----------------
let hudSel = null, hudDrag = null, hudReturnSettings = false;
function hudControls() { return [...document.querySelectorAll('#touch .tb, #touch #joyBase')].filter(e => !['bCar', 'bUp', 'bDown', 'bEject'].includes(e.id)); }
function normControl(el) {
  const cs = getComputedStyle(el), l = parseFloat(cs.left), t = parseFloat(cs.top);
  el.style.left = (isFinite(l) ? l : 0) + 'px'; el.style.top = (isFinite(t) ? t : 0) + 'px';
  el.style.right = ''; el.style.bottom = '';
}
function normalizeAll() {
  const [W, H] = viewSize();
  for (const el of hudControls()) {
    if (el.id === 'joyBase' && !HUDL.joyBase && !el.style.left) { el.style.left = (W * 0.18) + 'px'; el.style.top = (H * 0.72) + 'px'; }
    normControl(el);
  }
}
function applyHudLayout() {
  const [W, H] = viewSize();
  for (const el of hudControls()) {
    const L = HUDL[el.id]; if (!L) continue;
    el.style.left = (L.x / 100 * W) + 'px'; el.style.top = (L.y / 100 * H) + 'px';
    el.style.right = ''; el.style.bottom = '';
    el.style.transform = 'scale(' + L.scale + ')';
    el.style.opacity = L.opacity;
  }
}
function updateHudEditSel() {
  for (const el of hudControls()) el.classList.toggle('sel', el === hudSel);
  const on = !!hudSel; $('hudScale').disabled = $('hudOpacity').disabled = !on;
  let sc = 1, op = hudSel?.id === 'joyBase' ? 0.55 : 1;
  if (on) {
    const m = hudSel.style.transform.match(/scale\(([\d.]+)\)/); sc = m ? +m[1] : 1;
    op = hudSel.style.opacity ? +hudSel.style.opacity : +getComputedStyle(hudSel).opacity;
  }
  $('hudScale').value = Math.round(sc * 100); $('hudOpacity').value = Math.round(op * 100);
  $('hudScaleV').textContent = $('hudScale').value + '%'; $('hudOpacityV').textContent = $('hudOpacity').value + '%';
}
function enterHudEdit() {
  if (hudEdit) return;
  hudEdit = true; hudSel = null; hudDrag = null;
  hudReturnSettings = !$('settings').classList.contains('hidden');
  $('settings').classList.add('hidden');
  document.body.classList.add('hudEdit');
  $('touch').classList.remove('hidden');
  normalizeAll();
  $('hudEditBar').classList.remove('hidden');
  updateHudEditSel();
}
function exitHudEdit(saved) {
  hudEdit = false; hudDrag = null; hudSel = null;
  document.body.classList.remove('hudEdit');
  $('hudEditBar').classList.add('hidden');
  for (const el of hudControls()) el.classList.remove('sel', 'pressed');
  if (saved) applyHudLayout();
  else {
    for (const el of hudControls()) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = el.style.opacity = ''; }
    applyHudLayout();
  }
  if (G.state !== 'playing') $('touch').classList.add('hidden');
  else $('touch').classList.toggle('hidden', !isTouch);
  if (hudReturnSettings) { $('settings').classList.remove('hidden'); hudReturnSettings = false; }
}
function resetHudLayout() {
  HUDL = {}; try { localStorage.removeItem('party_hud_layout'); } catch (e) {}
  for (const el of hudControls()) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = el.style.opacity = ''; }
  hudSel = null; normalizeAll(); updateHudEditSel();
}
function saveHudLayout() {
  const [W, H] = viewSize(), out = {};
  for (const el of hudControls()) {
    const l = parseFloat(el.style.left), t = parseFloat(el.style.top); if (!isFinite(l) || !isFinite(t)) continue;
    const m = el.style.transform.match(/scale\(([\d.]+)\)/); const sc = m ? +m[1] : 1;
    const op = el.style.opacity ? +el.style.opacity : (el.id === 'joyBase' ? 0.55 : 1);
    out[el.id] = { x: +(l / W * 100).toFixed(2), y: +(t / H * 100).toFixed(2), scale: sc, opacity: op };
  }
  HUDL = out; try { localStorage.setItem('party_hud_layout', JSON.stringify(out)); } catch (e) {}
  exitHudEdit(true);
}
touchLayer.addEventListener('pointerdown', (e) => {
  if (!hudEdit) return;
  e.preventDefault();
  const el = e.target.closest?.('.tb, #joyBase');
  if (!el) { hudSel = null; updateHudEditSel(); return; }
  hudSel = el; updateHudEditSel();
  const p = gameXY(e.clientX, e.clientY);
  hudDrag = { el, joy: el.id === 'joyBase', sx: p.x, sy: p.y, l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0 };
  el.setPointerCapture?.(e.pointerId);
}, { passive: false });
touchLayer.addEventListener('pointermove', (e) => {
  if (!hudEdit || !hudDrag) return;
  e.preventDefault();
  const p = gameXY(e.clientX, e.clientY), d = hudDrag;
  if (d.joy) { d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px'; }
  else { d.el.style.left = (d.l + p.x - d.sx) + 'px'; d.el.style.top = (d.t + p.y - d.sy) + 'px'; }
}, { passive: false });
const endHudDrag = (e) => { if (!hudEdit || !hudDrag) return; hudDrag.el.releasePointerCapture?.(e.pointerId); hudDrag = null; };
touchLayer.addEventListener('pointerup', endHudDrag); touchLayer.addEventListener('pointercancel', endHudDrag);
$('btnHudEdit').addEventListener('click', enterHudEdit);
$('hudScale').addEventListener('input', () => { if (!hudSel) return; const v = +$('hudScale').value; hudSel.style.transform = `scale(${v / 100})`; $('hudScaleV').textContent = v + '%'; });
$('hudOpacity').addEventListener('input', () => { if (!hudSel) return; const v = +$('hudOpacity').value; hudSel.style.opacity = v / 100; $('hudOpacityV').textContent = v + '%'; });
$('hudReset').addEventListener('click', resetHudLayout);
$('hudCancel').addEventListener('click', () => exitHudEdit(false));
$('hudSave').addEventListener('click', saveHudLayout);
// settings dialog
function syncSettingsUI() {
  document.querySelectorAll('#settings .seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(S[seg.dataset.s]) === b.dataset.v)));
  $('sens').value = S.sens; $('sensV').textContent = (+S.sens).toFixed(1);
  $('fpsMeter').classList.toggle('hidden', !+S.showFps);
}
document.querySelectorAll('#settings .seg').forEach(seg => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const k = seg.dataset.s, v = b.dataset.v;
  S[k] = k === 'quality' ? v : +v; G.quality = S.quality; saveS(); syncSettingsUI(); if (k === 'quality') applyPixelRatio();
}));
$('sens').addEventListener('input', () => { S.sens = +$('sens').value; saveS(); syncSettingsUI(); });
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const openSettings = () => {
  syncSettingsUI(); const play = G.state === 'playing';
  G.paused = play; P.firing = false; P.joyX = P.joyY = 0;
  $('setTitle').textContent = play ? '已暂停' : '画面设置'; $('setClose').textContent = play ? '继续游戏' : '确定';
  $('btnQuit').classList.toggle('hidden', !play); $('btnExitFull').classList.toggle('hidden', !isFull());
  $('settings').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock();
};
async function exitFull() {
  try { screen.orientation?.unlock?.(); } catch (e) {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.webkitFullscreenElement) await document.webkitExitFullscreen?.(); } catch (e) {}
}
function syncFullBtns() { const f = isFull(); $('tExit').classList.toggle('hidden', !f); $('tFull').classList.toggle('hidden', f && !forceLandOn); $('btnExitFull').classList.toggle('hidden', !f); }
let wasFull = false;
function onFullChange() {
  const f = isFull(); syncFullBtns();
  if (wasFull && !f) { try { screen.orientation?.unlock?.(); } catch (e) {} if (G.state === 'playing' && $('settings').classList.contains('hidden')) openSettings(); }
  wasFull = f;
}
document.addEventListener('fullscreenchange', onFullChange); document.addEventListener('webkitfullscreenchange', onFullChange);
$('tExit').addEventListener('click', () => { exitFull(); openSettings(); });
$('lExit').addEventListener('click', async () => { await exitFull(); if (forceLandOn) setForceLand(false); else HUD.centerMsg('已恢复竖屏', 1000); syncFullBtns(); });
$('btnExitFull').addEventListener('click', () => { exitFull(); $('btnExitFull').classList.add('hidden'); });
$('btnSettings').addEventListener('click', openSettings); $('tSet').addEventListener('click', openSettings);
$('setClose').addEventListener('click', () => { G.paused = false; $('settings').classList.add('hidden'); });
function toLobby() {
  P.inCar = null; G.paused = false; closeBag();
  G.state = 'lobby'; $('settings').classList.add('hidden'); $('endScr').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('topBtns').classList.add('hidden'); $('lobby').classList.remove('hidden');
}
$('btnQuit').addEventListener('click', toLobby);
$('btnLobby').addEventListener('click', toLobby);
$('btnAgain').addEventListener('click', () => startMatch(G.opts));
syncSettingsUI();
lobbyChars($('lobby'));

// ---------------- main loop ----------------
const _hvT = new THREE.Vector3();
const mm = $('minimap'), mmCtx = mm.getContext('2d');
let last = performance.now(), lastFrame = 0, frames = 0, fpsT = 0, mmT = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const minGap = 1000 / S.fps - 1.5;
  if (ts - lastFrame < minGap) return;
  lastFrame = ts;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  frames++; fpsT += dt; if (fpsT >= 1) { G.fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; if (+S.showFps) $('fpsMeter').textContent = G.fps + ' FPS'; }
  if (G.state === 'lobby' || !G.map) return;
  if (G.state === 'playing' && !G.paused) {
    G.now += dt; G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; endMatch(); }
    if (G.mode !== 'br') { for (const e of G.entities) if (!e.alive && G.now >= e.respawnAt && G.state === 'playing') respawn(e); }
    else updateBR(G, dt, BRH);
    if (G.drop) updateDrop(G, dt, scene, DROPH);
    updatePlayer(dt);
    updateCarButton(); updateAirButton();
    for (const b of G.bots) updateBot(b, dt, G);
    for (const e of G.entities) { if (!e._pp) { e._pp = e.pos.clone(); e.hv = new THREE.Vector3(); } _hvT.subVectors(e.pos, e._pp).divideScalar(Math.max(dt, 1e-3)); _hvT.y = 0; if (_hvT.length() > 10) _hvT.set(0, 0, 0); e.hv.lerp(_hvT, 0.25); e._pp.copy(e.pos); }
  }
  if ((G.state === 'playing' && !G.paused) || G.state === 'ended') updateArrows(dt, ARROW_H);
  // dead bot animation
  for (const b of G.bots) if (!b.alive && b.mesh.visible) {
    animateDeath(b.mesh, G.now - b.deadT);
    if (G.now - b.deadT > 2.2) b.mesh.visible = false;
  }
  if (G.state === 'showcase') G.showcaseTick(dt);
  for (const tr of tracers) if (tr.l.visible) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07); if (tr.t <= 0) tr.l.visible = false; }
  for (const s of sparks) if (s.m.visible) { s.t -= dt; s.m.scale.setScalar(1 + (0.12 - s.t) * 6); s.m.material.opacity = Math.max(0, s.t / 0.12); if (s.t <= 0) s.m.visible = false; }
  G.map.update(G.now);
  if (G.state === 'playing') {
    HUD.updateHud(G);
    mmT -= dt; if (mmT <= 0) { mmT = 0.1; HUD.drawMinimap(G, mmCtx, mm.width, mm.height); }
  }
  if (G.sky) G.sky.position.copy(camera.position);
  renderer.clear();
  // depth precision: high in the air (plane / parachute) the 0.05 near plane makes roads and ground flicker
  { const hy = camera.position.y, nn = hy > 12 ? Math.min(2, hy * 0.02) : 0.05; if (Math.abs(camera.near - nn) > 0.005) { camera.near = nn; camera.updateProjectionMatrix(); } }
  renderer.render(scene, camera);
  if (G.player?.alive && !scopeOverlay() && !thirdPerson() && G.state === 'playing') { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}
requestAnimationFrame(loop);
syncFullBtns();
