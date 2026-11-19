// 货轮突击 - main: renderer, match flow, player, input, settings
import * as THREE from 'three';
import { buildMap, moveEntity } from './map.js';
import { WEAPONS, ORDER, buildViewmodels, MUZZLE } from './weapons.js';
import { createBotMesh, updateBot, eyeOf } from './bots.js';
import { animateDeath, resetSoldier, animateSoldier, soldierTris } from './soldier.js';
import { sfx, unlockAudio } from './audio.js';
import * as HUD from './hud.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------------- settings ----------------
const DEF = { quality: isTouch ? 'mid' : 'high', fps: 60, sens: 1, showFps: 0 };
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem('shipfps.settings') || '{}') }; } catch (e) {}
const saveS = () => { try { localStorage.setItem('shipfps.settings', JSON.stringify(S)); } catch (e) {} };

// ---------------- renderer ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
function applyPixelRatio() {
  const cap = isTouch ? { low: 1, mid: 1.25, high: 1.5 }[S.quality] : { low: 1, mid: 1.5, high: 2 }[S.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.setSize(innerWidth, innerHeight, false);
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.2); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const VM = buildViewmodels();
for (const k of ORDER) vmRoot.add(VM.models[k]);
function onResize() { applyPixelRatio(); camera.aspect = vmCamera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix(); }
addEventListener('resize', onResize); onResize();

// ---------------- game state ----------------
const BLUE_NAMES = ['阿杰', '小林', '老周', '石头', '阿飞'];
const RED_NAMES = ['老K', '铁牙', '阿狼', '火锅', '刀疤'];
const G = window.__game = {
  state: 'lobby', entities: [], bots: [], player: null, scores: { blue: 0, red: 0 }, timeLeft: 600, now: 0,
  diff: 'normal', target: 30, map: null, weapon: WEAPONS.rifle, ammo: {}, reloading: false, fps: 0, opts: null,
};
let builtQuality = null;
const tracers = [];

function buildWorld() {
  // clear old world
  for (let i = scene.children.length - 1; i >= 0; i--) { const o = scene.children[i]; scene.remove(o); o.traverse?.(c => { c.geometry?.dispose?.(); }); }
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5a4a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(-40, 60, 25); scene.add(sun);
  G.map = buildMap(scene, S.quality);
  builtQuality = S.quality;
  scene.fog = new THREE.Fog(0x9cc6de, 35, { low: 120, mid: 170, high: 240 }[S.quality]);
  tracers.length = 0;
  const tm = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, tm.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 });
  }
  sparks.length = 0;
  const sg = new THREE.PlaneGeometry(0.25, 0.25);
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
function makeBot(name, team) {
  const b = makeEntity(name, team, false);
  Object.assign(b, {
    mesh: createBotMesh(team), thinkT: Math.random() * 0.3, path: null, pathI: 0, target: null, reactT: 0, lastSeen: new THREE.Vector3(), lostT: 0,
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
    setWeapon('rifle', true); G.reloading = false; P.scoped = false; P.recoil = 0;
    $('deathScr').classList.add('hidden');
  } else {
    resetSoldier(e.mesh); e.mesh.visible = true; e.mesh.rotation.set(0, e.yaw, 0); e.mesh.position.copy(e.pos);
    e.aiState = 'patrol'; e.path = null; e.target = null; e.burstLeft = 4; e.lastSeen.copy(e.pos);
  }
}

function startMatch(opts) {
  opts = { team: 'blue', size: 5, target: 30, diff: 'normal', ...(opts || {}) };
  G.opts = opts;
  if (!G.map || builtQuality !== S.quality) buildWorld();
  for (const b of G.bots) scene.remove(b.mesh);
  G.quality = S.quality; VM.setTeam(opts.team);
  G.diff = opts.diff; G.target = +opts.target; G.scores = { blue: 0, red: 0 }; G.timeLeft = 600;
  const p = makeEntity('你', opts.team, true); G.player = p;
  const bots = [];
  const mine = opts.team === 'blue' ? BLUE_NAMES : RED_NAMES, theirs = opts.team === 'blue' ? RED_NAMES : BLUE_NAMES;
  const tagMine = opts.team === 'blue' ? '海鹰-' : '赤鲨-', tagTheirs = opts.team === 'blue' ? '赤鲨-' : '海鹰-';
  const enemyTeam = opts.team === 'blue' ? 'red' : 'blue';
  for (let i = 0; i < opts.size - 1; i++) bots.push(makeBot(tagMine + mine[i], opts.team));
  for (let i = 0; i < opts.size; i++) bots.push(makeBot(tagTheirs + theirs[i], enemyTeam));
  G.bots = bots; G.entities = [p, ...bots];
  for (const e of G.entities) respawn(e);
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
  G.state = 'ended'; P.firing = false; P.scoped = false;
  if (document.pointerLockElement) document.exitPointerLock();
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
  const top = e.crouch ? 1.07 : 1.47;
  _body.min.set(e.pos.x - 0.32, e.pos.y, e.pos.z - 0.32); _body.max.set(e.pos.x + 0.32, e.pos.y + top, e.pos.z + 0.32);
  _head.min.set(e.pos.x - 0.18, e.pos.y + top, e.pos.z - 0.18); _head.max.set(e.pos.x + 0.18, e.pos.y + top + 0.34, e.pos.z + 0.18);
}
G.fire = function (shooter, origin, dir, weaponId, dmgScale = 1, muzzle) {
  const w = WEAPONS[weaponId];
  const worldD = G.map.rayWorld(origin, dir, w.range);
  _ray.set(origin, dir);
  let best = null, bd = worldD, head = false;
  for (const e of G.entities) {
    if (e === shooter || !e.alive || e.team === shooter.team) continue;
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
  if (best) damage(best, w.dmg * (head ? w.head : 1) * dmgScale, shooter, w, head);
  return { hit: best, head, point: end };
};

function damage(t, amount, attacker, w, head) {
  if (!t.alive || G.state !== 'playing' || G.now < t.protectUntil) return;
  t.hp -= amount; t.lastHurt = G.now; t.lastAttacker = attacker;
  if (t.isPlayer) { $('dmg').style.opacity = 1; setTimeout(() => $('dmg').style.opacity = 0, 140); sfx.hurt(); }
  if (attacker.isPlayer && t.hp > 0) { HUD.hitMarker(head ? 'head' : 'hit'); head ? sfx.head() : sfx.hit(); }
  if (!t.isPlayer && attacker !== t && t.alive) { t.lastSeen.copy(attacker.pos); }
  if (t.hp <= 0) kill(t, attacker, w, head);
}
function kill(t, attacker, w, head) {
  t.alive = false; t.hp = 0; t.deaths++; attacker.kills++; G.scores[attacker.team]++;
  t.respawnAt = G.now + 3; t.deadT = G.now;
  HUD.killFeed(attacker, t, w.name, head);
  if (t.isPlayer) {
    P.firing = false; P.scoped = false; G.reloading = false;
    $('deathBy').textContent = `击败你的是 ${attacker.name}${head ? '（爆头）' : ''}`; $('deathScr').classList.remove('hidden');
  }
  if (attacker.isPlayer) { HUD.hitMarker('kill'); sfx.kill(); HUD.centerMsg(head ? `爆头！击杀 ${t.name}` : `击杀 ${t.name}`, 1100); }
  if (G.scores[attacker.team] >= G.target) endMatch();
}
G.debugKillBot = function () {
  if (G.state !== 'playing') return null;
  const enemy = G.player.team === 'blue' ? 'red' : 'blue';
  let b = G.bots.find(x => x.team === enemy && x.alive);
  if (!b) { b = G.bots.find(x => x.team === enemy); respawn(b); }
  b.protectUntil = 0; kill(b, G.player, WEAPONS.rifle, true);
  return b.name;
};

// ---------------- player ----------------
const VMB = G.VMB = { rifle: [0.2, -0.21, -0.52, 0.05], sniper: [0.2, -0.2, -0.5, 0.05], pistol: [0.15, -0.16, -0.42, 0.04], knife: [0.2, -0.19, -0.42, 0.12] };
const P = { firing: false, fireLatch: false, scoped: false, recoil: 0, nextShot: 0, jumpQ: false, lookX: 0, lookY: 0, joyX: 0, joyY: 0, keys: {}, bob: 0, eye: 1.6, kick: 0, switchT: 0, streak: 0, lastShotT: 0, aimAt: null, debugFireUntil: 0 };
function setWeapon(id, silent) {
  const w = WEAPONS[id]; G.weapon = w; G.reloading = false; P.scoped = false;
  for (const k of ORDER) VM.models[k].visible = k === id;
  VM.models[id].add(VM.flash); VM.flash.position.set(0, id === 'pistol' ? 0.03 : 0.022, MUZZLE[id]);
  P.nextShot = G.now + (silent ? 0 : 0.35); P.switchT = silent ? 0 : 0.35;
  $('bScope').classList.toggle('hidden', !(id === 'sniper' || id === 'rifle'));
}
function cycleWeapon(dir = 1) { const i = ORDER.indexOf(G.weapon.id); setWeapon(ORDER[(i + dir + ORDER.length) % ORDER.length]); }
function startReload() {
  const w = G.weapon, a = G.ammo[w.id];
  if (w.melee || G.reloading || a.mag >= w.mag || a.reserve <= 0 || !G.player.alive) return;
  G.reloading = true; G.reloadEnd = G.now + w.reload; P.scoped = false; sfx.reload();
}
function toggleScope() { if (!G.player?.alive) return; if (G.weapon.scope || G.weapon.id === 'rifle') P.scoped = !P.scoped; }

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
  const muzzle = camera.position.clone().add(new THREE.Vector3(0.18, -0.15, -0.6).applyEuler(_q));
  G.fire(p, camera.position.clone(), _dir.clone(), w.id, 1, muzzle);
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
    $('respawnIn').textContent = `${Math.max(0, p.respawnAt - G.now).toFixed(1)} 秒后在舱室复活`;
    camera.position.y += (p.pos.y + 0.4 - camera.position.y) * Math.min(1, dt * 3);
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
  // move
  let fx = 0, fz = 0;
  if (P.keys.KeyW) fz += 1; if (P.keys.KeyS) fz -= 1; if (P.keys.KeyD) fx += 1; if (P.keys.KeyA) fx -= 1;
  fx += P.joyX; fz += -P.joyY;
  const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let speed = G.weapon.melee ? 6.8 : G.weapon.id === 'sniper' ? 5.4 : 6.0;
  if (p.crouch) speed *= 0.5; if (P.scoped) speed *= 0.55;
  const mx = (-sy * fz + cy * fx) * speed * dt, mz = (-cy * fz - sy * fx) * speed * dt;
  if (P.jumpQ && p.onGround) { p.vel.y = 6.8; }
  P.jumpQ = false;
  moveEntity(p, mx, mz, dt, G.map.solids);
  p.moving = l > 0.1;
  // eye / camera
  const eyeT = p.crouch ? 1.05 : 1.6; P.eye += (eyeT - P.eye) * Math.min(1, dt * 12);
  P.bob += dt * (p.moving && p.onGround ? speed * 1.6 : 0);
  camera.position.set(p.pos.x, p.pos.y + P.eye + Math.sin(P.bob * 2) * 0.03, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  const wantFov = P.scoped ? (G.weapon.scope ? 20 : 52) : 75;
  if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
  // reload
  if (G.reloading && G.now >= G.reloadEnd) {
    const a = G.ammo[G.weapon.id], need = G.weapon.mag - a.mag, take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take; G.reloading = false;
  }
  // shoot
  if (!P.firing) P.fireLatch = false;
  if (P.firing && !P.fireLatch && G.now >= P.nextShot && !G.reloading && G.state === 'playing') playerShoot();
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
  $('scope').style.display = P.scoped && G.weapon.scope ? 'block' : 'none';
  $('cross').style.display = P.scoped && G.weapon.scope ? 'none' : 'block';
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
G.showcaseTick = function (dt) {
  for (const b of G.showcase) { const p = G.showcasePose;
    animateSoldier(b.mesh, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: b.yaw, crouch: p === 'crouch', aim: p === 'aim' || p === 'crouch', pitch: 0, reload: p === 'reload' ? 0.3 : -1 }); }
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
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0) setWeapon(ORDER[n]);
  if (e.code === 'KeyQ') cycleWeapon(1);
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
  el?.classList.add('pressed');
  if (btn === 'fire') P.firing = true;
  else if (btn === 'jump') P.jumpQ = true;
  else if (btn === 'crouch') { G.player.crouch = !G.player.crouch; el.classList.toggle('on', G.player.crouch); }
  else if (btn === 'reload') startReload();
  else if (btn === 'switch') cycleWeapon(1);
  else if (btn === 'scope') toggleScope();
}
touchLayer.addEventListener('touchstart', (e) => {
  e.preventDefault(); unlockAudio();
  if (G.state !== 'playing') return;
  for (const t of e.changedTouches) {
    const el = t.target.closest && t.target.closest('[data-btn]');
    if (el) { const btn = el.dataset.btn; T.set(t.identifier, { type: 'btn', btn, el, x: t.clientX, y: t.clientY }); btnDown(btn, el); continue; }
    if (t.clientX < innerWidth * 0.4) {
      T.set(t.identifier, { type: 'joy', ox: t.clientX, oy: t.clientY });
      joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px'; joyBase.classList.remove('hidden'); joyKnob.style.transform = '';
    } else T.set(t.identifier, { type: 'look', x: t.clientX, y: t.clientY });
  }
}, { passive: false });
touchLayer.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = T.get(t.identifier); if (!s) continue;
    if (s.type === 'joy') {
      let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const d = Math.hypot(dx, dy), R = 50;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      P.joyX = dx / R; P.joyY = dy / R; joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (s.type === 'look' || (s.type === 'btn' && s.btn === 'fire')) {
      P.lookX += t.clientX - s.x; P.lookY += t.clientY - s.y; s.x = t.clientX; s.y = t.clientY;
    }
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    const s = T.get(t.identifier); if (!s) continue; T.delete(t.identifier);
    if (s.type === 'joy') { P.joyX = P.joyY = 0; joyBase.classList.add('hidden'); }
    if (s.type === 'btn') { s.el.classList.remove('pressed'); if (s.btn === 'fire' && ![...T.values()].some(v => v.btn === 'fire')) P.firing = false; }
  }
}
touchLayer.addEventListener('touchend', touchEnd); touchLayer.addEventListener('touchcancel', touchEnd);

