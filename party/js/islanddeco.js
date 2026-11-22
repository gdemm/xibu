// 港口岛 detail pass: purely decorative geometry (no collision, no nav changes) layered over buildIsland().
// Grass tufts, flowers, pebbles, bushes, tree variety, picket fences, window / door / roof trims, barrels,
// street lamps, road markings, beach umbrellas and a foam line where the sea meets the beach.
// Perf: everything is merged into vertex-coloured meshes bucketed on a 4x4 grid (frustum culling per bucket),
// two materials (solid + double-sided grass) plus one for road paint and one for foam: <= ~36 draw calls total,
// usually 10-16 on screen. No textures. Uses its own seeded rng, so the map layout / loot rng is untouched.
import * as THREE from 'three';

let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const rr = (a, b) => a + rnd() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => _m.clone().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

// geometry bucket: positions / normals / colours of non-indexed triangles
class Bucket {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(geo, m, color, color2 = null, y0 = 0, y1 = 1) {   // color2: vertical gradient (local y0 -> y1 goes color -> color2)
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const P0 = g.attributes.position;
    const ys = color2 ? Array.from({ length: P0.count }, (_, i) => P0.getY(i)) : null;
    g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal;
    _c.setHex(color); if (color2 != null) _c2.setHex(color2);
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      if (ys) { const k = Math.min(1, Math.max(0, (ys[i] - y0) / (y1 - y0))); this.c.push(_c.r + (_c2.r - _c.r) * k, _c.g + (_c2.g - _c.g) * k, _c.b + (_c2.b - _c.b) * k); }
      else this.c.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
  }
  mesh(mat) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); return m;
  }
  get tris() { return this.p.length / 9; }
}
class Grid {   // buckets keyed by 70 m cells
  constructor(half, n = 4) { this.half = half; this.n = n; this.cells = new Map(); }
  at(x, z) {
    const n = this.n, s = (this.half * 2) / n;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x + this.half) / s))), j = Math.max(0, Math.min(n - 1, Math.floor((z + this.half) / s)));
    const k = i * n + j; let b = this.cells.get(k); if (!b) this.cells.set(k, b = new Bucket()); return b;
  }
  build(scene, mat) { let tris = 0, calls = 0; for (const b of this.cells.values()) { tris += b.tris; const m = b.mesh(mat); if (m) { scene.add(m); calls++; } } return { tris, calls }; }
}

