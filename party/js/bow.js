// 弓箭: procedural low-poly bow (original, no external asset), first-person viewmodel, arrow projectiles with gravity drop,
// travel time and arrows that stick where they land. Frame convention for the bow: grip at origin, +Z = shooting direction, +Y = up.
import * as THREE from 'three';
import { Builder, M, between } from './soldier.js';
import { critterMaterial } from './bean.js';

export const ARROW_G = 9.0;                   // m/s² gravity on arrows
export const arrowSpeed = (k) => 25 + 50 * k;  // charge 0..1 -> m/s
export const arrowDmg = (k) => 35 + 35 * k;    // body damage, headshot x2

const WOOD = 0x9b5a2a, WOOD2 = 0x7a4420, WRAP = 0x3b2a20, TIP = 0xffd166, SHAFT = 0xe9d8b4, HEAD = 0xb8c2cc, FLETCH = 0xff4d6d;
const LIMB_H = 0.55, TIP_BACK = 0.16, BRACE = 0.05, DRAW_LEN = 0.42, ARROW_LEN = 0.72;

function limbPoints() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const y = -LIMB_H + (2 * LIMB_H * i) / 12, t = Math.abs(y) / LIMB_H; pts.push(new THREE.Vector3(0, y, -TIP_BACK * t * t + (t > 0.85 ? (t - 0.85) * 0.25 : 0))); }
  return pts;
}
// bow body (limbs + grip + tips), merged and vertex-coloured; string is separate (it moves)
export function bowGeometry() {
  const B = new Builder();
  const curve = new THREE.CatmullRomCurve3(limbPoints());
  B.add(new THREE.TubeGeometry(curve, 24, 0.017, 6, false), new THREE.Matrix4(), WOOD);
  B.add(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 8), M(0, 0, 0.004), WRAP);             // grip wrap
  B.add(new THREE.BoxGeometry(0.03, 0.05, 0.05), M(0, 0.1, 0.01), WOOD2);                       // arrow shelf
  for (const s of [-1, 1]) B.add(new THREE.SphereGeometry(0.026, 8, 6), M(0, s * LIMB_H, -TIP_BACK + 0.04), TIP);
  return B.build(false);
}
export function arrowGeometry() {
  const B = new Builder();   // nock at z=0, tip at +ARROW_LEN
  B.add(new THREE.CylinderGeometry(0.008, 0.008, ARROW_LEN - 0.06, 5), M(0, 0, (ARROW_LEN - 0.06) / 2, Math.PI / 2), SHAFT);
  B.add(new THREE.ConeGeometry(0.022, 0.08, 6), M(0, 0, ARROW_LEN - 0.03, Math.PI / 2), HEAD);
  for (let i = 0; i < 3; i++) B.add(new THREE.BoxGeometry(0.002, 0.03, 0.1), M(0, 0, 0.08, 0, 0, (i / 3) * Math.PI * 2).multiply(M(0, 0.018, 0)), FLETCH);
  return B.build(false);
}
let BOWGEO = null, ARROWGEO = null;
const bowGeo = () => BOWGEO || (BOWGEO = bowGeometry());
const arrowGeo = () => ARROWGEO || (ARROWGEO = arrowGeometry());
export { bowGeo, arrowGeo };
const stringMat = new THREE.LineBasicMaterial({ color: 0xf4f0e6 });

// a bow with a live string and a nocked arrow; setDraw(0..1), setNocked(bool)
export function makeBow(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bowGeo(), critterMaterial()));
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const str = new THREE.Line(sg, stringMat); str.frustumCulled = false; g.add(str);
  const arrow = new THREE.Mesh(arrowGeo(), critterMaterial()); g.add(arrow);
  g.scale.setScalar(scale);
  const tipZ = -TIP_BACK + 0.04;
  g.userData.setDraw = (k) => {
    const nz = tipZ - BRACE - DRAW_LEN * k, p = sg.attributes.position.array;
    p[0] = 0; p[1] = LIMB_H; p[2] = tipZ; p[3] = 0; p[4] = 0.1; p[5] = nz; p[6] = 0; p[7] = -LIMB_H; p[8] = tipZ;
    sg.attributes.position.needsUpdate = true;
    arrow.position.set(0.02, 0.1, nz);
    g.userData.nockZ = nz;
  };
  g.userData.setNocked = (v) => { arrow.visible = v; };
  g.userData.arrow = arrow;
  g.userData.setDraw(0);
  return g;
}

