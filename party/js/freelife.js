// 2026-11-25 自由模式「城市灵魂」(original, GTA6-style mechanics only - no Rockstar names, logos or likeness):
//  - 路人各干各的: 慢跑 / 打电话 / 跳舞 / 街头卖艺 / 吵架, 头顶对话气泡; 撞到会骂, 掏枪会举手或逃跑, 有人举手机拍你, 硬汉会还手
//  - 司机被挡路会按喇叭骂人
//  - 手机「嗨拍」: 社交动态实时发你干的事 + 支线任务(带 GPS) + 新闻; 屏幕上方新闻滚动条
//  - 车内电台: 三个程序生成的原创电台
//  - 沼泽(海上, 开船能到) + 鳄鱼; 也有鳄鱼溜进城里的沙滩和泳池
import * as THREE from 'three';
import { spawnVehicles } from './vehicles.js';
import { routePath } from './autodrive.js';

const $ = (id) => document.getElementById(id);
const R = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------------- speech bubbles (pooled canvas sprites) ----------------
const BUB_N = 6;
function makeBubble(scene) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.6, 0.65, 1); sp.renderOrder = 20; sp.visible = false; scene.add(sp);
  return { sp, cv, tex, t: 0, owner: null, y: 2.3 };
}
function setBubble(b, text, col = '#fff') {
  const g = b.cv.getContext('2d'); g.clearRect(0, 0, 256, 64);
  g.font = 'bold 26px system-ui,sans-serif'; const w = Math.min(248, g.measureText(text).width + 26);
  const x = (256 - w) / 2;
  g.fillStyle = 'rgba(15,10,30,.82)'; g.beginPath(); g.roundRect(x, 4, w, 44, 14); g.fill();
  g.beginPath(); g.moveTo(120, 47); g.lineTo(136, 47); g.lineTo(128, 60); g.fill();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 27, 236);
  b.tex.needsUpdate = true;
}
function say(L, owner, text, dur = 2.6, col, y = 2.3) {
  if (!L) return;
  let b = L.bub.find(x => x.owner === owner) || L.bub.find(x => x.t <= 0) || L.bub.reduce((a, x) => (x.t < a.t ? x : a));
  b.owner = owner; b.t = dur; b.y = y; setBubble(b, text, col); b.sp.visible = true;
}

const LINES = {
  bump: ['看路啊！', '喂！撞到我了', '你瞎啊？', '走路不长眼？', '搞什么啊！', '别挤！'],
  handsup: ['别开枪！', '我什么都没看见！', '钱包给你！', '冷静冷静！', '求你了…'],
  film: ['这个要火了', '直播中…', '快看快看', '我拍到了！', '发嗨拍！'],
  tough: ['你找死？', '来啊！', '敢动我？', '揍你！'],
  phone: ['…对，我到海边了', '晚上去哪嗨？', '不是我干的！', '我在开会…', '哈哈哈真的假的', '帮我订个位'],
  jog: ['呼…呼…', '再跑一圈', '保持节奏'],
  dance: ['嗨起来！', '♪ 动次打次 ♪', '这首好听！'],
  perform: ['♪ ~ ♪', '打赏随意！', '谢谢老板！'],
  argue: ['你说什么？！', '是你先的！', '我受够了！', '你听我说！', '别碰我的车！'],
  chat: ['今天好热', '看那辆车！', '去海滩吗？', '我新纹身', '这城市疯了'],
  honk: ['滚开！', '让开！', '会不会走路？', '按喇叭了！', '想死啊？'],
  scared: ['救命！', '快跑！', '有枪！', '报警！'],
};

// ---------------- the social feed ----------------
const USERS = ['海风小宇', '霓虹喵', 'BeachBoi', '椰子姐', '冲浪阿杰', '夜店女王', '老港口', '粉红火烈鸟', '吃瓜群众', '晨跑达人', '沼泽钓客', '日落摄影'];
const AMBIENT = ['今天海边的日落绝了 🌅', '谁在海滨大道放烟花？', '又堵车了，这城市没救了', '沙滩上看见一条鳄鱼？？？', '新开的塔可店真不错', '凌晨三点的霓虹灯最好看', '有人在泳池里看到鳄鱼吗', '警察又在追人，第三次了', '今晚哪里有派对', '我的车又被偷了 😭', '码头那边有人飙摩托艇', '健身房在海滩上，太卷了'];
const CRIME_POST = {
  '路人报警': ['刚看见有人行凶，已经报警了', '就在我眼前！吓死了'],
  '打死路人': ['街上有人开枪！大家别出门', '我朋友差点被打中'],
  '撞死路人': ['有人开车撞人！！', '这司机疯了'],
  default: ['街上又出事了', '警笛响个不停', '谁能告诉我发生了什么'],
};

