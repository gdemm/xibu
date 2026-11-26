// 2026-11-26 自由模式 GTA 式玩法第四批（全部原创）:
//  1. 双人抢劫「椰林储蓄所大劫案」: 踩点 → 取车 → 动手 → 甩警 → 分赃
//  2. 手机短视频「热搜」: 你干的事自动变成视频, 播放量涨粉, 粉丝里程碑给赞助
//  3. 鳄鱼湾: 打死鳄鱼掉皮, 卖给「老杰克鱼饵铺」; 沼泽萤火虫
//  4. 买房买店收租: 海景公寓(复活点) / 冰沙铺 / 洗车行 / 霓虹夜店
import * as THREE from 'three';
import { spawnVehicles } from './vehicles.js';
import { addCash, refreshWantedHud } from './wanted.js';

const $ = (id) => document.getElementById(id);
const R = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ---------------- helpers ----------------
function nodeNear(map, x, z) {
  let best = null, bd = 1e9;
  for (const n of map.nodes || []) { if (!n.n?.length || n.inside) continue; const d = (n.p.x - x) ** 2 + (n.p.z - z) ** 2; if (d < bd) { bd = d; best = n.p; } }
  return best ? { x: best.x, z: best.z } : { x, z };
}
function label(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,10,30,.62)'; g.beginPath(); g.roundRect ? g.roundRect(6, 8, 244, 48, 14) : g.rect(6, 8, 244, 48); g.fill();
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0'); g.lineWidth = 3; g.stroke();
  g.font = '900 28px system-ui, "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(3.3, 0.82, 1); return sp;
}
function marker(S, scene, x, z, color, text) {
  const g = new THREE.RingGeometry(1.5, 1.9, 24); g.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })); ring.position.set(x, 0.07, z); ring.renderOrder = 2;
  const sp = label(text, color); sp.position.set(x, 4.2, z);
  scene.add(ring, sp); S.objs.push(ring, sp);
  return { x, z, ring, sp, color };
}
function setLabel(m, text) { const old = m.sp.material.map; const s = label(text, m.color); m.sp.material.map = s.material.map; m.sp.material.needsUpdate = true; old?.dispose(); }
function load(key, def) { try { return Object.assign(def, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) { return def; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
function boxMan(color) {
  const g = new THREE.Group(), m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), m(color)); body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), m(0xc98e5e)); head.position.y = 1.65; g.add(head);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.2), m(0x111111)); mask.position.set(0, 1.68, 0.1); g.add(mask);
  const legs = []; for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), m(0x1d2433)); l.position.set(s * 0.14, 0.34, 0); g.add(l); legs.push(l); }
  g.userData.legs = legs; return g;
}

// ---------------- state ----------------
const ASSETS = [
  { id: 'home', name: '海景公寓', price: 5000, rate: 0, color: 0x6ad1ff, desc: '买下后复活点改到这里' },
  { id: 'smoothie', name: '冰沙铺', price: 3000, rate: 60, color: 0x7dff4a, desc: '每分钟 $60' },
  { id: 'wash', name: '洗车行', price: 4500, rate: 100, color: 0xffd24a, desc: '每分钟 $100' },
  { id: 'club', name: '霓虹夜店', price: 12000, rate: 250, color: 0xff2bd6, desc: '每分钟 $250' },
];
const CAP_MIN = 10;
const NPC_VIDS = ['海滩落日延时 🌅', '街头舞王 battle 💃', '我家猫会开冰箱 🐱', '霓虹节无人机秀 ✨', '十分钟学会冲浪 🏄', '路边摊古巴三明治测评 🥪', '码头日出钓鱼 🎣', '沼泽里的萤火虫 ✨'];
const NPC_USERS = ['海风小宇', '霓虹喵', 'BeachBoi', '椰子姐', '冲浪阿杰', '夜店女王', '老港口'];
const CLIP = {
  crime: ['实拍：街头飞车大案 🚨', '路人拍到有人跟警察硬刚 😱', '这城市太疯了，又被我拍到 📹'],
  stunt: ['极速 100 码穿城 🏎️💨', '这车技我服了 🔥', '海滨大道狂飙实录 🏁'],
  gator: ['徒手…不，持枪大战鳄鱼 🐊', '鳄鱼湾惊魂 10 秒 🐊😱'],
  heist: ['储蓄所劫案全程第一视角 💰', '两个面具人带着钱跑了 🎭💸'],
  buy: ['我买下了一家店！当老板了 🏪', '新家看海，不贵 🏠'],
};
const MILES = [[1000, 500], [5000, 1500], [20000, 4000], [100000, 10000]];

