// Q版大乱斗 world: low-poly snowy Howling-Abyss style lane (party look), instanced decor, procedural
// towers / inhibitors / nexus, instanced minions, instanced VFX + health bars + blob shadows. Few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp } from './heroes.js';

export const LANE = { minX: -56, maxX: 56, half: 7 };
export const TEAM_COL = [0x3d8bff, 0xff4b4b];
const TEAM_COL2 = [0x9fd0ff, 0xffb0a0];
const TEAM_CRY = [0x46d2ff, 0xff3a52]; // structure crystals: blue-cyan / crimson

/* ---------- merged vertex-colour geometry builder ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return _m.clone().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); }
export class Builder {
  constructor() { this.parts = []; }
  add(g, m, color) {
    g = g.index ? g.toNonIndexed() : g.clone(); if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); this.parts.push(g); return this;
  }
  build() { const g = mergeGeometries(this.parts); g.computeBoundingSphere(); return g; }
}
let VCMAT = null;
export const vcToon = () => VCMAT || (VCMAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
const OL_MAT = {};
// inverted hull for static / instanced meshes (expanded along normals in the vertex shader)
export function outlineMat(w, instanced) {
  const k = w + (instanced ? 'i' : ''); if (OL_MAT[k]) return OL_MAT[k];
  const m = new THREE.MeshBasicMaterial({ color: 0x2a1f2e, side: THREE.BackSide });
  m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(4)};`); };
  m.customProgramCacheKey = () => 'hqOl' + k; return (OL_MAT[k] = m);
}
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

/* ---------- map ---------- */
// Howling Abyss palette (step 3): moody cool night — teal-slate stone lane with a darker worn centre path,
// dark blue-grey rocks/cliffs, snow only as pale-blue patches on edges/ledges, navy-purple sky/fog,
// warm orange brazier pools, glowing cyan ice. Heroes keep their own (bright) materials.
const SNOW = 0x93a9c4;      // scenery snow caps / mounds — pale blue in shade, never white
const ROCK = 0x3b4759, ROCK2 = 0x2f3a4b;
const PAL = {
  bg: 0x161c33, fog: 0x1d2541,
  skyTop: 0x080c1e, skyMid: 0x252a4e, skyBot: 0x1c2442,
  stone: 0x4a6a74, stone2: 0x405d68, path: 0x2f4048, path2: 0x2a3941,
  snow: 0x9db2cb, snow2: 0x8399b5, wall: 0x36424f, wall2: 0x2c3644, cliff: 0x252e3c,
  blueB: 0x2b5a92, redB: 0x7c2a38, warm: 0xe08a40,
};
const BRAZIERS = [-26, -10, 10, 26];
// flagstone texture (multiplied onto the stone part of the ground only)
const stoneTex = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#b4b4b4'; x.fillRect(0, 0, S, S);
  let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const rows = 3, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let cx = -R() * 60; const cols = 2 + Math.floor(R() * 2);
    while (cx < S) {
      const w = S / cols * (0.75 + R() * 0.5), v = 222 + Math.floor(R() * 33);
      x.fillStyle = `rgb(${v},${v},${v + 3})`;
      const ins = 2; x.fillRect(cx + ins, r * rh + ins, w - ins * 2, rh - ins * 2);
      if (cx + w > S) x.fillRect(cx + ins - S, r * rh + ins, w - ins * 2, rh - ins * 2); // wrap
      for (let k = 0; k < 6; k++) { const g = v - 18 - Math.floor(R() * 20); x.fillStyle = `rgba(${g},${g},${g + 4},.5)`; x.fillRect(cx + ins + R() * (w - 14), r * rh + ins + R() * (rh - 14), 4 + R() * 10, 3 + R() * 6); }
      cx += w;
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
})();
export function laneHalf(x) { const ax = Math.abs(x); return ax > 41 ? 10.5 : ax > 37 ? 7 + (ax - 37) * 0.875 : 7; }
export function buildMap(scene, quality) {
  const hi = quality === 'high', out = { objects: [] }; // scenery outlines only on desktop/high
  scene.background = new THREE.Color(PAL.bg);
  scene.fog = new THREE.Fog(PAL.fog, 32, quality === 'low' ? 80 : 100);
  // cool blue ambient + moonlight key (same 2 lights as before, recoloured)
  scene.add(new THREE.HemisphereLight(0xb4c8ff, 0x3a4266, 1.75));
  const sun = new THREE.DirectionalLight(0xe4ecff, 2.05); sun.position.set(-30, 60, 40); scene.add(sun);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 20, 10), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(PAL.skyTop) }, mid: { value: new THREE.Color(PAL.skyMid) }, bot: { value: new THREE.Color(PAL.skyBot) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); out.sky = sky;

  // lane plateau: one vertex-coloured grid (stone lane, darker worn centre, snow patches at the edges, warm brazier pools)
  {
    const W = 124, D = 30, nx = 62, nz = 30;
    const g = new THREE.PlaneGeometry(W, D, nx, nz); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), sw = new Float32Array(p.count), c = new THREE.Color(), cs = new THREE.Color();
    const K = {}; for (const k in PAL) K[k] = new THREE.Color(PAL[k]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = laneHalf(x), ad = Math.abs(z), n = hash(Math.round(x * 2), Math.round(z * 2)), n2 = hash(Math.round(x / 3.5), Math.round(z / 2.5));
      let y = 0, st = 1;
      const off = ad > h + 0.6;
      if (off) y = -0.05 + (z < 0 ? Math.min(3.5, (ad - h - 0.6) * 1.2) : -Math.min(6, (ad - h - 0.6) * 1.8)); // north wall up, south cliff down
      p.setY(i, y + (n - 0.5) * 0.06);
      // stone lane, worn darker path down the middle
      c.copy(n > 0.5 ? K.stone : K.stone2);
      const mid = Math.max(0, 1 - Math.max(0, ad - 1.6) / 1.8);
      c.lerp(n > 0.4 ? K.path : K.path2, mid * 0.85);
      if (Math.abs(x) > 42) c.lerp(x < 0 ? K.blueB : K.redB, 0.38 * (1 - Math.min(1, ad / (h + 0.5))));
      // snow drifts: along both edges (wider in patches), never in the walkway centre
      let warmW = 0; for (const bx of BRAZIERS) { const d = Math.hypot(x - bx, z + 7.6); if (d < 5.5) warmW = Math.max(warmW, (1 - d / 5.5) ** 1.2); }
      const edge = (ad - (h - 1.4 - n2 * 1.6)) / 1.2;
      let snow = Math.max(0, Math.min(1, edge)) * (1 - warmW); // snow melted around the braziers
      if (!off && n2 > 0.82 && ad > 3 && warmW < .1) snow = Math.max(snow, 0.7);
      if (snow > 0) { cs.copy(n > 0.5 ? K.snow : K.snow2); c.lerp(cs, snow * (0.75 + n * 0.25)); st = 1 - snow; }
      if (off) {
        if (z < 0) { c.copy(n > 0.5 ? K.wall : K.wall2); if (n2 > 0.55 || n > 0.8) c.lerp(K.snow2, 0.75); st = 0.5; }
        else { c.copy(K.cliff).lerp(K.wall2, n * 0.5); if (n2 > 0.7) c.lerp(K.snow2, 0.5); st = 0.4; }
      }
      // warm brazier light pools (fake point lights)
      if (warmW > 0) c.lerp(K.warm, warmW * 0.9);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; sw[i] = st;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sw, 1)); g.computeVertexNormals();
    stoneTex.repeat.set(124 / 4, 30 / 4);
    const gm = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map: stoneTex });
    gm.onBeforeCompile = s => {
      s.vertexShader = 'attribute float aS;\nvarying float vS;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;');
      s.fragmentShader = 'varying float vS;\n' + s.fragmentShader.replace('#include <map_fragment>', 'vec4 stx = texture2D( map, vMapUv ); diffuseColor.rgb *= mix(vec3(1.0), stx.rgb * 1.06, vS * .6);');
    };
    gm.customProgramCacheKey = () => 'hqGround';
    const ground = new THREE.Mesh(g, gm); scene.add(ground);
    // far ground below the south cliff (dark abyss) + back plateau
    const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), new THREE.MeshToonMaterial({ color: 0x1b2236, gradientMap: toonRamp() }));
    far.rotation.x = -Math.PI / 2; far.position.set(0, -6, 80); scene.add(far);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), new THREE.MeshToonMaterial({ color: 0x2c3548, gradientMap: toonRamp() }));
    back.rotation.x = -Math.PI / 2; back.position.set(0, 3.4, -55); scene.add(back);
  }
  // rocks along the walls + pines + snow mounds + ice crystals (instanced, 1 call each + outline on mid/high)
  // instanced in 24 m chunks along x so off-screen chunks are frustum-culled
  // fake brazier point light on instanced scenery: per-instance colour (free, same draw call)
  const _wc = new THREE.Color();
  const warmAt = (x, z) => { let w = 0; for (const bx of BRAZIERS) { const d = Math.hypot(x - bx, z + 7.6); if (d < 6) w = Math.max(w, (1 - d / 6) ** 1.3); } return _wc.setRGB(1 + w * 1.3, 1 + w * .45, 1 - w * .25); };
  const inst = (geo, list, ol = 0.05, mat = null, warmTint = true) => {
    const chunks = new Map(); for (const t of list) { const k = Math.floor((t[0] + 64) / 24); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(t); }
    const ims = [];
    for (const part of chunks.values()) {
      const im = new THREE.InstancedMesh(geo, mat || vcToon(), part.length);
      part.forEach((t, i) => im.setMatrixAt(i, M(t[0], t[1], t[2], t[3] || 0, t[4] || 0, t[5] || 0, t[6] || 1, t[7] || t[6] || 1, t[8] || t[6] || 1)));
      if (warmTint) part.forEach((t, i) => im.setColorAt(i, warmAt(t[0], t[2])));
      im.computeBoundingSphere(); scene.add(im); ims.push(im);
      if (hi && ol) { const o = new THREE.InstancedMesh(geo, outlineMat(ol, true), part.length); o.instanceMatrix = im.instanceMatrix; o.computeBoundingSphere(); scene.add(o); }
    }
    return ims;
  };
  {
    const rock = new Builder().add(new THREE.DodecahedronGeometry(1, 0), null, ROCK).add(new THREE.OctahedronGeometry(0.8, 0), M(0.1, 0.5, 0.05, 0, 0.4, 0, 1, 0.45, 1), SNOW).build();
    const rocks = []; let s = 1; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let x = -60; x <= 60; x += 2.3) {
      const h = laneHalf(x);
      rocks.push([x + R(), 0.3, -(h + 1.2 + R() * 0.8), R() * 3, R() * 3, 0, 0.9 + R() * 0.9, 0.7 + R() * 1.1, 0.9 + R() * 0.8]);
      if (R() > 0.35) rocks.push([x + R(), 1.6 + R(), -(h + 3 + R() * 2), R() * 3, R() * 3, 0, 1.4 + R(), 1 + R() * 1.4, 1.2 + R()]);
      if (R() > 0.55) rocks.push([x + R(), -0.2, h + 0.9 + R() * 0.6, R() * 3, R() * 3, 0, 0.5 + R() * 0.5, 0.35 + R() * 0.35]);
    }
    inst(rock, rocks);
    // dark frosted conifers (blue-teal, not party green)
    const pine = new Builder()
      .add(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 4, 1, true), M(0, 0.45, 0), 0x3a2e2c)
      .add(new THREE.ConeGeometry(1.15, 1.5, 6, 1, true), M(0, 1.4, 0), 0x1d3a45).add(new THREE.ConeGeometry(1.25, 0.35, 6, 1, true), M(0, 1.05, 0), SNOW)
      .add(new THREE.ConeGeometry(0.85, 1.3, 6, 1, true), M(0, 2.25, 0), 0x23474f)
      .add(new THREE.ConeGeometry(0.55, 1.0, 6, 1, true), M(0, 3.0, 0), 0x2a545b).add(new THREE.ConeGeometry(0.3, 0.45, 6, 1, true), M(0, 3.45, 0), SNOW).build();
    const pines = [];
    for (let x = -62; x <= 62; x += 3.1) {
      const h = laneHalf(x);
      pines.push([x + R() * 2, 2.6 + R(), -(h + 5 + R() * 5), 0, R() * 6, 0, 1 + R() * 0.6]);
      if (R() > 0.4) pines.push([x + R() * 2, 3.2, -(h + 11 + R() * 8), 0, R() * 6, 0, 1.2 + R() * 0.8]);
      if (R() > 0.45) pines.push([x + R() * 2, -6, h + 6 + R() * 18, 0, R() * 6, 0, 1.1 + R() * 0.7]);
    }
    inst(pine, pines, 0.06);
    const mound = new Builder().add(new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), null, SNOW).build();
    const mounds = [];
    for (let i = 0; i < 26; i++) { const x = -54 + i * 4.3 + R() * 2, h = laneHalf(x); mounds.push([x, -0.05, (R() > 0.5 ? -1 : 1) * (h - 0.3 - R() * 0.6), 0, R() * 6, 0, 0.6 + R() * 0.6, 0.3 + R() * 0.25, 0.6 + R() * 0.5]); }
    inst(mound, mounds, 0);
    // glowing cyan ice crystals
    const crystal = new Builder().add(new THREE.OctahedronGeometry(0.5, 0), M(0, 0.6, 0, 0, 0, 0, 0.6, 1.6, 0.6), 0x5fd8ff).add(new THREE.OctahedronGeometry(0.3, 0), M(0.35, 0.35, 0.1, 0, 0, 0.5, 0.6, 1.4, 0.6), 0x9eeaff).build();
    const crys = []; for (let i = 0; i < 18; i++) { const x = -50 + i * 5.9 + R() * 2, h = laneHalf(x); crys.push([x, 0, -(h + 0.5 + R()), 0, R() * 6, R() * 0.3, 0.8 + R() * 0.7]); }
    inst(crystal, crys, 0.03, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: 0x1fa8e0, emissiveIntensity: 0.95 }), false);
    // bridge near each base: dark stone posts with iron rails, merged into one mesh
    const rail = new Builder();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let x = 45; x <= 55; x += 2.5) {
      rail.add(new THREE.BoxGeometry(0.5, 1.1, 0.5), M(sx * x, 0.55, sz * 10.9), 0x4a5568).add(new THREE.BoxGeometry(0.62, 0.18, 0.62), M(sx * x, 1.15, sz * 10.9), SNOW);
      if (x < 55) rail.add(new THREE.BoxGeometry(2.5, 0.25, 0.3), M(sx * (x + 1.25), 0.85, sz * 10.9), 0x2a2f3a);
    }
    // braziers along the lane (stone pillar + iron bowl)
    for (const x of BRAZIERS) for (const sz of [-1]) {
      rail.add(new THREE.CylinderGeometry(0.25, 0.35, 1.3, 6), M(x, 0.65, sz * 7.6), 0x3e4656).add(new THREE.CylinderGeometry(0.5, 0.3, 0.3, 8), M(x, 1.4, sz * 7.6), 0x24262e);
    }
    const rm = new THREE.Mesh(rail.build(), vcToon()); scene.add(rm);
    if (hi) scene.add(new THREE.Mesh(rm.geometry, outlineMat(0.04)));
    // flames: outer orange + inner yellow core, unlit (reads as the light source)
    const fire = new Builder(); for (const x of BRAZIERS) fire.add(new THREE.ConeGeometry(0.36, 0.8, 6), M(x, 1.9, -7.6), 0xff7a1e).add(new THREE.ConeGeometry(0.2, 0.5, 6), M(x, 1.82, -7.6), 0xffd060);
    scene.add(new THREE.Mesh(fire.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: false })));
    // fountain platforms: dark stone, team trim + crystal
    for (const t of [0, 1]) {
      const sx = t ? 1 : -1;
      const f = new Builder().add(new THREE.CylinderGeometry(5.2, 5.6, 0.3, 20), M(sx * 52.5, 0.15, 0), 0x435064)
        .add(new THREE.TorusGeometry(4.8, 0.25, 5, 28), M(sx * 52.5, 0.3, 0, Math.PI / 2), TEAM_COL[t])
        .add(new THREE.CylinderGeometry(1.1, 1.4, 0.6, 10), M(sx * 52.5, 0.5, 0), 0x56637a)
        .add(new THREE.OctahedronGeometry(0.7, 0), M(sx * 52.5, 2.0, 0, 0, 0, 0, 1, 1.5, 1), TEAM_CRY[t]).build();
      const fm = new THREE.Mesh(f, vcToon()); scene.add(fm);
    }
  }
  return out;
}