// ---------------- radio: three original generative stations ----------------
const STATIONS = [
  { name: '霓虹 FM 88.1', bpm: 108, root: 45, scale: [0, 3, 5, 7, 10], wave: 'sawtooth', drum: 'synth' },
  { name: '海湾拉丁 93.5', bpm: 96, root: 50, scale: [0, 2, 4, 7, 9], wave: 'triangle', drum: 'latin' },
  { name: '街区节拍 101.9', bpm: 84, root: 41, scale: [0, 3, 5, 6, 7, 10], wave: 'square', drum: 'boom' },
];
function radioCtx(L) {
  if (L.ac) { if (L.ac.state === 'suspended') L.ac.resume(); return L.ac; }
  try { L.ac = new (window.AudioContext || window.webkitAudioContext)(); L.rg = L.ac.createGain(); L.rg.gain.value = 0.18; L.rg.connect(L.ac.destination);
    const nb = L.ac.createBuffer(1, L.ac.sampleRate * 0.3, L.ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; L.noise = nb; } catch (e) { L.ac = null; }
  return L.ac;
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function note(L, f, t, dur, vol, type) {
  const ac = L.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(L.rg); o.start(t); o.stop(t + dur + 0.05);
}
function hit(L, t, kind) {
  const ac = L.ac;
  if (kind === 'k') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(L.rg); o.start(t); o.stop(t + 0.22); return; }
  const s = ac.createBufferSource(); s.buffer = L.noise; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'h' ? 7000 : kind === 'c' ? 3000 : 1500;
  const g = ac.createGain(); const dur = kind === 'h' ? 0.04 : 0.14; g.gain.setValueAtTime(kind === 'h' ? 0.25 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(L.rg); s.start(t); s.stop(t + dur + 0.02);
}
function radioTick(L) {
  if (L.station < 0 || !L.ac) return;
  const S = STATIONS[L.station], ac = L.ac, step = 60 / S.bpm / 4;
  if (L.nextT < ac.currentTime) L.nextT = ac.currentTime + 0.05;
  while (L.nextT < ac.currentTime + 0.25) {
    const i = L.step % 16, bar = (L.step / 16) | 0, t = L.nextT;
    const chord = [0, 3, 4, 2][bar % 4], deg = (k) => S.root + S.scale[(chord + k) % S.scale.length] + 12 * (((chord + k) / S.scale.length) | 0);
    if (S.drum === 'synth') { if (i % 4 === 0) hit(L, t, 'k'); if (i % 8 === 4) hit(L, t, 's'); if (i % 2 === 1) hit(L, t, 'h'); }
    else if (S.drum === 'latin') { if (i === 0 || i === 6 || i === 8 || i === 14) hit(L, t, 'k'); if (i === 3 || i === 7 || i === 11) hit(L, t, 'c'); if (i % 2 === 0) hit(L, t, 'h'); }
    else { if (i === 0 || i === 7 || i === 10) hit(L, t, 'k'); if (i === 4 || i === 12) hit(L, t, 's'); if (i % 2 === 0) hit(L, t, 'h'); }
    if (i % 4 === 0 || (S.drum !== 'boom' && i % 4 === 2)) note(L, midi(deg(0) - 12), t, step * 1.8, 0.35, S.drum === 'boom' ? 'sine' : 'triangle');
    if (i === 0) for (const k of [0, 2, 4]) note(L, midi(deg(k) + 12), t, step * 14, 0.06, S.wave);
    if ((i % 3 === 0 || i === 14) && Math.random() < 0.7) note(L, midi(deg(((Math.random() * 5) | 0)) + 24), t, step * 1.5, 0.08, S.drum === 'latin' ? 'triangle' : 'square');
    L.step++; L.nextT += step;
  }
}
export function lifeRadio(G, h) {
  const L = G.life; if (!L) return;
  if (!radioCtx(L)) return;
  L.station = L.station + 1 >= STATIONS.length ? -1 : L.station + 1; L.step = 0; L.nextT = 0;
  const msg = L.station < 0 ? '电台：关' : '📻 ' + STATIONS[L.station].name;
  h.HUD.centerMsg(msg, 1400); const b = $('bRadio'); if (b) b.classList.toggle('on', L.station >= 0);
}

// ---------------- gators ----------------
function makeGator() {
  const g = new THREE.Group(), m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = m(0x3d5a2a), belly = m(0x8a9a5a), dark = m(0x2a3d1c);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 1.5), skin); body.position.y = 0.26; g.add(body);
  const bel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.4), belly); bel.position.y = 0.11; g.add(bel);
  for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), dark); r.position.set(0, 0.45, -0.6 + k * 0.3); g.add(r); }
  const head = new THREE.Group(); head.position.set(0, 0.28, 0.78); g.add(head);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.7), skin); top.position.set(0, 0.05, 0.32); head.add(top);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.66), belly); jaw.position.set(0, -0.07, 0.3); head.add(jaw);
  const jp = new THREE.Group(); jp.add(jaw); head.add(jp);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), m(0xffd23c)); e.position.set(s * 0.14, 0.15, 0.08); head.add(e);
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), m(0xffffff)); t.position.set(s * 0.18, -0.02, 0.15 + k * 0.14); head.add(t); } }
  const tail = new THREE.Group(); tail.position.set(0, 0.24, -0.75); g.add(tail);
  let par = tail; for (let k = 0; k < 3; k++) { const seg = new THREE.Group(); seg.position.z = k ? -0.45 : 0; const t = new THREE.Mesh(new THREE.BoxGeometry(0.5 - k * 0.14, 0.24 - k * 0.05, 0.5), skin); t.position.z = -0.22; seg.add(t); par.add(seg); par = seg; }
  const legs = [];
  for (const [x, z] of [[-0.4, 0.5], [0.4, 0.5], [-0.4, -0.45], [0.4, -0.45]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.26), skin); l.position.set(x, 0.1, z); g.add(l); legs.push(l); }
  g.scale.setScalar(1.25);
  g.userData = { head, jp, tail, legs };
  return g;
}

