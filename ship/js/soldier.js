// Original procedural soldier models (realistic proportions, tactical gear), one SkinnedMesh per soldier.
// Rigid skinning: every vertex belongs to exactly one bone. Geometry + materials are shared per team/LOD.
import * as THREE from 'three';

// ---------------- camo atlas (left half camo, right half white for vertex-coloured gear) ----------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ATLAS = {};
function atlas(team) {
  if (ATLAS[team]) return ATLAS[team];
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 64);
  x.save(); x.beginPath(); x.rect(0, 0, 63, 64); x.clip();
  const r = rng(team === 'blue' ? 7 : 13);
  if (team === 'blue') { // urban: navy / slate / grey angular blocks
    const pal = ['#5d6878', '#232f47', '#8b95a2', '#3b475b', '#b3bac2'];
    x.fillStyle = pal[0]; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = pal[1 + ((r() * 4) | 0)];
      const px = (r() * 64) | 0, py = (r() * 64) | 0, w = 3 + ((r() * 9) | 0), h = 2 + ((r() * 6) | 0);
      x.fillRect(px, py, w, h); x.fillRect(px + ((r() * 4) | 0) - 2, py + h, (w * 0.6) | 0, 2 + ((r() * 3) | 0));
    }
  } else { // desert: tan / brown / black blobs
    const pal = ['#b89d6c', '#876a40', '#2b2622', '#d4c194', '#9e8455'];
    x.fillStyle = pal[0]; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 46; i++) {
      x.fillStyle = pal[1 + ((r() * 4) | 0)];
      x.beginPath(); x.ellipse(r() * 64, r() * 64, 2 + r() * 7, 1.5 + r() * 4, r() * 3, 0, Math.PI * 2); x.fill();
    }
  }
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return (ATLAS[team] = t);
}
const MATS = {};
export function teamMaterial(team) {
  return MATS[team] || (MATS[team] = new THREE.MeshLambertMaterial({ map: atlas(team), vertexColors: true }));
}

