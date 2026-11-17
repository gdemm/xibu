// 西部赏金 · 红石镇 —— 主程序
import * as THREE from 'three';
import { A, loadAll, fit, character } from './assets.js';
import { AudioSys } from './audio.js';
import { createScene, setupSky, buildTerrain, buildWorld, TOWN, SUN_DIR, terrainH, floorAt, collide, boxRayDist, worldRay, worldRayDist, groundRayDist, boxes, tumbleweeds } from './scene.js';
import { createPost } from './post.js';
import { createFx } from './fx.js';
import { makeAnimator } from './anim.js';
import { createTown, SPOTS as TOWN_SPOTS } from './town.js';
import { createWild, PELTS } from './wild.js';
import { createHorse, callHorse, canMount, updateHorse, seatRider, mount, dismount, updateReins } from './ride.js';

const $ = id => document.getElementById(id);
const TEST = /[?&]test=1/.test(location.search);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

// ---------------- 设置 ----------------
const cfg = Object.assign({ sens: 1.2, aim: 2, q: 2 }, JSON.parse(localStorage.getItem('xb_cfg') || '{}'));
const qParam = location.search.match(/[?&]q=(\d)/); if (qParam) cfg.q = +qParam[1];
let ROT = false;
const VW = () => ROT ? innerHeight : innerWidth, VH = () => ROT ? innerWidth : innerHeight;
const tx = t => ROT ? t.clientY : t.clientX, ty = t => ROT ? innerWidth - t.clientX : t.clientY;
const saveCfg = () => localStorage.setItem('xb_cfg', JSON.stringify(cfg));

// ---------------- 渲染器 / 场景 ----------------
const canvas = $('c');
const { renderer, scene, camera, sun } = createScene(canvas);
renderer.info.autoReset = false;
let post = null, fx = null, sunGlow = null;
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cfg.q >= 2 ? 2 : cfg.q >= 1 ? 1.4 : 1));
  const sz = cfg.q >= 2 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  sun.shadow.radius = cfg.q >= 2 ? 4 : 2;
  post?.setQuality(cfg.q); fx?.setQuality(cfg.q);
  resize();
}
function applyRot() {
  ROT = cfg.rot === 1 && innerHeight > innerWidth;
  document.body.classList.toggle('rot', ROT);
  const st = document.body.style; st.setProperty('--lw', innerHeight + 'px'); st.setProperty('--lh', innerWidth + 'px'); st.setProperty('--sw', innerWidth + 'px');
  const rs = document.documentElement.style; rs.setProperty('--vw', VW() / 100 + 'px'); rs.setProperty('--vh', VH() / 100 + 'px');
}
function resize() {
  applyRot();
  renderer.setSize(VW(), VH(), false);
  camera.aspect = VW() / VH(); camera.updateProjectionMatrix();
  post?.setSize(VW(), VH());
}
addEventListener('resize', resize);

// ---------------- 状态 ----------------
const S = { mode: 'load', free: true, mission: false, honor: 0, wave: 0, bounty: 40, shots: 0, hits: 0, heads: 0, kills: 0, t0: 0, paused: false, timeScale: 1, time: 0, deW: 0, slowW: 0, hurtW: 0 };
const P = { pos: new THREE.Vector3(-4, 0, 7), vel: new THREE.Vector3(), vy: 0, yaw: -Math.PI / 2, pitch: -0.05, body: Math.PI / 2, hp: 100, de: 40, ammo: 6, reserve: 36,
  reloadT: 0, fireCD: 0, lastHurt: -99, onGround: true, ch: null, an: null, sprint: false, aimT: 0, aimHeld: false, dead: false, riding: false };
let H = null;   // 马
let town = null; // 镇民与互动点
let wild = null; // 野生动物
const INV = {};  // 背包：皮毛
const honorMul = () => S.honor >= 50 ? .8 : S.honor <= -50 ? 1.5 : 1;
const honorName = () => S.honor >= 50 ? '好人' : S.honor <= -50 ? '恶棍' : S.honor <= -20 ? '名声不佳' : '普通';

// ---------------- 输入 ----------------
const inp = { mx: 0, mz: 0, keys: {}, look: { dx: 0, dy: 0 }, fireHeld: false, firePressed: false, gallop: false };
let joyId = null, fireId = null, aimId = null, joyUpT = 0;
const lookIds = new Map();
const joy = $('joy'), knob = $('knob');
function joyCenter() { const r = joy.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return ROT ? { x: cy, y: innerWidth - cx, R: r.width / 2 } : { x: cx, y: cy, R: r.width / 2 }; }
function setJoy(x, y) {
  const c = joyCenter(); let dx = x - c.x, dy = y - c.y; const d = Math.hypot(dx, dy), m = c.R * .8;
  if (d > m) { dx *= m / d; dy *= m / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  inp.mx = dx / m; inp.mz = dy / m; P.sprint = d > m * 1.05;
}
const btnAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest('.tb'); };
const touchEl = $('touch');
touchEl.addEventListener('touchstart', e => {
  e.preventDefault(); audio.unlock();
  for (const t of e.changedTouches) {
    const b = btnAt(t.clientX, t.clientY);
    if (b) {
      b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120);
      if (b.id === 'bFire') { fireId = t.identifier; inp.fireHeld = true; inp.firePressed = true; lookIds.set(t.identifier, { x: tx(t), y: ty(t) }); }
      else if (b.id === 'bAim') { aimId = t.identifier; P.aimHeld = true; lookIds.set(t.identifier, { x: tx(t), y: ty(t) }); }
      else if (b.id === 'bDE') toggleDeadeye();
      else if (b.id === 'bRel') reload();
      else if (b.id === 'bJump') jump();
      else if (b.id === 'bHorse') horseAction();
      else if (b.id === 'bGallop') { inp.gallop = true; b.dataset.tid = t.identifier; }
      else if (b.id === 'bSet') openSettings();
      else if (b.id === 'bAct') interact();
      else if (b.id === 'bMute') { audio.setMuted(!audio.muted); b.textContent = audio.muted ? '🔇' : '🔊'; }
      continue;
    }
    if (tx(t) < VW() * .42 && joyId === null) {
      joyId = t.identifier; setJoy(tx(t), ty(t));
      if (S.time - joyUpT < .3 && P.riding) inp.gallop = true;     // 双击摇杆 = 疾驰
    } else {
      lookIds.set(t.identifier, { x: tx(t), y: ty(t) });
      if (S.deadeye) markAt(tx(t), ty(t));
      if (S.mode === 'duel') inp.firePressed = true;
    }
  }
}, { passive: false });
touchEl.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) setJoy(tx(t), ty(t));
    const l = lookIds.get(t.identifier);
    if (l) { inp.look.dx += tx(t) - l.x; inp.look.dy += ty(t) - l.y; l.x = tx(t); l.y = ty(t); }
  }
}, { passive: false });
const tEnd = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; inp.mx = inp.mz = 0; P.sprint = false; knob.style.transform = ''; joyUpT = S.time; if (!$('bGallop').dataset.tid) inp.gallop = false; }
    if (t.identifier === fireId) { fireId = null; inp.fireHeld = false; }
    if (t.identifier === aimId) { aimId = null; P.aimHeld = false; }
    if (String(t.identifier) === $('bGallop').dataset.tid) { delete $('bGallop').dataset.tid; inp.gallop = false; }
    lookIds.delete(t.identifier);
  }
};
touchEl.addEventListener('touchend', tEnd); touchEl.addEventListener('touchcancel', tEnd);
addEventListener('keydown', e => {
  inp.keys[e.code] = true;
  if (e.code === 'KeyR') reload(); if (e.code === 'Space') jump(); if (e.code === 'KeyE' || e.code === 'KeyQ') toggleDeadeye();
  if (e.code === 'KeyF') horseAction(); if (e.code === 'KeyH') whistle(); if (e.code === 'KeyT') interact();
});
addEventListener('keyup', e => inp.keys[e.code] = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  audio.unlock();
  if (S.mode !== 'play' && S.mode !== 'duel') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 2) { P.aimHeld = true; return; }
  if (S.deadeye) markAt(VW() / 2, VH() / 2); else { inp.fireHeld = true; inp.firePressed = true; }
});
addEventListener('mouseup', e => { if (isTouch) return; if (e.button === 2) P.aimHeld = false; else inp.fireHeld = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { inp.look.dx += e.movementX; inp.look.dy += e.movementY; } });