// ---------------- side jobs ----------------
const JOBS = [
  { id: 'deliver', name: '送货', desc: '去取一个包裹，90 秒内送到指定地点', pay: 350 },
  { id: 'jack', name: '偷跑车', desc: '找到标记的跑车，开到船坞车库交货', pay: 900 },
  { id: 'photo', name: '狗仔', desc: '去海滩拍到那位网红，再送到报社', pay: 500 },
];

// ---------------- setup / cleanup ----------------
export function lifeCleanup(G, scene) {
  const L = G.life; if (!L) return;
  for (const b of L.bub) scene.remove(b.sp);
  for (const o of L.objs) scene.remove(o);
  for (const a of L.gators) scene.remove(a.m);
  if (L.jobCar) { G.vehicles = (G.vehicles || []).filter(v => v !== L.jobCar); scene.remove(L.jobCar.mesh); }
  if (L.ac) try { L.ac.close(); } catch (e) {}
  $('lifePhone')?.classList.add('hidden'); const nt = $('newsTick'); if (nt) nt.classList.remove('show');
  const gp = $('gpsTag'); if (gp) gp.style.display = 'none';
  G.life = null;
}
export function setupLife(G, h, F) {
  const scene = h.scene;
  lifeCleanup(G, scene);
  const L = G.life = { bub: [], objs: [], gators: [], feed: [], news: [], station: -1, step: 0, nextT: 0, job: null, jobCar: null, postT: 6, newsT: 0, toughHit: 0, beam: null };
  for (let i = 0; i < BUB_N; i++) L.bub.push(makeBubble(scene));
  // ped roles: most just walk; the rest get an activity
  const roles = ['jog', 'jog', 'jog', 'phone', 'phone', 'dance', 'dance', 'perform', 'argue', 'argue'];
  const free = F.peds.filter(p => !p.group);
  for (const p of free) { p.role = 'walk'; p.tough = Math.random() < 0.15; p.sayT = R(2, 12); }
  for (let i = 0; i < roles.length && i < free.length; i++) free[i].role = roles[i];
  // the two arguers face each other; dancers / performer stand still in a spot
  const ar = free.filter(p => p.role === 'argue');
  if (ar.length === 2) { ar[1].pos.set(ar[0].pos.x + 1.1, 0, ar[0].pos.z); ar[0].partner = ar[1]; ar[1].partner = ar[0]; }
  for (const p of F.peds) if (p.group) { p.role = 'chat'; p.sayT = R(3, 10); p.tough = false; }
  // swamp: a mangrove lagoon on the sea south-west of the city, reachable by boat
  const SX = -95, SZ = G.map.bounds.maxZ + 55;
  const water = new THREE.Mesh(new THREE.CircleGeometry(48, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4f6b3a }));
  water.position.set(SX, -1.12, SZ); scene.add(water); L.objs.push(water);
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x5a4632 }), leafM = new THREE.MeshLambertMaterial({ color: 0x2f6b2a }), mossM = new THREE.MeshLambertMaterial({ color: 0x8a9a6a });
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * 6.28, r = R(18, 46), x = SX + Math.cos(a) * r, z = SZ + Math.sin(a) * r;
    const t = new THREE.Group(); t.position.set(x, -1.1, z);
    for (let j = 0; j < 4; j++) { const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4), trunkM); root.position.set(Math.cos(j * 1.6) * 0.5, 0.6, Math.sin(j * 1.6) * 0.5); root.rotation.z = Math.cos(j * 1.6) * 0.5; root.rotation.x = -Math.sin(j * 1.6) * 0.5; t.add(root); }
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.2, 5), trunkM); tr.position.y = 2.6; t.add(tr);
    const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(R(1.6, 2.4), 0), leafM); cr.position.y = 4.6; cr.scale.y = 0.6; t.add(cr);
    const moss = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.25, 1.4, 4), mossM); moss.position.set(0.6, 3.6, 0); t.add(moss);
    scene.add(t); L.objs.push(t);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.1), new THREE.MeshLambertMaterial({ color: 0x7a5a32 })); sign.position.set(SX + 30, 0.4, SZ - 30); scene.add(sign); L.objs.push(sign);
  L.swamp = { x: SX, z: SZ, r: 46 };
  // gators: 6 in the swamp (swimming), 2 sunning on the beach, 1 in a back-yard pool
  const addG = (x, z, y, home, swim) => { const m = makeGator(); m.position.set(x, y, z); m.rotation.y = Math.random() * 6; scene.add(m); L.gators.push({ m, home, swim, hp: 60, alive: true, t: R(0, 9), cd: 0, lunge: 0, deadT: 0, y }); };
  for (let k = 0; k < 6; k++) { const a = k * 1.05, r = R(6, 30); addG(SX + Math.cos(a) * r, SZ + Math.sin(a) * r, -1.2, { x: SX, z: SZ, r: 32 }, true); }
  addG(122, -20, 0, { x: 122, z: -20, r: 9 }, false); addG(118, 70, 0, { x: 118, z: 70, r: 9 }, false);
  addG(-40, -45, 0, { x: -40, z: -45, r: 4 }, false);
  // phone UI
  bindPhone(G, h);
  post(L, pick(USERS), '欢迎来到这座城市 🌴 今天也是疯狂的一天', true);
  news(L, '本台消息：海滨大道今晚霓虹节，交警提醒注意安全');
}

