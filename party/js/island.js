// 港口岛 - large battle-royale map: a 280 x 280 m island with a container port, warehouses, a village,
// rock outcrops and woods, a pier with the cargo ship hull as backdrop. Same interface as buildMap().
import * as THREE from 'three';
import { decorateIsland } from './islanddeco.js';
import { PropSet, propSize, hasProps } from './props.js';

const HALF = 140; // the original 280 x 280 m core (port, village, woods keep their coordinates)
// 2026-11 扩图: ~2x the area (392 x 392 m) - the core plus a north strip (农场 / 灯塔) and west / east strips (渔村 / 哨站);
// the south edge stays where it was (port + docked ship).
export const ISLAND = { minX: -196, maxX: 196, minZ: -252, maxZ: 140 };
const IC = { x: (ISLAND.minX + ISLAND.maxX) / 2, z: (ISLAND.minZ + ISLAND.maxZ) / 2, w: ISLAND.maxX - ISLAND.minX, d: ISLAND.maxZ - ISLAND.minZ };

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
    asphalt: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6c7080'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.2, 1800); }, 1, 1),   // lane paint is geometry now (islanddeco.js)
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
  const onRoad = (x, z, pad = 0) => ROADS.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  const inIsle = (x, z, m = 0) => x > ISLAND.minX + m && x < ISLAND.maxX - m && z > ISLAND.minZ + m && z < ISLAND.maxZ - m;
  const blocked = (x0, z0, x1, z1, pad = 0) => solids.some(b => x1 + pad > b.min.x && x0 - pad < b.max.x && z1 + pad > b.min.z && z0 - pad < b.max.z);

  // ---------- sea, sky, ground ----------
  scene.background = new THREE.Color(0x9cc6de);
  const seaGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: 0x29b6e0 })); sea.position.y = -1.2; scene.add(sea);
  T.sand.repeat.set(IC.w / 4.7, IC.d / 4.7); T.grass.repeat.set(IC.w / 5.6, IC.d / 5.6);
  const beach = new THREE.Mesh(new THREE.BoxGeometry(IC.w + 24, 1.2, IC.d + 24), new THREE.MeshLambertMaterial({ map: T.sand })); beach.position.set(IC.x, -0.62, IC.z); scene.add(beach);
  const grassG = new THREE.PlaneGeometry(IC.w - 12, IC.d - 12); grassG.rotateX(-Math.PI / 2); grassG.translate(IC.x, 0, IC.z);
  const grass = new THREE.Mesh(grassG, new THREE.MeshLambertMaterial({ map: T.grass })); grass.position.y = 0.005; scene.add(grass);
  // edge: low sea wall keeps players on the island (bullets pass over)
  { const B = ISLAND, x0 = B.minX - 12, x1 = B.maxX + 12, z0 = B.minZ - 12, z1 = B.maxZ + 12;
    solid(x0, 0, z0 + 1 - 2, x1, 1.1, z0 + 1, MAT.concrete); solid(x0, 0, z1 - 1, x1, 1.1, z1 - 1 + 2, MAT.concrete);
    solid(x0 + 1 - 2, 0, z0, x0 + 1, 1.1, z1, MAT.concrete); solid(x1 - 1, 0, z0, x1 - 1 + 2, 1.1, z1, MAT.concrete); }
  // roads (decor, minimap)
  const ROADS = [], BLD = [], TREES = [], FENCES = [];   // recorded for the decorative pass (islanddeco.js)
  const road = (x0, z0, x1, z1) => { ROADS.push([x0, z0, x1, z1]); const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); const t = T.asphalt.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, (x1 - x0) / 8), Math.max(1, (z1 - z0) / 8)); if (z1 - z0 > x1 - x0) { t.rotation = Math.PI / 2; t.repeat.set(Math.max(1, (z1 - z0) / 8), Math.max(1, (x1 - x0) / 8)); } const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t })); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -4; m.position.set((x0 + x1) / 2, 0.07 + ROADS.length * 0.006, (z0 + z1) / 2); scene.add(m); minimapRects.push({ x0, z0, x1, z1, c: '#55585c' }); };
  road(-188, -4, 188, 4); road(-4, -244, 4, 128); road(30, -100, 36, -4); road(-100, 40, -4, 46);

  // ---------- port (south-east): container yard + cranes + pier ----------
  const containerStack = (x, z, rot, layers) => {
    const L = 6.1, W = 2.45, H = 2.6; const lx = rot ? W : L, lz = rot ? L : W;
    for (let k = 0; k < layers; k++) { const mat = contMats[(rand() * contMats.length) | 0]; solid(x - lx / 2, k * H, z - lz / 2, x + lx / 2, (k + 1) * H, z + lz / 2, mat, k === 0 ? '#8f7f66' : null); }
  };
  for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 7; gz++) {
    if (rand() < 0.22) continue;
    const x = 44 + gx * 12 + rr(-1, 1), z = 22 + gz * 9 + rr(-1, 1);
    const rot = rand() < 0.2;
    containerStack(x, z, rot, 1 + ((rand() * 3) | 0));
    if (rand() < 0.5 && !rot) containerStack(x, z + 3, false, 1);   // no second stack next to a rotated one (they overlapped)
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
    BLD.push({ x0, x1, z0, z1, h, t, door, metal: mat === MAT.metal, n: opts.n || [cx], s: opts.s || [cx], w: opts.w || [], e: opts.e || [] });
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
  for (let x = -122; x < -36; x += 4) if (rand() < 0.6) { solid(x, 0, -122, x + 3.6, 1.1, -121.8, null); FENCES.push([x, -122, x + 3.6, -121.8]); }   // drawn as pickets

  // ---------- rocks & woods ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockAt = (x, z, s) => { if (blocked(x - s, z - s, x + s, z + s, 1)) return; solid(x - s * 0.8, 0, z - s * 0.8, x + s * 0.8, s * 1.3, z + s * 0.8, null, '#7d7a74'); const g = rockGeo.clone(); g.scale(s, s * 1.4, s); deco(g, MAT.rock, x, s * 0.5, z, rand() * 6); };
  for (let i = 0; i < 18; i++) { const cx = rr(-120, 120), cz = rr(-120, 120); if (Math.abs(cx) < 8 || Math.abs(cz) < 8) continue; for (let k = 0; k < 3; k++) rockAt(cx + rr(-5, 5), cz + rr(-5, 5), rr(1.2, 2.6)); }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
  const treeAt = (x, z) => { if (blocked(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1.5) || Math.abs(x) < 6 || Math.abs(z) < 6 || onRoad(x, z, 2.5) || !inIsle(x, z, 6)) return; solid(x - 0.35, 0, z - 0.35, x + 0.35, 6, z + 0.35, null); deco(trunkGeo, MAT.trunk, x, 1.5, z); TREES.push({ x, z, cone: rand() < 0.6 }); /* crowns drawn by islanddeco.js */ minimapRects.push({ x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1, c: '#2f5a2c' }); };
  // woods: south-west and north strip; scattered elsewhere
  for (let i = 0; i < 110; i++) treeAt(rr(-130, -20), rr(20, 130));
  for (let i = 0; i < 40; i++) treeAt(rr(-30, 130), rr(-130, -100));
  for (let i = 0; i < 40; i++) treeAt(rr(-130, 130), rr(-130, 130));
  // hay bales / crates scattered for cover in open fields
  for (let i = 0; i < 40; i++) { const x = rr(-125, 125), z = rr(-125, 125); if (blocked(x - 1, z - 1, x + 1, z + 1, 2) || Math.abs(x) < 6 || Math.abs(z) < 6) continue; solid(x - 0.7, 0, z - 0.7, x + 0.7, 1.4, z + 0.7, MAT.crate, '#8a6a40'); }

  const OUT = outerRegions({ scene, solid, deco, building, road, treeAt, rockAt, containerStack, blocked, onRoad, inIsle, MAT, contMats, minimapRects, BLD, FENCES, ROADS, rand, rr, quality });

  for (const b of batches.values()) b.build(scene);
  const decoStats = decorateIsland(scene, { solids, HALF, B: ISLAND, BLD, TREES, FENCES, ROADS, quality });
  decoStats.props = OUT.stats;

  // ---------- nav graph: 4 m grid + door / room nodes ----------
  // walkable test for the nav graph, via an 8 m hash of the low solids (the map has ~2x the solids now: a linear scan was O(n^2))
  const FH = new Map(), FC = 8;
  for (const b of solids) { if (!(b.min.y < 1.6 && b.max.y > 0.3)) continue; for (let x = Math.floor(b.min.x / FC); x <= Math.floor(b.max.x / FC); x++) for (let z = Math.floor(b.min.z / FC); z <= Math.floor(b.max.z / FC); z++) { const k = x * 4096 + z; let a = FH.get(k); if (!a) FH.set(k, a = []); a.push(b); } }
  const free = (x, z, r = 0.6) => {
    if (!(x >= ISLAND.minX - 8 && x <= ISLAND.maxX + 8 && z >= ISLAND.minZ - 8 && z <= ISLAND.maxZ + 8)) return false;
    for (let cx = Math.floor((x - r) / FC); cx <= Math.floor((x + r) / FC); cx++) for (let cz = Math.floor((z - r) / FC); cz <= Math.floor((z + r) / FC); cz++) { const a = FH.get(cx * 4096 + cz); if (a) for (const b of a) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return false; }
    return true;
  };
  const nodes = [], grid = new Map(), S = 4;
  for (let x = ISLAND.minX + 2; x <= ISLAND.maxX - 2; x += S) for (let z = ISLAND.minZ + 2; z <= ISLAND.maxZ - 2; z += S) if (free(x, z)) { grid.set(x + ',' + z, nodes.length); nodes.push({ p: new THREE.Vector3(x, 0, z), n: [], deck: true }); }
  const segClear = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z), st = Math.ceil(d / 0.5); for (let i = 1; i < st; i++) { const t = i / st; if (!free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.42)) return false; } return true; };
  const link = (i, j) => { if (i !== j && !nodes[i].n.includes(j)) { nodes[i].n.push(j); nodes[j].n.push(i); } };
  for (let x = ISLAND.minX + 2; x <= ISLAND.maxX - 2; x += S) for (let z = ISLAND.minZ + 2; z <= ISLAND.maxZ - 2; z += S) {
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
    while (heap.length && it++ < 16000) {
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
  return { solids, nodes, covers, spawns, minimapRects, findPath, nearestNode, rayWorld, hasLOS, update() {}, walkY: 0, bounds: ISLAND, center: new THREE.Vector2(IC.x, IC.z), kind: 'island', near, decoStats, lod: OUT.lod };
}

// ======================================================================================================
// 扩图 + 细节 (2026-11): new north / west / east regions, roads that connect them, CC0 props (Kenney Car / Survival /
// Furniture kits) for wrecks, camps, fences, rocks and building interiors, and ground colour variation.
// Everything static is merged per 64 m chunk (PropSet) -> a few draw calls, culled by the camera far plane;
// small indoor clutter is its own PropSet hidden beyond 70 m (lod). Seeded rng: same layout every match.
// ======================================================================================================
function outerRegions(o) {
  const { scene, solid, deco, building, road, treeAt, rockAt, containerStack, blocked, onRoad, inIsle, MAT, minimapRects, BLD, FENCES, rand, rr } = o;
  const PS = new PropSet(64), IN = new PropSet(48, o.quality === 'high' ? 70 : 45);
  const QK = o.quality === 'low' ? 0.45 : o.quality === 'mid' ? 0.65 : 1;   // phones (mid/low): fewer extra trees / rocks in the new strips, interiors drawn closer
  const props = hasProps();
  // a prop with collision: footprint = its rotated bounding box (axis-aligned), h = height used for the solid
  const put = (k, x, z, ry = 0, s = 1, { set = PS, solidH = null, tint = null, pad = 0, mm = null, y = 0 } = {}) => {
    if (!props) return false;
    const sz = propSize(k), sc = Array.isArray(s) ? s : [s, s, s], w = sz.x * sc[0], d = sz.z * sc[2], c = Math.abs(Math.cos(ry)), si = Math.abs(Math.sin(ry));
    const hx = (c * w + si * d) / 2, hz = (si * w + c * d) / 2;
    if (solidH !== 0 && blocked(x - hx, z - hz, x + hx, z + hz, pad)) return false;
    set.add(k, x, y, z, ry, s, tint);
    if (solidH !== 0) solid(x - hx * 0.92, 0, z - hz * 0.92, x + hx * 0.92, solidH ?? sz.y * sc[1], z + hz * 0.92, null, mm);
    return true;
  };
  // ---------- roads: ring road in the north, west / east coast roads, spurs to the new places ----------
  road(-176, -206, 176, -200);            // north ring road
  road(-176, -200, -170, 120);            // west coast road
  road(170, -200, 176, 120);              // east coast road
  road(150, -76, 170, -70);               // spur into the outpost
  road(-170, 78, -150, 84);               // spur into the fishing village
  road(-4, -200, 4, -196);                // (joins the axis road to the ring road visually)
  // ---------- 北岭农场 (north-west farm) ----------
  for (let i = 0; i < 4; i++) { const cx = -160 + i * 19 + rr(-1.5, 1.5), cz = -228 + rr(-1.5, 1.5); building(cx, cz, rr(9, 11), rr(8, 9.5), 3.4, { s: [cx], crates: 0, roof: rand() < 0.5 ? MAT.roof : MAT.roof2 }); }
  building(-72, -226, 22, 14, 6.5, { s: [-78, -66], n: [-72], crates: 3, roof: MAT.roof, door: 3.4, mm: '#a8624a' });   // barn
  const siloGeo = new THREE.CylinderGeometry(3, 3, 12, 14), siloTop = new THREE.SphereGeometry(3, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const x of [-52, -44]) { solid(x - 2.6, 0, -232, x + 2.6, 12, -226.8, null, '#c9cdd2'); deco(siloGeo, MAT.metal, x, 6, -229.4); deco(siloTop, MAT.roof2, x, 12, -229.4); }
  // fields (south of the ring road): plowed rows as ground colour, fenced
  const FIELDS = [[-168, -192, -120, -152], [-110, -192, -62, -160], [-52, -190, -14, -156]];
  // fence lines (Kenney fence, scaled to ~2 m panels) around the farmyard
  for (let x = -168; x < -38; x += 2.2) { if (Math.abs(x + 100) < 4) continue; put('fence', x, -242.5, 0, [4.4, 2.1, 4.4], { solidH: 1.1 }); }
  // farm clutter
  put('car_tractor', -92, -214, 0.6, 1.5, { solidH: 2.2 }); put('car_tractor', -30, -170, 2.4, 1.5, { solidH: 2.2 });
  for (let i = 0; i < 10; i++) { const x = rr(-165, -40), z = rr(-240, -212); if (!blocked(x - 1, z - 1, x + 1, z + 1, 1.5)) solid(x - 0.75, 0, z - 0.75, x + 0.75, 1.3, z + 0.75, MAT.crate, '#8a6a40'); }
  for (let i = 0; i < 8; i++) put(rand() < 0.5 ? 'logs' : 'workbench', rr(-165, -40), rr(-240, -212), rand() * 6, 4.2, { solidH: 0.9 });
  for (let i = 0; i < 6; i++) put('barrel', rr(-165, -40), rr(-240, -212), rand() * 6, 4.4, { solidH: 1.5 });
  put('campfire', -120, -214, 0, 4, { solidH: 0 });
  // ---------- 灯塔角 (north-east lighthouse) ----------
  { const x = 168, z = -232;
    solid(x - 3.2, 0, z - 3.2, x + 3.2, 22, z + 3.2, null, '#f2f2f2');
    for (let i = 0; i < 5; i++) deco(new THREE.CylinderGeometry(3.0 - i * 0.18, 3.2 - i * 0.18, 4.4, 14), i % 2 ? MAT.roof : MAT.fence, x, 2.2 + i * 4.4, z);
    deco(new THREE.CylinderGeometry(2.4, 2.4, 2.2, 12), MAT.metal, x, 23.1, z); deco(new THREE.ConeGeometry(2.8, 2.4, 12), MAT.roof, x, 25.4, z);
    building(150, -232, 10, 8, 3.4, { e: [-232], crates: 1, roof: MAT.roof2 });
    for (let i = 0; i < 4; i++) put(rand() < 0.5 ? 'barrel' : 'box_large', rr(140, 186), rr(-246, -218), rand() * 6, rand() < 0.5 ? 4.4 : 5, { solidH: 1.3 }); }
  // ---------- 东角哨站 (east outpost): walled compound, barracks, watch towers, tents ----------
  { const x0 = 148, x1 = 190, z0 = -112, z1 = -36, gate = -73;
    const wall = (ax, az, bx, bz) => { solid(Math.min(ax, bx) - 0.5, 0, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, 1.3, Math.max(az, bz) + 0.5, MAT.concrete, '#7d7a6e'); };
    wall(x0, z0, x1, z0); wall(x0, z1, x1, z1); wall(x1, z0, x1, z1);
    wall(x0, z0, x0, gate - 4); wall(x0, gate + 4, x0, z1);                  // gate where the spur road comes in
    for (const [x, z] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) {   // watch towers
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) solid(x + dx - 0.18, 0, z + dz - 0.18, x + dx + 0.18, 5.4, z + dz + 0.18, MAT.wood);
      deco(new THREE.BoxGeometry(3.6, 0.3, 3.6), MAT.wood, x, 5.4, z); deco(new THREE.BoxGeometry(3.8, 0.9, 0.12), MAT.wood, x, 6.0, z - 1.8); deco(new THREE.BoxGeometry(3.8, 0.9, 0.12), MAT.wood, x, 6.0, z + 1.8);
      deco(new THREE.ConeGeometry(2.8, 1.4, 4), MAT.roof2, x, 7.6, z, Math.PI / 4);
    }
    building(166, -96, 18, 9, 3.6, { mat: MAT.metal, roof: MAT.roof2, n: [160, 172], crates: 2, mm: '#7f8a7a' });
    building(176, -50, 14, 9, 3.6, { mat: MAT.metal, roof: MAT.roof2, s: [176], w: [-50], crates: 2, mm: '#7f8a7a' });
    containerStack(160, -52, false, 2); containerStack(160, -46, false, 1);
    for (const [x, z] of [[160, -80], [168, -80], [180, -84]]) put('tent_canvas', x, z, Math.PI / 2, 7, { solidH: 2.6 });
    for (let i = 0; i < 12; i++) put(['box_large', 'barrel', 'box', 'chest'][(rand() * 4) | 0], rr(x0 + 4, x1 - 4), rr(z0 + 4, z1 - 4), rand() * 6, 5, { solidH: 1.3, pad: 0.6 });
    for (let i = 0; i < 9; i++) put('fence_fort', rr(x0 + 6, x1 - 6), rr(z0 + 6, z1 - 6), rand() < 0.5 ? 0 : Math.PI / 2, [5, 2.4, 5], { solidH: 1.2, pad: 0.8 });   // sandbag-ish barricades
    put('car_truck', 156, -64, 0.2, 1.5, { solidH: 2.0, tint: 0x9aa088 }); put('car_suv', 184, -68, 2.9, 1.4, { solidH: 1.8, tint: 0x8f9a7a });
    minimapRects.push({ x0, z0, x1, z1: z0 + 1, c: '#6f6a60' }, { x0, z0: z1 - 1, x1, z1, c: '#6f6a60' }, { x0: x1 - 1, z0, x1, z1, c: '#6f6a60' });
  }
  // ---------- 西湾渔村 (west fishing village) ----------
  for (let i = 0; i < 5; i++) { const cx = -158 + (i % 2) * 2, cz = 40 + i * 18; building(cx, cz, rr(8, 10), rr(7, 9), 3.2, { e: [cz], crates: 1, roof: i % 2 ? MAT.roof : MAT.roof2 }); }
  for (let i = 0; i < 14; i++) put(['barrel', 'box_large', 'box_open', 'bucket', 'logs'][(rand() * 5) | 0], rr(-168, -146), rr(30, 128), rand() * 6, 4.6, { solidH: 1.0, pad: 0.6 });
  for (let i = 0; i < 4; i++) put('canvas', rr(-192, -180), rr(30, 128), rand() * 6, 5, { solidH: 0 });   // drying nets on the beach
  // ---------- car wrecks along the roads (burnt: dark tint), with tyres and cones ----------
  const WRECK = ['car_sedan', 'car_van', 'car_police', 'car_hatch', 'car_delivery'];
  const wreckAt = [[-150, -9], [-60, -12], [80, -10], [130, 10], [-10, -160], [10, -120], [-120, -212], [60, -211], [120, -192], [-182, -60], [-182, 40], [182, -140], [182, 60], [-140, 90]];
  for (const [x, z] of wreckAt) {
    const k = WRECK[(rand() * WRECK.length) | 0], ry = rand() * 6.28;
    if (put(k, x, z, ry, 1.45, { solidH: 1.7, tint: rand() < 0.6 ? 0x6e625a : 0xb0a898, mm: '#5a5048' })) {
      for (let i = 0; i < 2; i++) put('tire', x + rr(-3, 3), z + rr(-3, 3), rand() * 6, 2.2, { solidH: 0, y: 0 });
      if (rand() < 0.6) put('cone', x + rr(-4, 4), z + rr(-4, 4), 0, 1.3, { solidH: 0 });
    }
  }
  // ---------- nature in the new strips: woods, rocks (Kenney + procedural), grass clumps ----------
  const inField = (x, z, m = 3) => FIELDS.some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
  const tree2 = (x, z) => { if (!inField(x, z)) treeAt(x, z); };
  for (let i = 0; i < Math.round(90 * QK); i++) tree2(rr(-190, 190), rr(-248, -142));
  for (let i = 0; i < Math.round(55 * QK); i++) tree2(rr(-192, -142), rr(-140, 136));
  for (let i = 0; i < Math.round(55 * QK); i++) tree2(rr(142, 192), rr(-140, 136));
  for (let i = 0; i < 12; i++) { const side = (rand() * 3) | 0, cx = side === 0 ? rr(-185, 185) : side === 1 ? rr(-190, -145) : rr(145, 190), cz = side === 0 ? rr(-245, -145) : rr(-135, 130); for (let k = 0; k < 3; k++) rockAt(cx + rr(-5, 5), cz + rr(-5, 5), rr(1.2, 2.6)); }
  for (let i = 0; i < Math.round(60 * QK); i++) { const x = rr(-190, 190), z = rr(-248, 136); if (onRoad(x, z, 1.5) || !inIsle(x, z, 4) || inField(x, z)) continue; put(['rock_a', 'rock_b', 'rock_c'][(rand() * 3) | 0], x, z, rand() * 6, rr(3, 6.5), { solidH: null, pad: 1 }); }
  for (let i = 0; i < 26; i++) { const x = rr(-125, 125), z = rr(-125, 125); if (onRoad(x, z, 1.5)) continue; put(['rock_a', 'rock_b', 'rock_c'][(rand() * 3) | 0], x, z, rand() * 6, rr(2.5, 5), { solidH: null, pad: 1 }); }   // core: a few more rock shapes
  // camps in the woods: tent + campfire + logs
  for (const [x, z] of [[-95, 95], [60, -118], [-178, -120], [178, 100], [20, -230]]) {
    if (put('tent', x, z, rand() * 6, 6.5, { solidH: 2.6, pad: 1 })) { put('campfire', x + 3.2, z + 1, 0, 4.5, { solidH: 0 }); put('log', x + 4.6, z - 0.4, 1.2, 2.2, { solidH: 0.5 }); put('box', x - 2.6, z + 2, 0.4, 4.5, { solidH: 1.1 }); }
  }
  // signposts at junctions
  for (const [x, z, r] of [[8, -208, 0], [-168, -10, 1.57], [168, 8, -1.57], [-8, 10, 3.14], [148, -80, 1.57], [-148, 88, -1.57]]) put('signpost', x, z, r, 4, { solidH: 0 });
  // ---------- building interiors (Kenney Furniture Kit): houses get a bed, table + chairs, kitchen, shelf; warehouses boxes ----------
  const FS = 1.9;
  for (const b of BLD) {
    if (!props) break;
    const inner = { x0: b.x0 + b.t + 0.15, x1: b.x1 - b.t - 0.15, z0: b.z0 + b.t + 0.15, z1: b.z1 - b.t - 0.15 };
    const nearDoor = (x, z) => [...b.n.map(dx => [dx, b.z0]), ...b.s.map(dx => [dx, b.z1]), ...b.w.map(dz => [b.x0, dz]), ...b.e.map(dz => [b.x1, dz])].some(([dx, dz]) => Math.hypot(x - dx, z - dz) < b.door / 2 + 1.6);
    const along = (keys, solidH, step) => {          // furniture standing with its back to the north / south walls, facing in
      for (const [z, ry] of [[inner.z0, 0], [inner.z1, Math.PI]]) for (let x = inner.x0 + 0.9; x < inner.x1 - 0.9; x += step) {
        if (rand() < 0.35) continue;
        const k = keys[(rand() * keys.length) | 0], sz = propSize(k), d = sz.z * FS, w = sz.x * FS;
        const zz = ry ? z - d / 2 : z + d / 2, xx = x + w / 2; if (xx + w / 2 > inner.x1 || nearDoor(xx, zz)) continue;
        if (put(k, xx, zz, ry, FS, { set: IN, solidH, pad: 0.05 })) x += w;
      }
    };
    if (b.metal) { along(['f_cbox', 'f_cbox2', 'workbench', 'f_books'], 1.2, 1.6); for (let i = 0; i < 3; i++) put('f_cbox', rr(inner.x0 + 1, inner.x1 - 1), rr(inner.z0 + 1, inner.z1 - 1), rand() * 6, FS * 1.3, { set: IN, solidH: 0.7, pad: 0.4 }); }
    else {
      along(['f_bed', 'f_books', 'f_kcab', 'f_fridge', 'f_sofa', 'f_side', 'f_plant', 'f_stove'], 1.0, 1.3);
      const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
      if (!nearDoor(cx, cz) && put('f_tround', cx + 1.2, cz, 0, FS, { set: IN, solidH: 0.8, pad: 0.1 })) { put('f_chair', cx + 1.2, cz + 1.0, Math.PI, FS, { set: IN, solidH: 0 }); put('f_chair', cx + 1.2, cz - 1.0, 0, FS, { set: IN, solidH: 0 }); }
      put('f_rug', cx - 1.5, cz, 0, FS * 0.8, { set: IN, solidH: 0, y: 0.02 });
    }
  }
  // ---------- ground variation: dirt patches, worn paths, plowed fields, darker / lighter grass (one merged mesh) ----------
  const GP = [], GC = [], GN = [], col = new THREE.Color();
  const blob = (x, z, r, c, segs = 9, y = 0.012, sx = 1, sz = 1) => { col.set(c); const pts = []; for (let i = 0; i < segs; i++) { const a = i / segs * 6.283, k = r * (0.72 + rand() * 0.4); pts.push([x + Math.cos(a) * k * sx, z + Math.sin(a) * k * sz]); }
    for (let i = 0; i < segs; i++) { const p = pts[i], q = pts[(i + 1) % segs]; GP.push(x, y, z, q[0], y, q[1], p[0], y, p[1]); for (let k = 0; k < 3; k++) { GC.push(col.r, col.g, col.b); GN.push(0, 1, 0); } } };
  const quad = (x0, z0, x1, z1, c, y = 0.013) => { col.set(c); GP.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); for (let k = 0; k < 6; k++) { GC.push(col.r, col.g, col.b); GN.push(0, 1, 0); } };
  for (const [x0, z0, x1, z1] of FIELDS) { quad(x0, z0, x1, z1, 0x9a7448); for (let z = z0 + 1; z < z1 - 0.5; z += 2.2) quad(x0 + 0.6, z, x1 - 0.6, z + 0.9, 0x7f5c36, 0.016); for (let i = 0; i < 40; i++) blob(rr(x0 + 2, x1 - 2), rr(z0 + 2, z1 - 2), rr(0.4, 0.8), 0x5fb84a, 5, 0.02);
    minimapRects.push({ x0, z0, x1, z1, c: '#8c6c44' }); }
  for (let i = 0; i < 220; i++) { const x = rr(-190, 190), z = rr(-248, 136); if (onRoad(x, z, 1)) continue; const r = rand(); blob(x, z, rr(2.5, 7), r < 0.35 ? 0xb89a68 : r < 0.7 ? 0x5ea83f : 0x8fd162, 9, 0.011 + (i % 3) * 0.001, rr(0.7, 1.4), rr(0.7, 1.4)); }
  // dirt tracks from the roads to the farmyard, the camps and the fishing nets
  const track = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.2); for (let i = 0; i <= n; i++) { const t = i / n; blob(ax + (bx - ax) * t + rr(-0.4, 0.4), az + (bz - az) * t + rr(-0.4, 0.4), 1.7, 0xa88a5c, 7, 0.0125); } };
  track(-100, -206, -100, -236); track(-60, -200, -60, -175); track(-170, 60, -188, 60); track(4, -230, 20, -230); track(-92, 46, -95, 92); track(36, -100, 60, -114);
  if (GP.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(GN, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(GC, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); m.renderOrder = 0; scene.add(m); }
  const a = PS.build(scene), b = IN.build(scene);
  return { stats: { propCalls: a.calls, propTris: a.tris, indoorCalls: b.calls, indoorTris: b.tris, groundTris: GP.length / 9 }, lod: (cam) => IN.lod(cam) };
}