export function cleanupG6(G, scene) {
  const S = G.g6; if (!S) return;
  for (const o of S.objs) scene.remove(o);
  if (S.heist?.car) { G.vehicles = (G.vehicles || []).filter(v => v !== S.heist.car); }
  G.g6 = null;
}

export function setupG6(G, h) {
  const scene = h.scene, map = G.map, B = map.bounds, F = G.freeState;
  cleanupG6(G, scene);
  const S = G.g6 = { objs: [], heist: null, flyT: 0, clipCd: 0, hides: 0, tick: 0,
    social: load('party_g6_social', { vids: [], fans: 0, mile: 0 }),
    assets: load('party_g6_assets', { own: [], pend: {}, at: Date.now() }) };
  const W = B.maxX - B.minX, D = B.maxZ - B.minZ, at = (fx, fz) => nodeNear(map, B.minX + W * fx, B.minZ + D * fz);
  // bank (heist target)
  const bk = at(0.78, 0.25); S.bank = marker(S, scene, bk.x, bk.z, 0xffc83c, '椰林储蓄所');
  // assets
  const spots = [at(0.85, 0.75), at(0.3, 0.2), at(0.55, 0.85), at(0.2, 0.7)];
  S.props = ASSETS.map((a, i) => { const p = spots[i]; const m = marker(S, scene, p.x + (i % 2 ? 1.5 : -1.5), p.z, a.color, a.name + (S.assets.own.includes(a.id) ? ' · 已购' : ' · ' + money(a.price))); return { ...a, m }; });
  // offline rent (real time, capped)
  const mins = Math.min(CAP_MIN, (Date.now() - (S.assets.at || Date.now())) / 60000);
  for (const p of S.props) if (p.rate && S.assets.own.includes(p.id)) S.assets.pend[p.id] = Math.min(p.rate * CAP_MIN, (S.assets.pend[p.id] || 0) + p.rate * mins);
  S.assets.at = Date.now(); save('party_g6_assets', S.assets);
  // bait shop on the shore nearest the swamp
  const sw = G.life?.swamp;
  if (sw) {
    const s = nodeNear(map, sw.x, B.maxZ - 4); S.bait = marker(S, scene, s.x, s.z, 0x9ad14a, '老杰克鱼饵铺');
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3), new THREE.MeshLambertMaterial({ color: 0x7a5a32 })); hut.position.set(s.x + 4.5, 1.3, s.z + 2.5); scene.add(hut); S.objs.push(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.4, 4), new THREE.MeshLambertMaterial({ color: 0x3d5a2a })); roof.rotation.y = Math.PI / 4; roof.position.set(s.x + 4.5, 3.3, s.z + 2.5); scene.add(roof); S.objs.push(roof);
    // fireflies: one Points object
    const n = 60, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = Math.random() * sw.r; pos[i * 3] = sw.x + Math.cos(a) * r; pos[i * 3 + 1] = R(0.3, 3.5); pos[i * 3 + 2] = sw.z + Math.sin(a) * r; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    S.flies = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff27a, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    S.flies.visible = false; scene.add(S.flies); S.objs.push(S.flies); S.fliesBase = pos.slice();
  }
  S.drops = [];
  if (S.assets.own.includes('home')) S.home = { x: S.props[0].m.x, z: S.props[0].m.z };
  // seed the trending list with a few npc videos
  S.npc = NPC_VIDS.map(t => ({ t, user: pick(NPC_USERS), views: (R(2, 60) * 1000) | 0 }));
}