const audio = new AudioSys();

// ---------------- 敌人 ----------------
const enemies = [];
const pickups = [];
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
function spawnEnemy(boss = false) {
  const ch = character(boss ? 'boss' : 'bandit');
  if (boss) ch.root.scale.setScalar(1.06);
  const an = makeAnimator(ch);
  const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 25;
  const pos = boss ? new THREE.Vector3(10, 0, 7) : new THREE.Vector3(TOWN.x + Math.cos(a) * r, 0, TOWN.z + Math.sin(a) * r * .8);
  pos.y = floorAt(pos.x, pos.z);
  ch.root.position.copy(pos); scene.add(ch.root);
  const e = { ch, an, pos, hp: boss ? 100 : 70, boss, state: boss ? 'duel' : 'move', target: null, t: 0, shootT: 2 + Math.random() * 2, dead: false, deadT: 0,
    yaw: 0, hurtT: 0, speed: 3.4 + Math.random() * .8, repT: 6 + Math.random() * 4, aimT: 0, slide: new THREE.Vector3(), frame: Math.random() * 2 | 0 };
  pickCover(e);
  if (boss) an.setReady(true);
  enemies.push(e); return e;
}
function pickCover(e) {
  const cands = boxes.filter(b => b.maxY < 2.5 && b.maxY > .55 && Math.hypot((b.minX + b.maxX) / 2 - P.pos.x, (b.minZ + b.maxZ) / 2 - P.pos.z) < 30);
  let t;
  if (cands.length && Math.random() < .7) {
    const b = cands[Math.random() * cands.length | 0];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const away = new THREE.Vector3(cx - P.pos.x, 0, cz - P.pos.z).normalize();
    t = new THREE.Vector3(cx + away.x * 1.4, 0, cz + away.z * 1.4);
  } else {
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 12;
    t = new THREE.Vector3(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r);
  }
  e.target = t;
}
function faceDir(e, x, z, dt, k = 10) { const ty = Math.atan2(x, z); let d = ty - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * Math.min(1, dt * k); }
function faceTo(e, p, dt) { faceDir(e, p.x - e.pos.x, p.z - e.pos.z, dt); }
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const distCam = e.pos.distanceTo(camera.position);
    // 远处的敌人隔帧更新动作（省 CPU）
    e.frame++; e.accDt = (e.accDt || 0) + dt;
    if (distCam < 45 || e.frame % 2 === 0) { e.an.update(e.accDt); e.accDt = 0; }
    if (e.dead) {
      e.deadT += dt;
      if (e.deadT < .5) e.pos.addScaledVector(e.slide, dt * (1 - e.deadT / .5) * 1.6);
      e.pos.y = floorAt(e.pos.x, e.pos.z);
      e.ch.root.position.copy(e.pos);
      if (e.deadT > 9 && !e.boss) { scene.remove(e.ch.root); enemies.splice(i, 1); }
      continue;
    }
    if (e.state === 'duel') { faceTo(e, P.pos, dt); e.ch.root.position.copy(e.pos); e.ch.root.rotation.y = e.yaw; continue; }
    e.hurtT -= dt; e.aimT -= dt;
    const toP = _v1.subVectors(P.pos, e.pos); const distP = toP.length();
    let spd = 0;
    if (e.state === 'move') {
      const d = _v2.subVectors(e.target, e.pos); d.y = 0; const dl = d.length();
      if (dl < .6) { e.state = 'fight'; e.t = 0; }
      else {
        d.multiplyScalar(1 / dl);
        const old = _v3.copy(e.pos);
        e.pos.addScaledVector(d, e.speed * dt); collide(e.pos, .4, e.pos.y); e.pos.y = floorAt(e.pos.x, e.pos.z);
        spd = old.distanceTo(e.pos) / Math.max(dt, 1e-4);
        if (spd < e.speed * .25) { e.stuck = (e.stuck || 0) + dt; if (e.stuck > 1) { e.stuck = 0; pickCover(e); } }
        if (e.aimT > 0) faceTo(e, P.pos, dt); else faceDir(e, d.x, d.z, dt);
        if (distP < 28) e.shootT -= dt * .5;
      }
    } else {
      faceTo(e, P.pos, dt); e.t += dt; e.shootT -= dt;
      if (e.t > e.repT || distP < 5) { e.state = 'move'; e.repT = 5 + Math.random() * 5; pickCover(e); }
    }
    e.an.setLocomotion(spd);
    e.an.setReady(e.state === 'fight');
    e.an.setAim(e.aimT > 0);
    e.an.setAimPitch(Math.atan2(P.pos.y + 1.2 - (e.pos.y + 1.4), Math.max(1, distP)));
    if (e.shootT <= 0 && !P.dead && S.mode === 'play') {
      e.shootT = 1.6 + Math.random() * 1.6;
      if (distP < 55) { e.aimT = 1.1; setTimeout(() => enemyShoot(e, P.pos.distanceTo(e.pos)), 280); }
    }
    e.ch.root.position.copy(e.pos); e.ch.root.rotation.y = e.yaw;
  }
}
function muzzlePos(ch, out) { (ch.muzzle || ch.hand || ch.root).getWorldPosition(out); return out; }
function enemyShoot(e, dist) {
  if (e.dead || P.dead || S.mode !== 'play') return;
  const from = muzzlePos(e.ch, new THREE.Vector3());
  const chest = P.pos.clone(); chest.y += P.riding ? 2.1 : 1.2;
  const dir = chest.clone().sub(from); const L = dir.length(); dir.normalize();
  if (worldRayDist(from, dir, L) < L - .5) return;
  e.an.shoot();
  audio.shot(.45);
  fx.muzzle(from, dir);
  let acc = .62 - dist * .011 - (P.sprint ? .15 : 0) - (S.deadeye ? .3 : 0) - (P.riding && H.speed > 5 ? .25 : 0);
  if (e.hurtT > 0) acc -= .2;
  const hit = Math.random() < Math.max(.08, acc);
  const end = hit ? chest : chest.clone().add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .3) * 2, (Math.random() - .5) * 3));
  fx.tracer(from, end, 0xffc070);
  if (hit) { hurtPlayer(8 + Math.random() * 5); fx.blood(chest, dir); }
  else { audio.ricochet?.(); if (end.y < terrainH(end.x, end.z) + .3) fx.impact(end.setY(terrainH(end.x, end.z) + .05)); }
}
function hurtPlayer(n) {
  if (P.dead) return;
  P.hp -= n; P.lastHurt = S.time; S.hurtW = 1;
  if (!P.riding) P.an.hit(Math.random() < .3);
  shake(.25);
  if (P.hp <= 0) die();
}