// ---------------- geometry builder ----------------
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const _c = new THREE.Color(), _Y = new THREE.Vector3(0, 1, 0);
// matrix for a primitive stretched along +Y placed between a and b
export function between(a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
  return { m: new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), len };
}
export class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.b = []; this.boneMats = null; }
  add(geo, mat, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo; geo !== g && geo.dispose();
    g.applyMatrix4(mat);
    const bone = o.bone || 0;
    if (this.boneMats) g.applyMatrix4(this.boneMats[bone]);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    _c.setHex(o.camo ? 0xffffff : color);
    const su = o.su || 1, sv = o.sv || 1;
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      if (o.camo && U) this.uv.push(0.006 + U.getX(i) * 0.46 * su, 0.02 + U.getY(i) * 0.96 * sv); else this.uv.push(0.78, 0.5);
      this.c.push(_c.r, _c.g, _c.b); this.b.push(bone);
    }
    g.dispose();
    return this;
  }
  get tris() { return this.p.length / 9; }
  build(skinned) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (skinned) {
      const si = new Uint16Array(this.b.length * 4), sw = new Float32Array(this.b.length * 4);
      this.b.forEach((b, i) => { si[i * 4] = b; sw[i * 4] = 1; });
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeBoundingSphere();
    return g;
  }
}
const cap = (r, h, lo) => new THREE.CapsuleGeometry(r, h, lo ? 1 : 2, lo ? 6 : 9);
const cyl = (r1, r2, h, lo, open) => new THREE.CylinderGeometry(r1, r2, h, lo ? 5 : 8, 1, !!open);
const sph = (r, lo, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, lo ? 7 : 10, lo ? 4 : 7, 0, Math.PI * 2, ts, tl);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------------- weapons (shared by bots and first-person) ----------------
// origin = where the right hand holds the grip, forward = -Z. Muzzle tips: rifle -0.72, sniper -0.98, pistol -0.2
export const MUZZLE = { rifle: -0.73, sniper: -0.99, pistol: -0.2, knife: -0.3 };
export function addGun(B, type, base, bone = 0, lo = false) {
  const A = (geo, m, col) => B.add(geo, base.clone().multiply(m), col, { bone });
  const body = 0x26292d, dark = 0x17191c, rail = 0x33373d, tan = 0x6b5a3e, steel = 0x9aa1a8, lens = 0x2c5f8c;
  const r = lo ? 6 : 8;
  if (type === 'rifle') {
    A(box(0.05, 0.075, 0.30), M(0, 0.02, -0.07), body);                       // receiver
    A(box(0.034, 0.1, 0.045), M(0, -0.045, 0.03, -0.32), dark);                // pistol grip
    A(box(0.036, 0.13, 0.058), M(0, -0.075, -0.13, 0.22), rail);               // magazine
    A(box(0.034, 0.05, 0.16), M(0, 0.02, 0.15), dark);                         // stock tube/body
    A(box(0.04, 0.1, 0.05), M(0, -0.005, 0.245), dark);                        // butt pad
    A(box(0.02, 0.045, 0.12), M(0, -0.02, 0.17, 0.25), dark);                  // stock lower
    A(new THREE.CylinderGeometry(0.03, 0.03, 0.24, r), M(0, 0.022, -0.33, Math.PI / 2), body); // handguard
    A(box(0.018, 0.012, 0.42), M(0, 0.064, -0.14), rail);                      // top rail
    A(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6), M(0, 0.022, -0.55, Math.PI / 2), dark); // barrel
    A(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 6), M(0, 0.022, -0.68, Math.PI / 2), dark); // muzzle device
    A(box(0.036, 0.045, 0.075), M(0, 0.093, -0.09), dark);                     // optic body
    A(box(0.03, 0.03, 0.006), M(0, 0.095, -0.13), lens);                       // optic lens
    A(box(0.012, 0.035, 0.012), M(0, 0.085, -0.42), dark);                     // front sight
    A(box(0.02, 0.06, 0.03), M(0, -0.035, -0.37), dark);                       // fore-grip
  } else if (type === 'sniper') {
    A(box(0.052, 0.07, 0.34), M(0, 0.02, -0.06), tan);                         // chassis
    A(box(0.034, 0.1, 0.045), M(0, -0.045, 0.03, -0.3), dark);
    A(box(0.04, 0.06, 0.3), M(0, 0.0, 0.22), tan);                             // stock
    A(box(0.045, 0.12, 0.05), M(0, -0.02, 0.36), dark);                        // butt
    A(box(0.034, 0.08, 0.06), M(0, -0.055, -0.1), dark);                       // box mag
    A(new THREE.CylinderGeometry(0.015, 0.013, 0.66, r), M(0, 0.025, -0.6, Math.PI / 2), dark); // barrel
    A(new THREE.CylinderGeometry(0.022, 0.022, 0.06, r), M(0, 0.025, -0.95, Math.PI / 2), dark); // brake
    A(new THREE.CylinderGeometry(0.026, 0.026, 0.3, r), M(0, 0.11, -0.08, Math.PI / 2), dark);  // scope tube
    A(new THREE.CylinderGeometry(0.036, 0.026, 0.07, r), M(0, 0.11, -0.25, Math.PI / 2), dark); // objective bell
    A(new THREE.CylinderGeometry(0.026, 0.032, 0.05, r), M(0, 0.11, 0.09, Math.PI / 2), dark);  // eyepiece
    A(box(0.02, 0.05, 0.02), M(0, 0.07, -0.16), dark); A(box(0.02, 0.05, 0.02), M(0, 0.07, 0.0), dark); // rings
    A(box(0.03, 0.03, 0.03), M(0.03, 0.03, 0.02), steel);                      // bolt handle
  } else if (type === 'pistol') {
    A(box(0.032, 0.035, 0.19), M(0, 0.03, -0.07), body);                       // slide
    A(box(0.03, 0.025, 0.16), M(0, 0.005, -0.06), dark);                       // frame
    A(box(0.03, 0.11, 0.045), M(0, -0.045, 0.01, -0.22), dark);                // grip
    A(box(0.006, 0.03, 0.04), M(0, -0.012, -0.03), dark);                      // trigger guard
    A(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 6), M(0, 0.03, -0.17, Math.PI / 2), steel);
  } else if (type === 'knife') {
    A(box(0.006, 0.035, 0.2), M(0, 0.008, -0.16), steel);                      // blade
    A(box(0.007, 0.02, 0.06), M(0, -0.018, -0.24, 0.5), steel);                // tip bevel
    A(box(0.05, 0.016, 0.02), M(0, 0, -0.055), dark);                          // guard
    A(new THREE.CylinderGeometry(0.018, 0.016, 0.11, r), M(0, 0, 0.01, Math.PI / 2), dark); // handle
  }
}

