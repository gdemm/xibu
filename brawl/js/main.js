// 英雄大乱斗 — bootstrap, lobby, input, camera, HUD
import * as THREE from 'three';
import { CHARS, ORDER, makeBrawler, animBrawler } from './chars.js';
import { makeFX } from './fx.js';
import { createGame } from './game.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(/^(localhost|127\.)/.test(location.hostname) ? location.search : '');
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2aa3e0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9ab0, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(6, 12, 8); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 2, 1, 200);
const FX = makeFX(scene);

// ---------- lobby scene ----------
const lob = new THREE.Scene(); lob.background = null;
lob.add(new THREE.HemisphereLight(0xffffff, 0x8a9ab0, 1.6)); const ls = new THREE.DirectionalLight(0xffffff, 2.2); ls.position.set(3, 8, 7); lob.add(ls);
const lcam = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 40), new THREE.MeshToonMaterial({ color: 0xffd23f })); podium.position.y = -0.2; lob.add(podium);
const podO = new THREE.Mesh(podium.geometry, new THREE.MeshBasicMaterial({ color: 0x1a1022, side: THREE.BackSide })); podO.scale.setScalar(1.04); podium.add(podO);
let lobMesh = null, sel = localStorage.getItem('mdl_kind') || 'chef'; if (!CHARS[sel]) sel = 'chef';
let opts = { n: 16, diff: 1, mode: localStorage.getItem('mdl_mode') || 'party' }; if (!['party', 'solo', 'duo'].includes(opts.mode)) opts.mode = 'party';

// ---------- sizes / rotation ----------
let W = 1, Hh = 1;
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
function resize() {
  const rot = document.body.classList.contains('rot');
  W = rot ? innerHeight : innerWidth; Hh = rot ? innerWidth : innerHeight;
  renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.updateProjectionMatrix(); lcam.aspect = W / Hh; lcam.updateProjectionMatrix();
  const pr = Math.min(devicePixelRatio || 1, 1.5); ov.width = W * pr; ov.height = Hh * pr; octx.setTransform(pr, 0, 0, pr, 0, 0);
  document.body.classList.toggle('portrait', isTouch && innerHeight > innerWidth);
}
addEventListener('resize', resize); resize();
// map a client point to app-local coords (app may be CSS-rotated 90°)
function loc(x, y) { return document.body.classList.contains('rot') ? { x: y, y: innerWidth - x } : { x, y }; }
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function goLandscape() {
  try { if (!isFull()) await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) || document.documentElement.webkitRequestFullscreen?.()); } catch (e) {}
  try { await screen.orientation?.lock?.('landscape'); } catch (e) {}
  setTimeout(() => { if (innerHeight > innerWidth) document.body.classList.add('rot'); resize(); }, 350);
}
async function exitLandscape() {
  document.body.classList.remove('rot');
  try { screen.orientation?.unlock?.(); } catch (e) {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.webkitFullscreenElement) await document.webkitExitFullscreen?.(); } catch (e) {}
  resize();
}
$('tFull').onclick = goLandscape; $('pFull').onclick = goLandscape; $('btnRot').onclick = goLandscape;
$('btnRotNo').onclick = () => document.body.classList.add('noRot');

// ---------- portraits for the select cards ----------
function portraits() {
  const out = {}; const c = new THREE.PerspectiveCamera(26, 1, 0.1, 50); c.position.set(0, 2.0, 5.9); c.lookAt(0, 1.5, 0);
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xffffff, 0x8a9ab0, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 8, 7); s.add(d);
  renderer.setSize(160, 160, false); renderer.setClearColor(0x000000, 0);
  for (const k of ORDER) { const m = makeBrawler(k); m.rotation.y = 0.35; s.add(m); animBrawler(m, 0.016, 0); renderer.render(s, c); out[k] = canvas.toDataURL(); s.remove(m); }
  renderer.setClearColor(0x000000, 1); resize(); return out;
}
const PORT = portraits();
function buildCards() {
  $('cards').innerHTML = ORDER.map(k => `<button class="card${k === sel ? ' on' : ''}" data-k="${k}"><img src="${PORT[k]}"><b>${CHARS[k].name}</b></button>`).join('');
  for (const b of $('cards').children) b.onclick = () => { sel = b.dataset.k; localStorage.setItem('mdl_kind', sel); buildCards(); showSel(); };
}
function showSel() {
  const c = CHARS[sel]; $('selName').textContent = c.name + ' · ' + c.title; $('selRole').textContent = `${c.role} · 武器「${c.weapon}」 · 大招「${c.superName}」`; $('selDesc').textContent = c.desc;
  $('selStats').textContent = `生命 ${c.hp}　射程 ${c.range}　装填 ${c.reload}s`;
  if (lobMesh) lob.remove(lobMesh); lobMesh = makeBrawler(sel); lobMesh.scale.setScalar(1.15); lob.add(lobMesh);
}
for (const b of $('segN').children) b.onclick = () => { opts.n = +b.dataset.n; for (const x of $('segN').children) x.classList.toggle('on', x === b); };
const MODE_SUB = { party: '派对吃鸡 · 最后一个站着的赢', solo: '经典单人 · 10人抢能量块', duo: '经典双人 · 队友在就能复活' };
function showMode() { for (const x of $('segM').children) x.classList.toggle('on', x.dataset.m === opts.mode); $('rowN').classList.toggle('hidden', opts.mode !== 'party'); document.querySelector('.lbLeft .sub').textContent = MODE_SUB[opts.mode]; }
for (const b of $('segM').children) b.onclick = () => { opts.mode = b.dataset.m; localStorage.setItem('mdl_mode', opts.mode); showMode(); };
showMode();
for (const b of $('segD').children) b.onclick = () => { opts.diff = +b.dataset.d; for (const x of $('segD').children) x.classList.toggle('on', x === b); };
buildCards(); showSel();