// ---------------- 射击 ----------------
function raySphere(o, d, c, r) {
  const oc = _v3.subVectors(o, c), b = oc.dot(d), cc = oc.lengthSq() - r * r, h = b * b - cc;
  if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t > 0 ? t : Infinity;
}
function enemyParts(e) {
  const head = new THREE.Vector3(), body = new THREE.Vector3();
  e.ch.bones.head.getWorldPosition(head); head.y += .08;
  e.ch.bones.spine.getWorldPosition(body); body.y -= .12;
  return { body, head };
}
function traceEnemies(o, d) {
  let best = { t: Infinity, e: null, head: false };
  for (const e of enemies) {
    if (e.dead) continue; const p = enemyParts(e);
    const th = raySphere(o, d, p.head, .17), tb = raySphere(o, d, p.body, .42);
    if (th < best.t) best = { t: th, e, head: true };
    if (tb < best.t) best = { t: tb, e, head: false };
  }
  return best;
}
function assistTarget(o, d, maxDeg) {
  let best = null, bestA = maxDeg * Math.PI / 180;
  for (const e of enemies) {
    if (e.dead) continue; const p = enemyParts(e);
    for (const [pt, head] of [[p.body, false], [p.head, true]]) {
      const v = pt.clone().sub(o); const L = v.length(); v.normalize();
      const a = Math.acos(Math.min(1, v.dot(d))); if (a < bestA && L < 70) {
        if (worldRayDist(o, v, L) < L - .4) continue;
        bestA = a; best = { e, head, dir: v };
      }
    }
  }
  return best;
}
function camDir(out) { return camera.getWorldDirection(out); }
function fire(forceTarget) {
  if (P.reloadT > 0 || P.fireCD > 0 || P.dead) return false;
  if (P.ammo <= 0) { reload(); return false; }
  P.ammo--; P.fireCD = .32; S.shots++; P.aimT = .9;
  audio.shot(1);
  P.an.shoot(); shake(.35);
  const o = camera.position.clone(); let d = camDir(new THREE.Vector3());
  if (forceTarget) {
    const p = enemyParts(forceTarget.e); d = (forceTarget.head ? p.head : p.body).clone().sub(o).normalize();
  } else if (cfg.aim > 0 && (isTouch || cfg.aim === 2)) {
    const a = assistTarget(o, d, cfg.aim === 2 ? 5 : 2.6); if (a) d = a.dir;
  }
  const muzzle = muzzlePos(P.ch, new THREE.Vector3());
  const wh = worldRay(o, d, 200), tw = wh ? wh.distance : 200, tg = groundRayDist(o, d, 200), te = traceEnemies(o, d);
  const tWall = Math.min(tw, tg);
  town?.onGunshot(P.pos); wild?.onGunshot(P.pos);
  const tn = town && !forceTarget ? town.hitTest(o, d) : { t: Infinity };
  const ta = wild && !forceTarget ? wild.hitTest(o, d) : { t: Infinity };
  if (tn.n && tn.t < tWall && tn.t < te.t) {
    const hitP = o.clone().addScaledVector(d, tn.t);
    fx.muzzle(muzzle, hitP.clone().sub(muzzle).normalize()); fx.tracer(muzzle, hitP); fx.blood(hitP, d);
    town.kill(tn.n, d); S.honor -= 20; S.bounty = Math.max(0, S.bounty - 50);
    banner('你打死了无辜镇民 · 荣誉 -20 · 罚 $50', 2200);
  } else if (ta.a && ta.t < tWall && ta.t < te.t) {
    const hitP = o.clone().addScaledVector(d, ta.t);
    fx.muzzle(muzzle, hitP.clone().sub(muzzle).normalize()); fx.tracer(muzzle, hitP); fx.blood(hitP, d);
    if (wild.damage(ta.a, 38, d)) banner(`打到一只${{ deer: '鹿', fox: '狐狸', wolf: '狼' }[ta.a.kind]} · 走近按互动剥皮`, 1800);
    showHit(false);
  } else if (te.e && te.t < tWall) {
    const hitP = o.clone().addScaledVector(d, te.t);
    fx.muzzle(muzzle, hitP.clone().sub(muzzle).normalize());
    fx.tracer(muzzle, hitP); fx.blood(hitP, d);
    damageEnemy(te.e, forceTarget ? 999 : te.head ? 80 : 38, te.head, d);
    showHit(te.head);
  } else {
    const hitP = o.clone().addScaledVector(d, Math.min(tWall, 200));
    fx.muzzle(muzzle, hitP.clone().sub(muzzle).normalize());
    fx.tracer(muzzle, hitP);
    if (tWall < 200) { const n = tw < tg && wh.face ? wh.face.normal.clone().transformDirection(wh.object.matrixWorld) : new THREE.Vector3(0, 1, 0); fx.impact(hitP, n); }
  }
  if (P.ammo === 0) setTimeout(reload, 250);
  return true;
}
function showHit(head) { const h = $('hitm'); h.style.borderColor = head ? '#ff3b2a' : '#fff'; h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120); }
function damageEnemy(e, n, head, dir) {
  S.hits++; if (head) S.heads++;
  e.hp -= n; e.hurtT = 1.2; P.de = Math.min(100, P.de + (head ? 12 : 6));
  if (e.hp <= 0) {
    e.dead = true; S.kills++; S.bounty += e.boss ? 500 : 50 + (head ? 25 : 0); S.honor += 2;
    if (e === S.wanted) { S.wanted = null; S.bounty += 80; S.honor += 5; banner('通缉犯伏法 · 赏金 +$80 · 荣誉 +5', 2200); }
    e.an.die(); P.de = Math.min(100, P.de + 10);
    if (dir) e.slide.set(dir.x, 0, dir.z).normalize().multiplyScalar(.6);
    if (!e.boss && Math.random() < .4) dropPickup(e.pos, Math.random() < .55 ? 'ammo' : 'hp');
  } else e.an.hit(head);
}
function dropPickup(p, kind) {
  let m;
  if (kind === 'ammo') { m = fit(A.crate.scene.clone(true), .35); }
  else {
    m = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .32, 12), new THREE.MeshStandardMaterial({ color: 0x8a4a12, roughness: .15, metalness: .1, transparent: true, opacity: .9 }));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .14, 8), bottle.material); neck.position.y = .38;
    bottle.position.y = .16; m.add(bottle, neck);
  }
  m.position.set(p.x, floorAt(p.x, p.z) + .1, p.z); m.userData.kind = kind; scene.add(m); pickups.push(m);
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const m = pickups[i]; m.rotation.y += dt * 2;
    if (m.position.distanceTo(P.pos) < (P.riding ? 2.5 : 1.5)) {
      if (m.userData.kind === 'ammo') P.reserve += 12; else P.hp = Math.min(100, P.hp + 40);
      audio.pickup(); scene.remove(m); pickups.splice(i, 1);
    }
  }
}
function reload() {
  if (P.reloadT > 0 || P.ammo >= 6 || P.reserve <= 0 || P.dead) return;
  P.reloadT = 1.4; audio.reload(); P.an.reload();
}
function jump() { if (P.onGround && !P.dead && !P.riding && S.mode === 'play') { P.vy = 5.2; P.onGround = false; } }

