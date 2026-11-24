// 6 original chunky humanoid heroes + robot-dog pet: stats + procedural toon meshes (faces +Z)
import * as THREE from 'three';
import { Builder, M, outlined, heroMat } from './util.js';

// ---------- primitive helpers ----------
let DET = 1; // segment multiplier: 1 = lobby/close-up, <1 = in-game LOD
const q = (n, min = 3) => Math.max(min, Math.round(n * DET));
const S = (r, w, h, ...rest) => {
  const a = r > 0.45 ? 20 : r > 0.25 ? 14 : r > 0.12 ? 11 : r > 0.06 ? 8 : 6, b = r > 0.45 ? 12 : r > 0.25 ? 9 : r > 0.12 ? 7 : r > 0.06 ? 5 : 4;
  return new THREE.SphereGeometry(r, q(Math.min(w || a, a), 5), q(Math.min(h || b, b), 3), ...rest);
};
const HEMI = (r) => S(r, 0, 0, 0, Math.PI * 2, 0, Math.PI / 2);
const C = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, q(Math.min(s || 99, Math.max(rt, rb) > 0.3 ? 20 : Math.max(rt, rb) > 0.12 ? 14 : 8), 5));
const CAP = (r, l, s) => new THREE.CapsuleGeometry(r, l, r > 0.08 ? 4 : 3, q(Math.min(s || 99, r > 0.2 ? 14 : r > 0.08 ? 10 : 6), 5));
const TOR = (r, t, arc = Math.PI * 2, rs = 8, ts = 20) => new THREE.TorusGeometry(r, t, q(Math.min(rs, 6), 4), q(Math.min(ts, 24), 8), arc);
const CONE = (r, h, s = 14) => new THREE.ConeGeometry(r, h, s);
const LATHE = (pts, s = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), q(Math.min(s, 18), 8));
// rounded box with smooth normals (keeps the outline hull closed)
function RB(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z))); const nn = v.clone().sub(c).normalize(); v.copy(c).addScaledVector(nn, r); p.setXYZ(i, v.x, v.y, v.z); n.setXYZ(i, nn.x, nn.y, nn.z); }
  return g;
}
const INK = 0x1c1426, WHITE = 0xffffff;