// ---------------- social ----------------
export function g6Event(G, kind, info) {
  const S = G.g6; if (!S) return;
  if (kind === 'crime' && S.clipCd > 0) return;
  if (kind === 'crime' || kind === 'stunt') S.clipCd = 20;
  const base = { crime: 3000, stunt: 2500, gator: 4000, heist: 30000, buy: 2000 }[kind] || 1500;
  const v = { t: pick(CLIP[kind] || CLIP.crime), born: Date.now(), target: (base * R(0.6, 2.2)) | 0, views: 0 };
  S.social.vids.unshift(v); if (S.social.vids.length > 20) S.social.vids.pop();
  const b = $('bPhone'); if (b) { b.classList.add('ping'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('ping'), 2500); }
  save('party_g6_social', S.social);
}
function updateSocial(G, h) {
  const S = G.g6, so = S.social, now = Date.now(); let tot = 0;
  for (const v of so.vids) { const age = (now - v.born) / 1000; v.views = Math.round(v.target * (age < 60 ? age / 60 * 0.7 : 0.7 + 0.3 * Math.min(1, (age - 60) / 600))); tot += v.views; }
  for (const v of S.npc) v.views += (R(0, 40)) | 0;
  so.fans = Math.floor(tot / 20);
  while (so.mile < MILES.length && so.fans >= MILES[so.mile][0]) { const [f, pay] = MILES[so.mile]; so.mile++; addCash(G, pay); h.HUD.centerMsg(`粉丝破 ${f.toLocaleString('en-US')} · 品牌赞助 +${money(pay)}`, 2200); }
  save('party_g6_social', so);
}