// ---------------- skeleton ----------------
const BONES = ['root', 'hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR', 'gun'];
const REST = {
  root: [null, 0, 0, 0], hips: ['root', 0, 0.96, 0], spine: ['hips', 0, 0.06, 0], head: ['spine', 0, 0.48, 0],
  shL: ['spine', -0.19, 0.42, 0], elL: ['shL', 0, -0.30, 0], shR: ['spine', 0.19, 0.42, 0], elR: ['shR', 0, -0.30, 0],
  thL: ['hips', -0.1, -0.02, 0], knL: ['thL', 0, -0.44, 0], thR: ['hips', 0.1, -0.02, 0], knR: ['thR', 0, -0.44, 0],
  gun: ['spine', 0.1, 0.4, -0.3],
};
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
function makeBones() {
  const bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; const r = REST[n]; b.position.set(r[1], r[2], r[3]); return b; });
  BONES.forEach((n, i) => { const p = REST[n][0]; if (p) bones[BI[p]].add(bones[i]); });
  return bones;
}

// ---------------- soldier geometry ----------------
const LOOK = {
  blue: { vest: 0x2c333e, pouch: 0x3c4552, strap: 0x1c1f24, helm: 0x3f4b5b, band: 0x2f7dff, skin: 0xc79876, boot: 0x1b1b1d, glove: 0x202226, pack: 0x37404c, lens: 0xd88f2c, pad: 0x23272d, headset: 0x2a2d31 },
  red: { vest: 0x4a3f2e, pouch: 0x3d3426, strap: 0x2a241c, helm: 0xa88d60, band: 0xe2342b, skin: 0xb98a68, boot: 0x3b2d1f, glove: 0x1e1d1b, pack: 0x51432f, lens: 0x2b3138, pad: 0x1f1c19, mask: 0x1c1c1e },
};
const GEO = {};
let restMats = null;
function getRestMats() {
  if (restMats) return restMats;
  const bones = makeBones(); bones[0].updateMatrixWorld(true);
  return (restMats = bones.map(b => b.matrixWorld.clone()));
}
function soldierGeo(team, lo) {
  const key = team + (lo ? 'L' : 'H'); if (GEO[key]) return GEO[key];
  const L = LOOK[team], B = new Builder(); B.boneMats = getRestMats();
  const cam = (bone, o = {}) => ({ bone: BI[bone], camo: true, ...o }), on = (bone) => ({ bone: BI[bone] });
  // pelvis + belt
  B.add(cap(0.11, 0.14, lo), M(0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.82), 0, cam('hips'));
  B.add(cyl(0.165, 0.165, 0.06, lo), M(0, 0.07, 0, 0, 0, 0, 1.1, 1, 0.74), L.strap, on('hips'));
  B.add(box(0.07, 0.07, 0.05), M(0.14, 0.03, -0.06), L.pouch, on('hips'));
  B.add(box(0.07, 0.07, 0.05), M(-0.14, 0.03, -0.06), L.pouch, on('hips'));
  // torso + vest + pouches + backpack + radio
  B.add(cap(0.15, 0.22, lo), M(0, 0.24, 0, 0, 0, 0, 1.25, 1, 0.72), 0, cam('spine', { sv: 0.7 }));
  B.add(cap(0.156, 0.05, lo), M(0, 0.25, 0, 0, 0, 0, 1.24, 1, 0.82), L.vest, on('spine'));
  for (const x of [-0.085, 0, 0.085]) B.add(box(0.07, 0.11, 0.045), M(x, 0.17, -0.135), L.pouch, on('spine'));
  B.add(box(0.06, 0.07, 0.04), M(-0.1, 0.33, -0.12), L.pouch, on('spine'));                // radio pouch
  B.add(cyl(0.006, 0.006, 0.22, true), M(-0.12, 0.47, 0.06), L.strap, on('spine'));        // antenna
  B.add(box(0.27, 0.3, 0.13), M(0, 0.25, 0.17), L.pack, on('spine'));                       // backpack
  B.add(box(0.2, 0.08, 0.05), M(0, 0.12, 0.25), L.strap, on('spine'));                      // pack pocket
  B.add(box(0.05, 0.03, 0.26), M(-0.11, 0.4, 0.02), L.strap, on('spine'));                  // straps
  B.add(box(0.05, 0.03, 0.26), M(0.11, 0.4, 0.02), L.strap, on('spine'));
  B.add(cyl(0.075, 0.09, 0.06, lo), M(0, 0.47, 0), team === 'red' ? L.mask : L.strap, on('spine')); // collar
  // head
  const face = team === 'red' ? L.mask : L.skin;
  B.add(cyl(0.05, 0.055, 0.1, lo), M(0, 0.03, 0), face, on('head'));
  B.add(sph(0.105, lo), M(0, 0.13, 0, 0, 0, 0, 0.92, 1.12, 1.0), face, on('head'));
  B.add(box(0.05, 0.03, 0.04), M(0, 0.065, -0.085), face, on('head'));                       // jaw/chin
  B.add(box(0.02, 0.04, 0.03), M(0, 0.12, -0.105), face, on('head'));                        // nose
  if (team === 'blue') {
    B.add(sph(0.128, lo, 0, Math.PI * 0.52), M(0, 0.15, 0.005, 0, 0, 0, 1, 0.98, 1.08), L.helm, on('head')); // helmet
    B.add(cyl(0.129, 0.132, 0.025, lo), M(0, 0.15, 0.005, 0, 0, 0, 1, 1, 1.08), L.strap, on('head'));       // rim
    B.add(cyl(0.131, 0.131, 0.03, lo, true), M(0, 0.19, 0.005, 0, 0, 0, 1, 1, 1.08), L.strap, on('head'));  // goggle strap
    B.add(box(0.06, 0.035, 0.03), M(-0.035, 0.2, -0.125, -0.25), L.lens, on('head'));
    B.add(box(0.06, 0.035, 0.03), M(0.035, 0.2, -0.125, -0.25), L.lens, on('head'));
    B.add(cyl(0.035, 0.035, 0.03, lo), M(-0.105, 0.12, 0, 0, 0, Math.PI / 2), L.headset, on('head')); // ear cups
    B.add(cyl(0.035, 0.035, 0.03, lo), M(0.105, 0.12, 0, 0, 0, Math.PI / 2), L.headset, on('head'));
    B.add(box(0.075, 0.012, 0.01), M(0, 0.125, -0.098), 0x1a1a1a, on('head'));               // eye shadow line
  } else {
    B.add(box(0.12, 0.036, 0.03), M(0, 0.14, -0.088), L.skin, on('head'));                    // eye slit
    B.add(box(0.025, 0.012, 0.01), M(-0.03, 0.14, -0.104), 0x141414, on('head'));
    B.add(box(0.025, 0.012, 0.01), M(0.03, 0.14, -0.104), 0x141414, on('head'));
    B.add(sph(0.116, lo, 0, Math.PI * 0.5), M(0, 0.17, 0.005, 0, 0, 0, 1, 0.8, 1.06), L.helm, on('head')); // patrol cap
    B.add(box(0.15, 0.012, 0.09), M(0, 0.175, -0.13, 0.12), L.helm, on('head'));             // brim
    B.add(box(0.07, 0.035, 0.035), M(-0.036, 0.21, -0.1, -0.5), L.lens, on('head'));          // goggles on cap
    B.add(box(0.07, 0.035, 0.035), M(0.036, 0.21, -0.1, -0.5), L.lens, on('head'));
  }
  // arms
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? -1 : 1;
    B.add(sph(0.068, lo), M(sx * 0.01, -0.02, 0, 0, 0, 0, 1, 0.9, 1), 0, cam('sh' + s));           // shoulder
    B.add(cap(0.056, 0.2, lo), M(0, -0.15, 0), 0, cam('sh' + s, { sv: 0.6 }));
    B.add(cyl(0.061, 0.061, 0.05, lo), M(0, -0.09, 0), L.band, on('sh' + s));                      // team armband
    B.add(cap(0.049, 0.17, lo), M(0, -0.12, 0), 0, cam('el' + s, { sv: 0.6 }));
    B.add(cyl(0.053, 0.05, 0.05, lo), M(0, -0.22, 0), L.glove, on('el' + s));                     // cuff
    B.add(sph(0.045, lo), M(0, -0.295, -0.005, 0, 0, 0, 0.75, 1.25, 1.05), L.glove, on('el' + s)); // hand
    B.add(cap(0.015, 0.035, lo), M(sx * -0.03, -0.27, -0.03, 0.6, 0, 0), L.glove, on('el' + s));   // thumb
  }
  // legs
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? -1 : 1;
    B.add(cap(0.078, 0.29, lo), M(0, -0.22, 0), 0, cam('th' + s, { sv: 0.7 }));
    if (s === 'R') B.add(box(0.05, 0.12, 0.1), M(sx * 0.075, -0.2, 0), L.pouch, on('th' + s));     // thigh holster
    B.add(cap(0.062, 0.3, lo), M(0, -0.22, 0.005), 0, cam('kn' + s, { sv: 0.7 }));
    B.add(sph(0.06, lo), M(0, -0.01, -0.05, 0, 0, 0, 1.05, 1.2, 0.6), L.pad, on('kn' + s));         // knee pad
    B.add(cyl(0.068, 0.072, 0.14, lo), M(0, -0.37, 0), L.boot, on('kn' + s));                       // boot upper
    B.add(box(0.105, 0.075, 0.25), M(0, -0.405, -0.05), L.boot, on('kn' + s));                       // boot sole
  }
  addGun(B, 'rifle', new THREE.Matrix4(), BI.gun, lo);
  const g = B.build(true); g.userData.tris = B.tris;
  return (GEO[key] = g);
}