// ---------- face kit: features placed on the surface of a head sphere ----------
// h = { y: head centre, z: head centre z, R: radius }
function onHead(h, x, y, inset = 0) { const dy = y - h.y; const zz = Math.sqrt(Math.max(0.0001, h.R * h.R - x * x - dy * dy)); return h.z + zz - inset; }
function feat(B, h, geo, x, y, inset, sx, sy, sz, col, extraRz = 0, extraRx = 0) {
  const z = onHead(h, x, y, inset), ry = Math.atan2(x, z - h.z), rx = -Math.atan2(y - h.y, z - h.z);
  B.add(geo, M(x, y, z, rx + extraRx, ry, extraRz, sx, sy, sz), col);
}
let HEAD = null; // last head sphere of the hero being built (used to enlarge the head afterwards)
function face(B, h, o) {
  HEAD = h; Builder.noOut = true;
  const ex = o.ex ?? h.R * 0.38, ey = o.ey ?? h.y + h.R * 0.08, er = o.er ?? h.R * 0.24;
  for (const s of [-1, 1]) {
    feat(B, h, S(er, 20, 14), s * ex, ey, er * 0.45, 0.9, 1.2, 0.5, WHITE);
    feat(B, h, S(er * 0.68, 20, 14), s * ex + (o.look || 0) * er, ey - er * 0.08, er * 0.22, 0.95, 1.12, 0.5, o.iris ?? 0x2a1a3a);
    feat(B, h, S(er * 0.38, 16, 12), s * ex + (o.look || 0) * er, ey - er * 0.1, -er * 0.02, 1, 1.1, 0.5, INK);
    feat(B, h, S(er * 0.24, 10, 8), s * ex + er * 0.26, ey + er * 0.3, -er * 0.16, 1, 1, 0.5, WHITE);
    feat(B, h, S(er * 0.11, 8, 6), s * ex - er * 0.2, ey - er * 0.32, -er * 0.15, 1, 1, 0.5, WHITE);
    if (o.lid !== false) feat(B, h, TOR(er * 0.98, er * 0.19, Math.PI, 8, 16), s * ex, ey + er * 0.08, er * 0.28, 0.92, 1.22, 0.6, o.lidCol ?? INK, -s * 0.12);
    if (o.lash) feat(B, h, CAP(er * 0.13, er * 0.9, 6), s * (ex + er * 0.55), ey + er * 0.75, 0, 1, 1, 1, INK, Math.PI / 2 + s * 0.75);
    if (o.brow !== false) { const by = ey + er * 1.45 + (o.browUp || 0); feat(B, h, CAP(o.browT ?? er * 0.22, er * 1.1, 8), s * ex, by, -er * 0.05, 1, 1, 0.8, o.browCol ?? INK, Math.PI / 2 + s * (o.browAng ?? 0.25)); }
    if (o.cheek !== false) feat(B, h, S(er * 0.55, 12, 8), s * (ex + er * 0.35), ey - er * 1.55, er * 0.15, 1.2, 0.7, 0.3, o.cheekCol ?? 0xff8f8f);
  }
  if (o.nose) feat(B, h, S(o.nose, 12, 8), 0, ey - er * 1.1, o.nose * 0.3, 1, 0.85, 0.9, o.noseCol ?? o.skin);
  const my = o.my ?? ey - er * 2.1, mw = o.mw ?? er * 0.9;
  if (o.mouth === 'grin') { feat(B, h, S(mw, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0, my, mw * 0.25, 1.15, 0.9, 0.4, 0x6a1525); feat(B, h, S(mw * 0.98, 16, 6, 0, Math.PI * 2, Math.PI / 2, 0.45), 0, my - 0.005, mw * 0.18, 1.1, 0.9, 0.42, WHITE); feat(B, h, S(mw * 0.5, 12, 8), 0, my - mw * 0.55, mw * 0.25, 1.3, 0.5, 0.4, 0xff6b7e); }
  else if (o.mouth === 'open') { feat(B, h, S(mw * 0.8, 16, 12), 0, my, mw * 0.25, 1, 0.9, 0.4, 0x6a1525); feat(B, h, S(mw * 0.45, 12, 8), 0, my - mw * 0.3, mw * 0.2, 1.2, 0.6, 0.4, 0xff6b7e); }
  else if (o.mouth === 'smirk') feat(B, h, TOR(mw * 0.8, mw * 0.17, Math.PI * 0.8, 8, 16), mw * 0.15, my + mw * 0.45, mw * 0.05, 1, 1, 1, INK, Math.PI + 0.45);
  else if (o.mouth === 'tooth') { feat(B, h, S(mw, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0, my, mw * 0.25, 1.2, 1.0, 0.4, 0x6a1525); feat(B, h, RB(mw * 0.4, mw * 0.4, mw * 0.2, mw * 0.08, 2), -mw * 0.3, my - mw * 0.12, mw * 0.02, 1, 1, 1, WHITE); feat(B, h, S(mw * 0.5, 12, 8), 0, my - mw * 0.6, mw * 0.25, 1.3, 0.5, 0.4, 0xff6b7e); }
  else if (o.mouth !== false) feat(B, h, TOR(mw * 0.75, mw * 0.17, Math.PI, 8, 16), 0, my + mw * 0.55, mw * 0.05, 1, 1, 1, INK, Math.PI);
  Builder.noOut = false;
  if (o.ears !== false) for (const s of [-1, 1]) B.add(S(h.R * 0.2, 12, 8), M(s * h.R * 0.97, h.y - h.R * 0.05, h.z, 0, 0, 0, 0.55, 1, 0.8), o.skin);
}
// arm: shoulder pivot at origin; upper arm + forearm towards (0,-0.42,0.25); big hand there
function armBase(B, o) {
  const hx = o.hx ?? 0, hy = o.hy ?? -0.4, hz = o.hz ?? 0.22, r = o.r ?? 0.12;
  const len = Math.hypot(hx, hy, hz), ax = -Math.atan2(hz, -hy), tx = Math.atan2(-hy, hz);
  B.add(S(r * 1.25), M(0, 0, 0), o.sleeve);
  B.add(CAP(r, len * 0.7), M(hx * 0.45, hy * 0.45, hz * 0.45, ax, 0, -hx * 0.8), o.sleeve2 ?? o.sleeve);
  if (o.cuff !== undefined) B.add(TOR(r * 1.05, r * 0.32, Math.PI * 2, 8, 18), M(hx * 0.78, hy * 0.78, hz * 0.78, tx, 0, 0), o.cuff);
  B.add(S((o.hand ?? 0.17) * 1.32), M(hx, hy, hz, 0, 0, 0, 1, 0.95, 1.05), o.handCol ?? o.skin); // chunkier hands
  { const hr = (o.hand ?? 0.17) * 1.32; B.add(S(hr * 0.42), M(hx, hy + hr * 0.72, hz + hr * 0.5, 0.5, 0, 0, 0.85, 0.75, 1.25), o.handCol ?? o.skin); } // thumb on top of the fist
  return [hx, hy, hz];
}

// ---------- roster: stats + kit (kit slots unchanged from v1, re-themed) ----------
export const CHARS = {
  chef: {
    name: '饼大侠', title: '街头煎饼师', role: '近距离散弹', color: '#ff7a3d', hp: 3600, speed: 6.2, reload: 1.5, range: 10, superCost: 3600,
    weapon: '热锅辣豆', superName: '满锅爆炒',
    atk: { kind: 'spread', n: 5, spread: 0.55, dmg: 300, speed: 26, r: 0.22, col: 0xff5a36 },
    sup: { kind: 'blast', n: 9, spread: 0.7, dmg: 320, speed: 28, range: 12, r: 0.3, col: 0xffb020, knock: 6, breakWalls: true },
    desc: '铁锅甩出五颗热辣豆，越近越痛；大招「满锅爆炒」击退敌人并炸碎掩体。',
  },
  dj: {
    name: '阿响', title: '朋克DJ', role: '远程连射', color: '#ff3fa4', hp: 2800, speed: 6.0, reload: 1.4, range: 18, superCost: 3000,
    weapon: '低音炮音箱', superName: '炸场重低音',
    atk: { kind: 'burst', n: 6, gap: 0.07, dmg: 360, speed: 34, r: 0.16, col: 0x3ff0ff, jitter: 0.04 },
    sup: { kind: 'burst', n: 12, gap: 0.05, dmg: 320, speed: 36, range: 22, r: 0.22, col: 0xff3fa4, pierce: true, breakWalls: true, jitter: 0.02 },
    desc: '音箱轰出六连音波一条直线；大招「炸场重低音」穿透敌人与墙。',
  },
  lumber: {
    name: '木墩子', title: '伐木巨汉', role: '坦克散弹', color: '#d8352e', hp: 5000, speed: 6.0, reload: 1.6, range: 8, superCost: 4000,
    weapon: '双管木屑炮', superName: '伐木冲撞',
    atk: { kind: 'spread', n: 5, spread: 0.8, dmg: 360, speed: 22, r: 0.24, col: 0xe8c48a },
    sup: { kind: 'charge', dist: 13, dmg: 800, speed: 22, knock: 7, breakWalls: true },
    desc: '双管喷出木屑近距离开花；大招「伐木冲撞」撞飞路上的一切。',
  },
  ronin: {
    name: '小竹', title: '竹剑小武士', role: '近战坦克', color: '#1fa6a0', hp: 5600, speed: 6.6, reload: 1.0, range: 3.6, superCost: 3200,
    weapon: '竹刀二连斩', superName: '天落一刀',
    atk: { kind: 'punch', n: 2, gap: 0.14, dmg: 420, arc: 1.2, col: 0x9be15d },
    sup: { kind: 'leap', dist: 12, dmg: 900, radius: 3.2, knock: 5, breakWalls: true },
    desc: '竹刀左右二连斩；大招「天落一刀」跃向目标劈地。',
  },
  granny: {
    name: '铃奶奶', title: '疯狂科学家', role: '冲击波+召唤', color: '#7bd36b', hp: 3200, speed: 6.0, reload: 1.6, range: 14, superCost: 3200,
    weapon: '穿透药剂波', superName: '铁皮旺财',
    atk: { kind: 'wave', dmg: 800, speed: 18, r: 0.75, col: 0x8dff5a, pierce: true },
    sup: { kind: 'pet', hp: 4000, dmg: 400, range: 11 },
    desc: '烧瓶喷出穿透的药剂冲击波；大招召唤机器狗「铁皮旺财」帮你打架。',
  },
  diver: {
    name: '阿蓝', title: '深海潜水员', role: '抛投分裂弹', color: '#f28c28', hp: 2800, speed: 6.0, reload: 1.7, range: 13, superCost: 3000,
    weapon: '河豚炸弹', superName: '深海漩涡',
    atk: { kind: 'lob', dmg: 520, radius: 1.6, shards: 6, shardDmg: 240, shardRange: 4.5, flight: 0.7, col: 0xffd23f, shardCol: 0xfff3b0 },
    sup: { kind: 'storm', dmg: 300, radius: 4.2, time: 3.2, flight: 0.9, col: 0x3fc8ff },
    desc: '抛出河豚炸弹，落地炸开四散尖刺；大招「深海漩涡」持续伤害并减速。',
  },
  kite: {
    name: '小鸢', title: '风筝少女', role: '远程狙击', color: '#3fa9ff', hp: 2600, speed: 6.2, reload: 1.3, range: 17, superCost: 3000,
    weapon: '纸燕三连', superName: '风筝旋风',
    atk: { kind: 'spread', n: 3, spread: 0.16, dmg: 440, speed: 32, r: 0.18, col: 0x7fd4ff },
    sup: { kind: 'blast', n: 8, spread: 1.1, dmg: 380, speed: 30, range: 16, r: 0.26, col: 0xff5a5a, pierce: true, knock: 3 },
    desc: '风筝射出三只纸燕，远距离点射；大招「风筝旋风」扇形放出一圈穿透纸燕。',
  },
  lion: {
    name: '阿狮', title: '舞狮少年', role: '冲锋坦克', color: '#ffb020', hp: 5400, speed: 6.4, reload: 1.2, range: 3.4, superCost: 3400,
    weapon: '狮头三连咬', superName: '醒狮冲阵',
    atk: { kind: 'punch', n: 3, gap: 0.12, dmg: 330, arc: 1.4, col: 0xffd23f },
    sup: { kind: 'charge', dist: 12, dmg: 750, speed: 23, knock: 8, breakWalls: true },
    desc: '举起狮头连咬三口；大招「醒狮冲阵」一路冲撞，撞开敌人和掩体。',
  },
};
export const ORDER = ['chef', 'dj', 'lumber', 'ronin', 'granny', 'diver', 'kite', 'lion'];
export const PET = { kind: 'dog', name: '铁皮旺财' };

// ---------------- meshes ----------------
const GEO = {};
function parts(kind, lod, split = true) {
  const key = kind + (lod ? ':lo' : '') + (split ? '' : ':m'); if (GEO[key]) return GEO[key];
  DET = lod ? 0.62 : 1; HEAD = null;
  const body = new Builder(), foot = new Builder(), arm = new Builder(), armL = new Builder();
  let fx = 0.24, fy = 0.12, armPos = [0.6, 1.2, 0.02], melee = false, two = true;

  if (kind === 'chef') {
    const SK = 0xf0b48a, SH = 0xf6f2ea, AP = 0xe8433a, HAT = 0xffffff, MU = 0x2a1a14, PA = 0x3b3a4a;
    body.add(LATHE([[0, 0.3], [0.36, 0.33], [0.52, 0.5], [0.58, 0.72], [0.54, 0.95], [0.42, 1.18], [0.2, 1.3], [0, 1.32]]), M(), SH)
      .add(new THREE.LatheGeometry([[0.4, 0.3], [0.55, 0.5], [0.605, 0.72], [0.565, 0.95], [0.45, 1.14]].map(([r, y]) => new THREE.Vector2(r, y)), 20, -1.05, 2.1), M(), AP).add(RB(0.36, 0.2, 0.08, 0.04), M(0, 0.6, 0.6), 0xc72f28)
      .add(CAP(0.045, 0.62), M(-0.3, 1.0, 0.33, 0.2, 0, -0.5), AP).add(CAP(0.045, 0.62), M(0.3, 1.0, 0.33, 0.2, 0, 0.5), AP)
      .add(LATHE([[0, 0.28], [0.38, 0.3], [0.44, 0.42], [0, 0.44]]), M(), PA)
      .add(TOR(0.3, 0.09), M(0, 1.24, 0.02, Math.PI / 2), 0xffc93c).add(S(0.1), M(0.1, 1.18, 0.3), 0xffc93c).add(CONE(0.07, 0.22, 10), M(0.18, 1.06, 0.3, 0, 0, 0.5), 0xffc93c);
    const h = { y: 1.72, z: 0.02, R: 0.5 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.11, ex: 0.18, ey: 1.78, browAng: -0.15, browT: 0.04, browUp: 0.03, nose: 0.12, noseCol: 0xe89a74, mouth: 'grin', my: 1.48, mw: 0.12, cheekCol: 0xff8a7a });
    for (const s of [-1, 1]) { feat(body, h, CAP(0.07, 0.2, 8), s * 0.14, 1.585, 0.0, 1, 1, 0.9, MU, s * 1.15); feat(body, h, S(0.07, 10, 8), s * 0.25, 1.62, 0.02, 1, 1, 0.9, MU); }
    for (const s of [-1, 1]) body.add(S(0.12), M(s * 0.44, 1.82, -0.05, 0, 0, 0, 0.6, 1, 0.9), MU);
    body.add(C(0.44, 0.45, 0.3), M(0, 2.17, -0.02, -0.08), HAT).add(TOR(0.445, 0.035), M(0, 2.04, -0.01, Math.PI / 2 - 0.08), 0xe2ddd4);
    for (const [x, y, z, r] of [[0, 2.55, -0.06, 0.36], [-0.3, 2.45, -0.02, 0.27], [0.3, 2.45, -0.02, 0.27], [0, 2.44, 0.26, 0.27], [0, 2.44, -0.33, 0.27]]) body.add(S(r), M(x, y, z), HAT);
    fx = 0.24;
    foot.add(CAP(0.12, 0.18), M(0, 0.22, 0), PA).add(S(0.17), M(0, 0, 0.07, 0, 0, 0, 1.05, 0.7, 1.45), 0x2b2328);
    const [hx, hy, hz] = armBase(arm, { sleeve: SH, sleeve2: SK, cuff: SH, skin: SK, hx: 0.02, hy: -0.38, hz: 0.24, r: 0.12 });
    arm.add(HEMI(0.36), M(hx, hy + 0.06, hz + 0.32, Math.PI / 2 + 0.1, 0, 0, 1, 0.55, 1), 0x2d2d36).add(TOR(0.355, 0.035), M(hx, hy + 0.06, hz + 0.32, 0.1, 0, 0), 0x55555f)
      .add(HEMI(0.31), M(hx, hy + 0.06, hz + 0.3, Math.PI / 2 + 0.1, 0, 0, 1, 0.5, 1), 0x46464f)
      .add(CAP(0.05, 0.36), M(hx, hy + 0.02, hz - 0.08, Math.PI / 2, 0, 0), 0x9a6b3c)
      .add(CAP(0.05, 0.12), M(hx - 0.1, hy + 0.12, hz + 0.33, 0, 0, 1.0), 0xff3b2e).add(CAP(0.05, 0.12), M(hx + 0.09, hy + 0.1, hz + 0.34, 0, 0, -0.6), 0x4cc94c).add(S(0.06), M(hx, hy + 0.2, hz + 0.33), 0xff3b2e);
    armBase(armL, { sleeve: SH, sleeve2: SK, cuff: SH, skin: SK, hx: -0.04, hy: -0.4, hz: 0.12, r: 0.12 });
    armPos = [0.6, 1.12, 0.02];
  } else if (kind === 'dj') {
    const SK = 0xffd6bd, HR = 0xff3fa4, HRD = 0xc81f7c, JK = 0x2a2533, TOP = 0xb6ff3b, SKT = 0x6a3cff, PH = 0x31e1ff;
    body.add(LATHE([[0, 0.5], [0.4, 0.52], [0.44, 0.7], [0.42, 0.95], [0.34, 1.16], [0.16, 1.27], [0, 1.29]]), M(), JK)
      .add(S(0.3), M(0, 0.86, 0.2, 0, 0, 0, 0.75, 1.0, 0.7), TOP).add(new THREE.OctahedronGeometry(0.1, 0), M(0, 0.86, 0.42, 0, 0, 0, 1, 1.3, 0.4), 0xff3fa4)
      .add(LATHE([[0, 0.28], [0.54, 0.3], [0.48, 0.42], [0.4, 0.58], [0, 0.6]]), M(), SKT)
      .add(TOR(0.48, 0.04), M(0, 0.33, 0, Math.PI / 2), 0x3c1fa8);
    for (const s of [-1, 1]) for (const k of [0, 1, 2]) body.add(new THREE.ConeGeometry(0.045, 0.1, 8), M(s * (0.3 + k * 0.06), 1.16 - k * 0.04, 0.06 - k * 0.05, 0, 0, -s * 1.0), 0xd8d8e8);
    const h = { y: 1.73, z: 0.02, R: 0.48 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.125, ex: 0.18, ey: 1.74, lash: true, browCol: HRD, browAng: 0.18, iris: 0x7a2bd6, mouth: 'smirk', mw: 0.11, cheekCol: 0xff8fb0 });
    // hair: back cap + swoopy side bang + mohawk crest + shaved side
    body.add(S(0.53), M(0.02, 1.84, -0.1, 0, 0, 0, 1.0, 0.93, 0.92), HR)
      .add(S(0.34), M(-0.24, 1.98, 0.24, 0.3, 0, 0.5, 1.15, 0.6, 0.7), HR).add(S(0.22), M(-0.4, 1.7, 0.26, 0, 0, 0.2, 0.6, 1.1, 0.6), HR);
    for (const [y, z, h2, rx] of [[2.33, 0.12, 0.42, -0.35], [2.4, -0.1, 0.5, -0.6], [2.3, -0.34, 0.46, -1.0], [2.1, -0.52, 0.38, -1.45]]) body.add(CONE(0.12, h2, 12), M(0.06, y, z, rx, 0, -0.08), HR);
    body.add(S(0.2), M(0.42, 1.92, -0.1, 0, 0, -0.3, 0.6, 0.9, 1.1), HRD);
    // headphones round the neck + cups
    body.add(TOR(0.32, 0.055, Math.PI, 8, 20), M(0, 1.3, -0.02, -Math.PI / 2 + 0.3, 0, 0, 1.1, 1, 1), JK);
    for (const s of [-1, 1]) body.add(C(0.15, 0.15, 0.12, 18), M(s * 0.37, 1.33, 0.12, 0, 0, Math.PI / 2 - s * 0.35), JK).add(C(0.1, 0.1, 0.13, 16), M(s * 0.39, 1.34, 0.13, 0, 0, Math.PI / 2 - s * 0.35), PH);
    body.add(S(0.045), M(-0.48, 1.6, 0.02), 0xffd23f).add(S(0.045), M(-0.48, 1.53, 0.02), 0xffd23f);
    fx = 0.2;
    foot.add(CAP(0.09, 0.22), M(0, 0.24, 0), SK).add(C(0.13, 0.12, 0.2), M(0, 0.32, 0), JK).add(RB(0.28, 0.24, 0.42, 0.1), M(0, 0.03, 0.06), JK).add(RB(0.3, 0.08, 0.44, 0.04), M(0, -0.09, 0.06), WHITE);
    const [hx, hy, hz] = armBase(arm, { sleeve: JK, sleeve2: SK, cuff: TOP, skin: SK, hx: 0.04, hy: -0.32, hz: 0.28, r: 0.1, hand: 0.15 });
    arm.add(RB(0.5, 0.56, 0.42, 0.12), M(hx + 0.04, hy + 0.06, hz + 0.24), 0x3a3048).add(RB(0.52, 0.12, 0.44, 0.05), M(hx + 0.04, hy + 0.36, hz + 0.24), PH)
      .add(C(0.15, 0.15, 0.06, 20), M(hx + 0.04, hy + 0.14, hz + 0.46, Math.PI / 2), 0x14111b).add(S(0.1), M(hx + 0.04, hy + 0.14, hz + 0.48, 0, 0, 0, 1, 1, 0.5), PH)
      .add(C(0.08, 0.08, 0.06, 16), M(hx + 0.04, hy - 0.12, hz + 0.46, Math.PI / 2), 0x14111b).add(S(0.05), M(hx + 0.04, hy - 0.12, hz + 0.48, 0, 0, 0, 1, 1, 0.5), HR);
    armBase(armL, { sleeve: JK, sleeve2: SK, cuff: HR, skin: SK, hx: -0.04, hy: -0.38, hz: 0.1, r: 0.1, hand: 0.15 });
    armPos = [0.5, 1.13, 0.02];
  } else if (kind === 'lumber') {
    const SK = 0xe8a77c, BD = 0xb5562b, BDD = 0x8c3d1c, BN = 0x2f8f5b, SH = 0xd8352e, SHD = 0x8e1f1c, JE = 0x3d5a99;
    const prof = [[0, 0.32], [0.5, 0.34], [0.68, 0.55], [0.74, 0.8], [0.7, 1.05], [0.56, 1.25], [0.28, 1.38], [0, 1.4]];
    body.add(LATHE(prof), M(0, 0, -0.02), SH);
    for (const [y, r] of [[0.62, 0.725], [0.82, 0.745], [1.02, 0.71]]) body.add(TOR(r, 0.03, Math.PI * 2, 6, 40), M(0, y, -0.02, Math.PI / 2), SHD);
    body.add(LATHE([[0, 0.28], [0.56, 0.3], [0.62, 0.46], [0, 0.48]]), M(), JE).add(TOR(0.6, 0.06, Math.PI * 2, 8, 36), M(0, 0.44, -0.02, Math.PI / 2), 0x4a2c1a).add(RB(0.22, 0.16, 0.08, 0.04), M(0, 0.44, 0.62), 0xffc43d)
      .add(CAP(0.05, 0.62), M(-0.28, 0.95, 0.6, -0.12, 0, 0.06), JE).add(CAP(0.05, 0.62), M(0.28, 0.95, 0.6, -0.12, 0, -0.06), JE);
    const h = { y: 1.78, z: 0.04, R: 0.46 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.095, ex: 0.16, ey: 1.84, browT: 0.05, browAng: 0.35, browCol: BDD, nose: 0.12, noseCol: 0xd88a62, mouth: false, cheek: false });
    body.add(S(0.38), M(0, 1.5, 0.24, 0.2, 0, 0, 1.15, 0.95, 0.8), BD).add(S(0.22), M(0, 1.28, 0.36, 0.3, 0, 0, 1, 1, 0.75), BD).add(S(0.25), M(-0.32, 1.62, 0.12, 0, 0, 0, 0.6, 1, 0.8), BD).add(S(0.25), M(0.32, 1.62, 0.12, 0, 0, 0, 0.6, 1, 0.8), BD)
      .add(S(0.09), M(0, 1.6, 0.44, 0, 0, 0, 1.4, 0.6, 0.6), 0x5a1a20);
    for (const s of [-1, 1]) body.add(CAP(0.075, 0.18, 8), M(s * 0.13, 1.66, 0.47, 0, 0, s * 1.3), BDD);
    body.add(HEMI(0.5), M(0, 1.9, 0.0, -0.12, 0, 0, 1, 0.95, 1), BN).add(TOR(0.48, 0.09, Math.PI * 2, 10, 36), M(0, 1.92, 0.0, Math.PI / 2 - 0.12), 0x237048).add(S(0.15), M(0, 2.42, -0.06), 0xf3ead2);
    fx = 0.34;
    foot.add(CAP(0.16, 0.16), M(0, 0.22, 0), JE).add(RB(0.36, 0.28, 0.5, 0.12), M(0, 0.02, 0.06), 0x6b3f22).add(RB(0.38, 0.08, 0.52, 0.04), M(0, -0.11, 0.06), 0x2a1a12);
    const [hx, hy, hz] = armBase(arm, { sleeve: SH, cuff: SHD, skin: SK, hx: 0.0, hy: -0.4, hz: 0.24, r: 0.17, hand: 0.22 });
    for (const s of [-1, 1]) arm.add(C(0.14, 0.14, 0.95, 18), M(hx + s * 0.15, hy + 0.12, hz + 0.42, Math.PI / 2), 0x7a4b28).add(C(0.145, 0.145, 0.04, 18), M(hx + s * 0.15, hy + 0.12, hz + 0.9, Math.PI / 2), 0xe8c48a).add(C(0.07, 0.07, 0.05, 12), M(hx + s * 0.15, hy + 0.12, hz + 0.91, Math.PI / 2), 0x2a1a12);
    arm.add(TOR(0.3, 0.04, Math.PI * 2, 6, 22), M(hx, hy + 0.12, hz + 0.6, 0, 0, 0, 1.1, 0.55, 1), 0x4a2c1a);
    armBase(armL, { sleeve: SH, cuff: SHD, skin: SK, hx: -0.04, hy: -0.44, hz: 0.12, r: 0.17, hand: 0.22 });
    armPos = [0.82, 1.18, 0.0];
  } else if (kind === 'ronin') {
    const SK = 0xffd9b8, HR = 0x1f2340, HB = 0xe63946, HA = 0x1fa6a0, HAD = 0x15807b, UN = 0xf4f1ea, HK = 0x2b3a7a, BB = 0x8fd45a;
    body.add(LATHE([[0, 0.45], [0.4, 0.47], [0.42, 0.7], [0.38, 0.95], [0.3, 1.14], [0.14, 1.24], [0, 1.26]]), M(), HA)
      .add(LATHE([[0, 0.24], [0.5, 0.25], [0.46, 0.4], [0.4, 0.6], [0, 0.62]]), M(), HK)
      .add(TOR(0.41, 0.07, Math.PI * 2, 8, 30), M(0, 0.62, 0, Math.PI / 2), UN).add(S(0.08), M(0.2, 0.6, 0.38), UN)
      .add(S(0.2), M(0, 1.06, 0.27, 0, 0, 0, 0.75, 0.55, 0.45), UN).add(CAP(0.045, 0.34), M(-0.1, 1.0, 0.33, -0.25, 0, 0.42), HAD).add(CAP(0.045, 0.34), M(0.1, 1.0, 0.33, -0.25, 0, -0.42), HAD);
    for (const s of [-1, 1]) body.add(S(0.07), M(s * 0.32, 1.05, 0.2), WHITE);
    const h = { y: 1.68, z: 0.03, R: 0.48 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.13, ex: 0.18, ey: 1.7, browT: 0.045, browAng: 0.42, browCol: HR, mouth: 'grin', mw: 0.12, cheekCol: 0xff9a8a });
    feat(body, h, RB(0.14, 0.06, 0.04, 0.02, 2), 0.3, 1.52, 0.0, 1, 1, 1, WHITE, 0.5); feat(body, h, RB(0.06, 0.14, 0.04, 0.02, 2), 0.3, 1.52, -0.005, 1, 1, 1, 0xf2e6d6, 0.5);
    body.add(S(0.5), M(0, 1.79, -0.06, 0, 0, 0, 1.02, 0.85, 0.96), HR)
      .add(S(0.2), M(-0.17, 2.0, 0.34, 0.6, 0, 0.3, 1, 0.5, 0.8), HR).add(S(0.18), M(0.12, 2.02, 0.36, 0.6, 0, -0.4, 1, 0.5, 0.8), HR)
      .add(C(0.1, 0.12, 0.16, 14), M(0, 2.28, -0.12, -0.3), HR).add(S(0.2), M(0, 2.42, -0.18, -0.3, 0, 0, 1.25, 0.7, 0.9), HR)
      .add(TOR(0.47, 0.06, Math.PI * 2, 8, 36), M(0, 1.93, 0.0, Math.PI / 2 - 0.15, 0, 0, 1.03, 1, 1), HB)
      .add(S(0.07), M(0, 2.04, -0.48), HB).add(CAP(0.06, 0.32), M(-0.12, 1.86, -0.6, 0.6, 0, 0.5, 1, 1, 0.4), HB).add(CAP(0.06, 0.34), M(0.12, 1.84, -0.62, 0.7, 0, -0.3, 1, 1, 0.4), HB);
    fx = 0.22;
    foot.add(C(0.12, 0.1, 0.24, 14), M(0, 0.18, 0), UN).add(RB(0.24, 0.18, 0.38, 0.08), M(0, 0.0, 0.05), UN).add(RB(0.3, 0.07, 0.46, 0.03), M(0, -0.1, 0.05), 0x8a5a2b).add(CAP(0.025, 0.14, 6), M(0, 0.06, 0.16, 0, 0, Math.PI / 2), INK);
    const [hx, hy, hz] = armBase(arm, { sleeve: HA, sleeve2: SK, cuff: UN, skin: SK, hx: 0.02, hy: -0.36, hz: 0.26, r: 0.11, hand: 0.16 });
    // bamboo sword held forward & up
    const swd = new Builder();
    swd.add(C(0.065, 0.065, 0.36, 12), M(0, 0.0, 0), 0x2b2028).add(C(0.16, 0.16, 0.05, 18), M(0, 0.2, 0), 0x8a5a2b).add(C(0.075, 0.07, 1.2, 14), M(0, 0.82, 0), BB);
    for (const y of [0.45, 0.82, 1.18]) swd.add(TOR(0.076, 0.022, Math.PI * 2, 6, 16), M(0, y, 0, Math.PI / 2), 0x5fa83a);
    swd.add(S(0.075), M(0, 1.42, 0), BB);
    const sg = swd.build(); sg.applyMatrix4(M(hx, hy, hz + 0.05, 0.75, 0, 0.6)); arm.parts.push({ g: sg, c: null, keep: true });
    armBase(armL, { sleeve: HA, sleeve2: SK, cuff: UN, skin: SK, hx: -0.02, hy: -0.36, hz: 0.18, r: 0.11, hand: 0.16 });
    armPos = [0.5, 1.08, 0.02]; melee = true;
  } else if (kind === 'granny') {
    const SK = 0xf5cfb0, HR = 0xe9ecf5, HRD = 0xc6cbe0, CO = 0xf4f6f8, DR = 0x7b4fb8, GL = 0x6bd36b, BR = 0xc99a3a, LS = 0xbff3ff;
    body.add(LATHE([[0, 0.24], [0.56, 0.26], [0.52, 0.5], [0.46, 0.8], [0.4, 1.02], [0.3, 1.18], [0.12, 1.26], [0, 1.27]]), M(0, 0, -0.02), CO)
      .add(S(0.3), M(0, 0.9, 0.18, 0, 0, 0, 0.8, 1.1, 0.7), DR)
      .add(RB(0.18, 0.2, 0.06, 0.04), M(0.24, 0.98, 0.37, 0, 0.5, 0), 0xdfe3e8).add(CAP(0.02, 0.1), M(0.22, 1.08, 0.39, 0, 0, 0.2), 0x3fa9ff).add(CAP(0.02, 0.1), M(0.27, 1.07, 0.37, 0, 0, -0.1), 0xff4f6f)
      .add(LATHE([[0, 0.2], [0.5, 0.22], [0.5, 0.3], [0, 0.31]]), M(), DR);
    const h = { y: 1.64, z: 0.1, R: 0.48 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.1, ex: 0.18, ey: 1.7, browCol: HRD, browAng: -0.3, browUp: 0.04, nose: 0.1, noseCol: 0xe8a888, mouth: 'tooth', my: 1.44, mw: 0.12, iris: 0x2f8f5b, cheekCol: 0xff9fae });
    for (const s of [-1, 1]) { feat(body, h, TOR(0.16, 0.035, Math.PI * 2, 8, 24), s * 0.18, 1.7, -0.08, 1, 1, 1, BR); feat(body, h, S(0.15, 22, 14), s * 0.18, 1.7, -0.06, 1, 1, 0.25, LS); }
    // re-draw eyes on top of lenses (lens is semi-glass look: light cyan disc behind pupils)
    for (const s of [-1, 1]) { feat(body, h, S(0.075, 14, 10), s * 0.18, 1.69, -0.12, 1, 1.1, 0.4, INK); feat(body, h, S(0.028, 8, 6), s * 0.18 + 0.03, 1.72, -0.15, 1, 1, 0.4, WHITE); }
    feat(body, h, CAP(0.025, 0.06, 6), 0, 1.72, -0.02, 1, 1, 1, BR, Math.PI / 2);
    body.add(S(0.5), M(0, 1.76, -0.04, 0, 0, 0, 1.03, 0.82, 0.95), HR);
    for (const [x, y, z, r] of [[-0.38, 1.64, 0.16, 0.16], [0.38, 1.64, 0.16, 0.16], [-0.28, 1.98, 0.28, 0.15], [0.28, 1.98, 0.28, 0.15], [0, 2.08, 0.3, 0.15], [-0.42, 1.86, 0.05, 0.16], [0.42, 1.86, 0.05, 0.16]]) body.add(S(r), M(x, y, z), HR);
    body.add(S(0.27), M(0, 2.3, -0.08), HR).add(TOR(0.2, 0.05, Math.PI * 2, 8, 20), M(0, 2.14, -0.06, Math.PI / 2), HRD).add(C(0.025, 0.025, 0.6, 8), M(0, 2.33, -0.08, 0, 0, 1.2), 0xff4f6f).add(S(0.05), M(0.28, 2.45, -0.08), 0xff4f6f);
    fx = 0.22;
    foot.add(CAP(0.08, 0.14), M(0, 0.18, 0), 0xe8d4c2).add(S(0.16), M(0, 0.0, 0.06, 0, 0, 0, 1, 0.65, 1.4), 0xff8fb0).add(S(0.1), M(0, 0.08, 0.2, 0, 0, 0, 1, 0.6, 1), WHITE);
    const [hx, hy, hz] = armBase(arm, { sleeve: CO, cuff: CO, skin: SK, handCol: GL, hx: 0.02, hy: -0.36, hz: 0.24, r: 0.11, hand: 0.15 });
    arm.add(LATHE([[0, 0], [0.26, 0.02], [0.28, 0.12], [0.1, 0.4], [0.08, 0.52], [0, 0.53]], 22), M(hx, hy + 0.04, hz + 0.28, Math.PI / 2 - 0.2), 0xd6f7ff)
      .add(LATHE([[0, 0.02], [0.23, 0.04], [0.24, 0.12], [0.15, 0.26], [0, 0.27]], 20), M(hx, hy + 0.04, hz + 0.29, Math.PI / 2 - 0.2), 0x8dff5a)
      .add(C(0.085, 0.07, 0.14, 12), M(hx, hy + 0.15, hz + 0.84, Math.PI / 2 - 0.2), 0x9a6b3c)
      .add(S(0.07), M(hx + 0.08, hy + 0.18, hz + 0.95), 0x8dff5a).add(S(0.05), M(hx - 0.06, hy + 0.28, hz + 1.02), 0x8dff5a);
    armBase(armL, { sleeve: CO, cuff: CO, skin: SK, handCol: GL, hx: -0.02, hy: -0.4, hz: 0.14, r: 0.11, hand: 0.15 });
    armPos = [0.5, 1.08, 0.04];
  } else if (kind === 'diver') {
    const SU = 0xf28c28, SUD = 0xc8631a, BR = 0xd9a441, BRD = 0xa8742a, SK = 0xffd2b0, TK = 0x2ab3a6;
    body.add(LATHE([[0, 0.3], [0.48, 0.32], [0.58, 0.55], [0.58, 0.85], [0.5, 1.08], [0.3, 1.24], [0, 1.26]]), M(), SU)
      .add(TOR(0.57, 0.08, Math.PI * 2, 8, 36), M(0, 0.55, 0, Math.PI / 2), 0x3a3a46);
    for (const a of [-0.9, -0.3, 0.3, 0.9]) body.add(RB(0.16, 0.16, 0.1, 0.04), M(Math.sin(a) * 0.62, 0.55, Math.cos(a) * 0.62, 0, a, 0), 0x6a6a78);
    body.add(LATHE([[0, 1.08], [0.62, 1.1], [0.62, 1.22], [0.38, 1.34], [0, 1.35]], 30), M(), BR);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; body.add(S(0.05), M(Math.sin(a) * 0.6, 1.17, Math.cos(a) * 0.6), BRD); }
    body.add(CAP(0.17, 0.5), M(-0.2, 0.92, -0.52), TK).add(CAP(0.17, 0.5), M(0.2, 0.92, -0.52), TK).add(C(0.06, 0.06, 0.12), M(0, 1.3, -0.52, 0, 0, Math.PI / 2), 0x6a6a78)
      .add(TOR(0.3, 0.05, Math.PI * 1.2, 8, 20), M(0, 1.62, -0.55, 0, Math.PI / 2, -0.2), 0x3a3a46);
    body.hi = body.parts.length; body.add(S(0.6), M(0, 1.72, 0), BR).add(S(0.4), M(0, 1.7, 0.26), SK);
    const h = { y: 1.7, z: 0.26, R: 0.4 };
    face(body, h, { skin: SK, er: 0.095, ex: 0.14, ey: 1.73, browAng: 0.1, browT: 0.03, mouth: 'open', mw: 0.09, my: 1.56, ears: false, cheekCol: 0xff9f8f });
    HEAD = { y: 1.72, z: 0, R: 0.6 }; // scale the whole helmet, not just the face window
    body.add(TOR(0.32, 0.075, Math.PI * 2, 10, 32), M(0, 1.7, 0.5), BRD);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.39; body.add(S(0.04), M(Math.cos(a) * 0.32, 1.7 + Math.sin(a) * 0.32, 0.57), 0xe8c56a); }
    body.add(CAP(0.025, 0.1, 6), M(-0.2, 1.86, 0.55, 0, 0, -0.75), WHITE);
    for (const s of [-1, 1]) { body.add(TOR(0.15, 0.05, Math.PI * 2, 8, 20), M(s * 0.58, 1.72, 0, 0, Math.PI / 2, 0), BRD).add(C(0.13, 0.13, 0.04, 18), M(s * 0.58, 1.72, 0, 0, 0, Math.PI / 2), 0x3a77b8); }
    body.add(C(0.1, 0.12, 0.12), M(0, 2.34, -0.02), BRD).add(S(0.08), M(0, 2.43, -0.02), 0xe63946);
    fx = 0.26;
    foot.add(CAP(0.13, 0.12), M(0, 0.22, 0), SU).add(RB(0.34, 0.3, 0.46, 0.1), M(0, 0.02, 0.05), 0x4a4a58).add(RB(0.36, 0.08, 0.48, 0.03), M(0, 0.14, 0.05), BRD);
    const [hx, hy, hz] = armBase(arm, { sleeve: SU, cuff: BRD, skin: 0x7a4b28, handCol: 0x7a4b28, hx: 0.02, hy: -0.36, hz: 0.24, r: 0.13, hand: 0.17 });
    arm.add(C(0.2, 0.2, 0.62, 22), M(hx, hy + 0.12, hz + 0.3, Math.PI / 2), BR).add(TOR(0.2, 0.05, Math.PI * 2, 8, 22), M(hx, hy + 0.12, hz + 0.61), BRD).add(TOR(0.2, 0.04, Math.PI * 2, 8, 22), M(hx, hy + 0.12, hz + 0.05), BRD)
      .add(S(0.17), M(hx, hy + 0.12, hz + 0.66), 0xffd23f).add(S(0.04), M(hx - 0.07, hy + 0.18, hz + 0.8), INK).add(S(0.04), M(hx + 0.07, hy + 0.18, hz + 0.8), INK);
    for (const [a, b] of [[0, 1], [1.2, 0.8], [2.4, 1], [3.6, 0.8], [4.8, 1]]) arm.add(CONE(0.035, 0.12, 6), M(hx + Math.cos(a) * 0.16, hy + 0.12 + Math.sin(a) * 0.16, hz + 0.68, 0, 0, a - Math.PI / 2), 0xfff3b0);
    armBase(armL, { sleeve: SU, cuff: BRD, skin: 0x7a4b28, hx: -0.02, hy: -0.4, hz: 0.12, r: 0.13, hand: 0.17 });
    armPos = [0.62, 1.1, 0.0];
  } else if (kind === 'kite') {
    const SK = 0xffdcc0, HR = 0x26203a, RB_ = 0xe63946, TOPC = 0x3fa9ff, TOPD = 0x2a7fd0, PA = 0xf4f1ea, SL = 0xe63946, GD = 0xffd23f;
    body.add(LATHE([[0, 0.44], [0.4, 0.46], [0.43, 0.7], [0.4, 0.95], [0.32, 1.15], [0.15, 1.25], [0, 1.27]]), M(), TOPC)
      .add(LATHE([[0, 0.24], [0.52, 0.26], [0.47, 0.42], [0.42, 0.56], [0, 0.58]]), M(), RB_)
      .add(TOR(0.42, 0.05, Math.PI * 2, 8, 30), M(0, 0.57, 0, Math.PI / 2), GD)
      .add(TOR(0.2, 0.05, Math.PI * 2, 8, 22), M(0, 1.2, 0.04, Math.PI / 2 - 0.25), PA)
      .add(CAP(0.035, 0.36), M(0.12, 0.95, 0.4, -0.1, 0, 0.5), TOPD);
    for (const y of [1.05, 0.88, 0.71]) body.add(S(0.045), M(0.2, y, 0.38), GD);
    const h = { y: 1.7, z: 0.03, R: 0.47 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.13, ex: 0.18, ey: 1.71, lash: true, browAng: 0.1, browT: 0.035, iris: 0x2a6fd6, mouth: 'open', mw: 0.1, my: 1.5, cheekCol: 0xff8fa0 });
    // hair: cap + straight bangs + twin buns with red ribbons
    body.add(S(0.5), M(0, 1.8, -0.06, 0, 0, 0, 1.03, 0.86, 0.97), HR);
    for (const x of [-0.24, -0.08, 0.08, 0.24]) body.add(CAP(0.09, 0.12), M(x, 1.98, 0.36, 0.5, 0, x * 0.4), HR);
    for (const s of [-1, 1]) {
      body.add(S(0.2), M(s * 0.38, 2.12, -0.06), HR).add(TOR(0.17, 0.045, Math.PI * 2, 8, 20), M(s * 0.36, 2.0, -0.06, Math.PI / 2, 0, s * 0.4), RB_)
        .add(CAP(0.05, 0.22), M(s * 0.5, 1.84, -0.12, 0.2, 0, s * 0.3), RB_).add(S(0.06), M(s * 0.36, 2.02, 0.1), GD);
      body.add(CAP(0.08, 0.32), M(s * 0.4, 1.52, 0.02, 0, 0, -s * 0.1), HR);
    }
    fx = 0.2;
    foot.add(CAP(0.09, 0.2), M(0, 0.22, 0), PA).add(RB(0.24, 0.16, 0.38, 0.08), M(0, 0.0, 0.05), SL).add(RB(0.26, 0.06, 0.4, 0.03), M(0, -0.09, 0.05), 0x2b2328).add(S(0.05), M(0, 0.08, 0.22), GD);
    const [hx, hy, hz] = armBase(arm, { sleeve: TOPC, sleeve2: SK, cuff: PA, skin: SK, hx: 0.02, hy: -0.36, hz: 0.26, r: 0.1, hand: 0.15 });
    // diamond kite held up in front: frame, painted swallow face, tail bows
    const kb = new Builder();
    const kx = hx - 0.28, ky = hy + 0.42, kz = hz + 0.22;
    kb.add(C(0.025, 0.025, 0.6, 8), M(hx, hy + 0.26, hz + 0.18, 0.4), 0x9a6b3c)
      .add(RB(0.62, 0.62, 0.05, 0.05, 2), M(kx, ky, kz, 0, 0, Math.PI / 4), 0xfff3e0)
      .add(RB(0.44, 0.44, 0.06, 0.04, 2), M(kx, ky, kz + 0.01, 0, 0, Math.PI / 4), RB_)
      .add(S(0.07), M(kx - 0.1, ky + 0.06, kz + 0.05, 0, 0, 0, 1, 1, 0.4), WHITE).add(S(0.07), M(kx + 0.1, ky + 0.06, kz + 0.05, 0, 0, 0, 1, 1, 0.4), WHITE)
      .add(S(0.035), M(kx - 0.1, ky + 0.06, kz + 0.08, 0, 0, 0, 1, 1, 0.4), INK).add(S(0.035), M(kx + 0.1, ky + 0.06, kz + 0.08, 0, 0, 0, 1, 1, 0.4), INK)
      .add(CONE(0.06, 0.12, 4), M(kx, ky - 0.08, kz + 0.06, Math.PI, 0, 0), GD)
      .add(C(0.015, 0.015, 0.9, 6), M(kx, ky, kz + 0.04, 0, 0, Math.PI / 4), 0x9a6b3c).add(C(0.015, 0.015, 0.9, 6), M(kx, ky, kz + 0.04, 0, 0, -Math.PI / 4), 0x9a6b3c);
    for (const [i, c] of [[0, GD], [1, TOPC], [2, RB_]]) kb.add(CONE(0.06, 0.12, 4), M(kx + 0.05 * i, ky - 0.5 - i * 0.16, kz - 0.02, 0, 0, Math.PI / 2), c).add(CONE(0.06, 0.12, 4), M(kx + 0.05 * i, ky - 0.5 - i * 0.16, kz - 0.02, 0, 0, -Math.PI / 2), c);
    { const g2 = kb.build(); g2.applyMatrix4(new THREE.Matrix4().makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)).multiply(new THREE.Matrix4().makeTranslation(-hx, -hy, -hz))); arm.parts.push({ g: g2, c: null, keep: true }); }
    armBase(armL, { sleeve: TOPC, sleeve2: SK, cuff: PA, skin: SK, hx: -0.04, hy: -0.38, hz: 0.12, r: 0.1, hand: 0.15 });
    armPos = [0.5, 1.1, 0.02];
  } else if (kind === 'lion') {
    const SK = 0xf0b48a, LR = 0xe63946, LRD = 0xa8202c, GD = 0xffc93c, FUR = 0xfff6e8, PA = 0xffb020, HR = 0x2a1a14;
    // fringed lion-costume body
    body.add(LATHE([[0, 0.34], [0.5, 0.36], [0.62, 0.58], [0.64, 0.84], [0.56, 1.06], [0.38, 1.22], [0.16, 1.3], [0, 1.31]]), M(), LR)
      .add(LATHE([[0, 0.26], [0.5, 0.28], [0.54, 0.44], [0, 0.46]]), M(), PA);
    for (const [y, r] of [[0.5, 0.63], [0.78, 0.67], [1.04, 0.58]]) body.add(TOR(r, 0.065, Math.PI * 2, 8, 36), M(0, y, 0, Math.PI / 2), FUR);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; body.add(S(0.07), M(Math.sin(a) * 0.62, 0.92, Math.cos(a) * 0.62), GD); }
    body.add(RB(0.3, 0.2, 0.08, 0.04), M(0, 0.68, 0.64), GD).add(TOR(0.07, 0.025, Math.PI * 2, 6, 14), M(0, 0.68, 0.69), LRD);
    const h = { y: 1.74, z: 0.03, R: 0.46 };
    body.hi = body.parts.length; body.add(S(h.R), M(0, h.y, h.z), SK);
    face(body, h, { skin: SK, er: 0.115, ex: 0.17, ey: 1.76, browT: 0.05, browAng: 0.4, browCol: HR, mouth: 'grin', mw: 0.12, my: 1.52, cheekCol: 0xff8a7a });
    body.add(S(0.48), M(0, 1.84, -0.06, 0, 0, 0, 1.02, 0.82, 0.96), HR)
      .add(TOR(0.46, 0.07, Math.PI * 2, 8, 36), M(0, 1.95, 0.0, Math.PI / 2 - 0.12), LR).add(S(0.08), M(0.3, 2.0, -0.38), LR).add(CAP(0.06, 0.3), M(0.36, 1.84, -0.5, 0.5, 0, -0.6, 1, 1, 0.4), LR);
    for (const [x, y, z] of [[-0.2, 2.2, 0.12], [0.04, 2.26, 0.14], [0.24, 2.18, 0.1]]) body.add(CONE(0.1, 0.24, 10), M(x, y, z, -0.5, 0, x * 0.8), HR);
    fx = 0.28;
    foot.add(CAP(0.12, 0.16), M(0, 0.22, 0), PA).add(RB(0.32, 0.24, 0.46, 0.11), M(0, 0.02, 0.06), LR).add(RB(0.34, 0.07, 0.48, 0.03), M(0, -0.1, 0.06), 0x2a1a14).add(TOR(0.13, 0.04, Math.PI * 2, 6, 16), M(0, 0.2, 0, Math.PI / 2), FUR);
    const [hx, hy, hz] = armBase(arm, { sleeve: LR, sleeve2: SK, cuff: FUR, skin: SK, hx: 0.02, hy: -0.34, hz: 0.26, r: 0.13, hand: 0.17 });
    // lion head puppet held out front
    const lb = new Builder();
    const lx = hx - 0.12, ly = hy - 0.02, lz = hz + 0.46;
    lb.add(RB(0.74, 0.62, 0.62, 0.22), M(lx, ly, lz), LR).add(RB(0.6, 0.18, 0.5, 0.08), M(lx, ly - 0.32, lz + 0.06), LR)
      .add(RB(0.5, 0.1, 0.4, 0.04), M(lx, ly - 0.22, lz + 0.1), 0x6a1525)
      .add(RB(0.62, 0.14, 0.5, 0.06), M(lx, ly + 0.3, lz + 0.02), GD).add(S(0.1), M(lx, ly + 0.42, lz + 0.18), 0x4cc9f0)
      .add(CONE(0.07, 0.22, 10), M(lx, ly + 0.5, lz + 0.02, -0.3), GD);
    for (const s of [-1, 1]) {
      lb.add(S(0.13), M(lx + s * 0.17, ly + 0.12, lz + 0.3, 0, 0, 0, 1, 1, 0.6), WHITE).add(S(0.07), M(lx + s * 0.17, ly + 0.11, lz + 0.37, 0, 0, 0, 1, 1, 0.5), INK)
        .add(CAP(0.04, 0.18), M(lx + s * 0.17, ly + 0.27, lz + 0.31, 0, 0, Math.PI / 2 + s * 0.3), INK)
        .add(CONE(0.045, 0.1, 6), M(lx + s * 0.12, ly - 0.16, lz + 0.3, Math.PI, 0, 0), WHITE)
        .add(S(0.14), M(lx + s * 0.38, ly - 0.05, lz + 0.05), FUR).add(S(0.12), M(lx + s * 0.36, ly + 0.2, lz + 0.0), FUR);
    }
    for (const x of [-0.18, 0, 0.18]) lb.add(S(0.12), M(lx + x, ly - 0.46, lz + 0.18), FUR);
    { const g2 = lb.build(); g2.applyMatrix4(new THREE.Matrix4().makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)).multiply(new THREE.Matrix4().makeTranslation(-hx, -hy, -hz))); arm.parts.push({ g: g2, c: null, keep: true }); }
    armBase(armL, { sleeve: LR, sleeve2: SK, cuff: FUR, skin: SK, hx: -0.04, hy: -0.4, hz: 0.14, r: 0.13, hand: 0.17 });
    armPos = [0.62, 1.12, 0.02]; melee = true;
  } else if (kind === 'dog') {
    const MT = 0xb8c6e0, MTD = 0x7f8fb0, OR = 0xff8a2a, SC = 0x1d2440, EY = 0x5ff7ff;
    body.add(RB(1.0, 0.7, 1.3, 0.3), M(0, 0.85, -0.1), MT).add(RB(0.7, 0.36, 0.9, 0.14), M(0, 1.22, -0.15), OR)
      .add(S(0.13), M(0, 1.42, -0.3), 0xffd23f).add(C(0.03, 0.03, 0.2, 8), M(0, 1.42, -0.3), MTD)
      .add(RB(0.95, 0.8, 0.8, 0.3), M(0, 1.45, 0.62), MT).add(RB(0.78, 0.5, 0.1, 0.1), M(0, 1.47, 1.02), SC)
      .add(S(0.11), M(-0.18, 1.52, 1.06, 0, 0, 0, 1, 1.2, 0.3), EY).add(S(0.11), M(0.18, 1.52, 1.06, 0, 0, 0, 1, 1.2, 0.3), EY)
      .add(TOR(0.08, 0.025, Math.PI, 6, 12), M(0, 1.36, 1.07, 0, 0, Math.PI), EY)
      .add(RB(0.36, 0.22, 0.3, 0.1), M(0, 1.18, 1.0), MTD).add(S(0.08), M(0, 1.28, 1.15), INK)
      .add(CONE(0.17, 0.4, 4), M(-0.32, 1.95, 0.55, -0.1, 0.78, 0.35), OR).add(CONE(0.17, 0.4, 4), M(0.32, 1.95, 0.55, -0.1, -0.78, -0.35), OR)
      .add(C(0.025, 0.025, 0.35, 8), M(0.2, 2.0, 0.45), MTD).add(S(0.07), M(0.2, 2.2, 0.45), 0xe63946)
      .add(TOR(0.52, 0.06, Math.PI * 2, 8, 30), M(0, 1.1, 0.3, Math.PI / 2 - 0.2), 0xe63946).add(C(0.1, 0.1, 0.04, 16), M(0, 0.92, 0.82, Math.PI / 2 - 0.2), 0xffd23f);
    foot.add(C(0.13, 0.13, 0.4, 14), M(0, 0.25, 0), MTD).add(S(0.2), M(0, 0.02, 0.05, 0, 0, 0, 1, 0.6, 1.25), MT);
    arm.add(C(0.04, 0.04, 0.3, 8), M(0, 0.12, -0.12, -0.6), MTD).add(TOR(0.08, 0.025, Math.PI * 2, 6, 14), M(0, 0.12, -0.1, 0, 0, 0), MTD).add(S(0.12), M(0, 0.28, -0.28), OR);
    armPos = [0, 1.0, -0.75]; fx = 0.38; two = false;
  }
  { const xb = new Builder(); backGear(kind, xb); if (xb.parts.length) { const at = body.hi ?? body.parts.length; body.parts.splice(at, 0, ...xb.parts); if (body.hi !== undefined) body.hi += xb.parts.length; } }
  // head (everything added from the head sphere on) is its own mesh so it can nod, tilt and look around
  let headG = null, pivot = null;
  if (split && body.hi !== undefined && HEAD) { const hb = new Builder(); hb.parts = body.parts.splice(body.hi); headG = hb.build(); bigHead(headG, HEAD); pivot = [0, HEAD.y - HEAD.R * 0.8, HEAD.z * 0.5]; for (const g of [headG, headG.userData.outline]) if (g) { g.translate(-pivot[0], -pivot[1], -pivot[2]); g.computeBoundingSphere(); } }
  const bodyG = body.build(); if (HEAD) bigHead(bodyG, HEAD);
  const P = { body: bodyG, head: headG, pivot, foot: foot.build(), arm: buildArm(arm), armL: two ? armL.build() : null, fx, fy, armPos, melee };
  for (const g of [P.body, P.head, P.foot, P.arm, P.armL]) if (g) ao(g);
  DET = 1; return (GEO[key] = P);
}
// back-side gear: reads well from the top-down game camera (heroes are mostly seen from behind / above)
function backGear(kind, B) {
  if (kind === 'chef') { // apron bow
    for (const s of [-1, 1]) B.add(TOR(0.09, 0.035, Math.PI * 2, 6, 14), M(s * 0.1, 0.78, -0.6, 0, s * 0.5, 0, 1, 0.7, 1), 0xe8433a).add(CAP(0.035, 0.18, 6), M(s * 0.07, 0.62, -0.6, 0, 0, s * 0.3), 0xe8433a);
    B.add(S(0.05), M(0, 0.78, -0.62), 0xc72f28);
  } else if (kind === 'dj') { // studded belt
    B.add(TOR(0.43, 0.045, Math.PI * 2, 6, 28), M(0, 0.6, 0, Math.PI / 2), 0x14111b);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.4; B.add(new THREE.OctahedronGeometry(0.04, 0), M(Math.sin(a) * 0.47, 0.6, Math.cos(a) * 0.47), 0xe8e8f4); }
  } else if (kind === 'lumber') { // axe slung across the back
    B.add(C(0.065, 0.07, 1.35, 8), M(0, 0.98, -0.9, 0.12, 0, -0.66), 0x8a5a2b).add(TOR(0.075, 0.025, Math.PI * 2, 4, 10), M(-0.27, 0.65, -0.88, Math.PI / 2, 0, -0.66), 0x4a2c1a);
    B.add(RB(0.5, 0.4, 0.1, 0.06, 2), M(0.5, 1.42, -0.98, 0.12, 0, -0.66), 0xb9c4d6).add(RB(0.1, 0.44, 0.11, 0.04, 2), M(0.66, 1.3, -0.98, 0.12, 0, -0.66), 0xf2f6fb);
  } else if (kind === 'ronin') { // straw kasa hanging on the back
    B.add(C(0.06, 0.5, 0.2, 18), M(0, 0.98, -0.5, -1.35), 0xe3c46a).add(TOR(0.48, 0.03, Math.PI * 2, 4, 24), M(0, 0.95, -0.47, -1.35 + Math.PI / 2), 0xb8913a).add(CAP(0.02, 0.5, 4), M(0, 1.1, -0.36, 0.3), 0x8a5a2b);
  } else if (kind === 'granny') { // bubbling potion tank backpack
    for (const s of [-1, 1]) B.add(C(0.17, 0.17, 0.6, 14), M(s * 0.18, 0.9, -0.6), 0xd6f7ff).add(C(0.14, 0.14, 0.44, 12), M(s * 0.18, 0.86, -0.6), s < 0 ? 0x8dff5a : 0xc9a2ff)
      .add(C(0.19, 0.19, 0.08, 14), M(s * 0.18, 1.22, -0.6), 0xc99a3a).add(C(0.19, 0.19, 0.08, 14), M(s * 0.18, 0.6, -0.6), 0xc99a3a).add(S(0.045), M(s * 0.18 + 0.05, 0.98, -0.75), 0xf4fff0);
    B.add(C(0.04, 0.04, 0.36, 6), M(0, 1.3, -0.6, 0, 0, Math.PI / 2), 0xc99a3a).add(S(0.08), M(0, 1.38, -0.6), 0xff4f6f);
    for (const s of [-1, 1]) B.add(CAP(0.03, 0.5, 4), M(s * 0.22, 1.0, -0.32, 0, 0, 0), 0x7b4fb8);
  } else if (kind === 'kite') { // red scarf tails flowing back
    for (const s of [-1, 1]) B.add(CAP(0.08, 0.5, 6), M(s * 0.1, 0.86, -0.5, -0.35, 0, s * 0.3, 1, 1, 0.45), 0xe63946).add(RB(0.16, 0.08, 0.06, 0.02, 2), M(s * 0.17, 0.6, -0.6, -0.35, 0, s * 0.3), 0xffd23f);
    B.add(S(0.1), M(0, 1.12, -0.4, 0, 0, 0, 1.2, 0.8, 0.7), 0xe63946);
  } else if (kind === 'lion') { // costume tail with a fur tuft
    B.add(CAP(0.09, 0.4, 6), M(0, 0.62, -0.82, -1.0), 0xe63946).add(CAP(0.08, 0.3, 6), M(0, 0.92, -1.1, -0.3), 0xe63946).add(S(0.17), M(0, 1.14, -1.14), 0xfff6e8).add(S(0.1), M(0.08, 1.24, -1.08), 0xffc93c);
  }
}
// baked soft occlusion: undersides and downward-facing surfaces a touch darker, gives the toon shading more volume
function ao(g) {
  const n = g.attributes.normal, c = g.attributes.color; if (!c) return;
  for (let i = 0; i < n.count; i++) { const t = Math.min(1, Math.max(0, n.getY(i) * 0.6 + 0.65)), k = 0.8 + 0.2 * t * t * (3 - 2 * t); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
}
// enlarge everything above the neck around the head centre (smooth blend over the neck) — chunkier, more readable heads
function bigHead(g, h, K = 1.19) {
  const neck = h.y - h.R * 0.95, band = 0.2;
  for (const geo of [g, g.userData.outline]) {
    if (!geo) continue; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < neck) continue; const t = Math.min(1, (y - neck) / band), k = 1 + (K - 1) * t * t * (3 - 2 * t);
      p.setXYZ(i, p.getX(i) * k, h.y + (y - h.y) * k + (K - 1) * h.R * 0.6 * t, h.z + (p.getZ(i) - h.z) * k);
    }
    p.needsUpdate = true; geo.computeBoundingSphere();
  }
}
// arm builder may hold a pre-coloured sub-geometry (sword); merge it as-is
function buildArm(b) {
  const pre = b.parts.filter(p => p.keep); b.parts = b.parts.filter(p => !p.keep);
  const g = b.build(); if (!pre.length) return g;
  const all = [g, ...pre.map(p => p.g)]; let n = 0; for (const x of all) n += x.attributes.position.count;
  const out = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'color']) { const arr = new Float32Array(n * 3); let o = 0; for (const x of all) { arr.set(x.attributes[a].array, o); o += x.attributes[a].array.length; } out.setAttribute(a, new THREE.BufferAttribute(arr, 3)); }
  out.computeBoundingSphere(); return out;
}