// ---------------- 马 ----------------
function whistle() {
  if (!H || P.riding || S.mode !== 'play' || P.dead) return;
  if (callHorse(H, P.pos)) { audio.whistle?.(); banner('（口哨）', 800); P.an.interact(); }
}
function horseAction() {
  if (!H || S.mode !== 'play' || P.dead) return;
  if (P.riding) { dismount(H, P); P.riding = false; P.an.setRiding(false); P.body = H.yaw; return; }
  if (canMount(H, P)) { mount(H, P); P.riding = true; P.an.setRiding(true); P.vel.set(0, 0, 0); return; }
  whistle();
}
function updateHorseUI() {
  const b = $('bHorse'), g = $('bGallop');
  if (!H || S.mode !== 'play') { b.style.display = 'none'; g.style.display = 'none'; return; }
  b.style.display = '';
  const t = P.riding ? '下马' : canMount(H, P) ? '上马' : '唤马';
  if (b.textContent !== t) b.textContent = t;
  g.style.display = P.riding ? '' : 'none';
}

// ---------------- 死神之眼 ----------------
const marks = [];
function toggleDeadeye() {
  if (S.mode !== 'play') return;
  if (S.deadeye) { endDeadeye(); return; }
  if (P.de < 25 || P.ammo <= 0) return;
  S.deadeye = true; S.deT = 4; S.timeScale = .25; marks.length = 0; P.aimT = 4.5;
  audio.heartbeat(true);
}
function markAt(x, y) {
  if (!S.deadeye || marks.length >= P.ammo) return;
  const ndc = new THREE.Vector2(x / VW() * 2 - 1, -(y / VH()) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
  const o = rc.ray.origin.clone(), d = rc.ray.direction.clone();
  const a = assistTarget(o, d, 6) || (() => { const t = traceEnemies(o, d); return t.e ? t : null; })();
  if (a) { marks.push({ e: a.e, head: a.head }); renderMarks(); audio.pickup(); }
}
function endDeadeye() {
  S.deadeye = false; audio.heartbeat(false);
  P.de = Math.max(0, P.de - 25 - marks.length * 10);
  const list = marks.splice(0);
  list.forEach((m, i) => setTimeout(() => {
    if (!m.e.dead) { P.fireCD = 0; P.reloadT = 0; fire(m); } renderMarks();
    if (i === list.length - 1) setTimeout(() => S.timeScale = 1, 120);
  }, 140 * i + 80));
  if (!list.length) S.timeScale = 1;
}
function renderMarks() {
  const box = $('marks'); box.innerHTML = '';
  for (const m of marks) {
    const p = enemyParts(m.e)[m.head ? 'head' : 'body'].clone().project(camera);
    const d = document.createElement('div'); d.className = 'mk'; d.textContent = '✕';
    d.style.left = (p.x * .5 + .5) * VW() + 'px'; d.style.top = (-p.y * .5 + .5) * VH() + 'px'; box.appendChild(d);
  }
}

// ---------------- 波次 / 决斗 ----------------
const WAVES = [4, 6, 8];
function banner(t, ms = 1800) { const w = $('wave'); w.textContent = t; w.style.opacity = 1; clearTimeout(banner.h); banner.h = setTimeout(() => w.style.opacity = 0, ms); }
function nextWave() {
  S.wave++;
  if (S.wave > WAVES.length) { startDuel(); return; }
  banner(`第 ${S.wave} 波 · 秃鹫帮来了`);
  const n = WAVES[S.wave - 1];
  S.pend = n;
  for (let i = 0; i < n; i++) setTimeout(() => { S.pend--; if (S.mode === 'play') spawnEnemy(); }, i * 900);
}
function startDuel() {
  if (P.riding) { dismount(H, P); P.riding = false; P.an.setRiding(false); }
  if (S.deadeye) endDeadeye();
  S.mode = 'duel'; banner('最后的悬赏：独眼杰克', 2200);
  for (const e of enemies) scene.remove(e.ch.root);
  enemies.length = 0;
  P.pos.set(-6, floorAt(-6, 7), 7); P.yaw = -Math.PI / 2; P.pitch = 0; P.body = Math.PI / 2; P.vel.set(0, 0, 0);
  if (H) { H.pos.set(-12, 0, 13); H.yaw = Math.PI; H.speed = 0; H.state = 'idle'; H.target = null; }
  S.boss = spawnEnemy(true); S.boss.pos.set(9, floorAt(9, 7), 7);
  $('touch').querySelectorAll('.tb:not(#bFire):not(#bSet):not(#bMute)').forEach(b => b.style.opacity = .25);
  S.duelPhase = 'intro'; S.duelClock = 0; S.duelT = 2.5 + 1.5 + Math.random() * 2.5; $('duel').textContent = '';
  setTimeout(() => { if (S.mode === 'duel' && S.duelPhase !== 'done') $('duel').textContent = '准备…'; }, 2300);
}
function updateDuel(dt, rdt) {
  const b = S.boss; b.an.update(dt);
  b.ch.root.position.copy(b.pos); if (!b.dead) faceTo(b, P.pos, dt); b.ch.root.rotation.y = b.yaw;
  const want = Math.atan2(-(b.pos.x - P.pos.x), -(b.pos.z - P.pos.z));
  P.yaw += Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw)) * Math.min(1, rdt * 6);
  S.duelClock += rdt;
  if (S.duelPhase === 'intro' && S.duelClock > 2.3) S.duelPhase = 'wait';
  S.duelT -= rdt;
  const pressed = inp.firePressed; inp.firePressed = false;
  if (S.duelPhase === 'wait' || S.duelPhase === 'intro') {
    if (pressed && S.duelT < 2.2) { $('duel').textContent = '抢拔了！'; duelLose(.3); return; }
    if (S.duelT <= 0) { S.duelPhase = 'draw'; S.duelT = .8; $('duel').textContent = '拔枪！'; audio.ricochet?.(); b.an.setAim(true); S.timeScale = .35; }
  } else if (S.duelPhase === 'draw') {
    if (pressed) {
      S.duelPhase = 'done'; $('duel').textContent = '';
      P.ammo = Math.max(P.ammo, 1); P.fireCD = 0; P.reloadT = 0; fire({ e: b, head: true });
      S.timeScale = .3; S.duelKill = S.time;
      setTimeout(() => { S.timeScale = 1; }, 1500);
      setTimeout(() => win(), 3000);
    } else if (S.duelT <= 0) { $('duel').textContent = '太慢了…'; duelLose(0); }
  }
}
function duelLose(delay) {
  S.duelPhase = 'done'; S.timeScale = 1;
  setTimeout(() => {
    const b = S.boss; b.an.setAim(true); b.an.shoot(); audio.shot(1);
    const m = muzzlePos(b.ch, new THREE.Vector3()), tgt = P.pos.clone().setY(P.pos.y + 1.3);
    fx.muzzle(m, tgt.clone().sub(m).normalize()); fx.tracer(m, tgt); fx.blood(tgt, tgt.clone().sub(m).normalize()); hurtPlayer(999);
  }, delay * 1000 + 250);
}
function die() {
  P.dead = true; P.an.die(); audio.heartbeat(false);
  if (P.riding) { dismount(H, P); P.riding = false; P.an.setRiding(false); }
  if (S.deadeye) endDeadeye();
  setTimeout(() => showEnd(false), 2200);
}
function win() { S.mode = 'end'; S.honor += 30; S.mainDone = true; showEnd(true); }
function showEnd(won) {
  S.mode = 'end'; document.exitPointerLock?.();
  $('endT').textContent = won ? '赏金到手' : '你倒下了';
  $('roam').classList.toggle('hidden', !won);
  const acc = S.shots ? Math.round(S.hits / S.shots * 100) : 0, tm = Math.round((S.time - S.t0));
  $('endS').innerHTML = `赏金 $${S.bounty} · 击倒 ${S.kills} · 爆头 ${S.heads}<br>命中率 ${acc}% · 用时 ${Math.floor(tm / 60)} 分 ${tm % 60} 秒`;
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
}