// ---------------- muzzle flash (shared) ----------------
let flashGeo = null; const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function getFlashGeo() {
  if (flashGeo) return flashGeo;
  const B = new Builder();
  B.add(new THREE.PlaneGeometry(0.16, 0.34), M(0, 0, -0.12, Math.PI / 2), 0xffffff);
  B.add(new THREE.PlaneGeometry(0.16, 0.34), M(0, 0, -0.12, Math.PI / 2, 0, Math.PI / 2), 0xffffff);
  B.add(new THREE.PlaneGeometry(0.2, 0.2), M(0, 0, 0), 0xffffff);
  return (flashGeo = B.build(false));
}
const blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(0.42, 12); blobGeo.rotateX(-Math.PI / 2);

export function createSoldier(team) {
  const g = new THREE.Group();
  const bones = makeBones();
  const mesh = new THREE.SkinnedMesh(soldierGeo(team, false), teamMaterial(team));
  mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  g.add(mesh);
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.03; g.add(blob);
  const muzzle = new THREE.Mesh(getFlashGeo(), flashMat); muzzle.position.set(0, 0.022, MUZZLE.rifle); muzzle.visible = false;
  bones[BI.gun].add(muzzle);
  const B = Object.fromEntries(BONES.map((n, i) => [n, bones[i]]));
  g.userData = { team, mesh, bones: B, muzzle, blob, lo: false, phase: Math.random() * 6, moveK: 0, crouchK: 0, aimK: 0, kick: 0, t: Math.random() * 10, pitch: 0, hipYaw: 0, legDir: 1 };
  return g;
}
export function soldierTris(team, lo) { return soldierGeo(team, lo).userData.tris; }
export function setSoldierLOD(g, lo) {
  const u = g.userData; if (u.lo === lo) return;
  u.lo = lo; u.mesh.geometry = soldierGeo(u.team, lo);
}