// lod=true for the in-game crowd (fewer segments), false for lobby / portraits / lineup close-ups
// split=false merges the head into the body (one mesh fewer) - used for the bot crowd, the player and lobby keep the nodding head
export function makeBrawler(kind, lod = false, split = true) {
  const P = parts(kind, lod, split), root = new THREE.Group(), inner = new THREE.Group(), torso = new THREE.Group(); root.add(inner); inner.add(torso);
  const OC = 0x14101c, OP = 0.07; // outline colour + depth push (silhouette-only lines)
  const body = outlined(P.body, heroMat(), 0.068, OC, OP); torso.add(body);
  let head = null; if (P.head) { head = outlined(P.head, heroMat(), 0.068, OC, OP); head.position.set(...P.pivot); torso.add(head); }
  const fl = outlined(P.foot, heroMat(), 0.06, OC, OP), fr = outlined(P.foot, heroMat(), 0.06, OC, OP);
  fl.position.set(-P.fx, P.fy, 0); fr.position.set(P.fx, P.fy, 0); inner.add(fl, fr);
  const arm = outlined(P.arm, heroMat(), 0.06, OC, OP); arm.position.set(-P.armPos[0], P.armPos[1], P.armPos[2]); // weapon in the hero's right hand (screen-left when facing camera)
  torso.add(arm);
  let arm2 = null;
  if (P.armL) { arm2 = outlined(P.armL, heroMat(), 0.06, OC, OP); arm2.position.set(P.armPos[0], P.armPos[1], P.armPos[2]); torso.add(arm2); }
  root.userData = { kind, inner, torso, body, head, hp0: P.pivot, sup: 0, fl, fr, arm, arm2, armBase: P.armPos.slice(), melee: P.melee, t: Math.random() * 6, kick: 0, kick2: 0, w: 0, lean: 0, roll: 0 };
  return root;
}
// walk cycle (counter-twist, hip sway, contact squash), turn lean, idle breathing + weight shift + look-around,
// head follow-through, attack recoil / slash lunge, super hop-and-spin
export function animBrawler(g, dt, speed) {
  const u = g.userData;
  u.w += (Math.min(1, speed / 5) - u.w) * Math.min(1, dt * 9); const w = u.w, iw = 1 - w; // smoothed run weight
  u.t += dt * (2.2 + 9.5 * w); u.it = (u.it || 0) + dt;
  const sn = Math.sin(u.t), cs = Math.cos(u.t), k8 = Math.min(1, dt * 8);
  // lean into turns
  let dy = g.rotation.y - (u.py ?? g.rotation.y); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); u.py = g.rotation.y;
  const turn = dt > 0 ? Math.max(-1, Math.min(1, dy / dt / 9)) : 0; u.roll += (-turn * 0.17 * (0.35 + w) - u.roll) * k8;
  // feet: arc steps, toe lifts on the swing, heel plants at contact
  u.fl.position.z = sn * 0.3 * w; u.fr.position.z = -sn * 0.3 * w;
  u.fl.position.y = 0.12 + Math.max(0, cs) ** 1.5 * 0.2 * w; u.fr.position.y = 0.12 + Math.max(0, -cs) ** 1.5 * 0.2 * w;
  u.fl.rotation.x = (-cs * 0.42 - Math.max(0, -sn) * 0.25) * w; u.fr.rotation.x = (cs * 0.42 - Math.max(0, sn) * 0.25) * w;
  // torso: highest when feet pass, squash at foot contact, counter-twist, hip sway, idle breathing + slow weight shift
  const breath = Math.sin(u.it * 2.4), shift = Math.sin(u.it * 0.85), contact = Math.abs(sn) ** 4 * w;
  const bob = Math.abs(cs) * 0.09 * w + breath * 0.018 * iw;
  u.lean += (0.16 * w - u.lean) * k8;
  u.kick = Math.max(0, u.kick - dt * 5.5); u.kick2 = Math.max(0, u.kick2 - dt * 5.5); u.sup = Math.max(0, u.sup - dt * 2.2);
  const T = u.torso, k = u.kick, k2 = u.kick2, ke = k * k * (3 - 2 * k), km = Math.max(k, k2), sw = Math.sin(km * Math.PI);
  // super: crouch, hop, full spin, land (sup goes 1 -> 0)
  const sp = 1 - u.sup, hop = u.sup > 0 ? Math.max(0, Math.sin(Math.min(1, sp * 1.25) * Math.PI)) : 0, crouch = u.sup > 0.85 ? (1 - u.sup) / 0.15 : 0;
  let tz = 0, rx = u.lean, ry = -sn * 0.14 * w + shift * 0.05 * iw, sq = contact * 0.05 + ke * 0.04 + crouch * 0.12 - hop * 0.08;
  if (u.melee) { tz = (k + k2) * 0.28 * sw; ry += 0.55 * (k - k2) * sw; rx += 0.1 * sw; } // lunge + twist with the slash
  else if (u.kind !== 'dog') { tz = -ke * 0.12; rx -= ke * 0.16; } // gun kick: rock back
  if (u.sup > 0 && u.spin) ry += (1 - (1 - Math.min(1, sp * 1.4)) ** 3) * Math.PI * 2;
  T.position.set(sn * 0.035 * w + shift * 0.03 * iw, bob - contact * 0.03 + hop * 0.55, tz);
  T.rotation.set(rx, ry, sn * 0.045 * w + shift * 0.025 * iw + u.roll);
  T.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
  u.body.scale.set(1 - breath * 0.008 * iw, 1 + breath * 0.012 * iw, 1);
  // head: lags the bob, keeps facing forward through the counter-twist, nods on shots, looks around when idle
  if (u.head) {
    const H = u.head, look = Math.sin(u.it * 0.55) * Math.sin(u.it * 0.23 + 1) * 0.32 * iw;
    u.hl = (u.hl || 0) + ((bob - (u.hb || 0)) * 3 - (u.hl || 0)) * Math.min(1, dt * 12); u.hb = bob;
    H.rotation.set(-u.lean * 0.55 + u.hl * 0.6 + ke * 0.22 - crouch * 0.15 + breath * 0.025 * iw, (u.melee || (u.sup > 0 && u.spin) ? 0 : -ry * 0.6) + look, -u.roll * 0.6 + sn * 0.05 * w + Math.sin(u.it * 0.7) * 0.04 * iw);
    H.position.y = u.hp0[1] + breath * 0.01 * iw;
  }
  const b = u.armBase, A = u.arm;
  A.position.y = b[1];
  if (u.kind === 'dog') { A.rotation.y = Math.sin(u.t * 3) * 0.5; A.position.z = b[2]; }
  else if (u.melee) { // wind-up and slash across, alternate direction for the 2nd hit
    A.rotation.set(-0.6 * (k + k2) + sn * 0.15 * w - breath * 0.03 * iw - hop * 0.9, 1.35 * (k - k2) * sw, 0); A.position.z = b[2] + (k + k2) * 0.25;
  } else { A.position.z = b[2] - ke * 0.24 - sn * 0.06 * w; A.rotation.set(-ke * 0.5 + sn * 0.12 * w - breath * 0.03 * iw - hop * 0.7, 0, cs * 0.05 * w); }
  if (u.arm2) { const A2 = u.arm2; A2.position.y = b[1]; A2.rotation.x = -sn * 0.8 * w + breath * 0.05 * iw - (u.melee ? 0.5 * sw : 0.25 * ke) - hop * 1.6; A2.rotation.z = 0.12 + Math.abs(sn) * 0.1 * w + Math.max(0, breath) * 0.04 * iw + hop * 0.5; }
}
export function kickBrawler(g, alt, sup) { const u = g.userData; if (sup) { u.sup = 1; u.spin = sup === 'spin'; u.kick = 1; } else if (alt && u.melee) u.kick2 = 1; else u.kick = 1; }