// ---------------- 玩家与镜头 ----------------
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _cam = new THREE.Vector3(), _piv = new THREE.Vector3(), _qa = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const CAM = { pos: new THREE.Vector3(), piv: new THREE.Vector3(), dist: 3.2, fov: 60, shake: 0, init: false, side: .55 };
function shake(a) { CAM.shake = Math.max(CAM.shake, a); }
const damp = (k, dt) => 1 - Math.exp(-k * dt);
function angLerp(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }
// 上半身扭转：让瞄准方向与镜头一致（人物脚下朝向不同于镜头时）
function twistSpine(ch, ang) {
  const bs = [ch.bones.spine1, ch.model.getObjectByName('spine_02'), ch.bones.spine];
  ch.root.updateMatrixWorld(true);
  for (const b of bs) {
    if (!b) continue;
    // 动画没覆盖这块骨头时（静止瞄准/开枪姿势），先还原上一帧扭转前的姿态，避免逐帧叠加导致上半身一直转圈
    const u = b.userData;
    if (u.tw && u.tw.equals(b.quaternion)) b.quaternion.copy(u.pre); else u.pre = (u.pre || new THREE.Quaternion());
    u.pre.copy(b.quaternion);
    b.parent.updateMatrixWorld(true);
    b.parent.getWorldQuaternion(_qa);
    const inv = _qa.clone().invert();
    b.quaternion.premultiply(inv.multiply(new THREE.Quaternion().setFromAxisAngle(_up, ang / bs.length)).multiply(_qa));
    b.updateMatrixWorld(true);
    (u.tw || (u.tw = new THREE.Quaternion())).copy(b.quaternion);
  }
}
function updatePlayer(dt, rdt) {
  let sens = cfg.sens * (isTouch ? .0055 : .0025);
  const aiming = !P.dead && (P.aimHeld || P.aimT > 0 || inp.fireHeld || S.deadeye);
  if (aiming) sens *= .7;
  if (cfg.aim > 0 && isTouch && S.mode === 'play') {
    const a = assistTarget(camera.position, camDir(_v2), 7);
    if (a) sens *= cfg.aim === 2 ? .5 : .7;
    $('cross').classList.toggle('on', !!a);
  }
  if (S.mode === 'play') { P.yaw -= inp.look.dx * sens; P.pitch -= inp.look.dy * sens; }
  inp.look.dx = inp.look.dy = 0;
  P.pitch = Math.max(-1.0, Math.min(.75, P.pitch));
  _f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); _r.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  let mx = inp.mx, mz = inp.mz;
  if (inp.keys.KeyW) mz = -1; if (inp.keys.KeyS) mz = 1; if (inp.keys.KeyA) mx = -1; if (inp.keys.KeyD) mx = 1;
  if (!isTouch) { P.sprint = !!inp.keys.ShiftLeft; if (P.riding) inp.gallop = !!inp.keys.ShiftLeft; }
  if (P.dead || S.mode !== 'play') mx = mz = 0;
  const mlen = Math.min(1, Math.hypot(mx, mz));
  const camYawBody = P.yaw + Math.PI;               // 面朝镜头前方时的 root 朝向
  if (P.riding) {
    updateHorse(H, dt, { mx, mz, gallop: inp.gallop, camYaw: P.yaw }, fx);
    P.pos.copy(H.pos); P.body = H.yaw; P.sprint = H.speed > 7;
    P.an.setLocomotion(0); P.an.setAim(aiming); P.an.setAimPitch(P.pitch);
    P.an.update(dt);
    seatRider(H, P.ch);
    if (aiming) { let d = Math.atan2(Math.sin(camYawBody - H.yaw), Math.cos(camYawBody - H.yaw)); d = THREE.MathUtils.clamp(d, -1.9, 1.9); twistSpine(P.ch, d); }
    P.ch.root.updateMatrixWorld(true); updateReins(H, P.ch, aiming);
  } else {
    // 移动：镜头相对
    let speed = mlen < .08 ? 0 : (P.sprint && !aiming ? 6.4 : mlen > .55 && !aiming ? 3.7 : 1.6 * Math.max(.6, mlen));
    const mv = _v1.set(0, 0, 0).addScaledVector(_r, mx).addScaledVector(_f, -mz);
    if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(speed);
    P.vel.lerp(mv, damp(10, dt));
    P.pos.addScaledVector(P.vel, dt);
    collide(P.pos, .38, P.pos.y);
    const fy = floorAt(P.pos.x, P.pos.z);
    P.vy -= 16 * dt; P.pos.y += P.vy * dt;
    if (P.pos.y <= fy) { P.pos.y = fy; P.vy = 0; P.onGround = true; } else if (P.pos.y - fy > .05) P.onGround = false;
    // 朝向：不瞄准时朝移动方向；瞄准时朝镜头（侧移时脚朝移动方向、上半身扭回来）
    const vlen = Math.hypot(P.vel.x, P.vel.z);
    let signed = vlen;
    if (!P.dead) {
      if (aiming) {
        let target = camYawBody;
        if (vlen > .3) {
          const mvYaw = Math.atan2(P.vel.x, P.vel.z);
          let d = Math.atan2(Math.sin(mvYaw - camYawBody), Math.cos(mvYaw - camYawBody));
          if (Math.abs(d) > Math.PI * .6) { d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI)); signed = -vlen; }   // 倒退
          target = camYawBody + THREE.MathUtils.clamp(d, -1.2, 1.2);
        }
        // 只开枪（没按瞄准）：腿不动，上半身扭过去；超过 70° 才让脚慢慢跟上，避免整个人原地猛转
        if (!P.aimHeld && !S.deadeye) {
          if (vlen > .3) target = Math.atan2(P.vel.x, P.vel.z), signed = vlen;
          const off = Math.atan2(Math.sin(camYawBody - P.body), Math.cos(camYawBody - P.body)), lim = 1.2;
          if (vlen > .3) P.body = angLerp(P.body, target, damp(9, dt));
          else if (Math.abs(off) > lim) P.body = angLerp(P.body, camYawBody - Math.sign(off) * lim, damp(8, rdt));
        } else P.body = angLerp(P.body, target, damp(8, rdt));
      } else if (vlen > .3) P.body = angLerp(P.body, Math.atan2(P.vel.x, P.vel.z), damp(9, dt));
    }
    P.an.setLocomotion(P.onGround ? signed : 0);
    P.an.setAim(aiming); P.an.setAimPitch(P.pitch);
    P.an.update(S.deadeye ? rdt * .6 : dt);   // 死神之眼里主角动作不慢下来，举枪更跟手
    P.ch.root.position.copy(P.pos); P.ch.root.rotation.set(0, P.body, 0);
    if (aiming && !P.dead) { let d = Math.atan2(Math.sin(camYawBody - P.body), Math.cos(camYawBody - P.body)); d = THREE.MathUtils.clamp(d, -1.5, 1.5); if (Math.abs(d) > .02) twistSpine(P.ch, d); }
  }
  updateCamera(rdt, aiming);
  P.fireCD -= dt; P.aimT -= rdt;
  if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { const n = Math.min(6 - P.ammo, P.reserve); P.ammo += n; P.reserve -= n; } }
  if (S.time - P.lastHurt > 5 && P.hp < 100 && !P.dead) P.hp = Math.min(100, P.hp + 7 * dt);
  sun.position.copy(P.pos).addScaledVector(SUN_DIR, 140); sun.target.position.copy(P.pos);
}
function updateCamera(rdt, aiming) {
  let dist = 3.2, side = .55, h = 1.62, fov = 60;
  if (aiming) { dist = 1.55; side = .72; h = 1.6; fov = 47; }
  if (P.riding) { dist = aiming ? 3.0 : 5.6; side = aiming ? .7 : .25; h = 2.55; fov = aiming ? 50 : 60 + Math.min(10, H.speed * .8); }
  else if (P.sprint && !aiming && P.vel.lengthSq() > 9) fov += 6;
  if (S.mode === 'duel') { dist = 2.2; side = .55; fov = 40; }
  if (S.deadeye) fov -= 3;
  // 平滑跟随
  const piv = _piv.copy(P.pos).addScaledVector(_r, side); piv.y += h;
  if (!CAM.init) { CAM.piv.copy(piv); CAM.init = true; }
  CAM.piv.lerp(piv, damp(P.riding ? 9 : 14, rdt));
  CAM.piv.y += (piv.y - CAM.piv.y) * damp(20, rdt);
  const back = _v2.set(Math.sin(P.yaw) * Math.cos(P.pitch), -Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
  const hitD = boxRayDist(CAM.piv, back, dist + .3) - .3;
  const want = Math.max(.6, Math.min(dist, hitD));
  CAM.dist += (want - CAM.dist) * damp(want < CAM.dist ? 25 : 6, rdt);
  _cam.copy(CAM.piv).addScaledVector(back, CAM.dist);
  const gy = terrainH(_cam.x, _cam.z) + .3; if (_cam.y < gy) _cam.y = gy;
  camera.position.copy(_cam);
  camera.lookAt(_cam.x - back.x, _cam.y - back.y, _cam.z - back.z);
  // 决斗开场：从 Boss 身后低机位慢推
  if (S.mode === 'duel' && S.duelPhase === 'intro' && S.boss) {
    const k = Math.min(1, S.duelClock / 2.3), b = S.boss.pos;
    const dir = _v3.subVectors(b, P.pos).setY(0).normalize();
    camera.position.set(b.x + dir.x * (3.6 - k * .8) + dir.z * .9, b.y + .9 + k * .2, b.z + dir.z * (3.6 - k * .8) - dir.x * .9);
    camera.lookAt(P.pos.x, P.pos.y + 1.3, P.pos.z); fov = 38;
  }
  // Boss 被击中的慢动作：镜头看向 Boss
  if (S.mode === 'duel' && S.duelPhase === 'done' && S.boss?.dead && S.time - S.duelKill < 2.6) {
    const b = S.boss.pos; camera.lookAt(b.x, b.y + 1.0, b.z); fov = 34;
  }
  // 后坐 / 震动
  if (CAM.shake > 0) {
    const s = CAM.shake * CAM.shake;
    camera.rotation.x += (Math.random() - .3) * .02 * s; camera.rotation.y += (Math.random() - .5) * .012 * s;
    camera.position.y += (Math.random() - .5) * .03 * s;
    CAM.shake = Math.max(0, CAM.shake - rdt * 5);
  }
  CAM.fov += (fov - CAM.fov) * damp(10, rdt);
  if (Math.abs(camera.fov - CAM.fov) > .01) { camera.fov = CAM.fov; camera.updateProjectionMatrix(); }
  $('cross').style.opacity = aiming || S.mode === 'duel' ? 1 : .45;
  $('cross').style.transform = `translate(-50%,-50%) scale(${aiming ? 1 : .7})`;
}

// ---------------- HUD ----------------
const mini = $('mini').getContext('2d');
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = .08;
  $('hp').firstChild.style.width = Math.max(0, P.hp) + '%';
  $('de').firstChild.style.width = P.de + '%';
  $('bounty').textContent = '$' + S.bounty;
  if (S.free && S.mode === 'play') { $('wavei').textContent = `${S.wanted ? '追捕通缉犯' : '自由漫游'} · 荣誉 ${S.honor}（${honorName()}）`; $('left').style.display = 'none'; }
  else { $('wavei').textContent = S.mode === 'duel' ? '决斗' : `第 ${Math.max(1, S.wave)} 波`; $('left').style.display = ''; $('left').textContent = '剩 ' + enemies.filter(e => !e.dead).length; }
  const canAct = S.mode === 'play' && !P.riding && !P.dead;
  const spot = town && canAct ? town.nearSpot(P.pos) : null;
  const carc = !spot && wild && canAct ? wild.nearCarcass(P.pos) : null;
  $('bAct').classList.toggle('hidden', !spot && !carc); $('actHint').classList.toggle('hidden', (!spot && !carc) || isTouch);
  $('bAct').textContent = carc ? '剥皮' : '互动';
  if (spot) $('actHint').textContent = `按 T 进入${spot.name}`; else if (carc) $('actHint').textContent = '按 T 剥皮';
  let h = ''; for (let i = 0; i < 6; i++) h += `<b class="${i < P.ammo ? '' : 'e'}"></b>`;
  $('ammo').innerHTML = h + `<span style="margin-left:8px">${P.reloadT > 0 ? '装弹中…' : '× ' + P.reserve}</span>`;
  if (S.mode === 'play') $('bDE').style.opacity = P.de >= 25 || S.deadeye ? 1 : .45;
  updateHorseUI();
  const W = 192, c = mini; c.clearRect(0, 0, W, W);
  c.save(); c.translate(W / 2, W / 2); c.rotate(P.yaw);
  c.fillStyle = 'rgba(120,80,40,.6)';
  for (const b of boxes) { if (b.maxY < 2.5) continue; const x = (b.minX - P.pos.x) * 1.6, z = (b.minZ - P.pos.z) * 1.6; if (Math.abs(x) > 110 || Math.abs(z) > 110) continue; c.fillRect(x, z, (b.maxX - b.minX) * 1.6, (b.maxZ - b.minZ) * 1.6); }
  for (const e of enemies) { if (e.dead) continue; let x = (e.pos.x - P.pos.x) * 1.6, z = (e.pos.z - P.pos.z) * 1.6; const d = Math.hypot(x, z); if (d > 88) { x *= 88 / d; z *= 88 / d; } c.fillStyle = '#e8321e'; c.beginPath(); c.arc(x, z, 6, 0, 7); c.fill(); }
  if (town) {
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (const n of town.npcs) { if (n.dead) continue; const x = (n.pos.x - P.pos.x) * 1.6, z = (n.pos.z - P.pos.z) * 1.6; if (Math.hypot(x, z) > 90) continue; c.beginPath(); c.arc(x, z, 3, 0, 7); c.fill(); }
    if (wild) { for (const a of wild.animals) { if (a.dead && a.skinned) continue; const x = (a.pos.x - P.pos.x) * 1.6, z = (a.pos.z - P.pos.z) * 1.6; if (Math.hypot(x, z) > 90) continue; c.fillStyle = a.dead ? '#8a6a4a' : a.kind === 'wolf' ? '#9aa0a8' : '#c08850'; c.beginPath(); c.arc(x, z, 3.5, 0, 7); c.fill(); } }
    c.fillStyle = '#ffc860';
    for (const sp of TOWN_SPOTS) { let x = (sp.x - P.pos.x) * 1.6, z = (sp.z - P.pos.z) * 1.6; const d = Math.hypot(x, z); if (d > 88) { x *= 88 / d; z *= 88 / d; } c.beginPath(); c.arc(x, z, 5, 0, 7); c.fill(); }
  }
  if (H && !P.riding) { let x = (H.pos.x - P.pos.x) * 1.6, z = (H.pos.z - P.pos.z) * 1.6; const d = Math.hypot(x, z); if (d > 88) { x *= 88 / d; z *= 88 / d; } c.fillStyle = '#f0d9a0'; c.fillRect(x - 5, z - 5, 10, 10); }
  c.restore();
  c.fillStyle = '#ffe6b0'; c.beginPath(); c.moveTo(W / 2, W / 2 - 10); c.lineTo(W / 2 - 7, W / 2 + 7); c.lineTo(W / 2 + 7, W / 2 + 7); c.fill();
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
const SKY_SUN = new THREE.Vector3(0.828, 0.086, 0.554).normalize();   // 天空图里太阳的方向
const perf = { t: 0, n: 0, checked: false };
function loop() {
  requestAnimationFrame(loop);
  const rdt = Math.min(clock.getDelta(), 1 / 20);
  if (S.paused || S.mode === 'load') { renderer.info.reset(); if (post) post.render(0); else renderer.render(scene, camera); return; }
  const dt = rdt * S.timeScale; S.time += rdt;
  if (S.mode === 'play' || S.mode === 'duel' || S.mode === 'end') {
    if (S.mode === 'play' && inp.firePressed) { inp.firePressed = false; if (!S.deadeye) fire(); else markAt(VW() / 2, VH() / 2); }
    if (S.mode === 'play' && inp.fireHeld && !S.deadeye && !isTouch) fire();
    if (H && !P.riding) updateHorse(H, dt, { mx: 0, mz: 0, gallop: false, camYaw: P.yaw }, fx);
    updatePlayer(dt, rdt);
    if (S.mode === 'duel') updateDuel(dt, rdt); else updateEnemies(dt);
    if (town) town.update(dt, camera.position, S.mode !== 'play', S.honor <= -40 ? P.pos : null);
    if (wild && S.mode === 'play') wild.update(dt, P.pos, camera.position, P.riding);
    updatePickups(dt);
    if (S.deadeye) { S.deT -= rdt; renderMarks(); if (S.deT <= 0) endDeadeye(); }
  }
  for (const t of tumbleweeds) {
    t.position.x += t.userData.v * dt; t.rotation.z -= t.userData.v * dt / .45;
    if (t.position.x > 90) t.position.x = -90;
    t.position.y = terrainH(t.position.x, t.position.z) + Math.abs(Math.sin(S.time * 3 + t.userData.v)) * .25;
  }
  // 后期参数
  S.deW += ((S.deadeye ? 1 : (S.mode === 'duel' && S.duelPhase !== 'done' ? .3 : 0)) - S.deW) * damp(6, rdt);
  S.slowW += ((S.timeScale < .9 ? 1 : 0) - S.slowW) * damp(6, rdt);
  S.hurtW = Math.max(P.dead ? .8 : Math.max(0, 100 - P.hp) / 220, S.hurtW - rdt * 2.2);
  post.U.uDeadeye.value = S.deW; post.U.uSlowmo.value = S.slowW; post.U.uHurt.value = THREE.MathUtils.clamp(S.hurtW, 0, 1);
  if (sunGlow) sunGlow.position.copy(camera.position).addScaledVector(SKY_SUN, 900);
  fx.update(dt, rdt); updateHud(rdt);
  renderer.info.reset();
  post.render(rdt);
  // 自动降画质：开局 6 秒平均帧率 < 28
  if (S.mode === 'play' && !perf.checked && !TEST) {
    perf.t += rdt; perf.n++;
    if (perf.t > 6) { perf.checked = true; const fps = perf.n / perf.t; if (fps < 28 && cfg.q > 0) { cfg.q--; saveCfg(); syncSettingsUI(); applyQuality(); banner('已自动降低画质', 1500); } }
  }
}
const _nw = nextWave;
function guardedNext() { if (S._busy) return; S._busy = true; setTimeout(() => { S._busy = false; }, 4000); _nw(); }

// ---------------- 镇上互动 ----------------
function interact() {
  if (!town || S.mode !== 'play' || P.riding || P.dead || S.paused) return;
  const sp = town.nearSpot(P.pos);
  if (!sp) {
    const a = wild?.nearCarcass(P.pos); if (!a) return;
    const pelt = wild.skin(a); INV[pelt] = (INV[pelt] || 0) + 1; P.an.interact?.();
    banner(`得到 ${pelt}（拿去杂货铺卖）`, 1600); return;
  }
  S.paused = true; document.exitPointerLock?.(); P.an.interact?.();
  renderShop(sp);
  $('shop').classList.remove('hidden');
}
function renderShop(sp) {
  const money = S.bounty, box = $('shopBody'); $('shopT').textContent = sp.name;
  const item = (id, txt, cost) => `<button class="btn" data-buy="${id}" ${cost > money ? 'disabled style="opacity:.45"' : ''}>${txt}${cost ? ` · $${cost}` : ''}</button>`;
  const inv = Object.entries(INV).filter(([, n]) => n > 0);
  let h = `<p>身上有 $${money} · 荣誉 ${S.honor}（${honorName()}）${inv.length ? ' · 背包：' + inv.map(([k, n]) => k + '×' + n).join(' ') : ''}</p>`;
  const mul = honorMul(), price = c => Math.round(c * mul);
  if (mul !== 1 && sp.id !== 'board') h += `<p style="color:#7a1d10">${mul < 1 ? '老板认得你是好人，打八折' : '老板不待见你，价钱加五成'}</p>`;
  if (sp.id === 'board') {
    h += S.mission ? '<p>秃鹫帮的悬赏已经接下了，去把他们找出来。</p>'
      : S.mainDone ? '<p>秃鹫帮已被剿灭。</p>' : '<p>【悬赏 $500】秃鹫帮在镇外作乱。清掉三波匪徒，再在大街上击败头目「独眼杰克」。</p>' + item('mission', '接下悬赏', 0);
    if (!S.mission) h += S.wanted ? '<p>通缉犯还在逃，小地图上的红点就是他。</p>' : '<p>【通缉 $80】一个逃犯躲在镇外，活要见人死要见尸。</p>' + item('wanted', '接下通缉', 0);
  }
  if (sp.id === 'store') {
    h += '<p>老板擦着柜台：要点什么？</p>' + item('ammo', '子弹 ×12', price(20)) + item('med', '药水（回 50 血）', price(30));
    if (inv.length) h += `<button class="btn alt" data-buy="sell">卖掉全部皮毛 · +$${inv.reduce((s, [k, n]) => s + PELTS[k] * n, 0)}</button>`;
  }
  if (sp.id === 'saloon') h += '<p>钢琴在角落里叮叮当当地响。</p>' + item('whisky', '威士忌（死神之眼回满）', price(5)) + item('dice', '掷骰子 · 押 $10', 10) + (S.diceMsg ? `<p>${S.diceMsg}</p>` : '');
  box.innerHTML = h;
  box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, sp));
}
function closeShop() { $('shop').classList.add('hidden'); S.paused = false; clock.getDelta(); if (!isTouch && S.mode === 'play') canvas.requestPointerLock?.(); }
function buy(id, sp) {
  const mul = honorMul(); const cost = { ammo: Math.round(20 * mul), med: Math.round(30 * mul), whisky: Math.round(5 * mul), mission: 0, wanted: 0, sell: 0, dice: 10 }[id];
  if (cost > S.bounty) return;
  S.bounty -= cost; audio.unlock();
  if (id === 'ammo') P.reserve += 12;
  if (id === 'med') P.hp = Math.min(100, P.hp + 50);
  if (id === 'whisky') P.de = 100;
  if (id === 'sell') { for (const k in INV) { S.bounty += PELTS[k] * INV[k]; INV[k] = 0; } }
  if (id === 'dice') {
    const r = () => 1 + (Math.random() * 6 | 0), me = r() + r(), house = r() + r();
    S.bounty += me > house ? 20 : me === house ? 10 : 0;
    S.diceMsg = `你掷出 ${me}，庄家 ${house}：${me > house ? '赢了 $10' : me === house ? '平局，退回押注' : '输了 $10'}`;
  }
  if (id === 'wanted') { closeShop(); spawnWanted(); return; }
  if (id === 'mission') { closeShop(); S.mission = true; S.free = false; S.wave = 0; guardedNext(); return; }
  renderShop(sp);
}
$('shopX').onclick = () => { S.diceMsg = ''; closeShop(); };
function spawnWanted() {
  const e = spawnEnemy(false); const a = Math.random() * 6.283, r = 70 + Math.random() * 50;
  e.pos.set(TOWN.x + Math.cos(a) * r, 0, TOWN.z + Math.sin(a) * r); e.pos.y = floorAt(e.pos.x, e.pos.z);
  e.hp = 90; e.target = e.pos.clone(); S.wanted = e;
  banner('通缉犯在镇外 · 看小地图红点', 2200);
}
$('roam').onclick = () => {
  $('end').classList.add('hidden'); $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  $('touch').querySelectorAll('.tb').forEach(b => b.style.opacity = '');
  for (const e of enemies) scene.remove(e.ch.root); enemies.length = 0; S.boss = null;
  S.mode = 'play'; S.free = true; S.mission = false; S.wave = 0; S.timeScale = 1; $('duel').textContent = '';
  P.pos.set(-4, floorAt(-4, 7), 7); P.vel.set(0, 0, 0);
  if (!isTouch) canvas.requestPointerLock?.();
  banner('回到红石镇', 1500);
};