// ---------------- animation ----------------
const DOWN = new THREE.Vector3(0, -1, 0);
const _T = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _qb = new THREE.Quaternion();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
function solveArm(sh, el, target, pole, L1 = 0.3, L2 = 0.3) {
  _T.copy(target).sub(sh.position); let d = _T.length(); const mx = (L1 + L2) * 0.998;
  if (d > mx) { _T.multiplyScalar(mx / d); d = mx; } if (d < 0.08) d = 0.08;
  _d.copy(_T).normalize();
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _u.copy(_d).multiplyScalar(Math.cos(a)).addScaledVector(_pp, Math.sin(a));
  _f.copy(_T).addScaledVector(_u, -L1).normalize();
  sh.quaternion.setFromUnitVectors(DOWN, _u);
  _qb.setFromUnitVectors(DOWN, _f);
  el.quaternion.copy(sh.quaternion).invert().multiply(_qb);
}
const POLE_R = new THREE.Vector3(0.7, -1, 0.35), POLE_L = new THREE.Vector3(-0.8, -1, 0.1);
const GRIP_R = new THREE.Vector3(0.02, -0.045, 0.035), GRIP_L = new THREE.Vector3(-0.01, -0.03, -0.33), MAG = new THREE.Vector3(-0.02, -0.11, -0.12);
const POUCH = new THREE.Vector3(-0.1, 0.12, -0.2);
const _hr = new THREE.Vector3(), _hl = new THREE.Vector3(), _tmp = new THREE.Vector3();