// ---------------- feed / news ----------------
function post(L, user, text, quiet) {
  L.feed.unshift({ user, text, t: Date.now(), likes: (Math.random() * 900) | 0 });
  if (L.feed.length > 40) L.feed.pop();
  if (!quiet) { const b = $('bPhone'); if (b) { b.classList.add('ping'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('ping'), 2500); } }
  if ($('lifePhone') && !$('lifePhone').classList.contains('hidden')) renderPhone(L);
}
function news(L, text) {
  L.news.unshift(text); if (L.news.length > 12) L.news.pop();
  const nt = $('newsTick'); if (!nt) return;
  nt.querySelector('span').textContent = '📺 突发 · ' + text;
  nt.classList.remove('show'); void nt.offsetWidth; nt.classList.add('show');
  clearTimeout(nt._t); nt._t = setTimeout(() => nt.classList.remove('show'), 9000);
}
export function lifeCrime(G, why, n) {
  const L = G.life; if (!L) return;
  const pool = CRIME_POST[why] || CRIME_POST.default;
  setTimeout(() => { if (G.life === L) post(L, pick(USERS), pick(pool) + (G.freeMask ? '（戴着面具）' : '')); }, 1500 + Math.random() * 2500);
  const st = G.wanted?.stars || 0;
  if (st >= 2 && Date.now() - (L.lastNews || 0) > 15000) { L.lastNews = Date.now(); news(L, st >= 4 ? '警方全城追捕一名极度危险的嫌犯，直升机已出动' : st >= 3 ? `嫌犯${why ? '「' + why + '」' : ''}后驾车逃逸，警方设卡拦截` : `市区发生${why || '案件'}，警方正在搜索嫌犯`); }
}

// ---------------- phone UI ----------------
function ago(t) { const s = ((Date.now() - t) / 1000) | 0; return s < 60 ? s + ' 秒前' : ((s / 60) | 0) + ' 分钟前'; }
function renderPhone(L) {
  const el = $('lifePhone'); if (!el) return;
  const tab = L.tab || 'feed', body = el.querySelector('.phBody');
  el.querySelectorAll('.phTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'feed') body.innerHTML = L.feed.map(p => `<div class="phPost"><b>@${p.user}</b><small>${ago(p.t)}</small><p>${p.text}</p><i>♥ ${p.likes}</i></div>`).join('');
  else if (tab === 'news') body.innerHTML = L.news.map(n => `<div class="phPost"><b>城市新闻台</b><p>${n}</p></div>`).join('') || '<p class="phEmpty">暂无新闻</p>';
  else body.innerHTML = (L.job ? `<div class="phPost cur"><b>进行中：${L.job.def.name}</b><p>${L.job.stageTxt}</p><button data-j="quit">放弃任务</button></div>` : '') +
    JOBS.map(j => `<div class="phPost"><b>${j.name} · $${j.pay}</b><p>${j.desc}</p>${L.job ? '' : `<button data-j="${j.id}">接任务</button>`}</div>`).join('');
}
function bindPhone(G, h) {
  const el = $('lifePhone'); if (!el || el._bound) return; el._bound = true;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const L = G.life; if (!L) return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.t) { L.tab = t.dataset.t; renderPhone(L); }
    else if (t.dataset.j === 'quit') { endJob(G, h, false); renderPhone(L); }
    else if (t.dataset.j) { startJob(G, h, t.dataset.j); el.classList.add('hidden'); }
    else if (t.classList.contains('phClose')) el.classList.add('hidden');
  });
  ['pointerdown', 'touchstart'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
}
export function lifePhone(G) {
  const L = G.life, el = $('lifePhone'); if (!L || !el) return;
  el.classList.toggle('hidden'); $('bPhone')?.classList.remove('ping');
  if (!el.classList.contains('hidden')) renderPhone(L);
}