// ---------------- UI wiring ----------------
const lobbyOpts = { team: 'blue', size: 5, target: 30, diff: 'normal' };
document.querySelectorAll('#lobby .seg').forEach(seg => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach(x => x.classList.remove('on', 'blue', 'red'));
  b.classList.add('on'); if (seg.dataset.k === 'team') b.classList.add(b.dataset.v);
  const v = b.dataset.v; lobbyOpts[seg.dataset.k] = isNaN(+v) ? v : +v;
}));
$('btnStart').addEventListener('click', () => { unlockAudio(); startMatch({ ...lobbyOpts }); });
async function goFull() {
  try { if (!document.fullscreenElement) await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) || document.documentElement.webkitRequestFullscreen?.()); } catch (e) {}
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { if (innerHeight > innerWidth) HUD.centerMsg('请手动将手机横过来', 1800); }
}
$('btnFull').addEventListener('click', goFull); $('btnFull2').addEventListener('click', goFull); $('tFull').addEventListener('click', goFull);
function showScoreboard(on) {
  $('sbPanel').innerHTML = HUD.scoreboardHTML(G, '战绩') + '<button class="close" id="sbClose">关闭</button>';
  $('scoreboard').classList.toggle('hidden', !on);
  $('sbClose').onclick = () => showScoreboard(false);
}
$('tSb').addEventListener('click', () => showScoreboard($('scoreboard').classList.contains('hidden')));
$('scoreboard').addEventListener('click', (e) => { if (e.target.id === 'scoreboard') showScoreboard(false); });
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
const openSettings = () => { syncSettingsUI(); $('btnQuit').classList.toggle('hidden', G.state !== 'playing'); $('settings').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); };
$('btnSettings').addEventListener('click', openSettings); $('tSet').addEventListener('click', openSettings);
$('setClose').addEventListener('click', () => $('settings').classList.add('hidden'));
function toLobby() {
  G.state = 'lobby'; $('settings').classList.add('hidden'); $('endScr').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('topBtns').classList.add('hidden'); $('lobby').classList.remove('hidden');
}
$('btnQuit').addEventListener('click', toLobby);
$('btnLobby').addEventListener('click', toLobby);
$('btnAgain').addEventListener('click', () => startMatch(G.opts));
syncSettingsUI();

// ---------------- main loop ----------------
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
  if (G.state === 'playing') {
    G.now += dt; G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; endMatch(); }
    for (const e of G.entities) if (!e.alive && G.now >= e.respawnAt && G.state === 'playing') respawn(e);
    updatePlayer(dt);
    for (const b of G.bots) updateBot(b, dt, G);
  }
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
  renderer.clear();
  renderer.render(scene, camera);
  if (G.player?.alive && !(P.scoped && G.weapon.scope) && G.state === 'playing') { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}
requestAnimationFrame(loop);