/* ---------- structures ---------- */
const structGeo = {};
export function structureMesh(kind, team, quality) {
  const key = kind + team; let g = structGeo[key];
  const tc = TEAM_COL[team], tc2 = TEAM_COL2[team];
  if (!g) {
    const B = new Builder();
    if (kind === 'tower') {
      B.add(new THREE.CylinderGeometry(1.25, 1.5, 0.5, 8), M(0, 0.25, 0), 0x435068)
        .add(new THREE.CylinderGeometry(0.8, 1.05, 3.2, 8), M(0, 2.1, 0), 0x66758c)
        .add(new THREE.CylinderGeometry(0.95, 0.95, 0.35, 8), M(0, 1.0, 0), tc)
        .add(new THREE.CylinderGeometry(1.25, 0.85, 0.6, 8), M(0, 3.9, 0), 0x55637a)
        .add(new THREE.CylinderGeometry(1.3, 1.3, 0.15, 8), M(0, 4.25, 0), SNOW);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; B.add(new THREE.BoxGeometry(0.35, 1.0, 0.35), M(Math.cos(a) * 1.05, 4.7, Math.sin(a) * 1.05, 0, -a, 0.25 * (i % 2 ? 1 : -1)), 0x435068); }
      B.add(new THREE.OctahedronGeometry(0.62, 0), M(0, 5.3, 0, 0, 0, 0, 1, 1.4, 1), TEAM_CRY[team]);
    } else if (kind === 'inhib') {
      B.add(new THREE.CylinderGeometry(1.7, 1.9, 0.45, 10), M(0, 0.22, 0), 0x435068)
        .add(new THREE.TorusGeometry(1.2, 0.28, 6, 14), M(0, 1.35, 0, 0, 0, 0, 1, 1, 1), 0x66758c)
        .add(new THREE.IcosahedronGeometry(0.85, 0), M(0, 1.35, 0), TEAM_CRY[team]);
      for (let i = 0; i < 3; i++) { const a = i * 2.094; B.add(new THREE.ConeGeometry(0.3, 1.6, 5), M(Math.cos(a) * 1.5, 1.0, Math.sin(a) * 1.5, 0, 0, Math.cos(a) * 0.3), 0x55637a); }
    } else if (kind === 'nexus') {
      B.add(new THREE.CylinderGeometry(2.6, 3.0, 0.6, 12), M(0, 0.3, 0), 0x435068)
        .add(new THREE.CylinderGeometry(1.8, 2.2, 1.0, 12), M(0, 1.0, 0), 0x66758c)
        .add(new THREE.TorusGeometry(2.0, 0.2, 5, 20), M(0, 1.55, 0, Math.PI / 2), tc);
      for (let i = 0; i < 5; i++) { const a = i * 1.2566; B.add(new THREE.ConeGeometry(0.45, 2.6, 5), M(Math.cos(a) * 1.9, 2.1, Math.sin(a) * 1.9, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), 0x55637a); }
      B.add(new THREE.OctahedronGeometry(1.1, 0), M(0, 3.4, 0, 0, 0.4, 0, 1, 1.6, 1), TEAM_CRY[team]);
    }
    g = structGeo[key] = B.build();
  }
  const grp = new THREE.Group(); const m = new THREE.Mesh(g, vcToon()); grp.add(m);
  if (quality !== 'low') grp.add(new THREE.Mesh(g, outlineMat(0.05)));
  // destroyed rubble
  const rub = new THREE.Mesh(new THREE.CylinderGeometry(kind === 'nexus' ? 2.6 : 1.4, kind === 'nexus' ? 3 : 1.6, 0.4, 7), new THREE.MeshToonMaterial({ color: 0x2e3542, gradientMap: toonRamp() }));
  rub.position.y = 0.2; rub.visible = false; grp.add(rub);
  grp.userData = { body: m, rubble: rub };
  return grp;
}