// ---------------- jobs ----------------
function freeSpot(G, near, minD, maxD) {
  const nodes = (G.map.nodes || []).filter(n => !n.inside);
  for (let t = 0; t < 60; t++) { const n = pick(nodes); const d = Math.hypot(n.p.x - near.x, n.p.z - near.z); if (d > minD && d < maxD) return { x: n.p.x, z: n.p.z }; }
  return { x: near.x + minD, z: near.z };
}
function setBeam(G, h, pt, col) {
  const L = G.life;
  if (!L.beam) { L.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); h.scene.add(L.beam); L.objs.push(L.beam); }
  L.beam.material.color.setHex(col); L.beam.position.set(pt.x, 30, pt.z); L.beam.visible = true;
}
function startJob(G, h, id) {
  const L = G.life, def = JOBS.find(j => j.id === id), p = G.player.pos;
  const J = L.job = { def, stage: 0, t: 0, stageTxt: '' };
  if (id === 'deliver') { J.a = freeSpot(G, p, 30, 90); J.b = freeSpot(G, J.a, 60, 160); J.tgt = J.a; J.stageTxt = '去取包裹（看 GPS 光柱）'; setBeam(G, h, J.a, 0xffd24a); }
  else if (id === 'jack') {
    const sp = freeSpot(G, p, 50, 140);
    const [v] = spawnVehicles(h.scene, { kind: 'island', vehicleSpots: [['convert', sp.x, sp.z, Math.random() * 6]] });
    if (v) { h.toonify?.(v.mesh); G.vehicles.push(v); L.jobCar = v; v.jobPaint = true; v.mesh.traverse(o => { if (o.isMesh && o.material?.color && o.material.color.getHex() !== 0x111111) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x401030); } }); }
    J.a = sp; J.b = { x: -110, z: G.map.bounds.minZ - 4 }; J.tgt = sp; J.stageTxt = '找到标记的跑车'; setBeam(G, h, sp, 0xff2bd6);
  } else { J.a = { x: R(105, 130), z: R(-60, 60) }; J.b = freeSpot(G, p, 40, 120); J.tgt = J.a; J.stageTxt = '去海滩找网红拍照'; setBeam(G, h, J.a, 0x28e8ff);
    J.star = { pos: new THREE.Vector3(J.a.x, 0, J.a.z) }; }
  h.HUD.centerMsg('接到任务：' + def.name, 1500);
}
function endJob(G, h, ok) {
  const L = G.life, J = L.job; if (!J) return;
  if (ok) { if (G.wanted) { G.wanted.cash += J.def.pay; } h.HUD.centerMsg(`任务完成 · +$${J.def.pay}`, 2000); post(L, pick(USERS), J.def.id === 'photo' ? '那张网红偷拍照上头条了 📸' : J.def.id === 'jack' ? '有人把一辆粉色敞篷跑车开进了船坞…' : '快递小哥今天跑得飞快', false); }
  else h.HUD.centerMsg('任务失败', 1500);
  L.job = null; if (L.beam) L.beam.visible = false;
  if (L.jobCar && !ok) { /* keep the car in the world */ L.jobCar = null; }
  else if (L.jobCar && ok) { const v = L.jobCar; G.vehicles = G.vehicles.filter(x => x !== v); h.scene.remove(v.mesh); L.jobCar = null; }
  const gp = $('gpsTag'); if (gp) gp.style.display = 'none';
  import('./wanted.js').then(m => m.refreshWantedHud(G));
}
function updateJob(G, dt, h) {
  const L = G.life, J = L.job; if (!J) return;
  const p = G.player.pos, car = h.inCar?.(), here = car ? car.pos : p;
  const d = Math.hypot(here.x - J.tgt.x, here.z - J.tgt.z);
  J.t += dt;
  if (J.def.id === 'deliver') {
    if (J.stage === 0 && d < 3) { J.stage = 1; J.tgt = J.b; J.t = 0; J.stageTxt = '90 秒内送到'; setBeam(G, h, J.b, 0x7dff4a); h.HUD.centerMsg('拿到包裹！90 秒内送到', 1500); }
    else if (J.stage === 1) { const left = 90 - J.t; J.stageTxt = `送到目的地 · 剩 ${Math.ceil(left)} 秒`; if (d < 3.5) return endJob(G, h, true); if (left <= 0) return endJob(G, h, false); }
  } else if (J.def.id === 'jack') {
    if (J.stage === 0) { const v = L.jobCar; if (v) J.tgt = { x: v.pos.x, z: v.pos.z }; if (car && car === v) { J.stage = 1; J.tgt = J.b; J.stageTxt = '开到船坞车库'; setBeam(G, h, J.b, 0x7dff4a); h.HUD.centerMsg('偷到了！开去船坞车库', 1500); import('./wanted.js').then(m => m.addStars(G, h, 1, '偷车')); } }
    else if (d < 6 && car === L.jobCar) return endJob(G, h, true);
  } else {
    if (J.stage === 0) { if (!L.say0) say(L, J.star, '别拍我！', 1); if (d < 6) { J.stage = 1; J.tgt = J.b; J.stageTxt = '把照片送到报社'; setBeam(G, h, J.b, 0x7dff4a); h.HUD.centerMsg('📸 咔嚓！拍到了，送去报社', 1500); say(L, J.star, '谁在拍我？！', 2.5, '#ff8fb4'); } }
    else if (d < 3.5) return endJob(G, h, true);
  }
  const gp = $('gpsTag'); if (gp) { gp.style.display = 'block'; gp.textContent = `📍 ${J.def.name}：${J.stageTxt} · ${Math.round(d)} 米`; }
  if (L.beam) L.beam.position.set(J.tgt.x, 30, J.tgt.z);
}

