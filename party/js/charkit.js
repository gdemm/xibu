// Procedural character kit: builds an original body on the shared KayKit rig (same bones, same animation clips), so every
// existing animation (walk / sprint / jump / sky-dive / drive / hold / reload / die) and the blaster mount keep working.
//
// STYLE contract (js/charstyle.js):
//   rig:      optional { seg: { boneName: k | [kx, ky, kz] } } - scales the rest offset of a bone from its parent
//             (e.g. lowerlegl: 1.4 = longer thighs). Hips are lifted automatically so the feet stay on the ground.
//   build(name, index, ctx): adds parts for one of the 9 character slots (index 0 = the player's character).
//             ctx.R[bone] = rest-pose position (model units, +Y up, +Z = the character's front, +X = the character's LEFT)
//             ctx.add(geometry, Matrix4, color, bone, glow?) - rigid-skinned to that bone, vertex coloured
//   capped:   slots that wear no party hat (default: all)       hatScale: party-hat size factor
//   outlineW / outlineColor / tintK (team tint strength) / neckK (part of the head above the head bone that counts as neck)
// Model units: the game draws at 0.79 m per unit; keep the head top near 2.15 units (1.70 m) so hit boxes and cameras fit.
import * as THREE from 'three';
import { Builder } from './soldier.js';

const _v = new THREE.Vector3();
// ---------- rig re-proportioning ----------
export function reshapeRig(sc, rig) {
  sc.updateMatrixWorld(true);
  let sk = null; sc.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; });
  const bones = sk.skeleton.bones, W = {}, N = {};
  for (const b of bones) W[b.name] = b.getWorldPosition(new THREE.Vector3());
  const k3 = (n) => { const k = rig.seg?.[n]; return k == null ? [1, 1, 1] : Array.isArray(k) ? k : [k, k, k]; };
  // lift: how much longer the left leg (hips -> ankle) gets
  let dh = 0;
  for (const n of ['upperlegl', 'lowerlegl', 'footl']) { const b = sk.skeleton.getBoneByName(n); const off = W[n].y - W[b.parent.name].y; dh += off * (1 - k3(n)[1]); }
  for (const b of bones) {
    const p = b.parent;
    if (!p || !p.isBone) { N[b.name] = W[b.name].clone(); continue; }
    if (b.name === 'hips') { N.hips = W.hips.clone(); N.hips.y += dh; continue; }
    const k = k3(b.name), off = W[b.name].clone().sub(W[p.name]);
    N[b.name] = (N[p.name] || W[p.name]).clone().add(off.set(off.x * k[0], off.y * k[1], off.z * k[2]));
  }
  for (const b of bones) {          // parents come first in the skeleton list
    if (!b.parent || !b.parent.isBone) continue;
    b.parent.updateMatrixWorld(true);
    b.position.copy(b.parent.worldToLocal(N[b.name].clone()));
  }
  sc.updateMatrixWorld(true);
  return dh;
}
// original-rig height -> this rig's height (piecewise linear through sole, hip joint, chest, shoulder, neck, head top)
export function makeGy(sc, headTopAbs, on) {
  if (!on) return (y) => y;
  const y = (n) => sc.getObjectByName(n).getWorldPosition(_v).y;
  const A = [0, 0.519, 0.973, 1.107, 1.241, 2.15], B = [0, y('upperlegl'), y('chest'), y('upperarml'), y('head'), headTopAbs];
  return (v) => {
    let i = 0; while (i < A.length - 2 && v > A[i + 1]) i++;
    return B[i] + (v - A[i]) * (B[i + 1] - B[i]) / (A[i + 1] - A[i]);
  };
}
// ---------- swap the model's mesh for a style's procedural body ----------
export function buildStyled(sc, name, index, style) {
  sc.updateMatrixWorld(true);
  let sk = null; const drop = [];
  sc.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; else if (o.isMesh) drop.push(o); });
  for (const o of drop) o.parent.remove(o);
  const bones = sk.skeleton.bones, R = {};
  for (const b of bones) R[b.name] = b.getWorldPosition(new THREE.Vector3());
  const ibm = sk.bindMatrix.clone().invert();
  const boneMats = bones.map((b, i) => ibm.clone().multiply(sk.skeleton.boneInverses[i].clone().invert()).multiply(b.matrixWorld.clone().invert()));
  const body = new Builder(), glow = new Builder(); body.boneMats = glow.boneMats = boneMats;
  const idx = (n) => { const i = bones.findIndex(b => b.name === n); if (i < 0) throw new Error('no bone ' + n); return i; };
  const ctx = {
    R, THREE,
    add(geo, m, color, bone = 'chest', isGlow = false) { (isGlow ? glow : body).add(geo, m || new THREE.Matrix4(), color, { bone: idx(bone) }); return ctx; },
  };
  style.build(name, index, ctx);
  sk.geometry.dispose();
  sk.geometry = body.build(true);
  sk.material = new THREE.MeshToonMaterial({ vertexColors: true }); sk.material.name = 'StyleVC';
  if (glow.p.length) {
    const g = new THREE.SkinnedMesh(glow.build(true), new THREE.MeshBasicMaterial({ vertexColors: true }));
    g.material.name = 'GlowVC'; g.bind(sk.skeleton, sk.bindMatrix); sk.parent.add(g);
  }
}