// ---------- unit geometries ----------
function bladeTuft() {           // 5 thin blades fanned around Y, height 1
  const pos = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + (i % 2) * 0.4, ca = Math.cos(a), sa = Math.sin(a), w = 0.07, lean = 0.28 + (i % 3) * 0.08;
    const bx = ca * 0.05, bz = sa * 0.05;
    pos.push(bx - sa * w, 0, bz + ca * w, bx + sa * w, 0, bz - ca * w, bx + ca * lean, 1 - (i % 2) * 0.25, bz + sa * lean);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  // grass lit from above: point the normals up so both faces shade like the ground
  const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
  return g;
}
const TUFT = bladeTuft();
const STEM = new THREE.CylinderGeometry(0.012, 0.012, 1, 3, 1, true);
const PETALS = new THREE.OctahedronGeometry(1, 0);
const PEBBLE = new THREE.IcosahedronGeometry(1, 0);
const BUSH = new THREE.IcosahedronGeometry(1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL10 = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE7 = new THREE.ConeGeometry(1, 1, 7);
const WEDGES = Array.from({ length: 8 }, (_, k) => new THREE.ConeGeometry(1, 1, 2, 1, true, k * Math.PI / 4, Math.PI / 4));   // umbrella canopy panels
const ICO = new THREE.IcosahedronGeometry(1, 0);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const FLOWER_COLS = [0xffffff, 0xffe14d, 0xff7aa8, 0xb58cff, 0xff8a3d, 0x7ad7ff];
const LEAF_COLS = [0x3fb54a, 0x4cc44f, 0x2f9e45, 0x5fcf52, 0x7fd34e];
const ROUND_COLS = [0x7fd34e, 0x9bdc4c, 0x66c95a, 0xb7e05a];
const AUTUMN = [0xffa63d, 0xff7b4a, 0xffd04d];
const BARREL_COLS = [0xe8463c, 0x2f7fe0, 0x35b06a, 0xf2b33a];
const SHUTTER_COLS = [0x3f8fd6, 0x2ea86a, 0xe0574f, 0x8a63d2];
const UMB_COLS = [[0xff4d6d, 0xffffff], [0x2ec4b6, 0xffffff], [0xffbe0b, 0xff6b35], [0x3a86ff, 0xffe14d]];

export function decorateIsland(scene, { solids, HALF, BLD, TREES, FENCES, ROADS, quality }) {
  seed = 4242;
  const q = quality === 'low' ? 0.35 : quality === 'mid' ? 0.75 : 1;
  const solid = new Grid(HALF + 20), grass = new Grid(HALF + 20), paint = new Bucket();
  const S = (x, z) => solid.at(x, z), Gr = (x, z) => grass.at(x, z);
  const blockedAt = (x, z, r) => solids.some(b => b.max.y > 0.05 && x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z);
  const onRoad = (x, z, pad = 0.6) => ROADS.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  const inField = (x, z) => Math.abs(x) < HALF - 13 && Math.abs(z) < HALF - 13;          // the grass plane (sand beyond)
  const stat = {}; const tot = () => { let n = 0; for (const g of [solid, grass]) for (const b of g.cells.values()) n += b.tris; return n; }; let last = 0; const mark = (k) => { const n = tot(); stat[k] = Math.round(n - last); last = n; };

  // ---------- trees: two-tier pines and clustered round crowns, varied size / colour ----------
  for (const t of TREES) {
    const k = rr(0.8, 1.2), y = 0;
    if (t.cone) {
      const c = LEAF_COLS[(rnd() * LEAF_COLS.length) | 0], c2 = new THREE.Color(c).multiplyScalar(0.78).getHex();
      S(t.x, t.z).add(CONE7, mat4(t.x, y + 4.2 * k, t.z, 0, rnd() * 6, 0, 2.4 * k, 3.6 * k, 2.4 * k), c2);
      S(t.x, t.z).add(CONE7, mat4(t.x, y + 6.0 * k, t.z, 0, rnd() * 6, 0, 1.75 * k, 3.0 * k, 1.75 * k), c);
      S(t.x, t.z).add(CONE7, mat4(t.x, y + 7.4 * k, t.z, 0, rnd() * 6, 0, 1.0 * k, 1.8 * k, 1.0 * k), new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.12).getHex());
    } else {
      const pal = rnd() < 0.12 ? AUTUMN : ROUND_COLS, c = pal[(rnd() * pal.length) | 0];
      S(t.x, t.z).add(ICO, mat4(t.x, 4.4 * k, t.z, rnd(), rnd() * 6, 0, 2.3 * k, 2.0 * k, 2.3 * k), c);
      for (let i = 0; i < 2; i++) { const a = rnd() * 6.28, d = 1.3 * k; S(t.x, t.z).add(ICO, mat4(t.x + Math.cos(a) * d, (3.9 + rnd() * 1.2) * k, t.z + Math.sin(a) * d, rnd(), rnd() * 6, 0, 1.3 * k, 1.2 * k, 1.3 * k), new THREE.Color(c).multiplyScalar(0.85 + rnd() * 0.25).getHex()); }
    }
    // roots / base tufts
    for (let i = 0; i < 3 * q; i++) { const a = rnd() * 6.28, d = rr(0.5, 1.0); Gr(t.x, t.z).add(TUFT, mat4(t.x + Math.cos(a) * d, 0, t.z + Math.sin(a) * d, 0, rnd() * 6, 0, 0.3, rr(0.25, 0.4), 0.3), 0x3f8f2e, 0x8fd65a); }
  }

  mark('trees');
  // ---------- ground scatter: tufts, flowers, pebbles, bushes ----------
  const nTuft = Math.round(2600 * q), nFlower = Math.round(110 * q), nPebble = Math.round(220 * q);
  let placed = 0;
  for (let i = 0; i < nTuft * 2 && placed < nTuft; i++) {
    const x = rr(-HALF + 10, HALF - 10), z = rr(-HALF + 10, HALF - 10);
    if (onRoad(x, z) || blockedAt(x, z, 0.3)) continue;
    const h = rr(0.26, 0.46), w = rr(0.32, 0.46);
    const sand = !inField(x, z);
    Gr(x, z).add(TUFT, mat4(x, 0, z, 0, rnd() * 6.28, 0, w, h, w), sand ? 0x9cb653 : 0x5cb840, sand ? 0xd5e08a : (rnd() < 0.5 ? 0xb5ec6a : 0x9fe35c));
    placed++;
  }
  stat.tufts = placed;
  for (let i = 0; i < nFlower; i++) {   // little patches of 3-6 flowers of one colour
    const cx = rr(-HALF + 14, HALF - 14), cz = rr(-HALF + 14, HALF - 14); if (onRoad(cx, cz, 2) || blockedAt(cx, cz, 1.5)) continue;
    const col = FLOWER_COLS[(rnd() * FLOWER_COLS.length) | 0], n = 3 + ((rnd() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + rr(-0.9, 0.9), z = cz + rr(-0.9, 0.9), h = rr(0.22, 0.38);
      Gr(x, z).add(STEM, mat4(x, h / 2, z, 0, 0, 0, 1, h, 1), 0x3f9b3a);
      S(x, z).add(PETALS, mat4(x, h, z, 0, rnd() * 6, 0, 0.075, 0.03, 0.075), col);
      S(x, z).add(PETALS, mat4(x, h + 0.015, z, 0, 0, 0, 0.025, 0.02, 0.025), col === 0xffe14d ? 0xff8a3d : 0xffe14d);
    }
  }
  for (let i = 0; i < nPebble; i++) {
    const x = rr(-HALF + 4, HALF - 4), z = rr(-HALF + 4, HALF - 4); if (onRoad(x, z, 0.2) || blockedAt(x, z, 0.4)) continue;
    const s = rr(0.08, 0.22), g = 0x9a958c + (((rnd() * 3) | 0) * 0x080808);
    S(x, z).add(PEBBLE, mat4(x, s * 0.25, z, rnd(), rnd() * 6, rnd(), s * rr(1, 1.6), s * 0.6, s), g);
  }
  mark('scatter');
  seed = 9009;   // each section has its own sequence, so quality (scatter counts) never moves buildings / props
  // low bushes hugging tree trunks and rocks (never taller than 0.75 m: they never hide a standing player)
  for (const t of TREES) {
    if (rnd() > 0.35 * q + 0.1) continue;
    const a = rnd() * 6.28, d = rr(1.1, 1.6), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d; if (onRoad(x, z, 0.4) || blockedAt(x, z, 0.5)) continue;
    const c = [0x3c9e3f, 0x4cb24a, 0x2f8d3c][(rnd() * 3) | 0];
    for (let k = 0; k < 3; k++) S(x, z).add(BUSH, mat4(x + rr(-0.4, 0.4), 0.3, z + rr(-0.4, 0.4), rnd(), rnd() * 6, 0, rr(0.4, 0.6), rr(0.35, 0.45), rr(0.4, 0.6)), new THREE.Color(c).multiplyScalar(0.9 + rnd() * 0.2).getHex());
  }

  mark('bushes');
  seed = 3003;   // each section has its own sequence, so quality (scatter counts) never moves buildings / props
  // ---------- picket fences (the collision boxes stay exactly as they were) ----------
  for (const [x0, z0, x1, z1] of FENCES) {
    const zc = (z0 + z1) / 2, B = S((x0 + x1) / 2, zc);
    for (let x = x0 + 0.1; x <= x1 - 0.05; x += 0.3) { B.add(BOX, mat4(x, 0.5, zc, 0, 0, 0, 0.12, 1.0, 0.06), 0xffffff); B.add(BOX, mat4(x, 1.02, zc, 0, Math.PI / 4, 0, 0.085, 0.085, 0.085), 0xffffff); }
    for (const y of [0.32, 0.78]) B.add(BOX, mat4((x0 + x1) / 2, y, zc + 0.05, 0, 0, 0, x1 - x0, 0.09, 0.04), 0xe8e2d6);
    for (const x of [x0 + 0.05, x1 - 0.05]) B.add(BOX, mat4(x, 0.58, zc, 0, 0, 0, 0.16, 1.16, 0.16), 0xf4efe6);
  }

  mark('fences');
  seed = 5005;   // each section has its own sequence, so quality (scatter counts) never moves buildings / props
  // ---------- buildings: windows, door frames, roof fascia, plinth, corner posts, barrels ----------
  for (const b of BLD) {
    const { x0, x1, z0, z1, h, t, door, metal } = b, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, B = S(cx, cz);
    const frame = metal ? 0x3d4a57 : 0xffffff, glass = metal ? 0x5d86a8 : 0x4f7fa8, trim = metal ? 0x2b5f9e : 0xffffff;
    const plinth = metal ? 0x5b6470 : 0xa88a6a, post = metal ? 0x7b8794 : 0xd9c6a5;
    const shut = SHUTTER_COLS[(rnd() * SHUTTER_COLS.length) | 0];
    // walls: [axis, fixed coord, from, to, gaps, outward sign]
    const walls = [['x', z0, x0, x1, b.n, -1], ['x', z1, x0, x1, b.s, 1], ['z', x0, z0, z1, b.w, -1], ['z', x1, z0, z1, b.e, 1]];
    const put = (ax, fixed, along, y, sx, sy, depth, out, col) => {   // box on a wall: along-wall pos, centre height, size, depth, offset outward
      if (ax === 'x') B.add(BOX, mat4(along, y, fixed + out, 0, 0, 0, sx, sy, depth), col);
      else B.add(BOX, mat4(fixed + out, y, along, 0, 0, 0, depth, sy, sx), col);
    };
    for (const [ax, fixed, a0, a1, gaps, sg] of walls) {
      const nearGap = (p, r) => gaps.some(g => Math.abs(p - g) < door / 2 + r);
      // windows
      const ww = metal ? 2.4 : 1.1, wh = metal ? 0.9 : 1.0, wy = metal ? h - 1.9 : 1.75, step = metal ? 5 : 3;
      for (let p = a0 + (metal ? 3 : 1.9); p <= a1 - (metal ? 3 : 1.9); p += step) {
        if (nearGap(p, ww / 2 + 0.6)) continue;
        const fo = sg * (t / 2 + 0.015);
        put(ax, fixed, p, wy, ww + 0.22, wh + 0.22, 0.03, fo, frame);                          // frame plate (outside)
        put(ax, fixed, p, wy, ww, wh, t + 0.1, 0, glass);                                      // pane, through the wall: shows inside too
        put(ax, fixed, p, wy, 0.07, wh, 0.04, sg * (t / 2 + 0.06), frame);                     // mullion
        if (!metal) put(ax, fixed, p, wy, ww, 0.07, 0.04, sg * (t / 2 + 0.06), frame);
        const o = sg * (t / 2 + 0.09);
        if (!metal) {
          put(ax, fixed, p, wy - wh / 2 - 0.13, ww + 0.3, 0.08, 0.18, o, 0xf4efe6);                                   // sill
          for (const s of [-1, 1]) put(ax, fixed, p + s * (ww / 2 + 0.32), wy, 0.42, wh + 0.1, 0.05, sg * (t / 2 + 0.04), shut);   // shutters
          if (rnd() < 0.5) {   // flower box
            put(ax, fixed, p, wy - wh / 2 - 0.3, ww * 0.9, 0.24, 0.26, sg * (t / 2 + 0.15), 0x9a6438);
            for (let f = -2; f <= 2; f++) { const fp = p + f * ww * 0.18, fo = sg * (t / 2 + 0.15), fc = FLOWER_COLS[(rnd() * FLOWER_COLS.length) | 0]; if (ax === 'x') B.add(PETALS, mat4(fp, wy - wh / 2 - 0.12, fixed + fo, 0, rnd() * 3, 0, 0.09, 0.07, 0.09), fc); else B.add(PETALS, mat4(fixed + fo, wy - wh / 2 - 0.12, fp, 0, rnd() * 3, 0, 0.09, 0.07, 0.09), fc); }
          }
        }
      }
      // door frames (sit on the wall either side of the gap, never narrow it) + a little step / mat outside
      for (const g of gaps) {
        const dc = metal ? 0xffc23a : 0x8a5a3a;
        for (const s of [-1, 1]) put(ax, fixed, g + s * (door / 2 + 0.07), 1.33, 0.2, 2.66, t + 0.12, 0, dc);   // overhangs the gap 3 cm so no face sits on the wall's end face
        put(ax, fixed, g, 2.71, door + 0.4, 0.26, t + 0.17, 0, dc);   // deeper than the jambs: no coplanar faces
        put(ax, fixed, g, 0.012, door * 0.8, 0.025, 0.9, sg * (t / 2 + 0.5), metal ? 0x4a4f57 : 0xc0563f);
        if (metal) for (let k = -2; k <= 2; k++) put(ax, fixed, g + k * door * 0.2, 2.71, door * 0.1, 0.27, t + 0.22, 0, 0x222222);   // hazard stripes
      }
      // plinth along the wall, split at the doors (outside face only)
      const cuts = [a0 - 0.3, ...gaps.slice().sort((a, c) => a - c).flatMap(g => [g - door / 2 - 0.18, g + door / 2 + 0.18]), a1 + 0.3];
      for (let i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.05) put(ax, fixed, (cuts[i] + cuts[i + 1]) / 2, 0.2, cuts[i + 1] - cuts[i], 0.4, 0.06, sg * (t / 2 + 0.03), plinth);
      // roof fascia band (covers the roof slab's edge)
      put(ax, fixed, (a0 + a1) / 2, h + 0.22, a1 - a0 + 0.76, 0.5, 0.08, sg * 0.34, trim);
      if (metal) put(ax, fixed, (a0 + a1) / 2, h - 0.35, a1 - a0, 0.12, 0.08, sg * (t / 2 + 0.04), 0x2b5f9e);   // stripe under the eaves
    }
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.add(BOX, mat4(px, h / 2, pz, 0, 0, 0, t + 0.16, h, t + 0.16), post);
    // a cluster of barrels against a door-less stretch of wall (decor only, half a metre deep)
    const tries = metal ? 3 : 1;
    for (let k = 0; k < tries; k++) {
      const [ax, fixed, a0, a1, gaps, sg] = walls[(rnd() * 4) | 0];
      const p = rr(a0 + 1.2, a1 - 1.2); if (gaps.some(g => Math.abs(p - g) < door / 2 + 1.6)) continue;
      const n = 1 + ((rnd() * 3) | 0), col = BARREL_COLS[(rnd() * BARREL_COLS.length) | 0];
      for (let i = 0; i < n; i++) {
        const al = p + (i - (n - 1) / 2) * 0.68, off = fixed + sg * (t / 2 + 0.36);
        const x = ax === 'x' ? al : off, z = ax === 'x' ? off : al;
        if (blockedAt(x, z, 0.3)) continue;
        B.add(CYL10, mat4(x, 0.45, z, 0, 0, 0, 0.3, 0.9, 0.3), col);
        for (const y of [0.2, 0.7]) B.add(CYL10, mat4(x, y, z, 0, 0, 0, 0.315, 0.06, 0.315), 0x3a3a3a);
        B.add(CYL10, mat4(x, 0.905, z, 0, 0, 0, 0.26, 0.01, 0.26), new THREE.Color(col).multiplyScalar(0.7).getHex());
      }
    }
  }

  mark('buildings');
  // ---------- street lamps along the two main roads ----------
  for (let d = -120; d <= 120; d += 24) {
    if (Math.abs(d) < 10) continue;
    for (const [x, z, ax] of [[d, 5.6, 'x'], [-5.6, d, 'z']]) {
      if (blockedAt(x, z, 0.5)) continue;
      const B = S(x, z), dir = ax === 'x' ? [0, -1] : [1, 0];
      B.add(CYL8, mat4(x, 0.15, z, 0, 0, 0, 0.2, 0.3, 0.2), 0x3a4048);
      B.add(CYL8, mat4(x, 2.2, z, 0, 0, 0, 0.07, 4.4, 0.07), 0x4a525c);
      B.add(BOX, mat4(x + dir[0] * 0.55, 4.35, z + dir[1] * 0.55, 0, 0, 0, ax === 'z' ? 1.1 : 0.08, 0.08, ax === 'x' ? 1.1 : 0.08), 0x4a525c);
      B.add(BOX, mat4(x + dir[0] * 1.05, 4.25, z + dir[1] * 1.05, 0, 0, 0, 0.36, 0.14, 0.36), 0x4a525c);
      B.add(BOX, mat4(x + dir[0] * 1.05, 4.15, z + dir[1] * 1.05, 0, 0, 0, 0.28, 0.06, 0.28), 0xfff1a8);
    }
  }

  mark('lamps');
  // ---------- road paint: dashed centre line, edge lines, zebra crossings ----------
  const P = (x, z, w, d, col) => paint.add(PLANE, mat4(x, 0.1, z, 0, 0, 0, w, 1, d), col);
  for (const [x0, z0, x1, z1] of ROADS) {
    const horiz = x1 - x0 > z1 - z0, c = horiz ? (z0 + z1) / 2 : (x0 + x1) / 2, a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1, half = horiz ? (z1 - z0) / 2 : (x1 - x0) / 2;
    const self = [x0, z0, x1, z1].join(), cross = (p) => ROADS.some(r => r.join() !== self && (horiz ? p > r[0] - 1.5 && p < r[2] + 1.5 && c > r[1] - 4.5 && c < r[3] + 4.5 : p > r[1] - 1.5 && p < r[3] + 1.5 && c > r[0] - 4.5 && c < r[2] + 4.5));
    for (let p = a0 + 2; p < a1 - 3; p += 6) { if (cross(p) || cross(p + 3)) continue; horiz ? P(p + 1.5, c, 3, 0.28, 0xffd84a) : P(c, p + 1.5, 0.28, 3, 0xffd84a); }
    for (const s of [-1, 1]) for (let p = a0 + 0.5; p < a1 - 0.5; p += 4) { if (cross(p) || cross(p + 4)) continue; const o = c + s * (half - 0.4); horiz ? P(p + 2, o, 4.02, 0.3, 0xf4f4f0) : P(o, p + 2, 0.3, 4.02, 0xf4f4f0); }
  }
  for (const s of [-1, 1]) for (let k = -3; k <= 3; k++) { P(s * 6.2, k * 1.05, 2.4, 0.55, 0xf4f4f0); P(k * 1.05, s * 6.2, 0.55, 2.4, 0xf4f4f0); }

  mark('x');
  seed = 7007;   // each section has its own sequence, so quality (scatter counts) never moves buildings / props
  // ---------- beach: umbrellas + towels; foam line on the water ----------
  for (let i = 0; i < 10; i++) {
    const side = (rnd() * 4) | 0, a = rr(-HALF + 20, HALF - 20), d = rr(HALF - 8, HALF + 6);
    const x = side === 0 ? a : side === 1 ? a : side === 2 ? d : -d, z = side === 0 ? d : side === 1 ? -d : a;
    if (blockedAt(x, z, 2.2) || onRoad(x, z, 2)) continue;
    const [c1, c2] = UMB_COLS[(rnd() * UMB_COLS.length) | 0], B = S(x, z);
    (stat.umbrellas || (stat.umbrellas = [])).push([Math.round(x), Math.round(z)]);
    B.add(CYL8, mat4(x, 1.15, z, 0, 0, -0.12, 0.04, 2.3, 0.04), 0xf4efe6);
    for (let k = 0; k < 8; k++) Gr(x, z).add(WEDGES[k], mat4(x + 0.14, 2.35, z, 0, 0, 0, 1.25, 0.5, 1.25), k % 2 ? c1 : c2);
    B.add(PETALS, mat4(x + 0.14, 2.62, z, 0, 0, 0, 0.07, 0.07, 0.07), 0xffffff);
    const ry = rnd() * 3; B.add(BOX, mat4(x + Math.cos(ry) * 1.2, 0.015, z + Math.sin(ry) * 1.2, 0, -ry, 0, 1.8, 0.02, 0.8), c1);
  }
  const foam = new Bucket(), F = HALF + 12;
  for (const s of [-1, 1]) {
    foam.add(PLANE, mat4(0, -1.14, s * (F + 2.2), 0, 0, 0, F * 2 + 9, 1, 4.4), 0xffffff);
    foam.add(PLANE, mat4(s * (F + 2.2), -1.14, 0, 0, 0, 0, 4.4, 1, F * 2 - 0.2), 0xffffff);
  }

  mark('beach');
  // ---------- meshes ----------
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const paintMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  // thin paint lines alias at grazing angles on phones (no MSAA): when a pixel covers more ground than the line is wide,
  // fade the paint toward the asphalt colour so the far lines go soft grey instead of crawling/flowing while you move
  paintMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec2 fw = fwidth(vPW.xz); float px = max(max(fw.x, fw.y), 1e-4); float cov = clamp(0.3 / (2.2 * px), 0.0, 1.0); cov = cov * cov * (3.0 - 2.0 * cov); diffuseColor.rgb = mix(vec3(0.149, 0.162, 0.216), diffuseColor.rgb, cov); }');
  };
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const a = solid.build(scene, solidMat), b = grass.build(scene, grassMat);
  const pm = paint.mesh(paintMat); if (pm) { pm.renderOrder = 1; scene.add(pm); }
  const fm = foam.mesh(foamMat); if (fm) scene.add(fm);
  stat.solidTris = Math.round(a.tris); stat.grassTris = Math.round(b.tris); stat.paintTris = Math.round(paint.tris); stat.meshes = a.calls + b.calls + (pm ? 1 : 0) + (fm ? 1 : 0);
  return stat;
}