// o: { moveX, moveZ (world dir, length = 0..1), speed (m/s), yaw, crouch, aim, pitch, reload (-1 or 0..1) }
export function animateSoldier(g, dt, o) {
  const u = g.userData, b = u.bones;
  u.t += dt;
  const ml = Math.hypot(o.moveX, o.moveZ), moving = ml > 0.1;
  u.moveK += ((moving ? 1 : 0) - u.moveK) * Math.min(1, dt * 8);
  u.crouchK += ((o.crouch ? 1 : 0) - u.crouchK) * Math.min(1, dt * 10);
  u.aimK += ((o.aim ? 1 : 0) - u.aimK) * Math.min(1, dt * (o.aim ? 12 : 4));
  u.kick = Math.max(0, u.kick - dt * 10);
  u.pitch += ((o.aim ? o.pitch : 0) - u.pitch) * Math.min(1, dt * 10);
  // legs face the movement direction, upper body keeps facing the aim yaw
  let hipYaw = 0, dir = 1;
  if (moving) {
    const s = Math.sin(-o.yaw), c = Math.cos(-o.yaw);
    const lx = o.moveX * c + o.moveZ * s, lz = -o.moveX * s + o.moveZ * c;
    let a = Math.atan2(-lx, -lz);
    if (Math.abs(a) > Math.PI / 2 + 0.2) { dir = -1; a -= Math.sign(a) * Math.PI; }
    hipYaw = clamp(a, -0.9, 0.9);
  }
  u.hipYaw += (hipYaw - u.hipYaw) * Math.min(1, dt * 8);
  if (moving) u.legDir = dir;
  const spd = o.speed * ml;
  u.phase += dt * (moving ? 3.2 + spd * 1.45 : 0) * u.legDir;
  const A = clamp(0.25 + spd * 0.085, 0.25, 0.72) * u.moveK, ck = u.crouchK, mk = u.moveK;
  const run = clamp((spd - 3.2) / 2, 0, 1);
  const ph = u.phase;
  // standing/walking legs
  const leg = (p) => {
    const th = A * Math.sin(p);
    const kn = -(0.06 + (0.35 + A * 1.1) * Math.max(0, u.legDir * Math.cos(p)) * mk);
    return [th, kn];
  };
  let [tL, kL] = leg(ph), [tR, kR] = leg(ph + Math.PI);
  // crouch: kneel when still, squat-walk when moving
  const kneel = [1.45, -1.45, -0.22, -1.4], squat = [1.0 + 0.3 * Math.sin(ph), -1.75, 1.0 - 0.3 * Math.sin(ph), -1.75];
  const cp = kneel.map((v, i) => lerp(v, squat[i], mk));
  tL = lerp(tL, cp[0], ck); kL = lerp(kL, cp[1], ck); tR = lerp(tR, cp[2], ck); kR = lerp(kR, cp[3], ck);
  b.thL.rotation.set(tL, 0, -0.03); b.knL.rotation.set(kL, 0, 0);
  b.thR.rotation.set(tR, 0, 0.03); b.knR.rotation.set(kR, 0, 0);
  const bob = mk * (0.018 + run * 0.025) * Math.cos(ph * 2);
  b.hips.position.y = lerp(0.95 - A * 0.05 + bob, 0.585, ck);
  b.hips.rotation.set(0, u.hipYaw, 0);
  b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0);
  // torso: counter-rotate hips yaw, aim pitch, breathing, forward lean when running
  const breathe = Math.sin(u.t * 1.9) * 0.012 * (1 - mk);
  const lean = -(0.06 + run * 0.12) * mk * (1 - u.aimK) - 0.12 * ck * (1 - u.aimK);
  b.spine.rotation.set(u.pitch * 0.65 + lean + breathe + u.kick * 0.04, -u.hipYaw + Math.sin(ph) * 0.06 * mk * (1 - u.aimK), 0);
  b.head.rotation.set(u.pitch * 0.35 - lean * 0.6 + Math.sin(u.t * 0.7) * 0.03 * (1 - u.aimK), Math.sin(u.t * 0.43) * 0.12 * (1 - u.aimK) * (1 - mk), 0);
  // gun: low-ready <-> shouldered, recoil, reload tilt
  const ak = u.aimK, gk = b.gun;
  const rl = o.reload >= 0 ? o.reload : -1, rs = rl >= 0 ? Math.sin(Math.PI * rl) : 0;
  gk.position.set(lerp(0.09, 0.1, ak), lerp(0.25, 0.4, ak) + Math.sin(ph * 2) * 0.012 * mk - rs * 0.06, lerp(-0.26, -0.3, ak) + u.kick * 0.05);
  gk.rotation.set(lerp(-0.62, 0, ak) + u.kick * 0.14 - rs * 0.25 + breathe, lerp(0.42, 0.02, ak), lerp(0.12, 0, ak) + rs * 0.55, 'YXZ');
  gk.updateMatrix();
  _hr.copy(GRIP_R).applyMatrix4(gk.matrix);
  _hl.copy(GRIP_L).applyMatrix4(gk.matrix);
  if (rl >= 0) { // left hand: handguard -> mag -> vest pouch -> mag -> handguard
    _tmp.copy(MAG).applyMatrix4(gk.matrix);
    if (rl < 0.25) _hl.lerp(_tmp, rl / 0.25);
    else if (rl < 0.5) _hl.copy(_tmp).lerp(POUCH, (rl - 0.25) / 0.25);
    else if (rl < 0.75) _hl.copy(POUCH).lerp(_tmp, (rl - 0.5) / 0.25);
    else _hl.copy(_tmp).lerp(_hl, (rl - 0.75) / 0.25);
  }
  solveArm(b.shR, b.elR, _hr, POLE_R);
  solveArm(b.shL, b.elL, _hl, POLE_L);
}
export function soldierFired(g) { g.userData.kick = 1; }

