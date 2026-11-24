// 迈阿密 (2026-11): a separate battle-royale map in an original Miami-beach style - ocean drive with pastel art-deco
// fronts and neon, a sand beach with palms / umbrellas / lifeguard towers, a pier, a residential grid with pools,
// a marina parking lot and convenience stores (抢劫 counters). Same interface as buildIsland() (kind 'island', so the
// plane drop / zone / airdrops / vehicles all work), variant 'miami'.
// Perf: everything visual is vertex-coloured geometry merged into a few chunk meshes (islanddeco Grid: 4x4 cells for
// big things drawn to the fog, 8x8 cells hidden beyond ~70 m for small things), all roads in ONE mesh, road paint in
// ONE mesh, neon in a few unlit chunk meshes, all signs in ONE textured mesh; collision boxes carry no geometry.
import * as THREE from 'three';
import { canvasTex, noise, navCore, lodUpdate } from './island.js';
import { Bucket, Grid, mat4, BOX, CYL8, ICO, PLANE, WEDGES, PETALS, UMB_COLS } from './islanddeco.js';
import { PropSet, propSize, hasProps } from './props.js';

export const MIAMI = { minX: -150, maxX: 150, minZ: -130, maxZ: 130 };
const MC = { x: 0, z: 0, w: 300, d: 260 };
let seed = 11; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const rr = (a, b) => a + rand() * (b - a);
const pick = (a) => a[(rand() * a.length) | 0];

const PASTEL = [0xffb3c7, 0x9fe3d6, 0xffe0a3, 0xc9b6ff, 0xa8d8ff, 0xffc9a8, 0xb9f0b0, 0xfff1f5];
const NEON = [0xff2bd6, 0x28e8ff, 0xff7a1a, 0x7dff4a, 0xffe600, 0xb04bff];
// roads [x0, z0, x1, z1] (8 m wide); 海滨大道 / 柯林斯大道 / 西街 + three cross streets
const ROADS = [
  [84, -126, 92, 126], [20, -126, 28, 126], [-76, -126, -68, 126],
  [-146, -88, 92, -80], [-146, -4, 100, 4], [-146, 80, 92, 88],
];
// vehicles parked at the kerbs: [type, x, z, yaw] (yaw 0 = facing -z)
const VSPOTS = [
  ['coupe', 94.4, -60, 0], ['muscle', 94.4, 40, Math.PI], ['convert', 81.6, -20, Math.PI], ['police', 81.6, 100, 0], ['pickup', 94.4, 110, 0],
  ['coupe', 29.8, 60, Math.PI], ['convert', 18.2, -100, 0], ['muscle', 18.2, 20, 0], ['moto', 29.6, -40, 0],
  ['pickup', -66.2, -60, Math.PI], ['coupe', -77.8, 40, 0], ['moto', -66.4, 110, Math.PI], ['bike', -77.6, -20, 0],
  ['convert', -110, -78.2, Math.PI / 2], ['muscle', -40, 5.8, -Math.PI / 2], ['moto', 60, -78.4, Math.PI / 2], ['bike', -20, 89.6, -Math.PI / 2],
  ['police', -130, 20, 0], ['heli', 124, -100, 0], ['jeep', -120, 60, 0], ['bus', 50, 89.9, -Math.PI / 2],
];