// ---------- HUD helpers ----------
const dmgNums = [];
const H = {
  msg(t, ms = 1200) { const c = $('cmsg'); c.textContent = t; c.classList.add('show'); clearTimeout(c._t); c._t = setTimeout(() => c.classList.remove('show'), ms); },
  killFeed(k, v, me) { const d = document.createElement('div'); d.className = 'kf'; d.innerHTML = `<span class="${k === '你' ? 'me' : ''}">${k}</span> <i>击败</i> <span class="${v === '你' ? 'me' : ''}">${v}</span>`; $('kfeed').prepend(d); while ($('kfeed').children.length > 4) $('kfeed').lastChild.remove(); setTimeout(() => d.classList.add('out'), 3500); setTimeout(() => d.remove(), 4200); },
  dmgNum(x, y, z, amt, col, key) { const te = G.ents[key]; if (te && !te.mesh.visible && !te.isPlayer) return; const o = dmgNums.find(d => d.key === key && d.t > 0.55); if (o) { o.amt += amt; o.x = x; o.z = z; o.t = 0.8; return; } if (dmgNums.length > 30) dmgNums.shift(); dmgNums.push({ x, y, z, amt, col, t: 0.8, key }); },
  onEnd(r) { showEnd(r); },
};
const G = createGame(scene, FX, H); window.G = G;

// ---------- state ----------
let state = 'lobby', paused = false, speed = +(Q.get('speed') || 1);
const input = { mx: 0, mz: 0, auto: Q.has('auto'), jumped: false, aiming: false, aimYaw: 0 };
const camPos = new THREE.Vector3(0, 40, 30), camLook = new THREE.Vector3();