// death: knees buckle, body tips over with a small bounce, then fades out
export function animateDeath(g, t) {
  const u = g.userData, b = u.bones;
  if (!u.dying) {
    u.dying = true; u.deathDir = Math.random() < 0.5 ? 1 : -1; u.deathSide = (Math.random() - 0.5) * 0.8;
    u.fadeMat = teamMaterial(u.team).clone(); u.fadeMat.transparent = true; u.mesh.material = u.fadeMat;
  }
  const k1 = clamp(t / 0.3, 0, 1), k2 = Math.pow(clamp((t - 0.12) / 0.5, 0, 1), 2);
  b.thL.rotation.set(0.7 * k1, 0, -0.1 * k1); b.thR.rotation.set(0.35 * k1, 0, 0.15 * k1);
  b.knL.rotation.set(-1.3 * k1, 0, 0); b.knR.rotation.set(-0.8 * k1, 0, 0);
  b.hips.position.y = 0.95 - 0.3 * k1 + 0.25 * k2;
  let tip = 1.45 * k2;
  if (t > 0.62) tip = 1.45 + 0.07 * Math.sin((t - 0.62) * 22) * Math.exp(-(t - 0.62) * 9);
  b.root.rotation.set(u.deathDir * tip, 0, u.deathSide * k2);
  b.root.position.y = 0.1 * k2;
  b.spine.rotation.set(-0.3 * k1 * u.deathDir, 0, 0.2 * k2);
  b.head.rotation.set(-0.4 * k2 * u.deathDir, 0.3 * k2, 0);
  b.gun.rotation.z += (0.5 * u.deathDir - b.gun.rotation.z) * 0.05; // rifle and arms fall with the body
  u.muzzle.visible = false;
  const fade = clamp((t - 1.3) / 0.8, 0, 1);
  u.fadeMat.opacity = 1 - fade; u.blob.material.opacity; u.blob.visible = fade < 0.5;
}
export function resetSoldier(g) {
  const u = g.userData; if (!u.dying) return;
  u.dying = false; u.mesh.material = teamMaterial(u.team); u.fadeMat?.dispose(); u.fadeMat = null; u.blob.visible = true;
  u.bones.root.rotation.set(0, 0, 0); u.bones.root.position.set(0, 0, 0);
}
