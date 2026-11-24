// 自由模式专属街景 (2026-11): 霓虹竖招牌 / 霓虹拱门 / 枪械铺 / 快餐车 / 加油站. 全原创名字, 只在自由模式里加, 不动吃鸡地图.
// Perf: all glow boxes in ONE unlit vertex-coloured mesh, all sign faces in ONE textured mesh, booths in ONE lit mesh.
import * as THREE from 'three';

const NAMES = ['霓虹', 'MOTEL', 'DISCO', '夜 店', 'HOTEL', 'LIVE', 'TATTOO', 'PIZZA', '火烈鸟', '冲 浪', 'BAR', 'CLUB', '椰 林', 'SUSHI', '甜 品', 'JAZZ'];
const COLS = ['#ff2bd6', '#28e8ff', '#ffe600', '#7dff4a', '#ff7a1a', '#b04bff'];
const HEX = [0xff2bd6, 0x28e8ff, 0xffe600, 0x7dff4a, 0xff7a1a, 0xb04bff];

class Merge {
  constructor(vc = true) { this.P = []; this.C = []; this.N = []; this.vc = vc; }
  box(x, y, z, sx, sy, sz, col, ry = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz); if (ry) g.rotateY(ry); g.translate(x, y, z);
    const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array, c = new THREE.Color(col);
    for (const i of idx) { this.P.push(p.getX(i), p.getY(i), p.getZ(i)); this.N.push(n.getX(i), n.getY(i), n.getZ(i)); this.C.push(c.r, c.g, c.b); }
    g.dispose();
  }
  cyl(x, y, z, r, h, col) {
    const g = new THREE.CylinderGeometry(r, r, h, 8); g.translate(x, y, z);
    const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array, c = new THREE.Color(col);
    for (const i of idx) { this.P.push(p.getX(i), p.getY(i), p.getZ(i)); this.N.push(n.getX(i), n.getY(i), n.getZ(i)); this.C.push(c.r, c.g, c.b); }
    g.dispose();
  }
  mesh(mat) {
    if (!this.P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

function signAtlas() {
  const cw = 64, ch = 256, cv = document.createElement('canvas'); cv.width = cw * NAMES.length; cv.height = ch;
  const g = cv.getContext('2d');
  NAMES.forEach((t, i) => {
    const x = i * cw, c = COLS[i % COLS.length];
    g.fillStyle = '#140a26'; g.fillRect(x, 0, cw, ch);
    g.strokeStyle = c; g.lineWidth = 5; g.shadowColor = c; g.shadowBlur = 12; g.strokeRect(x + 5, 5, cw - 10, ch - 10);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...t.replace(/ /g, '')], n = chars.length, fs = Math.min(44, Math.floor((ch - 30) / n));
    g.font = `900 ${fs}px system-ui, "Microsoft YaHei", sans-serif`;
    chars.forEach((ch2, k) => g.fillText(ch2, x + cw / 2, 15 + (k + 0.5) * ((ch - 30) / n)));
    g.shadowBlur = 0;
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// wall present at (x, y, z)?
const wallAt = (map, x, y, z) => map.solids.some(b => x >= b.min.x - 0.05 && x <= b.max.x + 0.05 && z >= b.min.z && z <= b.max.z && b.min.y <= y && b.max.y >= y);
const onRoad = (map, x, z, pad = 0) => (map.roads || []).some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
function clearArea(map, x, z, hx, hz) {
  const B = map.bounds; if (x - hx < B.minX + 3 || x + hx > B.maxX - 3 || z - hz < B.minZ + 3 || z + hz > B.maxZ - 3) return false;
  if (onRoad(map, x, z, Math.max(hx, hz) + 0.5)) return false;
  return !map.solids.some(b => b.max.y > 0.05 && b.min.y < 3 && x + hx > b.min.x && x - hx < b.max.x && z + hz > b.min.z && z - hz < b.max.z);
}
function findOpen(map, x, z, hx, hz) {
  for (let r = 0; r < 40; r += 1.5) for (let a = 0; a < 12; a++) {
    const px = x + Math.cos(a / 12 * Math.PI * 2) * r, pz = z + Math.sin(a / 12 * Math.PI * 2) * r;
    if (clearArea(map, px, pz, hx, hz)) return { x: px, z: pz };
    if (!r) break;
  }
  return null;
}

export function buildFreeDeco(G, scene) {
  const map = G.map, glow = new Merge(), solid = new Merge(), objs = [], P = [], U = [];
  const nN = NAMES.length;
  const face = (x, y0, y1, z0, z1, i) => {   // a vertical quad in the x = const plane, spanning z0..z1
    const u0 = i / nN, u1 = (i + 1) / nN;
    const pts = [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], uv = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...pts[k]); U.push(...uv[k]); }
  };
  // ---- blade signs sticking out of the ocean-drive facades (east walls at x = 80) ----
  let si = 0, blades = 0;
  for (const [za, zb] of [[-124, -90], [-78, -6], [6, 78], [90, 124]]) {
    for (let z = za + 4; z < zb - 3; z += 9) {
      if (!wallAt(map, 80, 4.5, z)) continue;
      const i = si++ % nN, top = wallAt(map, 80, 7.5, z) ? 7.6 : 6.0, bot = top - 3.0, x0 = 80.25, x1 = 81.65, col = HEX[i % HEX.length];
      solid.box((x0 + x1) / 2, (top + bot) / 2, z, x1 - x0, top - bot, 0.22, 0x1a1030);
      glow.box((x0 + x1) / 2, top + 0.06, z, x1 - x0 + 0.1, 0.1, 0.3, col); glow.box((x0 + x1) / 2, bot - 0.06, z, x1 - x0 + 0.1, 0.1, 0.3, col);
      glow.box(x1 + 0.04, (top + bot) / 2, z, 0.1, top - bot + 0.2, 0.3, col);
      // the canvas column is drawn across z, so lay it on both sides of the blade (faces at z +-0.115)
      const pz = [z + 0.116, z - 0.116];
      for (const fz of pz) {
        const pts = [[x1, bot, fz], [x0, bot, fz], [x0, top, fz], [x1, top, fz]], u0 = i / nN, u1 = (i + 1) / nN;
        const uv = fz > z ? [[u0, 0], [u1, 0], [u1, 1], [u0, 1]] : [[u1, 0], [u0, 0], [u0, 1], [u1, 1]];
        for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...pts[k]); U.push(...uv[k]); }
      }
      blades++;
    }
  }
  // ---- neon arches over 海滨大道 (x 84..92) ----
  for (const [z, c1, c2] of [[-60, 0xff2bd6, 0x28e8ff], [20, 0x28e8ff, 0xffe600], [100, 0xff7a1a, 0xff2bd6]]) {
    for (const x of [82.6, 93.4]) { solid.cyl(x, 3.3, z, 0.16, 6.6, 0xf4f1ea); glow.box(x, 3.3, z, 0.08, 6.4, 0.36, c1); }
    solid.box(88, 6.8, z, 11.4, 0.5, 0.3, 0xf4f1ea);
    glow.box(88, 6.5, z, 11.2, 0.09, 0.4, c1); glow.box(88, 7.1, z, 11.2, 0.09, 0.4, c2);
    for (let k = 0; k < 9; k++) glow.box(83.6 + k * 1.1, 6.8, z, 0.1, 0.42, 0.4, k % 2 ? c1 : c2);
  }
  // ---- kiosks: gun shop, food truck, gas station ----
  const kiosks = [], extraShops = [];
  const gun = findOpen(map, -30, -40, 2.6, 2.2);
  if (gun) {
    const { x, z } = gun;
    solid.box(x, 1.4, z - 0.9, 4.4, 2.8, 0.25, 0x3a3f4a); solid.box(x - 2.2, 1.4, z, 0.25, 2.8, 2.0, 0x3a3f4a); solid.box(x + 2.2, 1.4, z, 0.25, 2.8, 2.0, 0x3a3f4a);
    solid.box(x, 1.0, z + 0.3, 4.2, 1.0, 0.6, 0x2a2d34); solid.box(x, 2.95, z, 4.8, 0.2, 2.6, 0xd8442e);
    for (let k = 0; k < 4; k++) solid.box(x - 1.4 + k * 0.95, 1.9, z - 0.74, 0.75, 0.12, 0.08, 0x111111);
    glow.box(x, 3.15, z + 1.25, 4.6, 0.12, 0.1, 0xff3a3a);
    kiosks.push({ kind: 'gun', x, z: z + 1.6, label: '枪械铺 · 买装备', color: 0xff5a3a });
  }
  const food = findOpen(map, 104, 14, 2.8, 1.6);
  if (food) {
    const { x, z } = food;
    solid.box(x, 1.4, z, 5.2, 2.2, 2.2, 0xfff1f5); solid.box(x, 2.55, z, 5.4, 0.2, 2.4, 0xff8fb4);
    solid.box(x, 1.3, z + 1.12, 3.0, 1.0, 0.06, 0x2a2a35); solid.box(x, 1.75, z + 1.5, 3.4, 0.1, 0.7, 0xffcc6e);
    for (const dx of [-1.7, 1.7]) for (const dz of [-0.9, 0.9]) solid.cyl(x + dx, 0.3, z + dz, 0.3, 0.25, 0x222222);
    glow.box(x, 2.75, z + 1.15, 4.6, 0.1, 0.1, 0x7dff4a);
    kiosks.push({ kind: 'food', x, z: z + 2.2, label: '快餐车 · 回血 $50', color: 0x7dff4a });
  }
  const gas = findOpen(map, -118, -118, 6, 4);
  if (gas) {
    const { x, z } = gas;
    for (const dx of [-5, 5]) for (const dz of [-3, 3]) solid.cyl(x + dx, 2.3, z + dz, 0.18, 4.6, 0xf4f1ea);
    solid.box(x, 4.7, z, 11.4, 0.4, 7.4, 0xf4f1ea); glow.box(x, 4.45, z + 3.72, 11.4, 0.1, 0.08, 0xff2bd6); glow.box(x, 4.45, z - 3.72, 11.4, 0.1, 0.08, 0xff2bd6);
    for (const dx of [-2.5, 2.5]) { solid.box(x + dx, 0.75, z, 0.6, 1.5, 0.5, 0x52dcc8); solid.box(x + dx, 1.35, z + 0.26, 0.4, 0.3, 0.03, 0x111111); }
    // kiosk shop on the side
    const kx = x + 7.6, kz = z;
    solid.box(kx, 1.4, kz, 3.0, 2.8, 3.4, 0xffcc6e); solid.box(kx, 2.95, kz, 3.4, 0.2, 3.8, 0xffffff);
    solid.box(kx - 1.52, 1.25, kz, 0.04, 1.3, 2.2, 0x5fb4e8);
    glow.box(kx - 1.6, 2.6, kz, 0.08, 0.3, 2.6, 0x28e8ff);
    extraShops.push({ x: kx - 2.6, z: kz, name: '加油站', gas: true });
    kiosks.push({ kind: 'gas', x: kx - 2.6, z: kz, label: '加油站 · 可抢劫', color: 0x28e8ff });
  }

  // ================= 地图细节 (2026-11-25, modelled on the real Miami Beach layout the original game is based on) =================
  let rs = 7; const R = () => (rs = (rs * 16807) % 2147483647) / 2147483647, RR = (a, b) => a + R() * (b - a);
  const B = map.bounds, WX = B.minX - 12;          // west sea wall x
  // ---- 市中心 skyline across the bay: a low island of glass towers (west, x < -185) ----
  const town = new Merge(), GLASS = [0x5fb4e8, 0x7fd0e8, 0x3f86c8, 0x9fd8f0, 0xbfe6f2, 0x4a6fa8], CROWN = [0xff2bd6, 0x28e8ff, 0xffe600, 0x7dff4a];
  town.box(-238, -0.6, 0, 100, 1.2, 330, 0xd9cbb8);
  for (let i = 0; i < 34; i++) {
    const x = RR(-280, -196), z = RR(-150, 150), w = RR(9, 18), d = RR(9, 18), h = RR(22, 95) * (Math.abs(z) < 60 ? 1.25 : 0.85), col = GLASS[(R() * GLASS.length) | 0];
    town.box(x, h / 2, z, w, h, d, col);
    for (let y = 4; y < h - 2; y += 3.4) town.box(x, y, z, w + 0.12, 0.35, d + 0.12, 0xeef4f8);       // floor slabs
    if (R() < 0.5) town.box(x, h + 2, z, w * 0.6, 4, d * 0.6, col);                                     // setback top
    if (R() < 0.55) { const c = CROWN[(R() * CROWN.length) | 0], th = h + (R() < 0.5 ? 4 : 0.1); glow.box(x, th, z - d * 0.31, w * 0.62, 0.3, 0.2, c); glow.box(x, th, z + d * 0.31, w * 0.62, 0.3, 0.2, c); glow.box(x - w * 0.31, th, z, 0.2, 0.3, d * 0.62, c); glow.box(x + w * 0.31, th, z, 0.2, 0.3, d * 0.62, c); }
  }
  // ---- 跨海大桥 (causeway) from the west end of the north cross street out over the bay to downtown ----
  for (const bz of [-84, 84]) {
    const x0 = WX - 1, x1 = -196, L = x0 - x1;
    for (let k = 0; k < 16; k++) {
      const a = x0 - (k + 0.5) * L / 16, t = (k + 0.5) / 16, y = 0.3 + Math.sin(t * Math.PI) * 7;
      town.box(a, y, bz, L / 16 + 0.3, 0.6, 9, 0xcfc8bc); town.box(a, y + 0.75, bz - 4.3, L / 16 + 0.3, 0.9, 0.3, 0xf4f1ea); town.box(a, y + 0.75, bz + 4.3, L / 16 + 0.3, 0.9, 0.3, 0xf4f1ea);
      town.box(a, y + 0.32, bz, L / 16 + 0.3, 0.02, 0.3, 0xffd84a);
      if (k % 3 === 1) { town.cyl(a, (y - 1.2) / 2 - 0.6, bz, 0.9, y + 0.6, 0xbfb8ac); town.cyl(a, y + 3, bz - 4.3, 0.08, 4.4, 0x3a3a48); glow.box(a, y + 5.2, bz - 3.8, 0.5, 0.15, 0.9, k % 2 ? 0xff2bd6 : 0x28e8ff); }
    }
  }
  // ---- 游艇码头 (marina) on the north shore: wooden piers + moored yachts and speedboats ----
  const ZN = B.minZ - 12;
  for (let k = 0; k < 6; k++) {
    const px = -130 + k * 20;
    town.box(px, -0.35, ZN - 14, 2.2, 0.3, 26, 0x9a7a5a);
    for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) {
      if (R() < 0.2) continue;
      const bx = px + sd * 4.6, bz = ZN - 6 - j * 8, big = R() < 0.4, hl = big ? 7.5 : 5, hw = big ? 2.6 : 1.9;
      town.box(bx, -0.75, bz, hw, 1.0, hl, 0xffffff); town.box(bx, -0.3, bz - hl * 0.5, hw * 0.6, 0.6, 0.8, 0xffffff, 0);
      town.box(bx, -0.95, bz, hw + 0.05, 0.25, hl + 0.05, [0x1f5f9f, 0xff5fa0, 0x2bb3a8, 0x222222][(R() * 4) | 0]);
      town.box(bx, -0.05, bz + hl * 0.08, hw * 0.75, big ? 1.1 : 0.6, hl * 0.4, big ? 0xf4f4f4 : 0x2a3a4a);
      if (big) town.box(bx, 0.65, bz + hl * 0.12, hw * 0.55, 0.5, hl * 0.25, 0x3a5a7a);
    }
  }
  // ---- 远处邮轮 (a cruise liner anchored offshore, east) ----
  { const x = B.maxX + 120, z = -40;
    town.box(x, 1.5, z, 22, 6, 120, 0xfafafa); town.box(x, -0.2, z, 22.2, 2.4, 120.2, 0x1f3f7f);
    for (let k = 0; k < 4; k++) town.box(x, 6.5 + k * 2.6, z + 6, 19 - k * 1.5, 2.4, 86 - k * 10, 0xffffff);
    for (let k = 0; k < 4; k++) glow.box(x - 10.6 + k * 0.01, 7.6 + k * 2.6, z + 6, 0.1, 0.4, 84 - k * 10, k % 2 ? 0x28e8ff : 0xffe6a0);
    town.box(x, 19, z - 14, 5, 5, 9, 0xd8442e); town.box(x, 21.7, z - 14, 5.2, 0.5, 9.2, 0x111111);
    glow.box(x, 17.5, z + 40, 14, 0.3, 0.3, 0xff2bd6); }
  // ---- street furniture: zebra crossings + traffic lights at every junction, bus stops on 柯林斯大道 ----
  const RD = map.roads || [], V = RD.filter(r => r[3] - r[1] > r[2] - r[0]), Hh = RD.filter(r => r[2] - r[0] > r[3] - r[1]);
  for (const v of V) for (const hr of Hh) {
    const cx = (v[0] + v[2]) / 2, cz = (hr[1] + hr[3]) / 2;
    if (cx < hr[0] || cx > hr[2] || cz < v[1] || cz > v[3]) continue;
    for (const sz of [-1, 1]) for (let k = -3; k <= 3; k++) solid.box(cx + k * 1.05, 0.115, cz + sz * 5.6, 0.6, 0.02, 2.2, 0xf6f6f2);     // crossings across the vertical road
    for (const sx of [-1, 1]) for (let k = -3; k <= 3; k++) solid.box(cx + sx * 5.6, 0.115, cz + k * 1.05, 2.2, 0.02, 0.6, 0xf6f6f2);    // across the horizontal road
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const lx = cx + sx * 5.0, lz = cz + sz * 5.0;
      if (map.solids.some(b => lx > b.min.x - 0.3 && lx < b.max.x + 0.3 && lz > b.min.z - 0.3 && lz < b.max.z + 0.3 && b.max.y > 0.5)) continue;
      solid.cyl(lx, 2.6, lz, 0.09, 5.2, 0x2a2c34); solid.box(lx - sx * 1.6, 5.05, lz, 3.2, 0.12, 0.12, 0x2a2c34);
      solid.box(lx - sx * 3.0, 4.55, lz, 0.38, 1.0, 0.38, 0x1a1c22);
      glow.box(lx - sx * 3.0, 4.85, lz - sz * 0.2, 0.22, 0.22, 0.04, 0x3a0a0a); glow.box(lx - sx * 3.0, 4.55, lz - sz * 0.2, 0.22, 0.22, 0.04, 0x3a2a0a); glow.box(lx - sx * 3.0, 4.25, lz - sz * 0.2, 0.22, 0.22, 0.04, 0x3aff6a);
    }
  }
  for (const bz of [-40, 44]) for (const bx of [18.4]) {
    if (map.solids.some(b => bx - 2 < b.max.x && bx + 2 > b.min.x && bz - 1 < b.max.z && bz + 1 > b.min.z && b.max.y > 0.5)) continue;
    solid.box(bx - 0.6, 1.3, bz, 0.1, 2.6, 3.6, 0x9fd8f0); solid.box(bx, 2.65, bz, 1.6, 0.12, 3.8, 0xf4f1ea);
    solid.box(bx - 0.2, 0.5, bz, 0.5, 0.1, 3.0, 0x8a5a3a); glow.box(bx - 0.66, 1.9, bz + 1.4, 0.04, 0.8, 0.5, 0xffe600);
  }
  const townM = town.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  if (townM) { scene.add(townM); objs.push({ mesh: townM }); }
  const glowM = glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true })), solidM = solid.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const m of [glowM, solidM]) if (m) { scene.add(m); objs.push({ mesh: m }); }
  if (P.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: signAtlas(), side: THREE.DoubleSide })); scene.add(m); objs.push({ mesh: m });
  }
  return { objs, kiosks, extraShops, blades };
}

export function disposeFreeDeco(D, scene, map) {
  if (!D) return;
  for (const o of D.objs) {
    if (o.mesh) { scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.map?.dispose?.(); o.mesh.material.dispose(); }
    if (o.solid && map) { const i = map.solids.indexOf(o.solid); if (i >= 0) map.solids.splice(i, 1); }
  }
}