/* ---------- minions (instanced, 1 call per type+team, + outline) ---------- */
function minionGeo(type, team) {
  const B = new Builder(), tc = TEAM_COL[team], tc2 = TEAM_COL2[team], dark = 0x2a2230;
  const eyes = (y, z, s = 1) => { for (const sx of [-1, 1]) { B.add(new THREE.SphereGeometry(0.07 * s, 5, 4), M(sx * 0.11 * s, y, z, 0, 0, 0, 1, 1.2, 0.6), 0xffffff); B.add(new THREE.SphereGeometry(0.04 * s, 4, 3), M(sx * 0.11 * s, y, z + 0.03, 0, 0, 0, 1, 1.2, 0.5), dark); } };
  if (type === 'melee') {
    B.add(new THREE.SphereGeometry(0.33, 8, 6), M(0, 0.42, 0, 0, 0, 0, 1, 1.05, 1), 0xe9e3d6)
      .add(new THREE.SphereGeometry(0.31, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), M(0, 0.5, 0), tc)
      .add(new THREE.ConeGeometry(0.08, 0.22, 5), M(0, 0.86, 0), tc2)
      .add(new THREE.BoxGeometry(0.06, 0.5, 0.04), M(0.34, 0.45, 0.12, 0.5, 0, 0), 0xdfe7f2).add(new THREE.BoxGeometry(0.2, 0.05, 0.06), M(0.34, 0.25, 0.02, 0.5, 0, 0), 0x7a5236)
      .add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), M(-0.34, 0.42, 0.05, 0, 0, Math.PI / 2), tc2);
    eyes(0.42, 0.28);
  } else if (type === 'caster') {
    B.add(new THREE.ConeGeometry(0.32, 0.6, 7), M(0, 0.3, 0), tc)
      .add(new THREE.SphereGeometry(0.25, 8, 6), M(0, 0.7, 0), 0xe9e3d6)
      .add(new THREE.ConeGeometry(0.27, 0.45, 7), M(0, 1.0, -0.03, -0.25, 0, 0), tc2)
      .add(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5), M(0.3, 0.45, 0.05), 0x7a5236)
      .add(new THREE.OctahedronGeometry(0.09, 0), M(0.3, 0.92, 0.05), 0xffe27a);
    eyes(0.7, 0.21, 0.9);
  } else {
    B.add(new THREE.BoxGeometry(0.9, 0.45, 1.1), M(0, 0.45, 0), 0x8a6a4a)
      .add(new THREE.BoxGeometry(0.95, 0.12, 1.15), M(0, 0.7, 0), tc)
      .add(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), M(0, 0.95, 0.25, Math.PI / 2 - 0.35, 0, 0), 0x5b6474)
      .add(new THREE.SphereGeometry(0.3, 8, 6), M(0, 0.95, -0.25), tc2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 7), M(sx * 0.5, 0.22, sz * 0.35, 0, 0, Math.PI / 2), 0x3a3540);
  }
  return B.build();
}
export class MinionRenderer {
  constructor(scene, quality, cap = 48) {
    this.sets = {};
    for (const type of ['melee', 'caster', 'siege']) for (const team of [0, 1]) {
      const g = minionGeo(type, team), im = new THREE.InstancedMesh(g, vcToon(), cap); im.count = 0; im.frustumCulled = false; scene.add(im);
      let ol = null; if (quality !== 'low') { ol = new THREE.InstancedMesh(g, outlineMat(0.03, true), cap); ol.instanceMatrix = im.instanceMatrix; ol.count = 0; ol.frustumCulled = false; scene.add(ol); }
      this.sets[type + team] = { im, ol, n: 0 };
    }
  }
  begin() { for (const k in this.sets) this.sets[k].n = 0; }
  add(type, team, x, y, z, yaw, s = 1) {
    const st = this.sets[type + team]; if (st.n >= st.im.instanceMatrix.count) return;
    st.im.setMatrixAt(st.n++, M(x, y, z, 0, yaw, 0, s));
  }
  end() { for (const k in this.sets) { const st = this.sets[k]; st.im.count = st.n; if (st.ol) st.ol.count = st.n; st.im.instanceMatrix.needsUpdate = true; } }
}

