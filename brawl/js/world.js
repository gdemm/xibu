// procedural top-down arena: tile grid with walls, crates, power boxes, bushes, water
import * as THREE from 'three';
import { Builder, M, vcMat, outlineMat, toonMat, toonRamp } from './util.js';

export const N = 96, CELL = 1.5, HALF = N * CELL / 2;
export const CO = 18, CS = 60; // classic arena: tile offset and size inside the grid
export const T = { G: 0, WALL: 1, CRATE: 2, BOX: 3, BUSH: 4, WATER: 5 };
export const SOLID = (t) => t === 1 || t === 2 || t === 3 || t === 5;
export const BLOCKSHOT = (t) => t === 1 || t === 2 || t === 3;
export const cx = (x) => Math.floor((x + HALF) / CELL), cz = cx;
export const wx = (i) => -HALF + (i + 0.5) * CELL;

// map rotation: 0 = the original sunny meadow, 1 = the dusk swamp (darker ground, teal grass fields, poison ponds)
export const MAPS = [{ id: 0, name: '晴空草原' }, { id: 1, name: '暮影沼泽' }];
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));

export function buildWorld(scene, classic = false, mapId = 0) {
  const MAP = MAPS[mapId] ? mapId : 0;
  seed = 1 + Math.floor(Math.random() * 100000);
  const type = new Uint8Array(N * N), hp = new Float32Array(N * N), biome = new Uint8Array(N * N), wcol = new Uint8Array(N * N);
  const idx = (i, j) => j * N + i, inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const set = (i, j, t) => { if (inb(i, j)) type[idx(i, j)] = t; };
  const blob = (ci, cj, r, t, only0 = true) => { for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) { if (!inb(i, j)) continue; const d = Math.hypot(i - ci, j - cj) + rand() * 0.9; if (d < r && (!only0 || type[idx(i, j)] === 0)) type[idx(i, j)] = t; } };
  const free = (i, j) => inb(i, j) && type[idx(i, j)] === 0;
  let boxes = [];
  if (classic) boxes = MAP === 1 ? genClassic2() : genClassic();
  else if (MAP === 1) boxes = genParty2();
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
  for (let q = 0; q < N * N; q++) { if (type[q] === T.WALL) hp[q] = 4000; else if (type[q] === T.CRATE && !hp[q]) hp[q] = 900; }


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


  // ---------- map 2 (暮影沼泽), classic arena: 4-way mirrored, plus-shaped poison pond in the centre ----------
  function genClassic2() {
    const O = CO, S = CS, Q = S / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const inP = i >= O && j >= O && i < O + S && j < O + S; type[idx(i, j)] = inP ? 0 : T.WATER; biome[idx(i, j)] = 0; }
    const M4 = (a, b) => [[O + a, O + b], [O + S - 1 - a, O + b], [O + a, O + S - 1 - b], [O + S - 1 - a, O + S - 1 - b]];
    const put = (a, b, t) => { if (a < 0 || b < 0 || a >= Q || b >= Q) return; for (const [i, j] of M4(a, b)) type[idx(i, j)] = t; };
    const get = (a, b) => type[idx(O + a, O + b)];
    const rect = (a, b, w, h, t) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(a + x, b + y, t); };
    const putIf0 = (a, b, t) => { if (a >= 0 && b >= 0 && a < Q && b < Q && get(a, b) === 0) put(a, b, t); };
    // lighter dirt round the pond + flagstone ring
    for (let b = Q - 9; b < Q; b++) for (let a = Q - 9; a < Q; a++) { const d = (Q - a) + (Q - b); if (d < 14) for (const [i, j] of M4(a, b)) biome[idx(i, j)] = d < 9 ? 2 : 1; }
    // centre: plus-shaped poison pond, stumps on its corners
    put(Q - 1, Q - 1, T.WATER); put(Q - 2, Q - 1, T.WATER); put(Q - 1, Q - 2, T.WATER); put(Q - 3, Q - 1, T.WATER); put(Q - 1, Q - 3, T.WATER); put(Q - 2, Q - 2, T.WATER);
    put(Q - 4, Q - 3, T.CRATE); put(Q - 3, Q - 4, T.CRATE);
    const prefabs = [
      (a, b) => { rect(a + 1, b, 3, 1, T.WALL); rect(a + 2, b + 1, 1, 4, T.WALL); rect(a + 3, b + 1, 2, 4, T.BUSH); putIf0(a, b + 3, T.CRATE); return [a + 1, b + 2]; },   // stone T + grass on one side
      (a, b) => { rect(a, b, 5, 5, T.BUSH); put(a + 2, b + 2, T.CRATE); return [a + 1, b + 1]; },                                                     // big teal field, stump in the middle
      (a, b) => { rect(a + 1, b + 1, 3, 3, T.WATER); putIf0(a, b, T.CRATE); putIf0(a + 4, b + 4, T.CRATE); rect(a, b + 4, 2, 1, T.BUSH); return null; },  // poison pond with stumps
      (a, b) => { rect(a, b, 2, 2, T.WALL); for (let k = 0; k < 3; k++) putIf0(a + 2 + k, b + 3, T.CRATE); rect(a + 3, b, 2, 2, T.BUSH); return [a + 4, b + 4]; }, // stone block + barrel row
      (a, b) => { rect(a, b, 5, 1, T.BUSH); rect(a, b + 1, 1, 4, T.BUSH); put(a + 1, b + 1, T.WALL); put(a + 2, b + 1, T.WALL); put(a + 1, b + 2, T.WALL); return [a + 3, b + 3]; }, // grass U round a wall corner
      (a, b) => { for (let k = 0; k < 5; k += 2) put(a + k, b + 1, T.WALL); rect(a, b + 2, 5, 2, T.BUSH); putIf0(a + 1, b + 4, T.CRATE); return [a + 2, b + 4]; }, // broken wall + grass behind
    ];
    const spread = [];
    for (let mb = 0; mb < 4; mb++) for (let ma = 0; ma < 4; ma++) {
      if (ma === 3 && mb === 3) continue;
      if (ma + mb === 0) continue; // open corner
      const a = ma * 7 + 1 + ri(0, 1), b = mb * 7 + 1 + ri(0, 1);
      const pick = (ma * 5 + mb * 3 + ri(0, 2)) % prefabs.length;
      const bx = prefabs[pick](a, b); if (bx) spread.push(bx);
    }
    // wide grass rims along the outer edge (reference-style long fields)
    for (let k = 0; k < 2; k++) { const a = ri(4, Q - 9), w = ri(5, 7); rect(a, 0, w, 3, T.BUSH); rect(0, a, 3, w, T.BUSH); }
    const out = [];
    const placeBox = (a, b) => { if (a < 1 || b < 1 || a >= Q || b >= Q) return; const t = get(a, b); if (t === T.WATER || t === T.WALL) return; put(a, b, T.BOX); for (const [i, j] of M4(a, b)) { hp[idx(i, j)] = 6000; out.push([i, j]); } };
    for (const [a, b] of [[Q - 5, Q - 1], [Q - 1, Q - 5], [Q - 5, Q - 5], [Q - 7, Q - 3]]) placeBox(a, b);
    spread.sort(() => rand() - 0.5); for (const [a, b] of spread.slice(0, 2)) placeBox(a, b);
    return out;
  }
  // ---------- map 2, party island: void border, poison ponds, stone T walls, big teal fields, stumps/barrels ----------
  function genParty2() {
    for (let k = 0; k < 6; k++) { const ci = ri(8, N - 8), cj = ri(8, N - 8), r = ri(6, 11), b = k % 3 === 0 ? 2 : 1; for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) if (inb(i, j) && Math.hypot(i - ci, j - cj) < r) biome[idx(i, j)] = b; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (i < 2 || j < 2 || i >= N - 2 || j >= N - 2) type[idx(i, j)] = T.WATER;
    for (let k = 0; k < 7; k++) { const a = rand() * Math.PI * 2, d = ri(10, 36); blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, ri(2, 4), T.WATER); }
    for (let k = 0; k < 60; k++) {
      const i = ri(4, N - 7), j = ri(4, N - 7), s = rand();
      if (s < 0.4) { const L = ri(3, 5), h = rand() < 0.5; for (let q = -1; q <= 1; q++) set(h ? i + q : i, h ? j : j + q, T.WALL); for (let q = 1; q <= L; q++) set(h ? i : i + q, h ? j + q : j, T.WALL); } // T
      else if (s < 0.7) { const L = ri(4, 8), h = rand() < 0.5; for (let q = 0; q < L; q++) set(h ? i + q : i, h ? j : j + q, T.WALL); }
      else { set(i, j, T.WALL); set(i + 1, j, T.WALL); set(i, j + 1, T.WALL); set(i + 1, j + 1, T.WALL); }
    }
    for (let k = 0; k < 26; k++) blob(ri(5, N - 6), ri(5, N - 6), 2.5 + rand() * 2.5, T.BUSH);
    let c = 0; for (let t = 0; t < 5000 && c < 130; t++) { const i = ri(3, N - 4), j = ri(3, N - 4); if (free(i, j)) { set(i, j, T.CRATE); hp[idx(i, j)] = 900; c++; } }
    const bx = []; for (let t = 0; t < 6000 && bx.length < 42; t++) { const i = ri(4, N - 5), j = ri(4, N - 5); if (free(i, j) && free(i + 1, j) && free(i - 1, j) && free(i, j + 1) && free(i, j - 1) && bx.every(b => Math.hypot(b[0] - i, b[1] - j) > 7)) { set(i, j, T.BOX); hp[idx(i, j)] = 3500; bx.push([i, j]); } }
    return bx;
  }

  // ---------- theme ----------
  const DUSK = MAP === 1;
  const TH = DUSK ? {
    ground: [['#4d3d63', '#4a3a5f'], ['#5b4a72', '#57476d'], ['#5f587d', '#5a5377']],
    patchD: 'rgba(18,8,34,.20)', patchL: 'rgba(150,120,190,.07)', line: 'rgba(15,6,30,.10)', hl: 'rgba(255,255,255,.03)',
    pond: '#74dc52', pondD: '#5cc541', pondHi: 'rgba(220,255,170,.55)', shore: '#2d5e34', voidC: '#1f1830', voidD: '#1d162d', cliff: '#120c1c',
    pw: ['#4fb83a', '#74dc52', '#a6ee6e', '#e2ffb0'], vw: ['#18122a', '#1d162d', '#221a36', '#2b2242'], beach: '#2a2140', vcliff: '#120c1c', rim: [null, '#463760', '#4b4569'], strokeL: 'rgba(170,150,220,.16)', strokeD: 'rgba(10,0,25,.22)', wave: 'rgba(170,140,220,.20)',
    sea: 0x1d1730, bushH: [0.47, 0.025], bushS: 0.5, bushL: [0.46, 0.06], tuft: [0x2f9a96, 0x3fb3a8, 0x2a8a8f], pebble: [0x6f6690, 0x7c739c, 0x5f5880],
    walls: [0x9ea2d2, 0x8f94c6, 0xaaa7d6], wallsC: [0x9ea2d2, 0x8f94c6, 0xaaa7d6], crate: [0xe8708f, 0xa8405f], mm: { g: ['#4d3d63', '#5b4a72', '#5f587d'], 1: '#a7a7d6', 2: '#c56a4a', 3: '#c9a2ff', 4: '#2f9a96', 5: '#74dc52', v: '#211a33' },
  } : {
    ground: classic ? [['#86d957', '#7fd150'], ['#f3d68c', '#ebcb7c'], ['#c9c2d6', '#bdb5cc']] : [['#78d052', '#71c84b'], ['#f2d48b', '#eaca7d'], ['#c9c2d6', '#bdb5cc']],
    patchD: 'rgba(30,90,20,.12)', patchL: 'rgba(255,255,210,.09)', line: 'rgba(0,40,0,.10)', hl: 'rgba(255,255,255,.10)',
    pond: '#3db7f0', pondD: '#36aee8', pondHi: 'rgba(255,255,255,.35)', shore: '#f7e6b0', voidC: '#3db7f0', voidD: '#36aee8', cliff: '#f7e6b0',
    pw: ['#2a9fe6', '#3db7f0', '#79d3f7', '#e9fbff'], vw: ['#2a9be0', '#36aee8', '#6ccdf3', '#f2fdff'], beach: '#f6db94', rim: [null, '#dcb466', '#a59dbb'], strokeL: 'rgba(200,255,150,.35)', strokeD: 'rgba(30,100,20,.20)', wave: 'rgba(255,255,255,.5)',
    sea: 0x2aa3e0, bushH: classic ? [0.24, 0.05] : [0.28, 0.08], bushS: classic ? 0.6 : 0.55, bushL: [0.5, 0.08], tuft: [0x4fae3a, 0x5fc244, 0x46a035], pebble: [0xb9b2c4, 0xa7a0b4, 0xcfc8d8],
    walls: [0xff8c5a, 0xf2a65a, 0xe76f51, 0xc8b6ff, 0x9bb7d4], wallsC: [0xaab6cc, 0xd99a58, 0xe2774e], crate: [0xd99a4e, 0x9c6230], mm: { g: ['#7fd957', '#f4d58d', '#c9c2d6'], 1: '#c0704a', 2: '#d99a4e', 3: '#7b3fb0', 4: '#2f8a3a', 5: '#3db7f0', v: '#3db7f0' },
  };
  // water outside the playable area is the "void" (sea / swamp mist), inside it is a pond
  const isVoid = (i, j) => classic ? (i < CO || j < CO || i >= CO + CS || j >= CO + CS) : (i < 2 || j < 2 || i >= N - 2 || j >= N - 2);

  // ---------- ground texture: per-pixel painted base with rounded shorelines / biome patches, then painted decor ----------
  const P = 16, NP = N * P, cv = document.createElement('canvas'); cv.width = cv.height = NP; const g = cv.getContext('2d');
  {
    const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const W8 = (i, j) => !inb(i, j) || type[idx(i, j)] === T.WATER;
    const B1 = (i, j) => inb(i, j) && type[idx(i, j)] !== T.WATER && biome[idx(i, j)] === 1, B2 = (i, j) => inb(i, j) && type[idx(i, j)] !== T.WATER && biome[idx(i, j)] === 2;
    const R = 7, H2 = P / 2;
    // signed distance in pixels to the edge of a tile mask whose corners are rounded (convex cut, concave filleted); > 0 inside
    function sd(mask, i, j, u, v) {
      const sx = u < H2 ? -1 : 1, sy = v < H2 ? -1 : 1, dx = sx < 0 ? u + 0.5 : P - u - 0.5, dy = sy < 0 ? v + 0.5 : P - v - 0.5;
      const A = mask(i + sx, j), B = mask(i, j + sy), D = mask(i + sx, j + sy);
      if (mask(i, j)) {
        if (!A && !B) return dx < R && dy < R ? R - Math.hypot(R - dx, R - dy) : Math.min(dx, dy);
        let d = H2; if (!A) d = Math.min(d, dx); if (!B) d = Math.min(d, dy); if (A && B && !D) d = Math.min(d, Math.hypot(dx + R, dy + R) - R); return d;
      }
      if (A && B) return dx < R && dy < R ? Math.hypot(R - dx, R - dy) - R : -Math.min(dx, dy);
      if (A) return -dx; if (B) return -dy;
      if (D) return R - Math.hypot(dx + R, dy + R);
      return -H2;
    }
    const allN = (mask, i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (!mask(i + a, j + b)) return false; return true; };
    const near = (mask, i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (mask(i + a, j + b)) return true; return false; };
    const GC = TH.ground.map(p => p.map(hx)), RIM = TH.rim.map(c => c && hx(c));
    const PW = TH.pw.map(hx), VW = TH.vw.map(hx), SH = hx(TH.shore), BE = hx(TH.beach);
    const F1 = new Float32Array(N * N), F2 = new Float32Array(N * N); for (let q = 0; q < N * N; q++) if (type[q] !== T.WATER) { if (biome[q] === 1) F1[q] = 1; else if (biome[q] === 2) F2[q] = 1; }
    const img = g.createImageData(NP, NP), U32 = new Uint32Array(img.data.buffer), cl = (x) => x < 0 ? 0 : x > 255 ? 255 : x | 0, pack = (r, gg, b) => (0xff000000 | (cl(b) << 16) | (cl(gg) << 8) | cl(r)) >>> 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = idx(i, j), nW = near(W8, i, j), aW = nW && allN(W8, i, j), n1 = !aW && near(B1, i, j), n2 = !aW && near(B2, i, j), par = (i + j) & 1, b0 = biome[q], tv = (rand() - 0.5) * 6;
      const vd = isVoid(i, j) || (nW && !W8(i, j) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(i + a, j + b) && type[idx(i + a, j + b)] === T.WATER && isVoid(i + a, j + b)));
      const o0 = j * P * NP + i * P;
      const fb = nW ? -1 : !n1 && !n2 ? 0 : n2 && allN(B2, i, j) ? 2 : !n2 && allN(B1, i, j) ? 1 : -1;
      if (aW || fb >= 0) { // fast path: whole tile is open water or plain ground -> one packed colour per row
        let c, k = 1; if (aW) c = (vd ? VW : PW)[0]; else { const b = fb === 0 ? (b0 === 0 ? 0 : b0) : fb; c = GC[b][par]; k = 1 + tv / 255 * 2; }
        const val = pack(c[0] * k, c[1] * k, c[2] * k); for (let v = 0; v < P; v++) U32.fill(val, o0 + v * NP, o0 + v * NP + P);
        if (aW) { const sp = (vd ? VW : PW)[2], sv = pack(sp[0], sp[1], sp[2]); for (let v = 0; v < P; v++) for (let u = 0; u < P; u++) if ((u * 3 + v * 7 + i * 5 + j * 11) % 37 === 0) U32[o0 + v * NP + u] = sv; }
        continue;
      }
      for (let v = 0; v < P; v++) for (let u = 0; u < P; u++) {
        let c, k = 1;
        const dW = aW ? H2 : nW ? sd(W8, i, j, u, v) : -H2;
        if (dW > 0) { // water: deep centre, lighter shallows, foam lip
          const pal = vd ? VW : PW; c = dW > 7 ? pal[0] : dW > 3 ? pal[1] : dW > 1.3 ? pal[2] : pal[3];
          if (dW > 7 && ((u * 3 + v * 7 + i * 5 + j * 11) % 37 === 0)) c = pal[2];
        } else {
          // biome patches: bilinear field of tile-centre samples -> smooth diagonal / curved edges with a thin rim
          let b = 0, d = 1;
          if (n1 || n2) {
            const fx = (i * P + u + 0.5) / P - 0.5, fy = (j * P + v + 0.5) / P - 0.5, i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
            const bl = (F) => { const f = (a, c) => inb(a, c) ? F[idx(a, c)] : 0; return (f(i0, j0) * (1 - tx) + f(i0 + 1, j0) * tx) * (1 - ty) + (f(i0, j0 + 1) * (1 - tx) + f(i0 + 1, j0 + 1) * tx) * ty; };
            if (n2) { const e = bl(F2); if (e > 0.5) { b = 2; d = e - 0.5; } }
            if (!b && n1) { const e = bl(F1); if (e > 0.5) { b = 1; d = e - 0.5; } }
          }
          c = GC[b][par]; k = 1 + tv / 255 * 2;
          if (b && d < 0.11 && RIM[b]) c = RIM[b];
          if (dW > -3.2 && !vd) c = SH; else if (vd && dW > -6) c = dW > -2 ? TH.vcliff ? hx(TH.vcliff) : BE : BE;
        }
        U32[o0 + v * NP + u] = pack(c[0] * k, c[1] * k, c[2] * k);
      }
    }
    g.putImageData(img, 0, 0);
    // tile seams only on stone plazas / classic floor, where a tile is fully surrounded by its own kind
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const q = idx(i, j), b = biome[q]; if (type[q] === T.WATER || !(classic || b === 2)) continue;
      let ok = true; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qq = idx(i + a, j + c); if (type[qq] === T.WATER || biome[qq] !== b) ok = false; } if (!ok) continue;
      const X = i * P, Y = j * P; g.fillStyle = TH.line; g.fillRect(X, Y + P - 1, P, 1); g.fillRect(X + P - 1, Y, 1, P); g.fillStyle = TH.hl; g.fillRect(X, Y, P, 1);
    }
    // grass strokes: short lighter / darker blades painted on the plain ground
    for (const [col, n] of [[TH.strokeL, 2], [TH.strokeD, 2]]) {
      g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const q = idx(i, j); if (type[q] === T.WATER || biome[q] !== 0) continue; for (let k = 0; k < n; k++) { const x = i * P + 2 + rand() * 12, y = j * P + 3 + rand() * 11, l = 2 + rand() * 2.5; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 2, y - l); } }
      g.stroke();
    }
    // sea: little wave crests on the void, ripple rings on ponds
    g.strokeStyle = TH.wave; g.lineWidth = 1.4; g.beginPath();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = idx(i, j); if (type[q] !== T.WATER || rand() > (isVoid(i, j) ? 0.12 : 0.18)) continue;
      const x = i * P + 3 + rand() * 9, y = j * P + 4 + rand() * 8; if (isVoid(i, j)) { g.moveTo(x, y); g.quadraticCurveTo(x + 3, y - 3, x + 6, y); } else { g.moveTo(x + 3, y); g.arc(x, y, 3, 0, Math.PI * 2); }
    }
    g.stroke();
  }

  // soft patches (darker hollows, lighter worn spots)
  for (let k = 0; k < N * N / 22; k++) {
    const i = ri(0, N - 1), j = ri(0, N - 1); if (type[idx(i, j)] === T.WATER) continue;
    g.fillStyle = rand() < 0.62 ? TH.patchD : TH.patchL; g.beginPath(); g.ellipse(i * P + rand() * P, j * P + rand() * P, P * (0.6 + rand() * 1.4), P * (0.4 + rand() * 0.9), rand() * 3, 0, 7); g.fill();
  }
  // painted decor: pebbles, cracks, leaf sprigs, flowers (meadow) / bones (swamp)
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (type[idx(i, j)] !== T.G) continue; const X = i * P, Y = j * P, r = rand();
    if (r < 0.06) { const x = X + 3 + rand() * 10, y = Y + 3 + rand() * 10; g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 1, 2.6, 1.6, 0, 0, 7); g.fill(); g.fillStyle = DUSK ? '#7a7299' : '#d8d2e2'; g.beginPath(); g.ellipse(x, y, 2.4, 1.6, 0, 0, 7); g.fill(); }
    else if (r < 0.1) { g.strokeStyle = DUSK ? 'rgba(12,4,24,.35)' : 'rgba(40,70,20,.25)'; g.lineWidth = 1; g.beginPath(); let x = X + rand() * P, y = Y + rand() * P; g.moveTo(x, y); for (let s = 0; s < 3; s++) { x += rand() * 8 - 4; y += rand() * 8 - 4; g.lineTo(x, y); } g.stroke(); }
    else if (r < 0.17) { const x = X + 3 + rand() * 10, y = Y + 4 + rand() * 9; g.strokeStyle = DUSK ? '#3fb3a8' : '#4f9e33'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x, y + 1); g.lineTo(x + 3, y - 3); g.moveTo(x, y + 1); g.lineTo(x, y - 4); g.stroke(); }
    else if (r < 0.2) {
      const x = X + 4 + rand() * 8, y = Y + 4 + rand() * 8;
      if (DUSK) { if (rand() < 0.6) continue; g.save(); g.translate(x, y); g.rotate(rand() * 3); g.scale(0.75, 0.75); g.globalAlpha = 0.7; g.fillStyle = '#e9e3f2'; g.fillRect(-3.5, -0.8, 7, 1.6); dot(-3.6, -1, 1.3, '#e9e3f2'); dot(-3.6, 1, 1.3, '#e9e3f2'); dot(3.6, -1, 1.3, '#e9e3f2'); dot(3.6, 1, 1.3, '#e9e3f2'); g.globalAlpha = 1; g.restore(); }
      else { const c = ['#fff6a8', '#ff9fd0', '#ffffff'][ri(0, 2)]; for (let k = 0; k < 4; k++) dot(x + Math.cos(k * 1.57) * 1.6, y + Math.sin(k * 1.57) * 1.6, 1.3, c); dot(x, y, 1, '#ffb000'); }
    }
  }
  // soft contact shadow round the base of walls / props
  g.fillStyle = 'rgba(10,0,25,.18)';
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = type[idx(i, j)]; if (t === T.WALL || t === T.CRATE || t === T.BOX) g.fillRect(i * P - 2, j * P + 2, P + 4, P + 3); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gg = new THREE.PlaneGeometry(N * CELL, N * CELL); gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ map: tex })); scene.add(ground);
  const sg = new THREE.PlaneGeometry(2000, 2000); sg.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: TH.sea })); sea.position.y = -0.6; scene.add(sea);

  // ---------- grass: blade clumps with wind sway; blades near the player go see-through while they hide inside ----------
  const bushU = { uT: { value: 0 }, uP: { value: new THREE.Vector2(9999, 9999) }, uIn: { value: 0 } };
  const SWAY = `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
 mvPosition = instanceMatrix * mvPosition; vec2 bo = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
 vec2 bo = vec2(0.0);
#endif
 vBD = distance(bo, uP); float hg = max(0.0, mvPosition.y);
 float sw = (sin(uT * 1.8 + mvPosition.x * 0.55 + mvPosition.z * 0.35) * 0.07 + sin(uT * 7.0 + mvPosition.x * 3.0) * 0.06 * smoothstep(2.0, 0.5, vBD)) * hg;
 mvPosition.x += sw; mvPosition.z += sw * 0.5;
 mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`;
  const DITHER = `if (uIn > 0.5 && vBD < 2.5) { if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0 || vBD < 1.2 && mod(floor(gl_FragCoord.y), 2.0) < 1.0) discard; }`;
  const bushMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  bushMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bushU);
    sh.vertexShader = 'uniform float uT; uniform vec2 uP; varying float vBD;\n' + sh.vertexShader.replace('#include <project_vertex>', SWAY);
    sh.fragmentShader = 'uniform float uIn; varying float vBD;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', DITHER + '\n#include <clipping_planes_fragment>');
  };
  bushMat.customProgramCacheKey = () => 'bushSway';
  const bushOut = new THREE.ShaderMaterial({
    uniforms: { ...bushU, w: { value: 0.022 }, c: { value: new THREE.Color(DUSK ? 0x123a40 : 0x1d4a16) } }, side: THREE.BackSide,
    vertexShader: `uniform float uT; uniform vec2 uP; uniform float w; varying float vBD;
void main(){ vec3 transformed = position + normalize(normal) * w; ${SWAY} }`,
    fragmentShader: `uniform vec3 c; uniform float uIn; varying float vBD; void main(){ if (uIn > 0.5 && vBD < 2.5) discard; gl_FragColor = vec4(c, 1.0); }`,
  });
  bushOut.defines = {}; // instancing define comes from the InstancedMesh

  // ---------- prop geometries ----------
  const RND = (a, b) => a + rand() * (b - a);
  // rounded box (smooth normals) for chunky toy-like props
  const RBX = (w, h, d, r, seg = 2) => { const gq = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = gq.attributes.position, n = gq.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3(); const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z))); const nn = v.clone().sub(c).normalize(); v.copy(c).addScaledVector(nn, r); p.setXYZ(i, v.x, v.y, v.z); n.setXYZ(i, nn.x, nn.y, nn.z); } return gq; };
  // vertical shade: darker at the foot, full colour at the top (fake ambient occlusion baked into vertex colours)
  const vshade = (geo, y0, y1, lo = 0.72) => { const p = geo.attributes.position, c = geo.attributes.color; for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))), k = lo + (1 - lo) * t; c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } return geo; };
  // walls: chamfered block + overhanging cap so the edges read soft, one staggered seam, light top plate; the outline hull skips the details
  const OCT = (w, h, c) => { const sh = new THREE.Shape(), a = w / 2 - c, H = w / 2; sh.moveTo(a, H); sh.lineTo(H, a); sh.lineTo(H, -a); sh.lineTo(a, -H); sh.lineTo(-a, -H); sh.lineTo(-H, -a); sh.lineTo(-H, a); sh.lineTo(-a, H); sh.closePath(); const gq = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); gq.rotateX(-Math.PI / 2); gq.translate(0, -h / 2, 0); gq.deleteAttribute('uv'); return gq; };
  const wallB = new Builder()
    .add(new THREE.BoxGeometry(CELL, 0.2, CELL), M(0, 0.1, 0), 0x8a8a96)                             // plinth
    .add(OCT(CELL * 0.95, 1.36, 0.13), M(0, 0.86, 0), 0xdcdce4)                                        // block with chamfered corners
    .add(new THREE.BoxGeometry(CELL * 0.04, 0.5, CELL * 0.955), M(CELL * 0.2, 0.55, 0), 0xaaaab8, true)  // brick seam
    .add(OCT(CELL * 1.0, 0.26, 0.15), M(0, 1.6, 0), 0xf4f4fa)                                          // cap slab
    .add(new THREE.CircleGeometry(CELL * 0.4, 8).rotateX(-Math.PI / 2), M(0, 1.735, 0), 0xffffff, true); // top plate
  const wallGeo = wallB.build(); vshade(wallGeo, 0, 1.75, 0.66);
  const crateGeo = new Builder().add(new THREE.BoxGeometry(1.25, 1.1, 1.25), M(0, 0.55, 0), TH.crate[0])
    .add(new THREE.BoxGeometry(1.29, 0.14, 1.29), M(0, 0.2, 0), TH.crate[1]).add(new THREE.BoxGeometry(1.29, 0.14, 1.29), M(0, 0.9, 0), TH.crate[1])
    .add(new THREE.BoxGeometry(0.16, 0.9, 1.28), M(0, 0.55, 0, 0, 0, 0.78), TH.crate[1]).add(new THREE.BoxGeometry(1.28, 0.9, 0.16), M(0, 0.55, 0, 0.78), TH.crate[1]).build();
  const barrelGeo = new Builder().add(new THREE.CylinderGeometry(0.5, 0.46, 1.05, 10), M(0, 0.53, 0), 0xb4723f)
    .add(new THREE.CylinderGeometry(0.53, 0.53, 0.1, 10), M(0, 0.25, 0), 0x5a4a5e).add(new THREE.CylinderGeometry(0.53, 0.53, 0.1, 10), M(0, 0.82, 0), 0x5a4a5e)
    .add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), M(0, 1.06, 0), 0xd49560).build();
  const stumpGeo = new Builder().add(new THREE.CylinderGeometry(0.5, 0.6, 0.85, 10), M(0, 0.43, 0), 0x7d4f36)
    .add(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 10), M(0, 0.87, 0), 0xdcae72).add(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), M(0, 0.89, 0), 0x3a2333)
    .add(new THREE.BoxGeometry(0.22, 0.2, 0.5), M(0.5, 0.1, 0.1, 0, 0.4, 0), 0x6a412c).add(new THREE.BoxGeometry(0.22, 0.2, 0.5), M(-0.45, 0.1, -0.2, 0, -0.9, 0), 0x6a412c)
    .add(new THREE.BoxGeometry(0.22, 0.2, 0.45), M(0, 0.1, -0.52, 0, 0.1, 0), 0x6a412c).build();
  const boxGeo = new Builder().add(new THREE.BoxGeometry(1.35, 1.25, 1.35), M(0, 0.63, 0), 0x5b2c83)
    .add(new THREE.BoxGeometry(1.4, 0.16, 1.4), M(0, 1.2, 0), 0xffc43d).add(new THREE.BoxGeometry(1.4, 0.16, 1.4), M(0, 0.1, 0), 0xffc43d)
    .add(new THREE.OctahedronGeometry(0.32), M(0, 1.45, 0, 0, 0, 0, 1, 1.3, 1), 0xff8a1f)
    .add(new THREE.OctahedronGeometry(0.17, 0), M(0, 0.66, 0.7, 0, 0, 0, 1, 1.25, 0.5), 0x9dff4a, true).add(new THREE.OctahedronGeometry(0.17, 0), M(0, 0.66, -0.7, 0, 0, 0, 1, 1.25, 0.5), 0x9dff4a, true)
    .add(new THREE.OctahedronGeometry(0.17, 0), M(0.7, 0.66, 0, 0, 0, 0, 0.5, 1.25, 1), 0x9dff4a, true).add(new THREE.OctahedronGeometry(0.17, 0), M(-0.7, 0.66, 0, 0, 0, 0, 0.5, 1.25, 1), 0x9dff4a, true).build();
  for (const [gq, h] of [[crateGeo, 1.1], [barrelGeo, 1.08], [stumpGeo, 0.9], [boxGeo, 1.3]]) vshade(gq, 0, h, 0.74);
  // grass clump: dark mound + ~16 tapered blades, shaded darker at the root (vertex colours are greys, the instance colour gives the hue)
  const bb = new Builder(); bb.add(new THREE.IcosahedronGeometry(0.62, 0), M(0, 0.18, 0, 0, 0, 0, 1.25, 0.55, 1.25), 0x8a8a8a);
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 * 3 + RND(-0.2, 0.2), d = k < 6 ? RND(0, 0.25) : RND(0.25, 0.7), hgt = RND(0.8, 1.2), tilt = 0.1 + d * 0.4; bb.add(new THREE.ConeGeometry(0.1, hgt, 3, 1, true), M(Math.cos(a) * d, hgt / 2, Math.sin(a) * d, Math.sin(a) * tilt, RND(0, 3), -Math.cos(a) * tilt, 1, 1, 0.55), 0xffffff, k < 6 || k % 3 !== 0); } // only every 3rd outer blade gets an outline
  const bushGeo = bb.build(); { const p = bushGeo.attributes.position, c = bushGeo.attributes.color; for (let i = 0; i < p.count; i++) { const k = 0.6 + 0.4 * Math.min(1, Math.max(0, p.getY(i) / 1.1)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } }
  const GEOS = { '1': [wallGeo, 0.05], '2a': [crateGeo, 0.05], '2b': [barrelGeo, 0.05], '2c': [stumpGeo, 0.05], '3': [boxGeo, 0.05], '4': [bushGeo, 0.035] };
  const vari = (i, j) => DUSK ? 'abc'[(i * 7 + j * 13) % 3] : 'aab'[(i * 7 + j * 13) % 3];
  const gk = (i, j, t) => t === T.CRATE ? '2' + vari(i, j) : '' + t;

  // ---------- instanced props, chunked so off-screen ones are frustum-culled ----------
  const CH = 24, NC = N / CH;
  const keyOf = (i, j, t) => gk(i, j, t) + ':' + (t === T.CRATE || t === T.BOX ? 'all' : ((j / CH) | 0) * NC + ((i / CH) | 0)); // small props: one batch each (fewer draw calls)
  const counts = {}; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = type[idx(i, j)]; if (t >= 1 && t <= 4) { const k = keyOf(i, j, t); counts[k] = (counts[k] || 0) + 1; } }
  const I = {};
  const mk = (key) => { const gkey = key.split(':')[0], n = counts[key], [geo, ow] = GEOS[gkey], bush = gkey === '4'; const m = new THREE.InstancedMesh(geo, bush ? bushMat : vcMat(), n); scene.add(m); const o = new THREE.InstancedMesh(geo.userData.outline || geo, bush ? bushOut : outlineMat(ow), n); o.renderOrder = -1; scene.add(o); if (bush) { m.frustumCulled = o.frustumCulled = true; } return { m, o, n: 0 }; };
  for (const k in counts) I[k] = mk(k);
  const inst = new Int32Array(N * N).fill(-1);
  const wallCols = TH.walls.map(c => new THREE.Color(c)), classicCols = TH.wallsC.map(c => new THREE.Color(c));
  const tmpC = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q = idx(i, j), t = type[q]; if (t < 1 || t > 4) continue; const e = I[keyOf(i, j, t)], k = e.n++;
    let mat;
    if (t === T.BUSH) { const s = 1.05 + rand() * 0.15; mat = M(wx(i), 0, wx(j), 0, rand() * 6, 0, s, (classic ? 1.05 : 0.95) + rand() * 0.25, s); tmpC.setHSL(TH.bushH[0] + rand() * TH.bushH[1], TH.bushS, TH.bushL[0] + rand() * TH.bushL[1]); e.m.setColorAt(k, tmpC); }
    else if (t === T.CRATE) mat = M(wx(i), 0, wx(j), 0, vari(i, j) === 'a' ? 0 : rand() * 6, 0);
    else { mat = M(wx(i), 0, wx(j)); if (t === T.WALL) e.m.setColorAt(k, classic ? classicCols[wcol[q] % classicCols.length] : wallCols[(Math.floor(i / 4) + Math.floor(j / 4) * 3) % wallCols.length]); }
    e.m.setMatrixAt(k, mat); e.o.setMatrixAt(k, mat); inst[q] = k;
  }
  for (const e of Object.values(I)) { e.m.instanceMatrix.needsUpdate = true; if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true; e.o.instanceMatrix.needsUpdate = true; e.m.computeBoundingSphere(); e.o.computeBoundingSphere(); }

  // ---------- small 3D ground decor (grass tufts, pebbles), merged per chunk, children of the ground so cleanup drops them ----------
  const dB = {};
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (type[idx(i, j)] !== T.G) continue; const r = rand(); if (r > 0.16) continue;
    const ck = ((j / CH) | 0) * NC + ((i / CH) | 0), B = dB[ck] || (dB[ck] = new Builder()), x = wx(i) + RND(-0.55, 0.55), z = wx(j) + RND(-0.55, 0.55);
    if (r < 0.1) { const c = TH.tuft[ri(0, 2)]; for (let k = 0; k < 4; k++) { const a = k * 1.6 + RND(-0.3, 0.3), hh = RND(0.22, 0.38); B.add(new THREE.ConeGeometry(0.06, hh, 3, 1, true), M(x + Math.cos(a) * 0.06, hh / 2, z + Math.sin(a) * 0.06, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), c); } }
    else if (r < 0.14) { const s = RND(0.07, 0.13); B.add(new THREE.OctahedronGeometry(1, 0), M(x, s * 0.35, z, 0, RND(0, 3), 0, s * 1.2, s * 0.6, s), TH.pebble[ri(0, 2)]); }
    else if (!DUSK) { // little flower clusters on the meadow
      for (let k = 0; k < 2; k++) { const fx2 = x + RND(-0.25, 0.25), fz = z + RND(-0.25, 0.25), hh = RND(0.16, 0.26), c = [0xfff6a8, 0xff9fd0, 0xffffff, 0xb9a6ff][ri(0, 3)];
        B.add(new THREE.ConeGeometry(0.025, hh, 3, 1, true), M(fx2, hh / 2, fz), 0x4f9e33).add(new THREE.OctahedronGeometry(0.075, 0), M(fx2, hh, fz, 0, RND(0, 3), 0, 1.3, 0.45, 1.3), c); }
    } else { // glowing toadstools in the swamp
      for (let k = 0, n = 1 + (rand() < 0.5); k < n; k++) { const mx = x + RND(-0.25, 0.25), mz = z + RND(-0.25, 0.25), s = RND(0.7, 1.2), c = [0x5ff7e0, 0xff7ad9, 0xc9a2ff][ri(0, 2)];
        B.add(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.2 * s, 5, 1, true), M(mx, 0.1 * s, mz), 0xe9e3f2).add(new THREE.ConeGeometry(0.12 * s, 0.1 * s, 6, 1, true), M(mx, 0.24 * s, mz), c); }
    }
  }
  // water edge life: reeds / cattails on pond rims, lily pads on open ponds, rocks (meadow) or dead snags (swamp) along the outer shore
  const isWt = (i, j) => inb(i, j) && type[idx(i, j)] === T.WATER, landN = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(i + a, j + b) && type[idx(i + a, j + b)] !== T.WATER);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    if (!isWt(i, j)) continue; const vd = isVoid(i, j), edge = landN(i, j); if (vd && !edge) continue; const r = rand();
    const ck = ((j / CH) | 0) * NC + ((i / CH) | 0), B = dB[ck] || (dB[ck] = new Builder()), x = wx(i) + RND(-0.35, 0.35), z = wx(j) + RND(-0.35, 0.35);
    if (!vd && edge && r < 0.3) { for (let k = 0; k < 2; k++) { const rx2 = x + RND(-0.3, 0.3), rz = z + RND(-0.3, 0.3), hh = RND(0.5, 0.85), tl = RND(-0.15, 0.15); B.add(new THREE.ConeGeometry(0.03, hh, 3, 1, true), M(rx2, hh / 2, rz, tl, 0, tl), DUSK ? 0x2f9a96 : 0x5fa83a); if (k < 1) B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 4, 1, true), M(rx2 + tl * hh * 0.5, hh * 0.8, rz - tl * hh * 0.5, tl, 0, tl), DUSK ? 0x5a3d6a : 0x8a5a2b); } }
    else if (!vd && !edge && r < 0.22) { const s = RND(0.22, 0.34); B.add(new THREE.CircleGeometry(s, 7, 0.5, Math.PI * 1.75).rotateX(-Math.PI / 2), M(x, 0.03, z, 0, RND(0, 6), 0), DUSK ? 0x3c8f4a : 0x4fb83a); if (rand() < 0.3) B.add(new THREE.OctahedronGeometry(0.08, 0), M(x, 0.08, z, 0, 0, 0, 1.2, 0.7, 1.2), DUSK ? 0xff7ad9 : 0xffb3da); }
    else if (vd && r < 0.16) {
      if (!DUSK) { const s = RND(0.25, 0.5); B.add(new THREE.IcosahedronGeometry(s, 0), M(x, s * 0.2, z, RND(0, 3), RND(0, 3), 0, 1.2, 0.7, 1), 0xb9b2c4); }
      else { const hh = RND(0.6, 1.1); B.add(new THREE.CylinderGeometry(0.04, 0.1, hh, 5, 1, true), M(x, hh / 2 - 0.1, z, RND(-0.3, 0.3), 0, RND(-0.3, 0.3)), 0x3a2c4a).add(new THREE.CylinderGeometry(0.02, 0.04, hh * 0.4, 4, 1, true), M(x + 0.12, hh * 0.7, z, 0, 0, -0.9), 0x3a2c4a); }
    }
  }
  for (const ck in dB) ground.add(new THREE.Mesh(dB[ck].build(), vcMat()));

  // minimap base
  const mm = document.createElement('canvas'); mm.width = mm.height = N; const mg = mm.getContext('2d');
  const mcol = TH.mm;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const t = type[idx(i, j)]; mg.fillStyle = t === 0 ? mcol.g[biome[idx(i, j)]] : t === T.WATER && isVoid(i, j) ? mcol.v : mcol[t]; mg.fillRect(i, j, 1, 1); }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const W = {
    type, hp, inst, I, mm, mg, ground, sea, bushU, map: MAP, mapName: MAPS[MAP].name, bg: TH.sea,
    light: DUSK ? { sky: 0xe0d2ff, gnd: 0x4a3a6a, hi: 1.45, sun: 0xffd6ec, si: 1.9 } : { sky: 0xffffff, gnd: 0x8a9ab0, hi: 1.5, sun: 0xfff3dc, si: 2.05 },
    at: (x, z) => { const i = cx(x), j = cz(z); return inb(i, j) ? type[idx(i, j)] : T.WATER; },
    idx, inb,
    remove(i, j) { const q = idx(i, j), t = type[q], e = I[keyOf(i, j, t)]; if (!e) return; const k = inst[q]; if (k >= 0) { e.m.setMatrixAt(k, zero); e.m.instanceMatrix.needsUpdate = true; if (e.o) { e.o.setMatrixAt(k, zero); e.o.instanceMatrix.needsUpdate = true; } } type[q] = T.G; inst[q] = -1; mg.fillStyle = mcol.g[biome[q]]; mg.fillRect(i, j, 1, 1); },
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
