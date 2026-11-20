// procedural top-down arena: tile grid with walls, crates, power boxes, bushes, water
import * as THREE from 'three';
import { Builder, M, vcMat, outlineMat, toonMat } from './util.js';

export const N = 96, CELL = 1.5, HALF = N * CELL / 2;
export const CO = 18, CS = 60; // classic arena: tile offset and size inside the grid
export const T = { G: 0, WALL: 1, CRATE: 2, BOX: 3, BUSH: 4, WATER: 5 };
export const SOLID = (t) => t === 1 || t === 2 || t === 3 || t === 5;
export const BLOCKSHOT = (t) => t === 1 || t === 2 || t === 3;
export const cx = (x) => Math.floor((x + HALF) / CELL), cz = cx;
export const wx = (i) => -HALF + (i + 0.5) * CELL;

let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));

export function buildWorld(scene, classic = false) {
  seed = 1 + Math.floor(Math.random() * 100000);
  const type = new Uint8Array(N * N), hp = new Float32Array(N * N), biome = new Uint8Array(N * N), wcol = new Uint8Array(N * N);
  const idx = (i, j) => j * N + i, inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const set = (i, j, t) => { if (inb(i, j)) type[idx(i, j)] = t; };
  const blob = (ci, cj, r, t, only0 = true) => { for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) { if (!inb(i, j)) continue; const d = Math.hypot(i - ci, j - cj) + rand() * 0.9; if (d < r && (!only0 || type[idx(i, j)] === 0)) type[idx(i, j)] = t; } };
  const free = (i, j) => inb(i, j) && type[idx(i, j)] === 0;
  let boxes = [];
  if (classic) boxes = genClassic();
  else {
  // biomes for ground color: 0 grass, 1 sand, 2 stone plaza
  for (let k = 0; k < 7; k++) { const ci = ri(8, N - 8), cj = ri(8, N - 8), r = ri(6, 12), b = k % 3 === 0 ? 2 : 1; for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) < r) biome[idx(i, j)] = b; }
  // border water
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (i < 2 || j < 2 || i >= N - 2 || j >= N - 2) type[idx(i, j)] = T.WATER;
  for (let k = 0; k < 4; k++) { const a = rand() * Math.PI * 2, d = ri(14, 34); blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, ri(3, 5), T.WATER); }
  // wall clusters
  for (let k = 0; k < 85; k++) {
    const i = ri(4, N - 6), j = ri(4, N - 6), s = rand();
    if (s < 0.35) { const L = ri(3, 7), h = rand() < 0.5; for (let q = 0; q < L; q++) set(h ? i + q : i, h ? j : j + q, T.WALL); }
    else if (s < 0.6) { const L = ri(3, 5); for (let q = 0; q < L; q++) { set(i + q, j, T.WALL); set(i, j + q, T.WALL); } }
    else if (s < 0.78) { set(i, j, T.WALL); set(i + 1, j, T.WALL); set(i, j + 1, T.WALL); set(i + 1, j + 1, T.WALL); }
    else { for (let q = 0; q < 4; q++) { set(i + q, j, T.WALL); set(i + q, j + 3, T.WALL); } set(i, j + 1, T.WALL); set(i + 3, j + 2, T.WALL); }
  }
  for (let k = 0; k < 70; k++) blob(ri(4, N - 5), ri(4, N - 5), 1.2 + rand() * 2.2, T.BUSH);
  // crates & power boxes on free ground with free neighbours
  let c = 0; for (let t = 0; t < 4000 && c < 110; t++) { const i = ri(3, N - 4), j = ri(3, N - 4); if (free(i, j)) { set(i, j, T.CRATE); hp[idx(i, j)] = 900; c++; } }
  boxes = []; for (let t = 0; t < 6000 && boxes.length < 42; t++) { const i = ri(4, N - 5), j = ri(4, N - 5); if (free(i, j) && free(i + 1, j) && free(i - 1, j) && free(i, j + 1) && free(i, j - 1) && boxes.every(b => Math.hypot(b[0] - i, b[1] - j) > 7)) { set(i, j, T.BOX); hp[idx(i, j)] = 3500; boxes.push([i, j]); } }
  }
  for (let q = 0; q < N * N; q++) if (type[q] === T.WALL) hp[q] = 4000;


  // ---------- classic arena: 60x60 tiles in the middle of the grid, 4-way mirrored, water outside ----------
  function genClassic() {
    const O = CO, S = CS, Q = S / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const inP = i >= O && j >= O && i < O + S && j < O + S; type[idx(i, j)] = inP ? 0 : T.WATER; biome[idx(i, j)] = 0; }
    // quadrant-local (a,b): 0 = outer edge, Q-1 = next to the centre line; every write mirrored 4 ways
    const put = (a, b, t, c = 0) => { if (a < 0 || b < 0 || a >= Q || b >= Q) return; for (const [i, j] of [[O + a, O + b], [O + S - 1 - a, O + b], [O + a, O + S - 1 - b], [O + S - 1 - a, O + S - 1 - b]]) { const q = idx(i, j); type[q] = t; wcol[q] = c; } };
    const get = (a, b) => type[idx(O + a, O + b)];
    const rect = (a, b, w, h, t, c) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(a + x, b + y, t, c); };
    const col = () => ri(0, 2); // 0 stone, 1 timber crate, 2 clay brick
    // (prefabs below are ~5x5 so they fit 7-tile blocks with a walkable gap)
    // centre plaza: sand ground, a 2x2 rock at the very centre and a dense ring of cube boxes
    for (let b = Q - 8; b < Q; b++) for (let a = Q - 8; a < Q; a++) if ((Q - a) + (Q - b) < 12) for (const [i, j] of [[O + a, O + b], [O + S - 1 - a, O + b], [O + a, O + S - 1 - b], [O + S - 1 - a, O + S - 1 - b]]) biome[idx(i, j)] = 1;
    put(Q - 1, Q - 1, T.WALL, 0);
    const cbox = [[Q - 3, Q - 1], [Q - 1, Q - 3], [Q - 5, Q - 2], [Q - 2, Q - 5]];
    // macro blocks: the quadrant split into 3x3 blocks of 5 tiles, each gets a hand-made style prefab
    const prefabs = [
      (a, b) => { const c = col(); rect(a, b, 4, 1, T.WALL, c); rect(a, b + 1, 1, 2, T.WALL, c); rect(a + 1, b + 1, 3, 3, T.BUSH); return [a + 2, b + 2]; },       // L wall hugging tall grass (box hidden in grass)
      (a, b) => { rect(a, b, 5, 4, T.BUSH); rect(a + 2, b + 4, 2, 1, T.WALL, col()); return [a + 2, b + 1]; },                                        // big tall-grass patch
      (a, b) => { const v = rand() < 0.5; rect(a, b, v ? 2 : 5, v ? 5 : 2, T.WATER); rect(v ? a + 2 : a, v ? b : b + 2, v ? 1 : 2, v ? 2 : 1, T.WALL, 0); return null; }, // lake strip
      (a, b) => { const c = col(); rect(a, b, 2, 2, T.WALL, c); rect(a + 3, b + 3, 2, 2, T.WALL, c); rect(a + 2, b, 3, 2, T.BUSH); return [a, b + 3]; }, // rock pair + grass
      (a, b) => { const c = col(); rect(a, b + 1, 5, 1, T.WALL, c); rect(a, b + 3, 2, 2, T.BUSH); return [a + 3, b + 3]; },                            // crate row with a box behind
      (a, b) => { const c = col(); rect(a + 1, b, 1, 4, T.WALL, c); rect(a + 3, b + 1, 1, 4, T.WALL, c); return [a + 2, b + 2]; },                     // corridor
    ];
    const spread = [];
    for (let mb = 0; mb < 4; mb++) for (let ma = 0; ma < 4; ma++) {
      if (ma === 3 && mb === 3) continue; // centre block is the plaza
      if (ma + mb === 0 && rand() < 0.5) continue; // leave some open ground in the corner
      const a = ma * 7 + 1 + ri(0, 1), b = mb * 7 + 1 + ri(0, 1);
      let pick = ri(0, prefabs.length - 1); if ((ma === 0 || mb === 0) && pick === 2 && rand() < 0.5) pick = 1;
      const bx = prefabs[pick](a, b); if (bx) spread.push(bx);
    }
    // tall grass skirting the outer edge, like the original's grassy rims
    for (let k = 0; k < 3; k++) { const a = ri(2, Q - 6), w = ri(3, 5); rect(a, 0, w, 2, T.BUSH); rect(0, a, 2, w, T.BUSH); }
    // boxes: dense centre + one per prefab that offered a spot (keep ~2-4 per quadrant)
    const out = [];
    const placeBox = (a, b) => { if (a < 1 || b < 1 || a >= Q || b >= Q) return; if (get(a, b) === T.WATER || get(a, b) === T.WALL) return; put(a, b, T.BOX); for (const [i, j] of [[O + a, O + b], [O + S - 1 - a, O + b], [O + a, O + S - 1 - b], [O + S - 1 - a, O + S - 1 - b]]) { hp[idx(i, j)] = 6000; out.push([i, j]); } };
    for (const [a, b] of cbox) placeBox(a, b);
    spread.sort(() => rand() - 0.5); for (const [a, b] of spread.slice(0, 2)) placeBox(a, b);
    return out;
  }

  // ---------- ground texture ----------
  const P = 12, cv = document.createElement('canvas'); cv.width = cv.height = N * P; const g = cv.getContext('2d');
  const pal = classic ? [['#8fe35a', '#7fd44c'], ['#f6d98e', '#ecca78'], ['#c9c2d6', '#bdb5cc']] : [['#7fd957', '#73cc4c'], ['#f4d58d', '#ecca7e'], ['#c9c2d6', '#bdb5cc']];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = type[idx(i, j)], b = biome[idx(i, j)];
    if (t === T.WATER) { g.fillStyle = '#3db7f0'; g.fillRect(i * P, j * P, P, P); g.fillStyle = 'rgba(255,255,255,.35)'; if ((i + j) % 3 === 0) g.fillRect(i * P + 2, j * P + 5, 6, 2); continue; }
    g.fillStyle = pal[b][(i + j) & 1]; g.fillRect(i * P, j * P, P, P);
    if (classic) { g.fillStyle = 'rgba(0,40,0,.10)'; g.fillRect(i * P, j * P + P - 1, P, 1); g.fillRect(i * P + P - 1, j * P, 1, P); g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(i * P, j * P, P, 1); continue; }
    if (b === 2) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(i * P, j * P, P, 1); g.fillRect(i * P, j * P, 1, P); }
    if (b === 0 && rand() < 0.08) { g.fillStyle = rand() < 0.5 ? '#fff6a8' : '#ff9fd0'; g.fillRect(i * P + 4, j * P + 4, 3, 3); }
  }
  // water shore outline
  g.fillStyle = '#f7e6b0';
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (type[idx(i, j)] === T.WATER) {
    if (inb(i - 1, j) && type[idx(i - 1, j)] !== T.WATER) g.fillRect(i * P, j * P, 2, P);
    if (inb(i + 1, j) && type[idx(i + 1, j)] !== T.WATER) g.fillRect(i * P + P - 2, j * P, 2, P);
    if (inb(i, j - 1) && type[idx(i, j - 1)] !== T.WATER) g.fillRect(i * P, j * P, P, 2);
    if (inb(i, j + 1) && type[idx(i, j + 1)] !== T.WATER) g.fillRect(i * P, j * P + P - 2, P, 2);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gg = new THREE.PlaneGeometry(N * CELL, N * CELL); gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ map: tex })); scene.add(ground);
  const sg = new THREE.PlaneGeometry(2000, 2000); sg.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x2aa3e0 })); sea.position.y = -0.6; scene.add(sea);

  // ---------- instanced props ----------
  const CH = 24, NC = N / CH; // spatial chunks so off-screen props are frustum-culled
  const counts = {}; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = type[idx(i, j)]; if (t >= 1 && t <= 4) { const k = t + ':' + ((j / CH) | 0) * NC + ((i / CH) | 0); counts[k] = (counts[k] || 0) + 1; } }
  const wallGeo = new Builder().add(new THREE.BoxGeometry(CELL, 1.7, CELL), M(0, 0.85, 0), 0xffffff).add(new THREE.BoxGeometry(CELL * 0.8, 0.12, CELL * 0.8), M(0, 1.74, 0), 0xfff3e0).build();
  const crateGeo = new Builder().add(new THREE.BoxGeometry(1.25, 1.1, 1.25), M(0, 0.55, 0), 0xd99a4e)
    .add(new THREE.BoxGeometry(1.29, 0.14, 1.29), M(0, 0.2, 0), 0x9c6230).add(new THREE.BoxGeometry(1.29, 0.14, 1.29), M(0, 0.9, 0), 0x9c6230).build();
  const boxGeo = new Builder().add(new THREE.BoxGeometry(1.35, 1.25, 1.35), M(0, 0.63, 0), 0x5b2c83)
    .add(new THREE.BoxGeometry(1.4, 0.16, 1.4), M(0, 1.2, 0), 0xffc43d).add(new THREE.BoxGeometry(1.4, 0.16, 1.4), M(0, 0.1, 0), 0xffc43d)
    .add(new THREE.OctahedronGeometry(0.32), M(0, 1.45, 0, 0, 0, 0, 1, 1.3, 1), 0xff8a1f).build();
  const bushGeo = new Builder().add(new THREE.IcosahedronGeometry(0.62, 1), M(0, 0.62, 0, 0, 0, 0, 1.15, 0.95, 1.15), 0xffffff)
    .add(new THREE.IcosahedronGeometry(0.42, 1), M(0.35, 0.95, 0.15), 0xffffff).add(new THREE.IcosahedronGeometry(0.4, 1), M(-0.3, 0.92, -0.2), 0xffffff).build();
  const GEOS = { 1: [wallGeo, 0.05], 2: [crateGeo, 0.05], 3: [boxGeo, 0.05], 4: [bushGeo, 0.04] };
  const I = {}; // key "type:chunk" -> {m, o, n}
  const mk = (key) => { const t = +key.split(':')[0], n = counts[key], [geo, ow] = GEOS[t]; const m = new THREE.InstancedMesh(geo, vcMat(), n); scene.add(m); const o = new THREE.InstancedMesh(geo, outlineMat(ow), n); o.renderOrder = -1; scene.add(o); return { m, o, n: 0 }; };
  for (const k in counts) I[k] = mk(k);
  const inst = new Int32Array(N * N).fill(-1);
  const wallCols = [0xff8c5a, 0xf2a65a, 0xe76f51, 0xc8b6ff, 0x9bb7d4].map(c => new THREE.Color(c));
  const classicCols = [0xaab6cc, 0xd99a58, 0xe2774e].map(c => new THREE.Color(c));
  const tmpC = new THREE.Color();
  const keyOf = (i, j, t) => t + ':' + ((j / CH) | 0) * NC + ((i / CH) | 0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q = idx(i, j), t = type[q]; if (t < 1 || t > 4) continue; const e = I[keyOf(i, j, t)], k = e.n++;
    let mat;
    if (t === T.BUSH) { const s = classic ? 1.12 + rand() * 0.12 : 0.9 + rand() * 0.3; mat = M(wx(i), 0, wx(j), 0, rand() * 6, 0, s, (classic ? 1.15 : 0.9) + rand() * 0.35, s); tmpC.setHSL(classic ? 0.24 + rand() * 0.05 : 0.28 + rand() * 0.08, classic ? 0.7 : 0.6, 0.38 + rand() * 0.08); e.m.setColorAt(k, tmpC); }
    else { mat = M(wx(i), 0, wx(j)); if (t === T.WALL) e.m.setColorAt(k, classic ? classicCols[wcol[q]] : wallCols[(Math.floor(i / 4) + Math.floor(j / 4) * 3) % wallCols.length]); }
    e.m.setMatrixAt(k, mat); e.o.setMatrixAt(k, mat); inst[q] = k;
  }
  for (const e of Object.values(I)) { e.m.instanceMatrix.needsUpdate = true; if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true; e.o.instanceMatrix.needsUpdate = true; e.m.computeBoundingSphere(); e.o.computeBoundingSphere(); }

  // minimap base
  const mm = document.createElement('canvas'); mm.width = mm.height = N; const mg = mm.getContext('2d');
  const mcol = { 0: '#7fd957', 1: '#c0704a', 2: '#d99a4e', 3: '#7b3fb0', 4: '#2f8a3a', 5: '#3db7f0' };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = type[idx(i, j)]; mg.fillStyle = t === 0 ? ['#7fd957', '#f4d58d', '#c9c2d6'][biome[idx(i, j)]] : mcol[t]; mg.fillRect(i, j, 1, 1); }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const W = {
    type, hp, inst, I, mm, mg, ground, sea,
    at: (x, z) => { const i = cx(x), j = cz(z); return inb(i, j) ? type[idx(i, j)] : T.WATER; },
    idx, inb,
    remove(i, j) { const q = idx(i, j), t = type[q], e = I[keyOf(i, j, t)]; if (!e) return; const k = inst[q]; if (k >= 0) { e.m.setMatrixAt(k, zero); e.m.instanceMatrix.needsUpdate = true; if (e.o) { e.o.setMatrixAt(k, zero); e.o.instanceMatrix.needsUpdate = true; } } type[q] = T.G; inst[q] = -1; mg.fillStyle = '#9ad97a'; mg.fillRect(i, j, 1, 1); },
    // circle vs solid cells: push the entity out
    collide(p, r) {
      const i0 = cx(p.x - r), i1 = cx(p.x + r), j0 = cz(p.z - r), j1 = cz(p.z + r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (!inb(i, j)) continue; if (!SOLID(type[idx(i, j)])) continue;
        const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL, nx = Math.max(x0, Math.min(p.x, x0 + CELL)), nz = Math.max(z0, Math.min(p.z, z0 + CELL));
        let dx = p.x - nx, dz = p.z - nz; const d = Math.hypot(dx, dz);
        if (d < r) { if (d < 1e-4) { dx = p.x - (x0 + CELL / 2); dz = p.z - (z0 + CELL / 2); const L = Math.hypot(dx, dz) || 1; p.x += dx / L * r; p.z += dz / L * r; } else { p.x += dx / d * (r - d); p.z += dz / d * (r - d); } }
      }
      const lim = HALF - CELL * 2 - r; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    },
    freeNear(x, z) { // nearest walkable spot
      let i = cx(x), j = cz(z); if (inb(i, j) && !SOLID(type[idx(i, j)])) return [x, z];
      for (let r = 1; r < 20; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (inb(a, b) && !SOLID(type[idx(a, b)])) return [wx(a), wx(b)]; }
      return [0, 0];
    },
    // ray along segment: first blocking cell or null
    lineBlocked(x0, z0, x1, z1) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / (CELL * 0.4)); for (let k = 1; k < n; k++) { const t = k / n; if (BLOCKSHOT(W.at(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t))) return true; } return false; },
    boxes, rand, classic, O: classic ? CO : 0, S: classic ? CS : N, PH: classic ? CS * CELL / 2 : HALF,
  };
  return W;
}