/* ---------- instanced quads: blobs, bars ---------- */
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 4, 32, 32, 31); g.addColorStop(0, 'rgba(4,6,16,.55)'); g.addColorStop(1, 'rgba(4,6,16,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
export class Blobs {
  constructor(scene, cap = 96) {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    this.im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), cap); this.im.frustumCulled = false; this.im.renderOrder = 1; scene.add(this.im); this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, z, s) { if (this.n >= this.im.instanceMatrix.count) return; this.im.setMatrixAt(this.n++, M(x, 0.03, z, 0, 0, 0, s, 1, s)); }
  end() { this.im.count = this.n; this.im.instanceMatrix.needsUpdate = true; }
}
// health / mana bars: two instanced quad sets (back plates + fills), billboarded with the fixed camera rotation
export class Bars {
  constructor(scene, cap = 220) {
    const g = new THREE.PlaneGeometry(1, 1);
    const mk = (o) => { const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: true, fog: false }), cap); im.setColorAt(0, new THREE.Color()); im.frustumCulled = false; im.renderOrder = o; scene.add(im); return im; };
    this.bg = mk(50); this.fg = mk(51); this.n = 0; this.m = 0; this.q = new THREE.Quaternion(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3(); this.c = new THREE.Color();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._mat = new THREE.Matrix4();
  }
  begin(camera) { this.n = this.m = 0; this.q.copy(camera.quaternion); this.right.set(1, 0, 0).applyQuaternion(this.q); this.up.set(0, 1, 0).applyQuaternion(this.q); }
  _put(im, i, x, y, z, w, h, col) { this._p.set(x, y, z); this._s.set(w, h, 1); this._mat.compose(this._p, this.q, this._s); im.setMatrixAt(i, this._mat); im.setColorAt(i, this.c.setHex(col)); }
  // bar centred at world (x,y,z), frac 0..1, segments: optional extra fill (shield) in white
  bar(x, y, z, w, h, frac, col, shieldFrac = 0, back = 0x1a1420) {
    if (this.n >= this.bg.instanceMatrix.count - 1) return;
    this._put(this.bg, this.n++, x, y, z, w + 0.06, h + 0.05, back);
    const f = Math.max(0, Math.min(1, frac)), fw = w * f, r = this.right;
    if (fw > 0.001) { const off = -(w - fw) / 2; this._put(this.fg, this.m++, x + r.x * off, y + r.y * off, z + r.z * off, fw, h, col); }
    if (shieldFrac > 0.001) { const sw = w * Math.min(1 - f, shieldFrac) || w * Math.min(shieldFrac, 0.25); const off = -w / 2 + fw + sw / 2; this._put(this.fg, this.m++, x + r.x * off, y + r.y * off, z + r.z * off, sw, h, 0xf4f4f4); }
  }
  end() { this.bg.count = this.n; this.fg.count = this.m; for (const im of [this.bg, this.fg]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } }
}