function startMatch() {
  G.cleanup(); G.setup({ kind: sel, n: opts.n, diff: opts.diff, mode: opts.mode, fastZone: Q.has('fastzone'), god: Q.has('god') }); state = 'game'; paused = false; input.jumped = false;
  $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden');
  $('gArmor').style.display = $('gHelm').style.display = G.classic ? 'none' : '';
  if (G.classic) { document.body.classList.remove('air'); $('btnJump').classList.add('hidden'); camPos.set(G.player.pos.x, 30, G.player.pos.z + 16); camLook.copy(G.player.pos); return; }
  document.body.classList.add('air'); $('btnJump').classList.remove('hidden'); $('btnJump').textContent = '跳 伞';
  camPos.set(G.plane.pos.x, 70, G.plane.pos.z + 40);
  H.msg('选好落点，点「跳伞」！', 2200);
}
function toLobby() { G.cleanup(); state = 'lobby'; paused = false; $('lobby').classList.remove('hidden'); $('hud').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden'); document.body.classList.remove('air'); }
function showEnd(r) {
  if (state !== 'game') return; state = 'end';
  const of = G.duo ? ' / 5 队' : G.classic ? ' / 10' : '';
  $('endRank').textContent = r.place === 1 ? '🏆 第 1 名！' : `第 ${r.place} 名${of}`;
  const mk = G.duo && G.player.mate ? `，队友击败 ${G.player.mate.kills} 人` : '';
  $('endSub').textContent = r.place === 1 ? `${G.duo ? '双人组夺冠' : '大吉大利，今晚吃鸡'}！击败 ${r.kills} 人${mk}` : `击败 ${r.kills} 人${mk} · 再接再厉`;
  const list = G.ents.filter(e => !e.pet).sort((a, b) => (a.place || 0) - (b.place || 0) || (a.team - b.team) || (b.isPlayer - a.isPlayer));
  $('endList').innerHTML = list.map(e => `<div class="${e.isPlayer ? 'me' : G.duo && e.team === G.player.team ? 'mate' : ''}"><span>${e.place ? e.place + '.' : '存活'} ${e.name}${G.duo && e.team === G.player.team && !e.isPlayer ? '（队友）' : ''}</span><span><img class="eh" src="${PORT[e.kind]}">${CHARS[e.kind].name} · ${e.kills}杀</span></div>`).join('');
  $('end').classList.remove('hidden');
}
function pause() { if (state !== 'game') return; paused = true; $('pause').classList.remove('hidden'); }
$('btnPlay').onclick = startMatch;
$('pResume').onclick = () => { paused = false; $('pause').classList.add('hidden'); };
$('pHome').onclick = toLobby; $('eHome').onclick = toLobby; $('eAgain').onclick = startMatch;
$('tExit').onclick = () => { exitLandscape(); pause(); };
document.addEventListener('fullscreenchange', () => { if (!isFull()) { document.body.classList.remove('rot'); resize(); if (state === 'game' && !paused) pause(); } });
$('btnJump').onclick = () => { if (G.playerJump()) { input.jumped = true; $('btnJump').textContent = '开 伞'; } };

// ---------- aim helpers ----------
function aimShape(isSup) {
  const p = G.player, d = p.def, a = isSup ? d.sup : d.atk;
  if (!isSup) {
    if (a.kind === 'spread') return { s: 'cone', w: a.spread + 0.15, len: d.range };
    if (a.kind === 'burst') return { s: 'rect', w: 0.45, len: d.range };
    if (a.kind === 'punch') return { s: 'cone', w: 2.2, len: d.range };
    if (a.kind === 'wave') return { s: 'rect', w: 1.5, len: d.range };
    if (a.kind === 'lob') return { s: 'circle', w: a.radius + 0.6, len: d.range, lob: true };
  } else {
    if (a.kind === 'blast') return { s: 'cone', w: a.spread + 0.15, len: a.range };
    if (a.kind === 'burst') return { s: 'rect', w: 0.6, len: a.range };
    if (a.kind === 'charge') return { s: 'rect', w: 1.6, len: a.dist };
    if (a.kind === 'leap') return { s: 'circle', w: a.radius, len: a.dist, lob: true };
    if (a.kind === 'pet') return { s: 'circle', w: 1.2, len: 2, lob: true };
    if (a.kind === 'storm') return { s: 'circle', w: a.radius, len: d.range, lob: true };
  }
}
function autoTarget(isSup) {
  const p = G.player, sh = aimShape(isSup); const t = G.nearestEnemy(p, sh.len + 2);
  if (t) return { dx: t.pos.x - p.pos.x, dz: t.pos.z - p.pos.z, dist: Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) };
  return { dx: Math.sin(p.yaw), dz: Math.cos(p.yaw), dist: sh.len * 0.6 };
}
function fire(isSup, dx, dz, dist) { return isSup ? G.superAtk(G.player, dx, dz, dist) : G.attack(G.player, dx, dz, dist); }
let aimState = null; // {isSup, dx, dz, k}