// ---------------- heist ----------------
const HEIST_LINES = ['准备好了吗？', '保安两个，后门在东边', '别手抖！', '钱袋给我一个！', '警笛！快走！', '往安全屋开！'];
export function g6StartHeist(G, h) {
  const S = G.g6; if (!S || S.heist) return;
  const scene = h.scene, p = G.player.pos;
  const buddy = boxMan(0x6a3dc8); buddy.position.set(p.x + 2, 0, p.z + 2); scene.add(buddy); S.objs.push(buddy);
  S.heist = { stage: 0, t: 0, hold: 0, buddy, total: 6000, tgt: { x: S.bank.x, z: S.bank.z }, txt: '去椰林储蓄所门口踩点（步行停 4 秒）', sayT: 0 };
  h.HUD.centerMsg('接到大任务：椰林储蓄所大劫案', 1800);
}
export function g6HeistInfo(G) { const H = G.g6?.heist; return H ? { name: '储蓄所大劫案', txt: H.txt, tgt: H.tgt } : null; }
export function g6QuitHeist(G, h, ok) {
  const S = G.g6, H = S?.heist; if (!H) return;
  h.scene.remove(H.buddy);
  if (H.car && !ok) { /* car stays in the world */ }
  S.heist = null; $('g6Split')?.remove();
  if (!ok) h.HUD.centerMsg('劫案失败', 1500);
  const gp = $('gpsTag'); if (gp) gp.style.display = 'none';
}
function heistSplit(G, h) {
  const S = G.g6, H = S.heist; H.stage = 5; H.txt = '选择怎么分赃';
  let d = $('g6Split'); if (d) d.remove();
  d = document.createElement('div'); d.id = 'g6Split';
  d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;background:#0e0a1c;border:3px solid #ffc83c;border-radius:18px;padding:16px 18px;color:#fff;font:15px system-ui;text-align:center;min-width:240px';
  d.innerHTML = '<b style="font-size:18px">分赃 · 一共 $6,000</b><div style="margin:8px 0 12px;opacity:.8">同伙在等你开口</div>' +
    '<button data-s="50" style="display:block;width:100%;margin:6px 0;padding:10px;border:0;border-radius:10px;background:#4cd17a;font-weight:800">五五分 · 你拿 $3,000</button>' +
    '<button data-s="70" style="display:block;width:100%;margin:6px 0;padding:10px;border:0;border-radius:10px;background:#ff5a5a;color:#fff;font-weight:800">七三分 · 你拿 $4,200（同伙不高兴）</button>';
  ['pointerdown', 'touchstart'].forEach(ev => d.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
  d.addEventListener('click', (e) => {
    e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
    const mine = b.dataset.s === '70' ? 4200 : 3000; addCash(G, mine);
    h.HUD.centerMsg(b.dataset.s === '70' ? `拿走 $4,200 · 同伙：「下次别找我了」` : `拿走 $3,000 · 同伙：「合作愉快！」`, 2400);
    g6Event(G, 'heist'); g6QuitHeist(G, h, true); import('./wanted.js').then(m => m.refreshWantedHud(G));
  });
  document.body.appendChild(d);
}
function updateHeist(G, dt, h) {
  const S = G.g6, H = S.heist; if (!H) return;
  const p = G.player, car = h.inCar?.(), here = car ? car.pos : p.pos, W = G.wanted;
  H.t += dt;
  if (!p.alive || H.t > 300) return g6QuitHeist(G, h, false);
  // buddy follows (inside the car he rides along, hidden)
  const b = H.buddy; b.visible = !car;
  if (!car) { // stays at the player's front-right so he never blocks the camera
    const y = p.yaw || 0, tx = p.pos.x + Math.cos(y) * 2 - Math.sin(y) * 1.2, tz = p.pos.z - Math.sin(y) * 2 - Math.cos(y) * 1.2;
    const dx = tx - b.position.x, dz = tz - b.position.z, d = Math.hypot(dx, dz);
    if (d > 12) b.position.set(tx, 0, tz);
    else if (d > 0.3) { const s = Math.min(d, 7 * dt) / d; b.position.x += dx * s; b.position.z += dz * s; }
    b.rotation.y = d > 0.5 ? Math.atan2(dx, dz) : y + Math.PI; const sw = d > 0.5 ? Math.sin(H.t * 10) * 0.5 : 0; b.userData.legs[0].rotation.x = sw; b.userData.legs[1].rotation.x = -sw; }
  else b.position.set(car.pos.x, 0, car.pos.z);
  H.sayT -= dt;
  const d = Math.hypot(here.x - H.tgt.x, here.z - H.tgt.z);
  if (H.stage === 0) {
    if (d < 3 && !car) { H.hold += dt; H.txt = `踩点中… ${Math.ceil(4 - H.hold)} 秒`; if (H.hold >= 4) {
      H.stage = 1; H.hold = 0; h.HUD.centerMsg('踩点完成：2 个保安，后门在东侧', 2000);
      const sp = nodeNear(G.map, H.tgt.x + R(-60, 60), H.tgt.z + R(30, 70));
      const [v] = spawnVehicles(h.scene, { kind: 'island', vehicleSpots: [['muscle', sp.x, sp.z, Math.random() * 6]] });
      if (v) { h.toonify?.(v.mesh); G.vehicles.push(v); H.car = v; }
      H.tgt = sp; H.txt = '去取逃跑车'; } }
    else { H.hold = 0; H.txt = '去椰林储蓄所门口踩点（步行停 4 秒）'; }
  } else if (H.stage === 1) {
    if (H.car) H.tgt = { x: H.car.pos.x, z: H.car.pos.z };
    if (car && (car === H.car || !H.car)) { H.stage = 2; H.tgt = { x: S.bank.x, z: S.bank.z }; H.txt = '开到储蓄所，下车进门'; h.HUD.centerMsg('上车了！开去储蓄所', 1500); }
  } else if (H.stage === 2) {
    if (d < 3 && !car) { H.hold += dt; const pc = Math.min(100, H.hold / 8 * 100) | 0; H.txt = `抢钱中 ${pc}%（别离开圈）`; h.HUD.centerMsg(`💰 抢钱中 ${pc}%`, 300);
      if (H.sayT <= 0) { H.sayT = 2.2; G.life && sayBuddy(G, H, pick(HEIST_LINES)); }
      if (!H.alarm && H.hold > 1) { H.alarm = true; import('./freeroam.js').then(m => m.crime(G, h, 2, 'heist', { x: S.bank.x, z: S.bank.z }, true)); }
      if (H.hold >= 8) { H.stage = 3; H.txt = '甩掉警察，开回安全屋'; H.tgt = { x: G.freeState.safe.x, z: G.freeState.safe.z }; h.HUD.centerMsg('钱到手！甩掉警察回安全屋', 2000);
        if (W) { W.stars = Math.max(W.stars, 3); refreshWantedHud(G); } } }
    else if (H.hold > 0 && H.hold < 8) { H.hold = Math.max(0, H.hold - dt * 0.5); H.txt = '回到储蓄所门口继续抢'; }
  } else if (H.stage === 3) {
    const cops = (W?.cops || []).filter(c => Math.hypot(c.pos.x - here.x, c.pos.z - here.z) < 60).length;
    H.txt = cops ? `甩掉警察（附近 ${cops} 辆警车）` : '开回安全屋';
    if (d < 4 && !cops) heistSplit(G, h);
    else if (d < 4 && H.sayT <= 0) { H.sayT = 2; sayBuddy(G, H, '警察还跟着！先甩掉！'); }
  }
  const gp = $('gpsTag'); if (gp && H.stage < 5) { gp.style.display = 'block'; gp.textContent = `📍 大劫案：${H.txt} · ${Math.round(d)} 米`; }
}
function sayBuddy(G, H, text) { import('./freelife.js').then(m => m.lifeSay?.(G, H.buddy, text)); }

// ---------------- assets ----------------
function buyAsset(G, h, id) {
  const S = G.g6, W = G.wanted, a = S.props.find(p => p.id === id); if (!a || S.assets.own.includes(id) || !W) return;
  if (W.cash < a.price) { h.HUD.centerMsg(`现金不够：需要 ${money(a.price)}`, 1400); return; }
  W.cash -= a.price; refreshWantedHud(G); S.assets.own.push(id); S.assets.pend[id] = 0; save('party_g6_assets', S.assets);
  setLabel(a.m, a.name + ' · 已购');
  if (id === 'home') S.home = { x: a.m.x, z: a.m.z };
  h.HUD.centerMsg(`买下 ${a.name}！` + (a.rate ? `每分钟收 ${money(a.rate)}` : '以后在这里复活'), 2200); g6Event(G, 'buy');
}
function collect(G, h, only) {
  const S = G.g6; let n = 0;
  for (const p of S.props) { if (only && p.id !== only) continue; n += S.assets.pend[p.id] || 0; S.assets.pend[p.id] = 0; }
  n = Math.floor(n); if (n > 0) { addCash(G, n); h.HUD.centerMsg('收租 +' + money(n), 1400); }
  save('party_g6_assets', S.assets); return n;
}

// ---------------- per-frame ----------------
export function updateG6(G, dt, h) {
  const S = G.g6; if (!S || !G.player?.alive && !S.heist) return;
  const p = G.player, car = h.inCar?.(), here = car ? car.pos : p.pos;
  S.clipCd = Math.max(0, S.clipCd - dt);
  // rent
  for (const a of S.props) if (a.rate && S.assets.own.includes(a.id)) S.assets.pend[a.id] = Math.min(a.rate * CAP_MIN, (S.assets.pend[a.id] || 0) + a.rate * dt / 60);
  S.tick += dt;
  if (S.tick > 2) { S.tick = 0; S.assets.at = Date.now(); updateSocial(G, h); save('party_g6_assets', S.assets);
    const el = $('lifePhone'); if (el && !el.classList.contains('hidden') && (G.life?.tab === 'trend' || G.life?.tab === 'asset')) { const body = el.querySelector('.phBody'); const html = g6PhoneTab(G, G.life.tab); if (html != null) body.innerHTML = html; } }
  // walking into an asset
  for (const a of S.props) {
    const d = Math.hypot(here.x - a.m.x, here.z - a.m.z), inn = d < 2.6;
    if (inn && !a.inn) {
      if (S.assets.own.includes(a.id)) { if (a.rate) collect(G, h, a.id); }
      else h.HUD.centerMsg(`${a.name} 出售 · ${money(a.price)} · 打开手机「资产」购买`, 2200);
    }
    a.inn = inn;
  }
  // stunt clip: fast driving for 2 s
  if (car && !car.boat && Math.abs(car.speed || 0) > 25) { S.flyT += dt; if (S.flyT > 2 && S.clipCd <= 0) { S.flyT = 0; g6Event(G, 'stunt'); } } else S.flyT = 0;
  // gator hides
  for (const a of G.life?.gators || []) {
    if (!a.alive && !a.g6drop) { a.g6drop = true; S.drops.push({ x: a.m.position.x, z: a.m.position.z, t: 60 }); g6Event(G, 'gator'); }
    if (a.alive) a.g6drop = false;
  }
  for (let i = S.drops.length - 1; i >= 0; i--) { const dr = S.drops[i]; dr.t -= dt;
    if (Math.hypot(here.x - dr.x, here.z - dr.z) < 3) { S.hides++; S.drops.splice(i, 1); h.HUD.centerMsg(`捡到鳄鱼皮 · 共 ${S.hides} 张`, 1200); }
    else if (dr.t <= 0) S.drops.splice(i, 1); }
  if (S.bait) { const inn = Math.hypot(here.x - S.bait.x, here.z - S.bait.z) < 3;
    if (inn && !S.baitIn) { if (S.hides) { const n = S.hides * 250; S.hides = 0; addCash(G, n); h.HUD.centerMsg(`老杰克收下鳄鱼皮 · +${money(n)}`, 1800); } else h.HUD.centerMsg('老杰克：带鳄鱼皮来，一张 $250', 1600); }
    S.baitIn = inn; }
  // fireflies
  const sw = G.life?.swamp;
  if (S.flies && sw) { const near = Math.hypot(here.x - sw.x, here.z - sw.z) < 120; S.flies.visible = near;
    if (near) { const a = S.flies.geometry.attributes.position, b = S.fliesBase, t = G.now; for (let i = 0; i < a.count; i++) { a.array[i * 3] = b[i * 3] + Math.sin(t * 0.7 + i) * 0.8; a.array[i * 3 + 1] = b[i * 3 + 1] + Math.sin(t * 1.3 + i * 2) * 0.3; } a.needsUpdate = true; S.flies.material.opacity = 0.55 + Math.sin(t * 3) * 0.35; } }
  updateHeist(G, dt, h);
}

// ---------------- phone ----------------
export function g6PhoneTab(G, tab) {
  const S = G.g6; if (!S) return null;
  if (tab === 'trend') {
    const so = S.social, mine = so.vids.map(v => ({ t: v.t, user: '我', views: v.views, me: true }));
    const top = [...mine, ...S.npc].sort((a, b) => b.views - a.views).slice(0, 5);
    const next = MILES[so.mile];
    return `<div class="phPost cur"><b>我的粉丝 ${so.fans.toLocaleString('en-US')}</b><p>${next ? `粉丝到 ${next[0].toLocaleString('en-US')} 有品牌赞助 ${money(next[1])}` : '你已经是顶流了'}</p></div>` +
      '<div class="phPost"><b>🔥 热搜榜</b>' + top.map((v, i) => `<p>${i + 1}. ${v.me ? '⭐' : ''}${v.t}<small style="display:block;float:none;opacity:.6">@${v.user} · ${v.views.toLocaleString('en-US')} 播放</small></p>`).join('') + '</div>' +
      (so.vids.length ? so.vids.slice(0, 5).map(v => `<div class="phPost"><b>我的视频</b><p>${v.t}</p><i>▶ ${v.views.toLocaleString('en-US')}</i></div>`).join('') : '<p class="phEmpty">还没有视频：去干点大事，路人会帮你拍</p>');
  }
  if (tab === 'asset') {
    const W = G.wanted, own = S.assets.own; let pend = 0; for (const a of S.props) pend += S.assets.pend[a.id] || 0;
    return `<div class="phPost cur"><b>待收租金 ${money(pend)}</b><p>每家店最多攒 ${CAP_MIN} 分钟</p>${pend >= 1 ? '<button data-g6="collect">收租</button>' : ''}</div>` +
      S.props.map(a => { const o = own.includes(a.id), near = a.inn;
        return `<div class="phPost"><b>${a.name} · ${o ? '已购' : money(a.price)}</b><p>${a.desc}</p>${o ? '' : (near ? `<button data-g6="buy:${a.id}" ${W && W.cash >= a.price ? '' : 'disabled'}>购买</button>` : '<small>走到门口才能买</small>')}</div>`; }).join('') +
      `<div class="phPost"><b>🐊 鳄鱼皮 ${S.hides} 张</b><p>卖给老杰克鱼饵铺 $250/张</p></div>`;
  }
  return null;
}
export function g6PhoneClick(G, h, btn) {
  const S = G.g6; if (!S || !btn.dataset.g6) return false;
  const [k, id] = btn.dataset.g6.split(':');
  if (k === 'collect') collect(G, h);
  else if (k === 'buy') buyAsset(G, h, id);
  const body = $('lifePhone')?.querySelector('.phBody'); if (body) body.innerHTML = g6PhoneTab(G, 'asset');
  return true;
}
export function g6Minimap(G, ctx, mx, mz) {
  const S = G.g6; if (!S) return;
  ctx.save();
  const sq = (x, z, c, s = 5) => { ctx.fillStyle = c; ctx.fillRect(mx(x) - s / 2, mz(z) - s / 2, s, s); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(mx(x) - s / 2, mz(z) - s / 2, s, s); };
  sq(S.bank.x, S.bank.z, '#ffc83c', 6);
  for (const a of S.props) sq(a.m.x, a.m.z, '#' + a.color.toString(16).padStart(6, '0'), S.assets.own.includes(a.id) ? 6 : 4);
  if (S.bait) sq(S.bait.x, S.bait.z, '#9ad14a', 5);
  ctx.fillStyle = '#e8d08a'; for (const d of S.drops) { ctx.beginPath(); ctx.arc(mx(d.x), mz(d.z), 2.5, 0, 7); ctx.fill(); }
  ctx.restore();
}
