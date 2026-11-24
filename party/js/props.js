// CC0 prop models (Kenney Car Kit / Survival Kit / Furniture Kit / Weapon Pack), pre-baked offline into one compact
// vertex-coloured file (assets/props/props.bin + props.json: quantised positions, int8 normals, rgb8 colours, uint16 indices).
// Static placements are merged per map chunk into ONE vertex-coloured mesh (1 draw call per chunk, frustum / far-plane culled);
// small indoor clutter goes into separate chunks that are hidden beyond a short distance (see PropSet.lod).
import * as THREE from 'three';

export const PROPS = {};
export const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
async function load() {
  const [hdr, bin] = await Promise.all([fetch('./assets/props/props.json').then(r => r.json()), fetch('./assets/props/props.bin').then(r => r.arrayBuffer())]);
  for (const [k, h] of Object.entries(hdr)) {
    let o = h.off; const al = (n) => { o += n; o += (4 - o % 4) % 4; };
    const I = new Uint16Array(bin, o, h.ni); al(h.ni * 2);
    const Pq = new Int16Array(bin, o, h.n * 3); al(h.n * 6);
    const N = new Int8Array(bin, o, h.n * 3); al(h.n * 3);
    const C = new Uint8Array(bin, o, h.n * 3);
    const P = new Float32Array(h.n * 3), Nf = new Float32Array(h.n * 3), Cf = new Float32Array(h.n * 3);
    for (let i = 0; i < h.n * 3; i++) { const c = i % 3; P[i] = h.min[c] + (Pq[i] + 32768) / 65535 * h.ext[c]; Nf[i] = N[i] / 127; Cf[i] = C[i] / 255; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nf, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cf, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(I), 1)); g.computeBoundingBox();
    { const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); }   // centred on x/z, standing on y = 0
    g.computeBoundingBox(); g.computeBoundingSphere();
    PROPS[k] = g;
  }
}
try { await load(); } catch (e) { console.warn('props failed to load (map keeps its procedural look)', e); }
export const hasProps = () => Object.keys(PROPS).length > 0;
// size of a prop at scale 1 (x, y, z) and its footprint centre offset
export function propSize(k) { const b = PROPS[k]?.boundingBox; return b ? b.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
// merged placements, bucketed into square chunks
export class PropSet {
  constructor(chunk = 64, maxD = 0, name = 'props', nearD = 0) { this.chunk = chunk; this.maxD = maxD; this.name = name; this.nearD = nearD; this.pairs = []; this.cells = new Map(); this.tris = 0; this.meshes = []; }
  // place prop k at (x, y, z), yaw ry, uniform or [sx, sy, sz] scale; tint multiplies the baked colours (e.g. a burnt wreck)
  // 2026-11 帧率: with nearD set, a prop that has a baked '<k>_lo' (the cars) goes in twice - full detail near the camera,
  // the ~15% simplified copy beyond nearD (same chunk, so exactly one of the two shows)
  add(k, x, y, z, ry = 0, s = 1, tint = null, rx = 0, rz = 0) {
    if (this.nearD && PROPS[k + '_lo'] && !this._lo) {
      this._lo = 1; const hc = this.cells; this.cells = this.hiCells || (this.hiCells = new Map());
      this.add(k, x, y, z, ry, s, tint, rx, rz); this.cells = this.loCells || (this.loCells = new Map()); this.add(k + '_lo', x, y, z, ry, s, tint, rx, rz);
      this.cells = hc; this._lo = 0; this.tris -= PROPS[k + '_lo'].index.count / 3; return true;
    }
    const g = PROPS[k]; if (!g) return false;
    const sc = Array.isArray(s) ? s : [s, s, s];
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sc[0], sc[1], sc[2]));
    const key = Math.floor(x / this.chunk) + ',' + Math.floor(z / this.chunk);
    let c = this.cells.get(key); if (!c) this.cells.set(key, c = { p: [], n: [], c: [], i: [], v: 0 });
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
    const nm = new THREE.Matrix3().getNormalMatrix(_m), v = new THREE.Vector3();
    if (tint != null) _c.set(tint);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(_m); c.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); c.n.push(v.x, v.y, v.z);
      if (tint != null) c.c.push(C.getX(i) * _c.r, C.getY(i) * _c.g, C.getZ(i) * _c.b); else c.c.push(C.getX(i), C.getY(i), C.getZ(i));
    }
    for (let i = 0; i < I.count; i++) c.i.push(I.getX(i) + c.v);
    c.v += P.count; this.tris += I.count / 3;
    return true;
  }
  mk(scene, c) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3));
    g.setIndex(c.v > 65535 ? new THREE.Uint32BufferAttribute(c.i, 1) : new THREE.Uint16BufferAttribute(c.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, propMat); m.name = this.name; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
  }
  build(scene) {
    if (this.hiCells) for (const [key, c] of this.hiCells) { const hi = this.mk(scene, c), lc = this.loCells.get(key), lo = lc ? this.mk(scene, lc) : null; if (lo) lo.name = this.name + '-lo'; this.pairs.push([hi, lo]); }
    for (const c of this.cells.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3));
      g.setIndex(c.v > 65535 ? new THREE.Uint32BufferAttribute(c.i, 1) : new THREE.Uint16BufferAttribute(c.i, 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, propMat); m.name = this.name; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); this.meshes.push(m);
    }
    this.cells.clear();
    return { calls: this.meshes.length + this.pairs.length * 2, tris: Math.round(this.tris) };
  }
  // hide chunks farther than maxD from the camera (cheap: a handful of meshes, called once per frame)
  lod(cam) {
    if (!this.maxD) return;
    for (const [hi, lo] of this.pairs) {
      const sp = hi.geometry.boundingSphere, dx = sp.center.x - cam.x, dz = sp.center.z - cam.z, d2 = dx * dx + dz * dz, rn = this.nearD + sp.radius, rf = this.maxD + sp.radius;
      hi.visible = d2 < rn * rn; if (lo) lo.visible = !hi.visible && d2 < rf * rf;
    }
    for (const m of this.meshes) { const s = m.geometry.boundingSphere, r = this.maxD + s.radius, dx = s.center.x - cam.x, dz = s.center.z - cam.z; m.visible = dx * dx + dz * dz < r * r; }
  }
}