// ---------- touch ----------
const stick = { id: null, ox: 0, oy: 0 }, abtn = { id: null, cx: 0, cy: 0, x: 0, y: 0, t0: 0, sup: false };
const R_STICK = 55, R_AIM = 85;
function btnCenter(el) { const r = el.getBoundingClientRect(); const c = loc(r.left + r.width / 2, r.top + r.height / 2); return c; }
function onStart(ev) {
  if (state !== 'game' || paused) return;
  for (const t of ev.changedTouches) {
    const p = loc(t.clientX, t.clientY), el = t.target;
    if (el.closest && (el.closest('#btnAtk') || el.closest('#btnSup'))) {
      if (abtn.id !== null) continue; const sup = !!el.closest('#btnSup'); if (sup && G.player.superC < 1) continue;
      const c = btnCenter(sup ? $('btnSup') : $('btnAtk')); Object.assign(abtn, { id: t.identifier, cx: c.x, cy: c.y, x: p.x, y: p.y, t0: performance.now(), sup }); ev.preventDefault(); continue;
    }
    if (el.closest && el.closest('button')) continue;
    if (stick.id === null && p.x < W * 0.55) { stick.id = t.identifier; stick.ox = p.x; stick.oy = p.y; $('stickL').classList.add('on'); $('stickL').style.transform = `translate(${p.x}px,${p.y}px)`; setKnob(0, 0); ev.preventDefault(); }
  }
}
function setKnob(dx, dy) { $('stickL').querySelector('.knob').style.transform = `translate(${dx}px,${dy}px)`; }
function onMove(ev) {
  for (const t of ev.changedTouches) {
    const p = loc(t.clientX, t.clientY);
    if (t.identifier === stick.id) { let dx = p.x - stick.ox, dy = p.y - stick.oy; const L = Math.hypot(dx, dy); if (L > R_STICK) { dx *= R_STICK / L; dy *= R_STICK / L; } setKnob(dx, dy); input.mx = dx / R_STICK; input.mz = dy / R_STICK; ev.preventDefault(); }
    if (t.identifier === abtn.id) { abtn.x = p.x; abtn.y = p.y; updateAimFromBtn(); ev.preventDefault(); }
  }
}
function updateAimFromBtn() {
  let dx = abtn.x - abtn.cx, dy = abtn.y - abtn.cy; const L = Math.hypot(dx, dy);
  const knob = (abtn.sup ? $('btnSup') : $('btnAtk')).querySelector('.knob'); const kl = Math.min(L, 40); knob.style.transform = L > 1 ? `translate(${dx / L * kl}px,${dy / L * kl}px)` : '';
  if (L < 16) { aimState = null; return; }
  const w = screenDirToWorld(dx / L, dy / L);
  const st = { isSup: abtn.sup, dx: w.x, dz: w.z, k: Math.min(1, L / R_AIM), t: performance.now() };
  // keep the last steady aim: a quick flick while lifting the finger shouldn't swing the shot
  if (aimState && aimState.isSup === st.isSup) aimPrev = aimState;
  aimState = st;
}
let aimPrev = null;
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _sp = new THREE.Vector3();
// screen-space drag direction -> world ground direction through the tilted perspective camera
function screenDirToWorld(ux, uy) {
  const p = G.player; _sp.set(p.pos.x, 0, p.pos.z).project(camera);
  const sx = (_sp.x + 1) / 2 * W + ux * 140, sy = (1 - _sp.y) / 2 * Hh + uy * 140;
  _ndc.set(sx / W * 2 - 1, -(sy / Hh * 2 - 1)); _ray.setFromCamera(_ndc, camera); _gp.constant = 0;
  if (!_ray.ray.intersectPlane(_gp, _hit)) return { x: ux, z: uy };
  const dx = _hit.x - p.pos.x, dz = _hit.z - p.pos.z, L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L };
}
function onEnd(ev) {
  for (const t of ev.changedTouches) {
    if (t.identifier === stick.id) { stick.id = null; input.mx = input.mz = 0; $('stickL').classList.remove('on'); }
    if (t.identifier === abtn.id) {
      const knob = (abtn.sup ? $('btnSup') : $('btnAtk')).querySelector('.knob'); knob.style.transform = '';
      if (state === 'game' && !paused) {
        if (aimState && aimPrev && performance.now() - aimState.t < 60 && Math.hypot(aimState.dx - aimPrev.dx, aimState.dz - aimPrev.dz) > 0.25) aimState = aimPrev;
        if (aimState) { const sh = aimShape(aimState.isSup); fire(aimState.isSup, aimState.dx, aimState.dz, sh.lob ? Math.max(1.5, aimState.k * sh.len) : sh.len); }
        else { const a = autoTarget(abtn.sup); fire(abtn.sup, a.dx, a.dz, a.dist); }
      }
      abtn.id = null; aimState = null; aimPrev = null;
    }
  }
}
const app = $('app');
app.addEventListener('touchstart', onStart, { passive: false }); app.addEventListener('touchmove', onMove, { passive: false });
app.addEventListener('touchend', onEnd); app.addEventListener('touchcancel', onEnd);