export function buildMiami(scene, quality) {
  seed = 11;
  const solids = [], minimapRects = [], G_DOORS = [], G_ROOMS = [], BLD = [], SHOPS = [];
  const q = quality === 'low' ? 0.45 : quality === 'mid' ? 0.7 : 1;
  const DD = { low: 55, mid: 70, high: 120 }[quality] || 70;
  const HALF = 175;
  const big = new Grid(HALF, 4, 10, 0), leaf = new Grid(HALF, 4, 10, 0), det = new Grid(HALF, 8, 10, 0, DD), neon = new Grid(HALF, 4, 10, 0), paint = new Bucket(), signQ = [];
  const IN = new PropSet(40, quality === 'high' ? 70 : 38, 'indoor'), PS = new PropSet(48, { low: 110, mid: 130, high: 220 }[quality] || 130, 'props', { low: 30, mid: 40, high: 70 }[quality] || 40);
  const B = (x, z) => big.at(x, z), D = (x, z) => det.at(x, z), N = (x, z) => neon.at(x, z);
  const solid = (x0, y0, z0, x1, y1, z1, col, mm, bucket) => {
    solids.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
    if (mm) minimapRects.push({ x0, z0, x1, z1, c: mm });
    if (col != null) (bucket || B((x0 + x1) / 2, (z0 + z1) / 2)).add(BOX, mat4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, x1 - x0, y1 - y0, z1 - z0), col);
  };
  const box = (bk, x, y, z, sx, sy, sz, col, ry = 0) => bk.add(BOX, mat4(x, y, z, 0, ry, 0, sx, sy, sz), col);
  const onRoad = (x, z, pad = 0) => ROADS.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  const blocked = (x0, z0, x1, z1, pad = 0) => solids.some(b => b.max.y > 0.05 && b.min.y < 2 && x1 + pad > b.min.x && x0 - pad < b.max.x && z1 + pad > b.min.z && z0 - pad < b.max.z);
  const props = hasProps();
  const put = (set, k, x, z, ry, s, solidH, tint = null, y = 0) => {
    if (!props) return false;
    const sz = propSize(k), w = sz.x * s, d = sz.z * s, c = Math.abs(Math.cos(ry)), si = Math.abs(Math.sin(ry)), hx = (c * w + si * d) / 2, hz = (si * w + c * d) / 2;
    if (solidH && blocked(x - hx, z - hz, x + hx, z + hz, 0.05)) return false;
    set.add(k, x, y, z, ry, s, tint);
    if (solidH) solid(x - hx * 0.92, 0, z - hz * 0.92, x + hx * 0.92, solidH, z + hz * 0.92, null);
    return true;
  };

  // ---------- sea, sand, city ground ----------
  scene.background = new THREE.Color(0x9cd6ee);
  const seaGeo = new THREE.PlaneGeometry(1400, 1400); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: 0x22c4e0 })); sea.position.y = -1.2; sea.renderOrder = 4; scene.add(sea);
  const T = {
    sand: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f6e2b0'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.12, 1400); }, 1, 1),
    pave: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9dfd2'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } noise(g, w, h, 0.08, 600); }, 1, 1),
    asphalt: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#5f6372'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.2, 1800); }, 1, 1),
  };
  T.sand.repeat.set((MC.w + 24) / 4.7, (MC.d + 24) / 4.7);
  const beach = new THREE.Mesh(new THREE.BoxGeometry(MC.w + 24, 1.2, MC.d + 24), new THREE.MeshLambertMaterial({ map: T.sand })); beach.position.set(MC.x, -0.62, MC.z); beach.renderOrder = 3; scene.add(beach);
  // city ground: pavement west of the beach (x < 96)
  const cx0 = MIAMI.minX + 6, cx1 = 96, cz0 = MIAMI.minZ + 6, cz1 = MIAMI.maxZ - 6;
  T.pave.repeat.set((cx1 - cx0) / 6, (cz1 - cz0) / 6);
  const cg = new THREE.PlaneGeometry(cx1 - cx0, cz1 - cz0); cg.rotateX(-Math.PI / 2); cg.translate((cx0 + cx1) / 2, 0.005, (cz0 + cz1) / 2);
  const city = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ map: T.pave })); city.renderOrder = 2; scene.add(city);
  minimapRects.push({ x0: cx0, z0: cz0, x1: cx1, z1: cz1, c: '#d9cbb8' }, { x0: cx1, z0: MIAMI.minZ, x1: MIAMI.maxX, z1: MIAMI.maxZ, c: '#efd99a' });
  // sea wall (low; bullets pass over) with a gap where the pier goes out
  { const x0 = MIAMI.minX - 12, x1 = MIAMI.maxX + 12, z0 = MIAMI.minZ - 12, z1 = MIAMI.maxZ + 12;
    solid(x0, 0, z0 - 1, x1, 1.1, z0 + 1, 0xd8d4c8); solid(x0, 0, z1 - 1, x1, 1.1, z1 + 1, 0xd8d4c8); solid(x0 - 1, 0, z0, x0 + 1, 1.1, z1, 0xd8d4c8);
    solid(x1 - 1, 0, z0, x1 + 1, 1.1, -3.2, 0xd8d4c8); solid(x1 - 1, 0, 3.2, x1 + 1, 1.1, z1, 0xd8d4c8); }

  // ---------- roads: one merged mesh, world-space UVs ----------
  { const P = [], U = [], Nn = [];
    ROADS.forEach(([x0, z0, x1, z1], i) => { const y = 0.07 + i * 0.004; P.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) { U.push(x / 8, z / 8); Nn.push(0, 1, 0); } minimapRects.push({ x0, z0, x1, z1, c: '#55585c' }); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: T.asphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); m.renderOrder = 1; scene.add(m);
    // paint: dashed yellow centre, white edges, skipping the junctions
    const Pt = (x, z, w, d, col) => paint.add(PLANE, mat4(x, 0.1, z, 0, 0, 0, w, 1, d), col);
    for (const [x0, z0, x1, z1] of ROADS) {
      const horiz = x1 - x0 > z1 - z0, c = horiz ? (z0 + z1) / 2 : (x0 + x1) / 2, a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1, half = horiz ? (z1 - z0) / 2 : (x1 - x0) / 2;
      const cross = (p) => ROADS.some(r => r !== undefined && (horiz ? (r[2] - r[0] < r[3] - r[1]) && p > r[0] - 1.5 && p < r[2] + 1.5 && c > r[1] - 4.5 && c < r[3] + 4.5 : (r[2] - r[0] > r[3] - r[1]) && p > r[1] - 1.5 && p < r[3] + 1.5 && c > r[0] - 4.5 && c < r[2] + 4.5));
      for (let p = a0 + 2; p < a1 - 3; p += 6) { if (cross(p) || cross(p + 3)) continue; horiz ? Pt(p + 1.5, c, 3, 0.28, 0xffd84a) : Pt(c, p + 1.5, 0.28, 3, 0xffd84a); }
      for (const s of [-1, 1]) for (let p = a0 + 0.5; p < a1 - 0.5; p += 4) { if (cross(p) || cross(p + 4)) continue; const o = c + s * (half - 0.4); horiz ? Pt(p + 2, o, 4.02, 0.3, 0xf4f4f0) : Pt(o, p + 2, 0.3, 4.02, 0xf4f4f0); }
    }
  }

  // ---------- buildings (enterable: door gaps; collision walls + vertex-coloured visuals) ----------
  // opts: { col, h, n/s/w/e: door centres, deco: 'deco' | 'house' | 'shop' | 'hut', neon, sign, mm }
  const building = (cx, cz, w, d, h, o = {}) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.4, door = o.door || 2.6, col = o.col ?? pick(PASTEL);
    const bk = B(cx, cz), dk = D(cx, cz);
    const wallX = (z, gaps) => { let x = x0; for (const gc of gaps.slice().sort((a, b) => a - b)) { if (gc - door / 2 > x) solid(x, 0, z - t / 2, gc - door / 2, h, z + t / 2, col, null, bk); x = gc + door / 2; solid(gc - door / 2, 2.6, z - t / 2, gc + door / 2, h, z + t / 2, col, null, bk); } if (x < x1) solid(x, 0, z - t / 2, x1, h, z + t / 2, col, null, bk); };
    const wallZ = (x, gaps) => { let z = z0; for (const gc of gaps.slice().sort((a, b) => a - b)) { if (gc - door / 2 > z) solid(x - t / 2, 0, z, x + t / 2, h, gc - door / 2, col, null, bk); z = gc + door / 2; solid(x - t / 2, 2.6, gc - door / 2, x + t / 2, h, gc + door / 2, col, null, bk); } if (z < z1) solid(x - t / 2, 0, z, x + t / 2, h, z1, col, null, bk); };
    const n = o.n || [], s = o.s || [], we = o.w || [], e = o.e || [];
    wallX(z0, n); wallX(z1, s); wallZ(x0, we); wallZ(x1, e);
    solid(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.35, z1 + 0.3, 0xfaf6ee, null, bk);                     // flat roof slab
    box(bk, cx, h + 0.55, z0 - 0.15, w + 0.6, 0.4, 0.3, 0xffffff); box(bk, cx, h + 0.55, z1 + 0.15, w + 0.6, 0.4, 0.3, 0xffffff);   // parapet
    box(bk, x0 - 0.15, h + 0.55, cz, 0.3, 0.4, d + 0.6, 0xffffff); box(bk, x1 + 0.15, h + 0.55, cz, 0.3, 0.4, d + 0.6, 0xffffff);
    minimapRects.push({ x0, z0, x1, z1, c: '#' + new THREE.Color(col).multiplyScalar(0.8).getHexString() });
    BLD.push({ x0, x1, z0, z1, t, door, n, s, w: we, e, kind: o.deco });
    // windows (blue glass through the wall, white frames) + door frames, per wall
    const walls = [['x', z0, x0, x1, n, -1], ['x', z1, x0, x1, s, 1], ['z', x0, z0, z1, we, -1], ['z', x1, z0, z1, e, 1]];
    const wp = (ax, fixed, along, y, sx, sy, dep, off, c, bucket = dk) => ax === 'x' ? box(bucket, along, y, fixed + off, sx, sy, dep, c) : box(bucket, fixed + off, y, along, dep, sy, sx, c);
    for (const [ax, fixed, a0, a1, gaps, sg] of walls) {
      const near = (p, r) => gaps.some(g => Math.abs(p - g) < door / 2 + r);
      for (let p = a0 + 2; p <= a1 - 2; p += 3.6) {
        if (near(p, 1.2)) continue;
        for (const wy of h > 6 ? [1.7, 4.6] : [1.7]) { wp(ax, fixed, p, wy, 1.2, 1.1, t + 0.08, 0, 0x5fb4e8); wp(ax, fixed, p, wy + 0.68, 1.5, 0.12, 0.3, sg * 0.3, 0xffffff); }   // pane + eyebrow ledge
      }
      for (const g of gaps) { for (const sd of [-1, 1]) wp(ax, fixed, g + sd * (door / 2 + 0.08), 1.33, 0.18, 2.66, t + 0.12, 0, 0xffffff); wp(ax, fixed, g, 2.75, door + 0.4, 0.3, t + 0.16, 0, 0xffffff);
        if (o.deco === 'deco' || o.deco === 'shop') wp(ax, fixed, g, 3.1, door + 2.2, 0.12, 1.4, sg * 0.75, NEON[(rand() * NEON.length) | 0]);   // awning
      }
      // art-deco: horizontal racing stripes + neon tube along the roofline on the street side
      if (o.deco === 'deco') { wp(ax, fixed, (a0 + a1) / 2, h - 0.9, a1 - a0, 0.22, 0.08, sg * (t / 2 + 0.05), 0xffffff); wp(ax, fixed, (a0 + a1) / 2, h - 1.3, a1 - a0, 0.12, 0.08, sg * (t / 2 + 0.05), col === 0xfff1f5 ? 0x9fe3d6 : 0xffffff); }
      if (o.neon && gaps.length) { const nc = o.neon; wp(ax, fixed, (a0 + a1) / 2, h + 0.2, a1 - a0 + 0.4, 0.12, 0.12, sg * 0.42, nc, N(cx, cz)); for (const pp of [a0 + 0.2, a1 - 0.2]) wp(ax, fixed, pp, h / 2, 0.12, h, 0.12, sg * 0.42, nc, N(cx, cz)); }
    }
    // art-deco centre fin on the street front with a neon edge
    if (o.fin) { const [ax, fixed, a0, a1, , sg] = walls.find(w => w[4].length) || walls[0]; const mid = (a0 + a1) / 2;
      wp(ax, fixed, mid, h + 1.6, 1.4, 3.2, 0.6, sg * 0.5, 0xffffff, bk); wp(ax, fixed, mid, h + 1.6, 1.6, 3.4, 0.12, sg * 0.85, o.neon || 0xff2bd6, N(cx, cz)); }
    if (o.sign != null) { const [ax, fixed, a0, a1, gaps, sg] = walls.find(w => w[4].length) || walls[0]; signQ.push({ ax, fixed: fixed + sg * (t / 2 + 0.12), along: gaps[0] ?? (a0 + a1) / 2, y: Math.min(h - 0.6, 4.2), sg, i: o.sign }); }
    for (const g of n) G_DOORS.push(new THREE.Vector3(g, 0, z0)); for (const g of s) G_DOORS.push(new THREE.Vector3(g, 0, z1));
    for (const g of we) G_DOORS.push(new THREE.Vector3(x0, 0, g)); for (const g of e) G_DOORS.push(new THREE.Vector3(x1, 0, g));
    G_ROOMS.push(new THREE.Vector3(cx, 0, cz));
    return { x0, x1, z0, z1, cx, cz };
  };

  // ---------- 海滨大道 strip (x 32..80): art-deco hotels / cafés / bars facing the beach, neon at the roofline ----------
  const SIGNS = ['OCEAN CAFE', 'SUNSET HOTEL', 'PALM MOTEL', 'NEON BAR', 'BEACH CLUB', '24/7 便利店', 'TACO SHACK', 'SURF SHOP', 'PINK FLAMINGO', 'ICE CREAM'];
  const blocksZ = [[-126, -88], [-80, -4], [4, 80], [88, 126]];
  let si = 0;
  for (const [za, zb] of blocksZ) {
    for (let z = za + 3; z < zb - 10; ) {
      const d = Math.min(zb - 3 - z, rr(14, 20)); if (d < 10) break;
      const w = rr(16, 24), x1 = 80, cx = x1 - w / 2, cz = z + d / 2, h = rand() < 0.5 ? 8 : 5.2;
      const shop = SIGNS[si % SIGNS.length] === '24/7 便利店';
      const b = building(cx, cz, w, d - 1, h, { e: [cz], w: rand() < 0.5 ? [cz] : [], deco: shop ? 'shop' : 'deco', neon: pick(NEON), fin: !shop && h > 6 && rand() < 0.7, sign: si % SIGNS.length });
      if (shop) SHOPS.push({ x: b.x1 - 4, z: cz, b });
      si++; z += d;
    }
  }
  // ---------- 柯林斯 / west: pastel houses with pools and palms; a second shop per side ----------
  const houseRows = [[-64, 16], [-142, -80]];
  for (const [xa, xb] of houseRows) for (const [za, zb] of blocksZ) {
    for (let x = xa + 3; x < xb - 9; x += rr(17, 22)) for (let z = za + 3; z < zb - 9; z += rr(18, 24)) {
      if (rand() < 0.18) continue;
      const w = rr(9, 12), d = rr(8, 10), cx = x + w / 2 + 1, cz = z + d / 2 + 1; if (cx + w / 2 > xb - 2 || cz + d / 2 > zb - 2) continue;
      if (rand() < 0.08 && SHOPS.length < 4) { const b = building(cx, cz, w + 3, d, 4.2, { s: [cx], n: [cx], deco: 'shop', neon: 0x28e8ff, sign: 5 }); SHOPS.push({ x: cx, z: cz - 1.5, b }); continue; }
      building(cx, cz, w, d, 3.6, { s: [cx], e: rand() < 0.5 ? [cz] : [], deco: 'house', sign: null });
      // pool behind the house (no collision: you can walk across), white rim
      const px = cx, pz = cz - d / 2 - 3.6; if (pz - 2 > za && !blocked(px - 3, pz - 2, px + 3, pz + 2)) { D(px, pz).add(PLANE, mat4(px, 0.03, pz, 0, 0, 0, 5, 1, 3), 0x3fd0f0); box(D(px, pz), px, 0.05, pz, 5.6, 0.08, 3.6, 0xffffff); minimapRects.push({ x0: px - 2.5, z0: pz - 1.5, x1: px + 2.5, z1: pz + 1.5, c: '#4fc8ee' }); }
    }
  }
  // ---------- beach: bars, lifeguard towers, umbrellas, loungers ----------
  for (const [z, si2] of [[-50, 7], [50, 0]]) building(110, z, 12, 8, 3.4, { w: [z], deco: 'shop', neon: 0x7dff4a, sign: si2 });
  for (const z of [-100, -20, 30, 100]) {   // lifeguard towers: stilts (solid), cabin, ramp
    const x = 132, bk = B(x, z);
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) solid(x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, 2.6, z + dz + 0.12, 0xffffff, null, bk);
    box(bk, x, 2.75, z, 3, 0.3, 3, 0xffffff); box(bk, x, 3.9, z, 2.6, 2.0, 2.6, pick([0xff7a9c, 0x5fd3c8, 0xffd35a])); box(bk, x, 5.05, z, 3.2, 0.3, 3.2, 0xffffff);
    box(bk, x - 1.31, 4.1, z, 0.05, 0.9, 2.0, 0x5fb4e8); minimapRects.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, c: '#f2f2f2' });
  }
  for (let i = 0; i < Math.round(26 * (0.6 + 0.4 * q)); i++) {
    const x = rr(104, 146), z = rr(-122, 122); if (blocked(x - 1.5, z - 1.5, x + 1.5, z + 1.5) || Math.abs(z) < 5) continue;
    const [c1, c2] = pick(UMB_COLS), bk = D(x, z);
    bk.add(CYL8, mat4(x, 1.15, z, 0, 0, 0, 0.04, 2.3, 0.04), 0xf4efe6);
    for (let k = 0; k < 8; k++) bk.add(WEDGES[k], mat4(x, 2.35, z, 0, 0, 0, 1.4, 0.5, 1.4), k % 2 ? c1 : c2);
    const ry = rand() * 3; box(bk, x + Math.cos(ry) * 1.3, 0.2, z + Math.sin(ry) * 1.3, 1.9, 0.12, 0.7, c1, -ry); box(bk, x - Math.cos(ry) * 1.3, 0.015, z - Math.sin(ry) * 1.3, 1.8, 0.02, 0.8, c2, -ry);
  }
  // beach volleyball net
  { const bk = D(118, 70); for (const z of [64, 76]) solid(117.9, 0, z - 0.1, 118.1, 2.4, z + 0.1, 0xffffff, null, bk); box(bk, 118, 2.2, 70, 0.05, 0.6, 12, 0xf4f4f4); }
  // ---------- pier (x 120 -> 196 at z 0): deck, posts, rails (rails are solid), a hut at the end ----------
  { const z0 = -3, z1 = 3, xa = 120, xb = 196, bk = B(158, 0);
    box(bk, (xa + xb) / 2, -0.1, 0, xb - xa, 0.3, z1 - z0, 0xb07a48);
    for (let x = xa; x <= xb; x += 6) for (const z of [z0 + 0.2, z1 - 0.2]) box(bk, x, -0.9, z, 0.3, 1.8, 0.3, 0x7a5232);
    solid(150, 0, z0 - 0.1, xb, 1.0, z0 + 0.05, 0xffffff, null, bk); solid(150, 0, z1 - 0.05, xb, 1.0, z1 + 0.1, 0xffffff, null, bk); solid(xb - 0.1, 0, z0, xb + 0.1, 1.0, z1, 0xffffff, null, bk);
    for (let x = 150; x < xb; x += 8) { D(x, 0).add(CYL8, mat4(x, 1.8, z0 + 0.1, 0, 0, 0, 0.06, 3.6, 0.06), 0x3a3a48); box(N(x, 0), x, 3.6, z0 + 0.1, 0.4, 0.25, 0.4, pick(NEON)); }
    minimapRects.push({ x0: xa, z0, x1: xb, z1, c: '#a8784a' });
  }
  // ---------- palms: along the beach, the drives, the houses ----------
  const palm = (x, z) => {
    if (blocked(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.8) || onRoad(x, z, 1.5) || BLD.some(b => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2)) return;
    solid(x - 0.3, 0, z - 0.3, x + 0.3, 6, z + 0.3, null);
    const bk = B(x, z), h = rr(6.5, 9), lean = rr(-0.25, 0.25), la = rand() * 6.28; let px = x, pz = z, py = 0;
    for (let i = 0; i < 4; i++) { const seg = h / 4, k = (i + 1) / 4, tx = x + Math.cos(la) * lean * h * k * k, tz = z + Math.sin(la) * lean * h * k * k;
      const mx = (px + tx) / 2, mz = (pz + tz) / 2, r = 0.26 - i * 0.03;
      bk.add(TRUNK, mat4(mx, py + seg / 2, mz, 0, 0, 0, r, seg * 1.02, r), i % 2 ? 0x9a7a52 : 0x86683f); px = tx; pz = tz; py += seg; }
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + rand() * 0.3; leaf.at(x, z).add(FROND, mat4(px + Math.cos(a) * 1.4, py - 0.35, pz + Math.sin(a) * 1.4, 0, -a, -0.45, 3.0, 1, 1), k % 2 ? 0x3fb24a : 0x52c856); }
    minimapRects.push({ x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1, c: '#3e8f3a' });
  };
  for (let z = -124; z <= 124; z += 11) { palm(98.5, z); palm(80.5 + 1.2, z + 5); }
  for (let z = -124; z <= 124; z += 14) { palm(31, z); palm(17, z + 7); }
  for (let i = 0; i < Math.round(45 * (0.6 + 0.4 * q)); i++) palm(rr(-145, 145), rr(-125, 125));
  // ---------- neon street lamps along 海滨大道 (pink / cyan heads), plain lamps elsewhere ----------
  for (let z = -120; z <= 120; z += 16) for (const x of [83.2, 92.8]) {
    if (blocked(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) continue; const dk = D(x, z), s = x < 88 ? 1 : -1;
    dk.add(CYL8, mat4(x, 2.4, z, 0, 0, 0, 0.08, 4.8, 0.08), 0x3a3a48); box(dk, x + s * 0.5, 4.75, z, 1.0, 0.08, 0.08, 0x3a3a48); box(N(x, z), x + s * 1.0, 4.62, z, 0.5, 0.12, 0.3, z % 32 ? 0xff2bd6 : 0x28e8ff);
  }
  // ---------- marina parking lot (west): Kenney cars parked in rows + a shop ----------
  for (let i = 0; i < 6; i++) for (const z of [-110, -100]) { const x = -140 + i * 7; if (rand() < 0.35) continue; put(PS, pick(['car_sedan', 'car_hatch', 'car_van', 'car_sedan']), x, z, z < -105 ? 0 : Math.PI, 1.45, 1.7, pick([0xffb3c7, 0x9fe3d6, 0xffe0a3, 0xffffff, 0xa8d8ff])); }
  for (let x = -142; x < -96; x += 7) paint.add(PLANE, mat4(x + 3.5, 0.03, -105, 0, 0, 0, 0.18, 1, 14), 0xffffff);
  // ---------- furniture inside (Kenney Furniture Kit): houses get beds / sofas / kitchens, shops get shelves + a counter ----------
  const FS = 1.9;
  for (const b of BLD) {
    if (!props) break;
    const inner = { x0: b.x0 + b.t + 0.2, x1: b.x1 - b.t - 0.2, z0: b.z0 + b.t + 0.2, z1: b.z1 - b.t - 0.2 };
    const doors = [...b.n.map(x => [x, b.z0]), ...b.s.map(x => [x, b.z1]), ...b.w.map(z => [b.x0, z]), ...b.e.map(z => [b.x1, z])];
    const nearDoor = (x, z) => doors.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < b.door / 2 + 1.8);
    const keys = b.kind === 'shop' ? ['f_books', 'f_kcab', 'f_fridge', 'f_books'] : b.kind === 'house' ? ['f_bed', 'f_sofa', 'f_kcab', 'f_fridge', 'f_plant', 'f_stove', 'f_side'] : ['f_sofa', 'f_tround', 'f_plant', 'f_books', 'f_side'];
    for (const [z, ry] of [[inner.z0, 0], [inner.z1, Math.PI]]) for (let x = inner.x0 + 0.9; x < inner.x1 - 0.9; x += 1.4) {
      if (rand() < (quality === 'high' ? 0.4 : 0.6)) continue; const k = pick(keys), sz = propSize(k), dd = sz.z * FS, ww = sz.x * FS, zz = ry ? z - dd / 2 : z + dd / 2, xx = x + ww / 2;
      if (xx + ww / 2 > inner.x1 || nearDoor(xx, zz)) continue; if (put(IN, k, xx, zz, ry, FS, 1.0)) x += ww;
    }
  }
  // shop counters: a solid counter (the 抢劫 spot is in front of it)
  for (const s of SHOPS) { const b = s.b, x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2; const bk = D(x, z);
    const cz = z - 1.2; solid(x - 1.6, 0, cz - 0.4, x + 1.6, 1.05, cz + 0.4, 0xfafafa, null, bk); box(bk, x, 1.1, cz, 3.4, 0.1, 0.9, 0xff2bd6); box(bk, x + 1.0, 1.35, cz, 0.5, 0.4, 0.4, 0x333344);
    s.x = x; s.z = cz + 1.2; }
  // ---------- signs: one canvas atlas, one mesh ----------
  { const cw = 512, rows = SIGNS.length, rh = 48, cv = document.createElement('canvas'); cv.width = cw; cv.height = rows * rh; const g = cv.getContext('2d');
    SIGNS.forEach((t, i) => { const y = i * rh; g.fillStyle = '#1a1030'; g.fillRect(0, y, cw, rh); const c = ['#ff2bd6', '#28e8ff', '#ffe600', '#7dff4a', '#ff7a1a'][i % 5]; g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(3, y + 3, cw - 6, rh - 6);
      g.font = '900 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = c; g.shadowBlur = 10; g.fillStyle = '#ffffff'; g.fillText(t, cw / 2, y + rh / 2 + 1); g.shadowBlur = 0; });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const P = [], U = [];
    for (const s of signQ) { const w = 5.2, hh = 0.55, v0 = 1 - (s.i + 1) / rows, v1 = 1 - s.i / rows, a0 = s.along - w / 2, a1 = s.along + w / 2, f = s.fixed, y0 = s.y - hh, y1 = s.y + hh;
      const pts = s.ax === 'x' ? [[a0, y0, f], [a1, y0, f], [a1, y1, f], [a0, y1, f]] : [[f, y0, a0], [f, y0, a1], [f, y1, a1], [f, y1, a0]];
      const flip = (s.ax === 'x' ? s.sg > 0 : s.sg < 0);
      const uv = flip ? [[0, v0], [1, v0], [1, v1], [0, v1]] : [[1, v0], [0, v0], [0, v1], [1, v1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...pts[k]); U.push(...uv[k]); } }
    if (P.length) { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g2.computeBoundingSphere();
      const m = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); m.name = 'signs'; scene.add(m); }
  }
  // ---------- foam line where the beach meets the water ----------
  const foam = new Bucket(); foam.add(PLANE, mat4(MIAMI.maxX + 14.2, -1.14, 0, 0, 0, 0, 4.4, 1, MC.d + 24), 0xffffff);
  foam.add(PLANE, mat4(0, -1.14, MIAMI.maxZ + 14.2, 0, 0, 0, MC.w + 33, 1, 4.4), 0xffffff); foam.add(PLANE, mat4(0, -1.14, MIAMI.minZ - 14.2, 0, 0, 0, MC.w + 33, 1, 4.4), 0xffffff); foam.add(PLANE, mat4(MIAMI.minX - 14.2, -1.14, 0, 0, 0, 0, 4.4, 1, MC.d + 24), 0xffffff);

  // ---------- meshes ----------
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true }), neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const paintMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const LODS = [];
  const lf = leaf.build(scene, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'mia-leaf'), a = big.build(scene, solidMat, 'mia-big'), b = det.build(scene, solidMat, 'mia-det', LODS), c = neon.build(scene, neonMat, 'mia-neon');
  const pm = paint.mesh(paintMat); if (pm) { pm.renderOrder = 1; scene.add(pm); }
  const fm = foam.mesh(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); if (fm) scene.add(fm);
  const ps = PS.build(scene), ins = IN.build(scene);
  const decoStats = { bigTris: a.tris, detTris: b.tris, neonTris: c.tris, calls: lf.calls + a.calls + b.calls + c.calls + ps.calls + ins.calls + 4, propTris: ps.tris, indoorTris: ins.tris, shops: SHOPS.length, buildings: BLD.length };

  const nav = navCore(solids, G_DOORS, G_ROOMS, MIAMI);
  return { solids, ...nav, spawns: { blue: [], red: [] }, minimapRects, update() {}, walkY: 0, bounds: MIAMI, center: new THREE.Vector2(MC.x, MC.z), kind: 'island', variant: 'miami', mmBase: 'rgba(220,205,180,.9)',
    decoStats, roads: ROADS, vehicleSpots: VSPOTS, shops: SHOPS, lod: (cam) => { PS.lod(cam); IN.lod(cam); lodUpdate(LODS, cam); } };
}
const TRUNK = new THREE.CylinderGeometry(1, 1.12, 1, 6, 1, true);
// a palm frond: a long flat leaf drooping outward from its base (local +x = outward), 1 unit long
const FROND = (() => { const p = [], n = 3; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, w = (t) => 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)), y = (t) => -0.9 * t * t;
  const a = [t0 - 0.5, y(t0), -w(t0)], b = [t1 - 0.5, y(t1), -w(t1)], c = [t1 - 0.5, y(t1), w(t1)], d = [t0 - 0.5, y(t0), w(t0)], mid0 = [t0 - 0.5, y(t0) + 0.06, 0], mid1 = [t1 - 0.5, y(t1) + 0.06, 0];
  p.push(...a, ...mid0, ...mid1, ...a, ...mid1, ...b, ...mid0, ...d, ...c, ...mid0, ...c, ...mid1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); const Nn = g.attributes.normal; for (let i = 0; i < Nn.count; i++) Nn.setXYZ(i, 0, 1, 0); return g; })();