// ---------------- 开始 / 设置 ----------------
function syncSettingsUI() {
  $('sSens').value = cfg.sens; $('vSens').textContent = (+cfg.sens).toFixed(1); $('sAim').value = cfg.aim; $('sQ').value = cfg.q; $('sRot').value = cfg.rot || 0;
}
$('sSens').oninput = e => { cfg.sens = +e.target.value; $('vSens').textContent = cfg.sens.toFixed(1); saveCfg(); };
$('sAim').onchange = e => { cfg.aim = +e.target.value; saveCfg(); };
$('sRot').onchange = e => { cfg.rot = +e.target.value; saveCfg(); resize(); };
$('forceRot').onclick = () => { cfg.rot = 1; saveCfg(); syncSettingsUI(); resize(); };
$('quit').onclick = () => { try { document.fullscreenElement && document.exitFullscreen(); } catch {} location.reload(); };
$('sQ').onchange = e => { cfg.q = +e.target.value; saveCfg(); perf.checked = true; applyQuality(); };
function openSettings() {
  S.paused = true; document.exitPointerLock?.();
  $('go').classList.add('hidden'); $('resume').classList.remove('hidden'); $('quit').classList.remove('hidden'); $('start').classList.add('pz'); $('start').classList.remove('hidden');
}
$('resume').onclick = () => { $('start').classList.add('hidden'); S.paused = false; clock.getDelta(); };
$('go').onclick = () => { audio.unlock(); startGame(); };
$('again').onclick = () => location.reload();
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.mode === 'play')) openSettings(); });