// ---------- first-person viewmodel (camera space, -Z forward) ----------
export function buildBowViewmodel(armFn, teamMat) {
  const root = new THREE.Group();
  const GX = -0.15, GY = -0.09, GZ = -0.66;
  const bow = makeBow(0.55); bow.rotation.set(0, Math.PI, 0.35); bow.position.set(GX, GY, GZ); root.add(bow);   // canted, in the left fist
  // left arm (static) holding the grip
  const B = new Builder();
  armFn(B, [GX - 0.02, GY - 0.04, GZ + 0.07], [GX - 0.17, GY - 0.25, GZ + 0.38], [GX, GY, GZ], true);
  const armMesh = new THREE.Mesh(B.build(false), teamMat); root.add(armMesh);
  // right hand: glove at the nock, follows the draw
  const hand = new THREE.Group();
  const H = new Builder();
  armFn(H, [0.03, -0.03, 0.07], [0.18, -0.2, 0.4], [0, 0, 0], false);
  const handMesh = new THREE.Mesh(H.build(false), teamMat); hand.add(handMesh); root.add(hand);
  const _p = new THREE.Vector3();
  root.userData = {
    tris: B.tris + H.tris, mesh: armMesh, meshes: [armMesh, handMesh], bow,
    setDraw(k, nocked) {
      bow.userData.setDraw(k * 0.55); bow.userData.setNocked(nocked);   // shortened draw in first person keeps the fist out of the sight line
      bow.updateMatrix(); _p.set(0, 0.1, bow.userData.nockZ - 0.03).applyMatrix4(bow.matrix); hand.position.copy(_p);
      hand.visible = nocked || k > 0;
    },
  };
  root.userData.setDraw(0, true);
  root.visible = false;
  return root;
}

// ---------- arrows in the world ----------
const POOL = [];
let poolScene = null;
export function initArrows(scene) {
  POOL.length = 0; poolScene = scene;
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(arrowGeo(), critterMaterial()); m.visible = false; m.frustumCulled = false; scene.add(m); POOL.push({ m, state: 0 }); }
}
export function clearArrows() { for (const a of POOL) { a.state = 0; a.m.visible = false; } }
let ai = 0;
// returns the arrow record
export function shootArrow(shooter, origin, dir, k, dmgScale = 1) {
  if (!POOL.length) return null;
  let a = POOL.find(x => x.state === 0) || POOL[ai++ % POOL.length];
  a.state = 1; a.shooter = shooter; a.pos = origin.clone(); a.vel = dir.clone().multiplyScalar(arrowSpeed(k)); a.dmg = arrowDmg(k) * dmgScale; a.k = k; a.t = 0; a.ent = null;
  a.m.visible = true; a.m.position.copy(a.pos); a.m.lookAt(_l.copy(a.pos).add(a.vel)); a.m.position.addScaledVector(dir, -ARROW_LEN);
  return a;
}
const _l = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
// H: { trace(shooter, origin, dir, len) -> { d, ent, head }, hit(ent, head, dmg, shooter, point), miss(point) }
export function updateArrows(dt, H) {
  for (const a of POOL) {
    if (a.state === 0) continue;
    a.t += dt;
    if (a.state === 1) {               // flying
      a.vel.y -= ARROW_G * dt;
      const len = a.vel.length() * dt; _d.copy(a.vel).normalize();
      const r = H.trace(a.shooter, a.pos, _d, len);
      if (r.d < len) {
        a.pos.addScaledVector(_d, r.d);
        a.state = 2; a.t = 0;
        if (r.ent) { a.ent = r.ent; a.off = a.pos.clone().sub(r.ent.pos); a.life = 3; H.hit(r.ent, r.head, a.dmg, a.shooter, a.pos); }
        else { a.life = 6; H.miss(a.pos, a.shooter); }
        a.pos.addScaledVector(_d, 0.12);    // bury the head a little
        a.m.position.copy(a.pos); a.m.lookAt(_l.copy(a.pos).add(_d)); a.m.position.addScaledVector(_d, -ARROW_LEN);
        continue;
      } else a.pos.addScaledVector(_d, len);
      if (a.t > 5 || a.pos.y < -20) { a.state = 0; a.m.visible = false; continue; }
      a.m.position.copy(a.pos); a.m.lookAt(_l.copy(a.pos).add(a.vel)); a.m.position.addScaledVector(_d, -ARROW_LEN);
    } else {                            // stuck
      if (a.ent) {
        if (!a.ent.alive && a.t > 0.2) { a.state = 0; a.m.visible = false; continue; }
        _o.copy(a.ent.pos).add(a.off); a.m.position.add(_o).sub(a.pos); a.pos.copy(_o);
      }
      if (a.t > a.life) { a.state = 0; a.m.visible = false; }
    }
  }
}
export const arrowsInFlight = () => POOL.filter(a => a.state === 1).length;
export const arrowsStuck = () => POOL.filter(a => a.state === 2).length;