/* ---------- VFX: orbs / ground rings / discs / beams (1 call each) ----------
   Normal alpha blending + per-instance alpha (additive decals stacked to white on the snow).
   Colours are pushed to saturated mid-lightness so overlapping effects stay tinted, not white. */
const discTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(.72, 'rgba(255,255,255,.55)'); g.addColorStop(.93, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const _hsl = {};
function vivid(c) { c.getHSL(_hsl); if (_hsl.s > .12) c.setHSL(_hsl.h, Math.max(_hsl.s, .85), Math.min(_hsl.l, .58)); else c.multiplyScalar(.92); return c; }
export class FX {
  constructor(scene, cap = 160) {
    const mat = (map) => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: map || null, transparent: true, depthWrite: false, fog: false });
      m.onBeforeCompile = sh => { sh.vertexShader = 'attribute float aA;\nvarying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
        sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA;'); };
      return m; };
    const mk = (g, ro, map) => { g.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1)); const im = new THREE.InstancedMesh(g, mat(map), cap); im.setColorAt(0, new THREE.Color()); im.frustumCulled = false; im.renderOrder = ro; scene.add(im); return im; };
    this.orb = mk(new THREE.IcosahedronGeometry(0.5, 1), 5);
    const rg = new THREE.RingGeometry(0.92, 1, 32); rg.rotateX(-Math.PI / 2); this.ring = mk(rg, 4);
    const dg = new THREE.CircleGeometry(1, 32); dg.rotateX(-Math.PI / 2); this.disc = mk(dg, 3, discTex);
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0, 0.5); this.beam = mk(bg, 5);
    this.sets = [this.orb, this.ring, this.disc, this.beam]; this.n = [0, 0, 0, 0]; this.c = new THREE.Color(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.amax = [.85, .9, .4, .7]; // alpha caps: orbs, rings, area discs, beams
  }
  begin() { this.n.fill(0); }
  _put(k, x, y, z, sx, sy, sz, yaw, col, a) {
    const im = this.sets[k]; if (this.n[k] >= im.instanceMatrix.count) return;
    this._q.setFromEuler(this._e.set(0, yaw, 0)); this._m.compose(this._p.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    const i = this.n[k]++; im.setMatrixAt(i, this._m); im.setColorAt(i, vivid(this.c.setHex(col)));
    im.geometry.attributes.aA.array[i] = Math.max(0, Math.min(this.amax[k], a));
  }
  orbAt(x, y, z, r, col, a = 1) { this._put(0, x, y, z, r * 2, r * 2, r * 2, 0, col, a); }
  ringAt(x, z, r, col, a = 1, y = 0.06) { this._put(1, x, y, z, r, 1, r, 0, col, a); }
  // area disc: callers pass the old additive strength (~.05–.3); mapped to .2–.4 normal alpha with a bright rim from discTex
  discAt(x, z, r, col, a = 1, y = 0.05) { this._put(2, x, y, z, r, 1, r, 0, col, Math.min(.4, a * 3.5)); }
  // beam from (x,z) along yaw with length/width
  beamAt(x, y, z, yaw, len, w, h, col, a = 1) { this._put(3, x, y, z, w, h, len, yaw, col, a * .8); }
  end() { this.sets.forEach((im, k) => { im.count = this.n[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.geometry.attributes.aA.needsUpdate = true; }); }
}
