// 港口岛 - large battle-royale map: a 280 x 280 m island with a container port, warehouses, a village,
// rock outcrops and woods, a pier with the cargo ship hull as backdrop. Same interface as buildMap().
import * as THREE from 'three';

const HALF = 140; // island half size (playable)
export const ISLAND = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function noise(g, w, h, a, n = 1200, rgb = '0,0,0') { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
// deterministic rng so every match on this map looks the same
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const rr = (a, b) => a + rand() * (b - a);

// merge many box/cyl geometries that share one material into one mesh (keeps draw calls low on phones)
class Batch {
  constructor(mat) { this.mat = mat; this.geos = []; }
  add(geo, x, y, z, ry = 0) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z); g.applyMatrix4(m); this.geos.push(g); }
  build(scene) {
    if (!this.geos.length) return;
    let n = 0; for (const g of this.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of this.geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere(); scene.add(new THREE.Mesh(geo, this.mat)); this.geos = [];
  }
}

export function buildIsland(scene, quality) {
  seed = 7;
  const solids = [], minimapRects = [];
  const T = {
    sand: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2dc9e'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.15, 1500); }, 60, 60),
    grass: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#74c94e'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.08, 900); noise(g, w, h, 0.18, 700, '200,240,120'); }, 50, 50),
    asphalt: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6c7080'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.2, 1800); g.fillStyle = 'rgba(230,200,60,.8)'; g.fillRect(0, 60, w, 5); }, 1, 1),
    cont: canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, h); } g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); noise(g, w, h, 0.15, 400); }),
    wall: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff1d8'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, y, w, 2); } noise(g, w, h, 0.12, 700); }, 2, 1),
    metal: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b9d4e6'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 12) { g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x, 0, 4, h); } noise(g, w, h, 0.1, 500); }, 3, 1),
    rock: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#a8a39a'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.35, 900); }),
    crate: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d99a4e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5b4224'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4); g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.stroke(); }),
  };
  const contColors = [0x3a86ff, 0xff4d6d, 0x2ec46b, 0xffbe0b, 0x9b5de5, 0x2ec4c4, 0xff8c42];
  const MAT = {
    wall: new THREE.MeshLambertMaterial({ map: T.wall }), roof: new THREE.MeshLambertMaterial({ color: 0xf0574a }), roof2: new THREE.MeshLambertMaterial({ color: 0x3f8fd6 }),
    metal: new THREE.MeshLambertMaterial({ map: T.metal }), rock: new THREE.MeshLambertMaterial({ map: T.rock, color: 0xb0aaa0 }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x9a6438 }), leaf: new THREE.MeshLambertMaterial({ color: 0x3fb54a }), leaf2: new THREE.MeshLambertMaterial({ color: 0x7fd34e }),
    crate: new THREE.MeshLambertMaterial({ map: T.crate }), concrete: new THREE.MeshLambertMaterial({ color: 0xd8d4c8 }), crane: new THREE.MeshLambertMaterial({ color: 0xffc23a }),
    hull: new THREE.MeshLambertMaterial({ color: 0x5a6fd6 }), wood: new THREE.MeshLambertMaterial({ color: 0xb07a48 }), fence: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };
  const contMats = contColors.map(c => new THREE.MeshLambertMaterial({ map: T.cont, color: c }));
  const batches = new Map(); const B = (mat) => { let b = batches.get(mat); if (!b) batches.set(mat, b = new Batch(mat)); return b; };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const solid = (x0, y0, z0, x1, y1, z1, mat, mm) => {
    solids.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
    if (mm) minimapRects.push({ x0, z0, x1, z1, c: mm });
    if (mat) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); B(mat).add(g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
  };
  const deco = (geo, mat, x, y, z, ry) => B(mat).add(geo, x, y, z, ry);
  const blocked = (x0, z0, x1, z1, pad = 0) => solids.some(b => x1 + pad > b.min.x && x0 - pad < b.max.x && z1 + pad > b.min.z && z0 - pad < b.max.z);

  // ---------- sea, sky, ground ----------
  scene.background = new THREE.Color(0x9cc6de);
  const seaGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: 0x29b6e0 })); sea.position.y = -1.2; scene.add(sea);
  const beach = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 24, 1.2, HALF * 2 + 24), new THREE.MeshLambertMaterial({ map: T.sand })); beach.position.y = -0.62; scene.add(beach);
  const grassG = new THREE.PlaneGeometry(HALF * 2 - 12, HALF * 2 - 12); grassG.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(grassG, new THREE.MeshLambertMaterial({ map: T.grass })); grass.position.y = 0.005; scene.add(grass);
  // edge: low sea wall keeps players on the island (bullets pass over)
  for (const s of [-1, 1]) { solid(-HALF - 12, 0, s * (HALF + 11) - 1, HALF + 12, 1.1, s * (HALF + 11) + 1, MAT.concrete); solid(s * (HALF + 11) - 1, 0, -HALF - 12, s * (HALF + 11) + 1, 1.1, HALF + 12, MAT.concrete); }
  // roads (decor, minimap)
  const road = (x0, z0, x1, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); const t = T.asphalt.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, (x1 - x0) / 8), Math.max(1, (z1 - z0) / 8)); if (z1 - z0 > x1 - x0) { t.rotation = Math.PI / 2; t.repeat.set(Math.max(1, (z1 - z0) / 8), Math.max(1, (x1 - x0) / 8)); } const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t })); m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); scene.add(m); minimapRects.push({ x0, z0, x1, z1, c: '#55585c' }); };
  road(-128, -4, 128, 4); road(-4, -128, 4, 128); road(30, -100, 36, -4); road(-100, 40, -4, 46);

  // ---------- port (south-east): container yard + cranes + pier ----------
  const containerStack = (x, z, rot, layers) => {
    const L = 6.1, W = 2.45, H = 2.6; const lx = rot ? W : L, lz = rot ? L : W;
    for (let k = 0; k < layers; k++) { const mat = contMats[(rand() * contMats.length) | 0]; solid(x - lx / 2, k * H, z - lz / 2, x + lx / 2, (k + 1) * H, z + lz / 2, mat, k === 0 ? '#8f7f66' : null); }
  };
  for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 7; gz++) {
    if (rand() < 0.22) continue;
    const x = 44 + gx * 12 + rr(-1, 1), z = 22 + gz * 9 + rr(-1, 1);
    containerStack(x, z, rand() < 0.2, 1 + ((rand() * 3) | 0));
    if (rand() < 0.5) containerStack(x, z + 3, false, 1);
  }
  // cranes
  for (const x of [56, 84, 112]) {
    for (const dz of [-4, 4]) solid(x - 0.7, 0, 100 + dz - 0.7, x + 0.7, 24, 100 + dz + 0.7, MAT.crane, '#b08a2a');
    deco(new THREE.BoxGeometry(1.6, 1.6, 40), MAT.crane, x, 24.8, 104);
  }
  // pier + docked ship hull (backdrop, solid)
  solid(40, 0, 118, 130, 0.01, 126, null, '#6b5a44');
  deco(new THREE.BoxGeometry(90, 0.4, 8), MAT.wood, 85, -0.15, 122);
  solid(40, -6, 128, 135, 4, 145, MAT.hull, '#3a2b2b');
  for (let i = 0; i < 6; i++) deco(new THREE.BoxGeometry(6, 2.6 * (1 + (i % 3)), 12), contMats[i % contMats.length], 50 + i * 14, 4 + 1.3 * (1 + (i % 3)), 136);
  // port warehouses (enterable: door gaps)
  const building = (cx, cz, w, d, h, opts = {}) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.4, door = opts.door || 2.6, mat = opts.mat || MAT.wall;
    const wallX = (z, gaps) => { let x = x0; for (const gc of gaps.sort((a, b) => a - b)) { if (gc - door / 2 > x) solid(x, 0, z - t / 2, gc - door / 2, h, z + t / 2, mat); x = gc + door / 2; solid(gc - door / 2, 2.6, z - t / 2, gc + door / 2, h, z + t / 2, mat); } if (x < x1) solid(x, 0, z - t / 2, x1, h, z + t / 2, mat); };
    const wallZ = (x, gaps) => { let z = z0; for (const gc of gaps.sort((a, b) => a - b)) { if (gc - door / 2 > z) solid(x - t / 2, 0, z, x + t / 2, h, gc - door / 2, mat); z = gc + door / 2; solid(x - t / 2, 2.6, gc - door / 2, x + t / 2, h, gc + door / 2, mat); } if (z < z1) solid(x - t / 2, 0, z, x + t / 2, h, z1, mat); };
    wallX(z0, opts.n || [cx]); wallX(z1, opts.s || [cx]); wallZ(x0, opts.w || []); wallZ(x1, opts.e || []);
    solid(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.4, z1 + 0.3, opts.roof || MAT.roof);
    minimapRects.push({ x0, z0, x1, z1, c: opts.mm || '#b9b0a2' });
    // a few crates inside for cover
    for (let i = 0; i < (opts.crates ?? 2); i++) { const px = rr(x0 + 2, x1 - 2), pz = rr(z0 + 2, z1 - 2); if (Math.abs(px - cx) < 2) continue; solid(px - 0.6, 0, pz - 0.6, px + 0.6, 1.2, pz + 0.6, MAT.crate); }
    G_DOORS.push(...(opts.n || [cx]).map(x => new THREE.Vector3(x, 0, z0)), ...(opts.s || [cx]).map(x => new THREE.Vector3(x, 0, z1)), ...(opts.w || []).map(z => new THREE.Vector3(x0, 0, z)), ...(opts.e || []).map(z => new THREE.Vector3(x1, 0, z)));
    G_ROOMS.push(new THREE.Vector3(cx, 0, cz));
  };
  const G_DOORS = [], G_ROOMS = [];
  building(60, -30, 30, 16, 7, { mat: MAT.metal, roof: MAT.roof2, n: [52, 68], s: [60], e: [-30], mm: '#8f979e', crates: 5, door: 3.2 });
  building(100, -30, 26, 16, 7, { mat: MAT.metal, roof: MAT.roof2, n: [100], s: [94, 106], w: [-30], mm: '#8f979e', crates: 5, door: 3.2 });
  building(80, -66, 34, 18, 8, { mat: MAT.metal, roof: MAT.roof2, n: [70, 90], s: [80], mm: '#8f979e', crates: 6, door: 3.2 });

  // ---------- village (north-west) ----------
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const cx = -110 + i * 22 + rr(-2, 2), cz = -100 + j * 22 + rr(-2, 2);
    building(cx, cz, rr(9, 12), rr(8, 10), 3.4, { s: [cx], n: rand() < 0.5 ? [cx] : [], crates: 1, roof: rand() < 0.5 ? MAT.roof : MAT.roof2 });
  }
  building(-60, 60, 28, 18, 6, { n: [-66, -54], s: [-60], w: [60], e: [60], crates: 4 });
  building(-100, 90, 12, 10, 3.4, { n: [-100], crates: 1 });
  building(-20, 100, 12, 10, 3.4, { w: [100], crates: 1 });
  // fences around the village
  for (let x = -122; x < -36; x += 4) if (rand() < 0.6) solid(x, 0, -122, x + 3.6, 1.1, -121.8, MAT.fence);

  // ---------- rocks & woods ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockAt = (x, z, s) => { if (blocked(x - s, z - s, x + s, z + s, 1)) return; solid(x - s * 0.8, 0, z - s * 0.8, x + s * 0.8, s * 1.3, z + s * 0.8, null, '#7d7a74'); const g = rockGeo.clone(); g.scale(s, s * 1.4, s); deco(g, MAT.rock, x, s * 0.5, z, rand() * 6); };
  for (let i = 0; i < 18; i++) { const cx = rr(-120, 120), cz = rr(-120, 120); if (Math.abs(cx) < 8 || Math.abs(cz) < 8) continue; for (let k = 0; k < 3; k++) rockAt(cx + rr(-5, 5), cz + rr(-5, 5), rr(1.2, 2.6)); }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6), leafGeo = new THREE.ConeGeometry(2.2, 5, 7), leafGeo2 = new THREE.IcosahedronGeometry(2.2, 0);
  const treeAt = (x, z) => { if (blocked(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1.5) || Math.abs(x) < 6 || Math.abs(z) < 6) return; solid(x - 0.35, 0, z - 0.35, x + 0.35, 6, z + 0.35, null); deco(trunkGeo, MAT.trunk, x, 1.5, z); if (rand() < 0.6) deco(leafGeo, MAT.leaf, x, 5.2, z); else deco(leafGeo2, MAT.leaf2, x, 4.4, z); minimapRects.push({ x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1, c: '#2f5a2c' }); };
  // woods: south-west and north strip; scattered elsewhere
  for (let i = 0; i < 110; i++) treeAt(rr(-130, -20), rr(20, 130));
  for (let i = 0; i < 40; i++) treeAt(rr(-30, 130), rr(-130, -100));
  for (let i = 0; i < 40; i++) treeAt(rr(-130, 130), rr(-130, 130));
  // hay bales / crates scattered for cover in open fields
  for (let i = 0; i < 40; i++) { const x = rr(-125, 125), z = rr(-125, 125); if (blocked(x - 1, z - 1, x + 1, z + 1, 2) || Math.abs(x) < 6 || Math.abs(z) < 6) continue; solid(x - 0.7, 0, z - 0.7, x + 0.7, 1.4, z + 0.7, MAT.crate, '#8a6a40'); }

  for (const b of batches.values()) b.build(scene);

  // ---------- nav graph: 4 m grid + door / room nodes ----------
  const free = (x, z, r = 0.6) => { for (const b of solids) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && b.min.y < 1.6 && b.max.y > 0.3) return false; return Math.abs(x) <= HALF + 8 && Math.abs(z) <= HALF + 8; };
  const nodes = [], grid = new Map(), S = 4;
  for (let x = -HALF + 2; x <= HALF - 2; x += S) for (let z = -HALF + 2; z <= HALF - 2; z += S) if (free(x, z)) { grid.set(x + ',' + z, nodes.length); nodes.push({ p: new THREE.Vector3(x, 0, z), n: [], deck: true }); }
  const segClear = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z), st = Math.ceil(d / 0.5); for (let i = 1; i < st; i++) { const t = i / st; if (!free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.42)) return false; } return true; };
  const link = (i, j) => { if (i !== j && !nodes[i].n.includes(j)) { nodes[i].n.push(j); nodes[j].n.push(i); } };
  for (let x = -HALF + 2; x <= HALF - 2; x += S) for (let z = -HALF + 2; z <= HALF - 2; z += S) {
    const i = grid.get(x + ',' + z); if (i == null) continue;
    for (const [dx, dz] of [[S, 0], [0, S], [S, S], [S, -S]]) { const j = grid.get((x + dx) + ',' + (z + dz)); if (j != null && segClear(nodes[i].p, nodes[j].p)) link(i, j); }
  }
  // doors: a node just inside and just outside each door, linked to nearby nodes with a clear line
  const extra = [];
  for (const d of G_DOORS) for (const off of [[0, 1.2], [0, -1.2], [1.2, 0], [-1.2, 0]]) { const x = d.x + off[0], z = d.z + off[1]; if (free(x, z, 0.45)) { extra.push(nodes.length); nodes.push({ p: new THREE.Vector3(x, 0, z), n: [], deck: true }); } }
  for (const r of G_ROOMS) for (const off of [[0, 0], [3, 2], [-3, -2], [3, -2], [-3, 2]]) { const x = r.x + off[0], z = r.z + off[1]; if (free(x, z, 0.5)) { extra.push(nodes.length); nodes.push({ p: new THREE.Vector3(x, 0, z), n: [], deck: true, inside: true }); } }
  for (const i of extra) for (let j = 0; j < nodes.length; j++) { if (i === j) continue; const a = nodes[i].p, b = nodes[j].p; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < 6.5 && segClear(a, b)) link(i, j); }
  // drop isolated nodes from use by keeping them (A* falls back) – mark cover nodes
  const covers = [];
  nodes.forEach((nd, i) => { if (nd.n.length && !free(nd.p.x, nd.p.z, 1.9)) covers.push(i); });

  // spatial buckets for nearestNode
  const BK = 16, buckets = new Map();
  nodes.forEach((nd, i) => { if (!nd.n.length) return; const k = Math.floor(nd.p.x / BK) + ',' + Math.floor(nd.p.z / BK); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i); });
  function nearestNode(p) {
    const bx = Math.floor(p.x / BK), bz = Math.floor(p.z / BK); let best = -1, bd = 1e9;
    for (let r = 0; r < 4 && best < 0; r++) for (let ix = bx - r; ix <= bx + r; ix++) for (let iz = bz - r; iz <= bz + r; iz++) { const a = buckets.get(ix + ',' + iz); if (a) for (const i of a) { const n = nodes[i].p, d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } } }
    if (best < 0) { for (let i = 0; i < nodes.length; i++) { if (!nodes[i].n.length) continue; const n = nodes[i].p, d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } } }
    return best;
  }
  function findPath(from, to) { // A* with binary heap
    const s = nearestNode(from), g = typeof to === 'number' ? to : nearestNode(to);
    const gS = new Float64Array(nodes.length).fill(1e9), came = new Int32Array(nodes.length).fill(-1), closed = new Uint8Array(nodes.length);
    const heap = []; const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top[1]; };
    const G = nodes[g].p; gS[s] = 0; push(s, nodes[s].p.distanceTo(G)); let it = 0;
    while (heap.length && it++ < 6000) {
      const c = pop(); if (closed[c]) continue; closed[c] = 1;
      if (c === g) { const path = []; let x = c; while (x !== -1) { path.unshift(nodes[x].p); x = came[x]; } return path; }
      for (const nb of nodes[c].n) { if (closed[nb]) continue; const t = gS[c] + nodes[c].p.distanceTo(nodes[nb].p); if (t < gS[nb]) { gS[nb] = t; came[nb] = c; push(nb, t + nodes[nb].p.distanceTo(G)); } }
    }
    return [G];
  }

  // ---------- ray tests (coarse grid over solids) ----------
  const CG = 12, cells = new Map();
  solids.forEach((b, i) => { for (let x = Math.floor(b.min.x / CG); x <= Math.floor(b.max.x / CG); x++) for (let z = Math.floor(b.min.z / CG); z <= Math.floor(b.max.z / CG); z++) { const k = x + ',' + z; let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); } });
  const _ray = new THREE.Ray(), _v = new THREE.Vector3(), stamp = new Uint32Array(solids.length); let st = 0;
  function rayWorld(origin, dir, maxD) {
    _ray.set(origin, dir); let best = maxD; st++;
    if (dir.y < 0 && origin.y > 0) { const d = -origin.y / dir.y; if (d < best) best = d; }
    // walk cells along the ray (2D DDA-ish sampling every half cell)
    const step = CG / 2, n = Math.ceil(best / step) + 1;
    for (let s = 0; s <= n; s++) {
      const t = Math.min(best, s * step); const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = cells.get((Math.floor(x / CG) + ox) + ',' + (Math.floor(z / CG) + oz)); if (!a) continue;
        for (const i of a) { if (stamp[i] === st) continue; stamp[i] = st; const hit = _ray.intersectBox(solids[i], _v); if (hit) { const d = hit.distanceTo(origin); if (d < best) best = d; } }
      }
      if (s * step > best) break;
    }
    return best;
  }
  function hasLOS(a, b) { const d = a.distanceTo(b); const dir = _v.clone().subVectors(b, a).normalize(); return rayWorld(a, dir, d) >= d - 0.05; }

  // collision subset around a position for moveEntity (3x3 cells, cached per cell)
  const nearCache = new Map();
  function near(p) { const cx = Math.floor(p.x / CG), cz = Math.floor(p.z / CG), k = cx + ',' + cz; let a = nearCache.get(k); if (a) return a; const set = new Set(); for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const i of cells.get((cx + ox) + ',' + (cz + oz)) || []) set.add(solids[i]); a = [...set]; nearCache.set(k, a); return a; }
  const spawns = { blue: [], red: [] };
  return { solids, nodes, covers, spawns, minimapRects, findPath, nearestNode, rayWorld, hasLOS, update() {}, walkY: 0, bounds: ISLAND, kind: 'island', near };
}