// ---------- shape helpers (all return BufferGeometry; place them with M / between) ----------
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const _Y = new THREE.Vector3(0, 1, 0);
// matrix that stands a +Y primitive (centred on the origin) between points a and b, with an optional extra scale
export function between(a, b, sx = 1, sz = 1, roll = 0) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, roll));
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(sx, 1, sz));
}
export const dist = (a, b) => a.distanceTo(b);
export const S = (r, w = 10, h = 7, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
export const HEMI = (r, w = 14, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
export const CAP = (r, len, seg = 10, caps = 3) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), caps, seg);
export const CYL = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const CONE = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const TOR = (r, t, arc = Math.PI * 2, rs = 6, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts, arc);
// rounded box with smooth normals (keeps the outline hull closed)
export function RB(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const nn = v.clone().sub(c); if (nn.lengthSq() < 1e-10) nn.set(0, 0, 1); nn.normalize(); v.copy(c).addScaledVector(nn, r); p.setXYZ(i, v.x, v.y, v.z); n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  return g;
}
// a limb segment from bone a to bone b (radius r0 at a, r1 at b), skinned to bone a; capsule ends hide the joints
export function limb(ctx, a, b, r0, r1, color, o = {}) {
  const A = ctx.R[a].clone(), Bp = ctx.R[b].clone();
  if (o.ext) { const d = Bp.clone().sub(A).normalize(); Bp.addScaledVector(d, o.ext); }
  if (o.pre) { const d = Bp.clone().sub(A).normalize(); A.addScaledVector(d, -o.pre); }
  const len = A.distanceTo(Bp), r = (r0 + r1) / 2;
  let geo;
  if (o.box) geo = RB(r0 * 2 * (o.sx || 1), len + r * 2 * (o.capK ?? 0.6), r0 * 2 * (o.sz || 1), r0 * (o.round ?? 0.5), 2);
  else if (Math.abs(r0 - r1) < 1e-4) geo = CAP(r, Math.max(0.001, len), o.seg || 8, o.caps || 2);
  else { geo = taper(r1, r0, len, o.seg || 8); }
  ctx.add(geo, between(A, Bp, o.box ? 1 : (o.sx || 1), o.box ? 1 : (o.sz || 1), o.roll || 0), color, o.bone || a, o.glow);
  return { a: A, b: Bp, len };
}
// tapered capsule (radius rt at +Y end, rb at -Y end) with hemispherical ends
export function taper(rt, rb, len, seg = 10) {
  const pts = [], n = 3;
  for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(t) * rb, -len / 2 + Math.sin(t) * rb)); }
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(t) * rt, len / 2 + Math.sin(t) * rt)); }
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts, seg);
}
// a feature sitting on the front of a head ellipsoid h = { x, y, z, rx, ry, rz }: (u, v) = offsets from the head centre
export function onHead(h, u, v, inset = 0) {
  const nx = u / h.rx, ny = v / h.ry, k = Math.max(0.0001, 1 - nx * nx - ny * ny);
  const z = h.z + h.rz * Math.sqrt(k) - inset;
  const n = new THREE.Vector3(u / (h.rx * h.rx), v / (h.ry * h.ry), (z - h.z) / (h.rz * h.rz)).normalize();
  return { p: new THREE.Vector3(h.x + u, h.y + v, z), n };
}
const _zA = new THREE.Vector3(0, 0, 1);
// geometry facing +Z placed flat on the head surface, local scale (sx, sy, sz), extra roll rz
export function feat(ctx, h, geo, u, v, inset, sx, sy, sz, col, rz = 0, bone = 'head', glow = false) {
  const { p, n } = onHead(h, u, v, inset);
  const q = new THREE.Quaternion().setFromUnitVectors(_zA, n).multiply(new THREE.Quaternion().setFromAxisAngle(_zA, rz));
  ctx.add(geo, new THREE.Matrix4().compose(p, q, new THREE.Vector3(sx, sy, sz)), col, bone, glow);
}