// ---------- keyboard + mouse ----------
const keys = {}; let mouse = null, mouseDown = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state !== 'game') return;
  if (e.code === 'Escape') { paused ? $('pResume').click() : pause(); }
  if (e.code === 'Space') $('btnJump').click();
  if (e.code === 'KeyE' && !paused) { const a = mouseAim() || autoTarget(true); fire(true, a.dx, a.dz, a.dist); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const ray = new THREE.Raycaster(), gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function mouseAim() {
  if (!mouse) return null; const p = G.player;
  ray.setFromCamera(new THREE.Vector2(mouse.x / W * 2 - 1, -(mouse.y / Hh) * 2 + 1), camera);
  if (!ray.ray.intersectPlane(gplane, hitP)) return null;
  const dx = hitP.x - p.pos.x, dz = hitP.z - p.pos.z; return { dx, dz, dist: Math.hypot(dx, dz) };
}
canvas.addEventListener('mousemove', (e) => { mouse = loc(e.clientX, e.clientY); });
canvas.addEventListener('mousedown', (e) => { if (state !== 'game' || paused) return; mouse = loc(e.clientX, e.clientY); mouseDown = e.button === 2 ? 2 : 1; });
canvas.addEventListener('mouseup', (e) => { if (state !== 'game' || paused || !mouseDown) return; const a = mouseAim() || autoTarget(mouseDown === 2); fire(mouseDown === 2, a.dx, a.dz, a.dist); mouseDown = 0; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- overlay: hp bars, names, ammo, damage numbers ----------
const vp = new THREE.Vector3();
function toScreen(x, y, z) { vp.set(x, y, z).project(camera); return { x: (vp.x + 1) / 2 * W, y: (1 - vp.y) / 2 * Hh, ok: vp.z < 1 }; }
function rr(x, y, w, h, r) { octx.beginPath(); octx.roundRect ? octx.roundRect(x, y, w, h, r) : octx.rect(x, y, w, h); }
function drawOverlay(dt) {
  octx.clearRect(0, 0, W, Hh); if (state === 'lobby') return;
  const P = G.player;
  octx.textAlign = 'center'; octx.lineJoin = 'round';
  for (const e of G.ents) {
    if (!e.alive || !e.mesh.visible || e.air) continue;
    const s = toScreen(e.pos.x, e.pos.y + (e.pet ? 2.6 : 2.85), e.pos.z); if (!s.ok || s.x < -60 || s.x > W + 60 || s.y < -40 || s.y > Hh + 40) continue;
    const bw = e.isPlayer ? 64 : 56, bh = 10, x = s.x - bw / 2, y = s.y;
    const ally = !e.isPlayer && e.team === P.team;
    const col = e.isPlayer ? '#4cff6a' : ally ? '#4cc9ff' : '#ff4d5e';
    rr(x - 2, y - 2, bw + 4, bh + 4, 5); octx.fillStyle = '#1a1022'; octx.fill();
    rr(x, y, bw * clamp(e.hp / e.maxHp, 0, 1), bh, 3); octx.fillStyle = col; octx.fill();
    octx.font = '900 10px system-ui'; octx.lineWidth = 3; octx.strokeStyle = '#1a1022'; octx.fillStyle = '#fff';
    octx.strokeText(Math.ceil(e.hp), s.x, y + 9); octx.fillText(Math.ceil(e.hp), s.x, y + 9);
    octx.font = '800 11px system-ui'; if (ally && !e.pet) octx.fillStyle = '#7fdcff'; octx.strokeText(e.name, s.x, y - 6); octx.fillText(e.name, s.x, y - 6);
    if (e.cubes) { octx.fillStyle = '#ff9f1c'; octx.beginPath(); octx.arc(x - 9, y + 5, 8, 0, 7); octx.fill(); octx.strokeStyle = '#1a1022'; octx.lineWidth = 2; octx.stroke(); octx.fillStyle = '#fff'; octx.font = '900 10px system-ui'; octx.fillText(e.cubes, x - 9, y + 9); }
    if (e.isPlayer && !e.air) { // ammo bar
      for (let i = 0; i < 3; i++) { const sx = x + i * (bw / 3), sw = bw / 3 - 2; rr(sx, y + bh + 4, sw, 6, 2); octx.fillStyle = '#1a1022'; octx.fill(); const f = clamp(e.ammo - i, 0, 1); if (f > 0) { rr(sx + 1, y + bh + 5, (sw - 2) * f, 4, 2); octx.fillStyle = f >= 1 ? '#ff9f1c' : '#a86a20'; octx.fill(); } }
    }
  }
  octx.font = '900 16px system-ui'; octx.lineWidth = 4;
  for (let i = dmgNums.length - 1; i >= 0; i--) { const d = dmgNums[i]; d.t -= dt; if (d.t <= 0) { dmgNums.splice(i, 1); continue; } const s = toScreen(d.x, d.y + (0.8 - d.t) * 1.6, d.z); octx.globalAlpha = Math.min(1, d.t * 3); octx.strokeStyle = '#1a1022'; octx.fillStyle = d.col; octx.strokeText(d.amt, s.x, s.y); octx.fillText(d.amt, s.x, s.y); }
  octx.globalAlpha = 1;
}
// ---------- minimap ----------
const mini = $('mini'), mctx = mini.getContext('2d');
function drawMini() {
  const Wd = G.world, w = 110, sc = w / (Wd.PH * 2), mx = (x) => (x + Wd.PH) * sc;
  mctx.imageSmoothingEnabled = false; mctx.drawImage(Wd.mm, Wd.O, Wd.O, Wd.S, Wd.S, 0, 0, w, w);
  const Z = G.zone; mctx.save(); mctx.beginPath(); mctx.rect(0, 0, w, w);
  if (Z.sq) mctx.rect(mx(Z.c.x - Z.r), mx(Z.c.y - Z.r), 2 * Z.r * sc, 2 * Z.r * sc); else mctx.arc(mx(Z.c.x), mx(Z.c.y), Z.r * sc, 0, 7, true);
  mctx.fillStyle = 'rgba(60,200,60,.55)'; mctx.fill('evenodd'); mctx.restore();
  for (const e of G.ents) if (e.alive && !e.pet && !e.isPlayer && e.team === G.player.team) { mctx.fillStyle = '#7fdcff'; mctx.strokeStyle = '#1a1022'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(mx(e.pos.x), mx(e.pos.z), 3, 0, 7); mctx.fill(); mctx.stroke(); }
  if (Z.next && !Z.sq) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(mx(Z.next.c.x), mx(Z.next.c.y), Z.next.r * sc, 0, 7); mctx.stroke(); }
  if (G.state === 'plane') { mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.setLineDash([3, 3]); mctx.beginPath(); mctx.moveTo(mx(G.plane.a.x), mx(G.plane.a.z)); mctx.lineTo(mx(G.plane.b.x), mx(G.plane.b.z)); mctx.stroke(); mctx.setLineDash([]); mctx.fillStyle = '#ff8a3d'; mctx.fillRect(mx(G.plane.pos.x) - 3, mx(G.plane.pos.z) - 3, 6, 6); }
  for (const d of G.drops) { mctx.fillStyle = '#ffd23f'; mctx.strokeStyle = '#1a1022'; mctx.beginPath(); mctx.arc(mx(d.x), mx(d.z), 3.5, 0, 7); mctx.fill(); mctx.stroke(); }
  const p = G.player; if (p.alive) { mctx.fillStyle = '#4cc9ff'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(mx(p.pos.x), mx(p.pos.z), 3.5, 0, 7); mctx.fill(); mctx.stroke(); }
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0'); };
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const p = G.player; $('alive').textContent = G.duo ? `剩余 ${G.teamsLeft()} 队` : '存活 ' + G.alive().length;
  const Z = G.zone; $('zoneT').textContent = G.state === 'count' ? '准备开战…' : Z.stage === 'final' ? '最终决战！' : Z.sq ? (Z.stage === 'wait' ? `毒雾将在 ${fmt(Z.t)} 后逼近` : `毒雾逼近中 ${fmt(Z.t)}`) : Z.stage === 'wait' ? `毒雾将在 ${fmt(Z.t)} 后扩散` : `毒雾扩散中 ${fmt(Z.t)}`;
  $('gCube').textContent = '⚡' + p.cubes; $('gArmor').textContent = '甲' + p.armor; $('gArmor').className = 'lv' + p.armor; $('gHelm').textContent = '盔' + p.helmet; $('gHelm').className = 'lv' + p.helmet;
  const sb = $('btnSup'); sb.classList.toggle('ready', p.superC >= 1); sb.style.setProperty('--p', Math.round(p.superC * 100) + '%'); const sp = sb.querySelector('.pct'); if (sp) sp.textContent = p.superC >= 1 ? '大招!' : Math.floor(p.superC * 100) + '%';
  const air = !!p.air && p.alive; document.body.classList.toggle('air', air); $('btnJump').classList.toggle('hidden', !(p.air === 'plane' || p.air === 'fall'));
  $('hint').textContent = !p.alive && p.respawnT ? `${Math.max(0, Math.ceil(p.respawnT - G.now))} 秒后在队友身边复活` : p.air === 'plane' ? (G.plane.k > G.plane.k0 ? '点「跳伞」跳下飞机' : '飞机即将到达小岛…') : p.air === 'fall' ? '摇杆控制方向，可提前开伞' : p.air === 'chute' ? '滑翔中，选好落点' : (p.alive && G.outside(p) ? '⚠ 你在毒雾里！快跑回安全区' : '');
  drawMini();
}

// ---------- main loop ----------
let last = performance.now(), lobT = 0, frames = 0, fpsT = 0; window.fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; frames++; fpsT += dt; if (fpsT > 1) { window.fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (state === 'lobby') {
    lobT += dt; if (lobMesh) { lobMesh.rotation.y = Math.sin(lobT * 0.7) * 0.5 + 0.3; animBrawler(lobMesh, dt, 0); lobMesh.userData.inner.scale.y = 1 + Math.sin(lobT * 3) * 0.025; }
    const wide = W / Hh; lcam.position.set(wide > 1.2 ? 3.4 : 0, 2.6, 11); lcam.lookAt(wide > 1.2 ? 3.4 : 0, 0.9, 0); lob.position.x = 0;
    renderer.setClearColor(0x2b6cff, 1); scene.background = null; renderer.render(lob, lcam); scene.background = new THREE.Color(0x2aa3e0); drawOverlay(dt); return;
  }
  if (!paused && G.world) {
    // keyboard movement
    if (!isTouch || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) { if (stick.id === null) { input.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); input.mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); } }
    const steps = Math.max(1, Math.ceil(speed)); const sdt = dt * speed / steps;
    for (let i = 0; i < steps; i++) { G.update(sdt, input); G.trackVel(sdt); }
  }
  if (G.world) render(dt);
}
const off = new THREE.Vector3();
function render(dt) {
  const p = G.player; let tgt = p.pos, h = G.classic ? 19 : 20, back = G.classic ? 9.5 : 11.5;
  if (G.duo && !p.alive && p.mate && p.mate.alive) tgt = p.mate.pos; // spectate the teammate while waiting to respawn
  if (Q.has('overview')) { tgt = new THREE.Vector3(); h = 105; back = 1; } // localhost-only test camera
  if (p.air === 'plane') { tgt = G.plane.pos; h = 52; back = 30; }
  else if (p.air) { h = 16 + p.pos.y * 0.55; back = 9 + p.pos.y * 0.25; }
  off.set(tgt.x, tgt.y + h, tgt.z + back); camPos.lerp(off, Math.min(1, dt * (p.air ? 3 : 8)));
  camLook.lerp(new THREE.Vector3(tgt.x, tgt.y, tgt.z - 0.5), Math.min(1, dt * (p.air ? 3 : 10)));
  camera.position.copy(camPos); camera.lookAt(camLook);
  const nearWanted = p.air ? 2 : 1; if (camera.near !== nearWanted) { camera.near = nearWanted; camera.far = p.air || Q.has('overview') ? 260 : 120; camera.updateProjectionMatrix(); }
  // visibility, culling, shadows, rings
  FX.shadow.begin(); FX.ring.begin();
  for (const e of G.ents) {
    if (!e.alive) continue; const far = Math.hypot(e.pos.x - camLook.x, e.pos.z - camLook.z) > (p.air || Q.has('overview') ? 90 : 34);
    const vis = e.air !== 'plane' && !far && (e.isPlayer || !p.alive || G.visibleTo(e, p) || e.air);
    e.mesh.visible = vis; if (e.chute) e.chute.visible = e.air === 'chute' && !far;
    if (!vis) continue;
    if (e.isPlayer) { const m = e.mesh.userData.mat; m.opacity = e.inBush ? 0.55 : 1; m.depthWrite = !e.inBush; }
    if (!e.air) { const s = e.pet ? 1.3 : 0.75; FX.shadow.push(e.pos.x, 0.03, e.pos.z, s, 1, s); FX.ring.push(e.pos.x, 0.05, e.pos.z, e.pet ? 1.4 : 1, 1, e.pet ? 1.4 : 1, e.isPlayer ? 0x4cff6a : e.team === p.team ? 0x4cc9ff : 0xff4d5e); }
    else FX.shadow.push(e.pos.x, 0.03, e.pos.z, 0.6, 1, 0.6);
  }
  for (const it of G.items) { const far = Math.hypot(it.pos.x - camLook.x, it.pos.z - camLook.z) > 34; it.mesh.visible = !far; if (!far) FX.shadow.push(it.pos.x, 0.03, it.pos.z, 0.4, 1, 0.4); }
  FX.shadow.end(); FX.ring.end();
  // projectiles
  FX.proj.begin(); FX.projO.begin();
  for (const q of G.projs) { const sx = q.wave ? q.r * 1.4 : q.r, sy = q.wave ? 0.25 : q.r, yaw = Math.atan2(q.dx, q.dz); FX.proj.push(q.x, q.y, q.z, sx, sy, q.wave ? q.r * 0.6 : q.r * 1.6, q.col, yaw); FX.projO.push(q.x, q.y, q.z, sx, sy, q.wave ? q.r * 0.6 : q.r * 1.6, undefined, yaw); }
  for (const L of G.lobs) { const k = L.t / L.T, x = L.x0 + (L.x1 - L.x0) * k, z = L.z0 + (L.z1 - L.z0) * k, y = 1 + Math.sin(k * Math.PI) * 4.5; FX.proj.push(x, y, z, 0.38, 0.38, 0.38, L.col); FX.projO.push(x, y, z, 0.38, 0.38, 0.38); FX.shadow.push(x, 0.03, z, 0.35, 1, 0.35); }
  FX.proj.end(); FX.projO.end();
  // zone
  const Z = G.zone; FX.zoneU.c.value.copy(Z.c); FX.zoneU.r.value = Z.r; FX.zoneU.t.value = G.now; FX.zoneU.sq.value = Z.sq ? 1 : 0; FX.zoneU.lim.value = G.world.PH + (Z.sq ? 0 : 0.5);
  if (Z.next && Z.stage !== 'final' && !Z.sq) { FX.zoneU.nc.value.copy(Z.next.c); FX.zoneU.nr.value = Z.next.r; } else FX.zoneU.nr.value = -1;
  FX.cloud.begin(); FX.cloudO.begin();
  const gasCol = Z.sq ? 0xc9a2ff : 0xc9ff7a; if (FX.cloud.m.material.color.getHex() !== gasCol) { FX.cloud.m.material.color.setHex(gasCol); FX.cloud.m.material.emissive.setHex(Z.sq ? 0x3a1a55 : 0x335500); FX.cloudO.m.material.uniforms.c.value.setHex(Z.sq ? 0x6a3c9a : 0x4f9a1a); }
  if (Z.sq && Z.r < G.world.PH) { // puffs along the four edges of the square, only near the camera
    let k = 0; const r = Z.r + 0.4;
    for (let side = 0; side < 4; side++) for (let u = -r; u <= r; u += 1.1) {
      const x = side < 2 ? u : (side === 2 ? -r : r), z = side < 2 ? (side === 0 ? -r : r) : u;
      if (Math.abs(x - camLook.x) > 26 || Math.abs(z - camLook.z) > 20) continue; k++;
      const s = 0.5 + (Math.sin(k * 3.1 + side) * 0.5 + 0.5) * 0.45 + Math.sin(G.now * 2 + k) * 0.08, y = 0.35 + s * 0.5 + (k % 2) * 0.3 + Math.sin(G.now * 1.5 + k * 0.7) * 0.15;
      const ox = side >= 2 ? (side === 2 ? -0.4 : 0.4) * (k % 2) : 0, oz = side < 2 ? (side === 0 ? -0.4 : 0.4) * (k % 2) : 0;
      FX.cloud.push(x + ox, y, z + oz, s, s * 0.8, s); FX.cloudO.push(x + ox, y, z + oz, s, s * 0.8, s);
    }
  } else if (!Z.sq && Z.r < 140) {
    const n = 90, base = Math.atan2(camLook.z - Z.c.y, camLook.x - Z.c.x);
    for (let i = 0; i < n; i++) { // puffs concentrated on the part of the edge near the camera
      const a = base + (i / n - 0.5) * Math.min(Math.PI * 2, 70 / Math.max(4, Z.r)) + Math.sin(i * 12.9) * 0.02;
      const rr2 = Z.r + 0.3 + (i % 2) * 0.9 + Math.sin(i * 7.3) * 0.3, x = Z.c.x + Math.cos(a) * rr2, z = Z.c.y + Math.sin(a) * rr2;
      if (Math.hypot(x - camLook.x, z - camLook.z) > 34) continue;
      const s = 0.45 + (Math.sin(i * 3.1) * 0.5 + 0.5) * 0.45 + Math.sin(G.now * 2 + i) * 0.08;
      const y = 0.3 + s * 0.5 + (i % 2) * 0.35 + Math.sin(G.now * 1.5 + i * 0.7) * 0.15; FX.cloud.push(x, y, z, s, s * 0.8, s); FX.cloudO.push(x, y, z, s, s * 0.8, s);
    }
  }
  FX.cloud.end(); FX.cloudO.end();
  // aim indicator
  FX.aim.visible = false;
  if (p.alive && !p.air && state === 'game') {
    let as = aimState; if (!as && mouse && !isTouch) { const a = mouseAim(); if (a && a.dist > 0.5) { const sup = keys.ShiftLeft; as = { isSup: mouseDown === 2 || sup, dx: a.dx / a.dist, dz: a.dz / a.dist, k: Math.min(1, a.dist / (aimShape(mouseDown === 2).len || 1)), mouseDist: a.dist }; } }
    if (as) {
      const sh = aimShape(as.isSup), col = as.isSup ? 0xffd23f : 0xffffff;
      if (sh.lob) { const d = as.mouseDist !== undefined ? Math.min(sh.len, as.mouseDist) : as.k * sh.len; FX.setAim('circle', p.pos.x + as.dx * d, p.pos.z + as.dz * d, as.dx, as.dz, 0, sh.w, col); }
      else FX.setAim(sh.s, p.pos.x, p.pos.z, as.dx, as.dz, sh.len, sh.w, col);
      FX.aim.material.opacity = isTouch || as.isSup ? 0.38 : 0.18;
    }
  }
  renderer.render(scene, camera);
  drawOverlay(dt); updateHud(dt);
}
requestAnimationFrame(frame);
if (Q.get('mode') && ['party', 'solo', 'duo'].includes(Q.get('mode'))) { opts.mode = Q.get('mode'); showMode(); }
if (Q.has('go')) { if (Q.get('kind') && CHARS[Q.get('kind')]) sel = Q.get('kind'); if (Q.get('n')) opts.n = +Q.get('n'); startMatch(); }
window.__start = startMatch; window.__info = () => renderer.info.render; window.__state = () => state;
window.__sdw = screenDirToWorld;