// ---------------- per-frame ----------------
const _v = new THREE.Vector3();
export function lifeShot(G, h, origin, dir, w, wallD) {
  const L = G.life; if (!L) return false;
  for (const a of L.gators) {
    if (!a.alive) continue;
    const c = a.m.position, ox = c.x - origin.x, oy = c.y + 0.3 - origin.y, oz = c.z - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z; if (t < 0 || t > wallD) continue;
    const dx = ox - dir.x * t, dy = oy - dir.y * t, dz = oz - dir.z * t;
    if (dx * dx + dy * dy + dz * dz < 0.9) { a.hp -= w.dmg; h.addSpark?.(new THREE.Vector3(c.x, c.y + 0.4, c.z), 0x8aff4a); if (a.hp <= 0) { a.alive = false; a.deadT = 30; a.m.rotation.z = Math.PI; a.m.position.y = a.y + 0.4; } else { a.cd = 0; a.angry = 6; } return true; }
  }
  return false;
}
function updateGators(G, dt, h) {
  const L = G.life, p = G.player, car = h.inCar?.();
  const pp = car ? car.pos : p.pos, onBoat = car && car.boat;
  for (const a of L.gators) {
    const m = a.m, u = m.userData;
    if (!a.alive) { a.deadT -= dt; if (a.deadT <= 0) { a.alive = true; a.hp = 60; m.rotation.z = 0; m.position.set(a.home.x, a.y, a.home.z); } continue; }
    a.t += dt; a.cd -= dt; a.angry = Math.max(0, (a.angry || 0) - dt);
    const dx = pp.x - m.position.x, dz = pp.z - m.position.z, d = Math.hypot(dx, dz);
    if (d > 90) continue;
    const reach = a.swim ? (onBoat ? 14 : 0) : (car ? 0 : (a.angry ? 30 : 7));
    let sp = 0, ty = m.rotation.y;
    if (d < reach && p.alive) { ty = Math.atan2(dx, dz); sp = d > 2 ? (a.swim ? 5.5 : 3.2) : 0;
      if (d < 2.4 && a.cd <= 0) { a.cd = 1.6; a.lunge = 0.35; const dmg = car ? 0 : 18; if (dmg) { p.hp -= dmg; h.sfx?.hurt?.(); h.HUD.centerMsg('被鳄鱼咬了！', 900); if (p.hp <= 0) h.damage?.(p, 1, null, { id: 'gator', name: '鳄鱼' }, false); } else if (car) { car.speed *= 0.3; h.HUD.centerMsg('鳄鱼撞上了船！', 900); }
        if (Math.random() < 0.5 && G.life) post(G.life, pick(USERS), '我刚刚看到有人被鳄鱼追 😱'); } }
    else { const hx = a.home.x - m.position.x, hz = a.home.z - m.position.z, hd = Math.hypot(hx, hz);
      if (hd > a.home.r) { ty = Math.atan2(hx, hz); sp = 0.8; } else if (a.swim) { ty += Math.sin(a.t * 0.3) * dt * 0.6; sp = 0.7; } }
    let dy = ((ty - m.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; m.rotation.y += dy * Math.min(1, dt * 4);
    if (sp) { m.position.x += Math.sin(m.rotation.y) * sp * dt; m.position.z += Math.cos(m.rotation.y) * sp * dt; }
    if (a.swim) m.position.y = a.y + Math.sin(a.t * 2) * 0.04;
    // animation: tail sway, legs paddle, jaw snaps on a lunge
    const sw = Math.sin(a.t * (sp ? 8 : 1.5)) * (sp ? 0.35 : 0.12);
    u.tail.rotation.y = sw; u.tail.children[0].rotation.y = sw * 0.8;
    u.legs.forEach((l, i) => { l.rotation.x = sp ? Math.sin(a.t * 10 + i * 1.6) * 0.6 : 0; });
    a.lunge = Math.max(0, a.lunge - dt); u.jp.rotation.x = a.lunge > 0 ? 0.6 : (Math.sin(a.t * 0.5) > 0.95 ? 0.35 : 0);
  }
}
function updatePedSoul(G, dt, h) {
  const L = G.life, F = G.freeState, p = G.player; if (!F || !p) return;
  const car = h.inCar?.(), pp = p.pos, armed = G.weapon && G.weapon.id !== 'knife' && !car;
  const fired = G.now - (p.lastFired || -9) < 2;
  const stars = G.wanted?.stars || 0;
  for (const ped of F.peds) {
    if (!ped.alive) { ped.cheer = false; continue; }
    const dx = ped.pos.x - pp.x, dz = ped.pos.z - pp.z, d2 = dx * dx + dz * dz;
    ped.cheer = false; ped.jog = false;
    if (d2 > 3600) continue;
    ped.sayT = (ped.sayT || 0) - dt; ped.bumpCd = Math.max(0, (ped.bumpCd || 0) - dt);
    const d = Math.sqrt(d2);
    // tough guy coming for you
    if (ped.fight > 0) { ped.fight -= dt; ped.fleeT = 0; ped.idleT = 0;
      const step = Math.min(d - 0.9, 3.4 * dt); if (step > 0) { ped.pos.x -= dx / d * step; ped.pos.z -= dz / d * step; ped.moving = true; }
      ped.yaw = Math.atan2(-dx, -dz);
      if (d < 1.3 && (ped.punchCd = (ped.punchCd || 0) - dt) <= 0 && !car) { ped.punchCd = 0.9; p.hp -= 6; h.sfx?.hurt?.(); if (Math.random() < 0.5) say(L, ped, pick(LINES.tough), 1.2, '#ffb0a0'); if (p.hp <= 0) h.damage?.(p, 1, null, { id: 'fist', name: '拳头' }, false); }
      continue; }
    if (ped.fleeT > 0) { if (ped.sayT <= 0 && d < 25) { ped.sayT = R(3, 6); say(L, ped, pick(LINES.scared), 1.6, '#ffd0d0'); } continue; }
    // gun pointed at them: hands up (or run), the brave ones film
    if (armed && ((fired && d < 12) || (d < 3.5 && Math.abs(((Math.atan2(dx, dz) - (p.yaw + Math.PI)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0.35))) {
      if (!ped.hands) { ped.hands = true; ped.idleT = Math.max(ped.idleT, 3); if (ped.tough && fired && Math.random() < 0.5) { ped.fight = 8; say(L, ped, pick(LINES.tough), 1.6, '#ffb0a0'); continue; } say(L, ped, pick(LINES.handsup), 2, '#ffe0a0'); }
      ped.cheer = true; ped.yaw = Math.atan2(-dx, -dz); ped.idleT = Math.max(ped.idleT, 0.5); continue;
    } else ped.hands = false;
    // bumped on foot
    if (!car && d < 0.95 && ped.bumpCd <= 0) { ped.bumpCd = 3; ped.bumps = (ped.bumps || 0) + 1; ped.yaw = Math.atan2(-dx, -dz);
      if (ped.tough && ped.bumps >= 2) { ped.fight = 10; say(L, ped, pick(LINES.tough), 1.8, '#ffb0a0'); }
      else say(L, ped, pick(LINES.bump), 1.8, '#ffe0a0');
      ped.idleT = Math.max(ped.idleT, 1.2); continue; }
    // wanted: some stop and film you
    if (stars > 0 && d < 22 && !ped.reported && ped.role !== 'jog') {
      if (ped.filming == null) ped.filming = Math.random() < 0.35;
      if (ped.filming) { ped.phone = true; ped.idleT = Math.max(ped.idleT, 1); ped.yaw = Math.atan2(-dx, -dz); if (ped.sayT <= 0) { ped.sayT = R(4, 8); say(L, ped, pick(LINES.film), 2); if (Math.random() < 0.4) post(L, pick(USERS), '我拍到那个通缉犯了！就在我面前 📹'); } continue; }
    } else if (!stars) ped.filming = null;
    // activities
    const role = ped.role;
    if (role === 'jog') { ped.jog = true; if (ped.idleT > 0) ped.idleT = 0; }
    else if (role === 'dance' || role === 'perform') { ped.idleT = 9999; ped.cheer = Math.sin(G.now * (role === 'dance' ? 3 : 1.6) + ped.walk) > -0.2; ped.yaw += dt * (role === 'dance' ? 1.2 : 0); }
    else if (role === 'phone') { ped.phone = true; }
    else if (role === 'argue' && ped.partner) { ped.idleT = 9999; ped.yaw = Math.atan2(ped.partner.pos.x - ped.pos.x, ped.partner.pos.z - ped.pos.z); ped.cheer = Math.sin(G.now * 2.3 + (ped === ped.partner.partner ? 0 : 1.5)) > 0.55; }
    if (ped.sayT <= 0 && d < 18) {
      ped.sayT = R(5, 12);
      const pool = LINES[role] || (Math.random() < 0.3 ? LINES.chat : null);
      if (pool) say(L, ped, pick(pool), 2.4);
    }
  }
}
function updateHonks(G, dt, h) {
  const L = G.life, F = G.freeState, p = G.player; if (!F) return;
  const car = h.inCar?.(), pp = car ? car.pos : p.pos;
  for (const c of F.traffic || []) {
    if (!c.civ || c.dead || c === car) continue;
    c.honkCd = Math.max(0, (c.honkCd || 0) - dt);
    const fx = Math.sin(c.yaw + Math.PI), fz = Math.cos(c.yaw + Math.PI);
    const dx = pp.x - c.pos.x, dz = pp.z - c.pos.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (ahead > 1 && ahead < 7 && side < 2 && c.honkCd <= 0) {
      c.honkCd = R(4, 7); honk(L);
      say(L, c, pick(LINES.honk), 2, '#ffd0a0', 2.4);
    }
  }
}
function honk(L) {
  if (!L.ac) return; const ac = L.ac, t = ac.currentTime;
  for (const f of [392, 494]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.35); g.gain.linearRampToValueAtTime(0, t + 0.4); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.45); }
}
export function updateLife(G, dt, h) {
  const L = G.life; if (!L) return;
  if (!L.ac && G.now > 1) radioCtx(L);    // created after the first tap (the game has already been interacted with)
  updatePedSoul(G, dt, h);
  updateHonks(G, dt, h);
  updateGators(G, dt, h);
  updateJob(G, dt, h);
  // radio only plays inside a vehicle
  const car = h.inCar?.(); const rb = $('bRadio'); if (rb) rb.style.display = car ? 'flex' : 'none';
  if (L.station >= 0 && L.ac) { L.rg.gain.value = car ? 0.18 : 0; if (car) radioTick(L); }
  // ambient posts
  L.postT -= dt; if (L.postT <= 0) { L.postT = R(18, 35); post(L, pick(USERS), pick(AMBIENT), true); }
  // bubbles follow their owner
  for (const b of L.bub) {
    if (b.t <= 0) { b.sp.visible = false; continue; }
    b.t -= dt; const o = b.owner; const pos = o?.pos || o?.position;
    if (!pos || (o.alive === false)) { b.t = 0; b.sp.visible = false; continue; }
    b.sp.position.set(pos.x, (pos.y || 0) + b.y, pos.z); b.sp.material.opacity = Math.min(1, b.t * 3);
  }
}
export function lifeMinimap(G, ctx, mx, mz) {
  const L = G.life; if (!L) return;
  ctx.save();
  for (const a of L.gators) if (a.alive) { ctx.fillStyle = '#4a7a2a'; ctx.fillRect(mx(a.m.position.x) - 2, mz(a.m.position.z) - 1, 4, 2); }
  if (L.job) { const p = G.player.pos, t = L.job.tgt;
    if (!L.gps || G.now - L.gps.at > 1 || L.gps.tx !== t.x || L.gps.tz !== t.z) L.gps = { at: G.now, tx: t.x, tz: t.z, pts: routePath(G.map, p.x, p.z, t.x, t.z) };
    ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(mx(p.x), mz(p.z)); for (const w of L.gps.pts) ctx.lineTo(mx(w.x), mz(w.z)); ctx.stroke();
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(mx(t.x), mz(t.z), 4.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