function startGame() {
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  S.mode = 'play'; S.t0 = S.time; S.wave = 0; S.bounty = 40; S.free = true; S.mission = false; S.honor = 0;
  if (!isTouch) canvas.requestPointerLock?.();
  try { if (isTouch && document.documentElement.requestFullscreen && !TEST) document.documentElement.requestFullscreen().catch(() => {}); } catch {}
  banner('红石镇 · 自由漫游', 2000);
}

async function boot() {
  applyQuality(); syncSettingsUI();
  await loadAll(p => $('loading').textContent = `正在装填子弹… ${Math.round(p * 100)}%`);
  sunGlow = setupSky(renderer, scene);
  buildTerrain(scene);
  buildWorld(scene);
  post = createPost(renderer, scene, camera, cfg.q);
  fx = createFx(scene, camera, cfg.q); fx.setSun(SUN_DIR.clone().negate());
  applyQuality();
  P.ch = character('player'); P.an = makeAnimator(P.ch); scene.add(P.ch.root);
  P.pos.y = floorAt(P.pos.x, P.pos.z);
  town = createTown(scene);
  wild = createWild(scene, { onBite: n => { if (S.mode === 'play') hurtPlayer(n); } });
  if (A.horse) H = createHorse(scene, new THREE.Vector3(-9, 0, 3.2));
  if (H) { H.yaw = Math.PI / 2; }
  $('loading').classList.add('hidden');
  S.mode = 'menu';
  updatePlayer(0, 1);
  if (TEST) startGame(); else $('start').classList.remove('hidden');
}
setInterval(() => {
  if (S.mission && S.mode === 'play' && S.wave > 0 && !S._busy && !enemies.some(e => !e.dead) && !(S.pend > 0)) guardedNext();
}, 500);
window.__xb = {
  S, P, enemies, cfg, scene, camera, renderer, fire, spawnEnemy, startDuel, toggleDeadeye, boxes,
  get post() { return post; }, get fx() { return fx; }, get horse() { return H; }, get town() { return town; }, get wild() { return wild; }, INV, interact, horseAction, whistle, endDeadeye, markAt, inp,
};
loop(); boot();
