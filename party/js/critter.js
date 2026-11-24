// 派对突击 characters: KayKit "Character Pack: Adventurers" + "Skeletons" by Kay Lousberg (CC0) — chunky stylised rigged heroes
// sharing one rig and one animation set, holding a Kenney "Blaster Kit" (CC0) toy blaster.
// Same API as before (createSoldier / animateSoldier / animateDeath / resetSoldier / soldierFired / setSoldierLOD / soldierTris).
// Falls back to the procedural bean critters (bean.js) if the GLBs fail to load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as BEAN from './bean.js';
import { Builder, M } from './soldier.js';
import { makeBow } from './bow.js';
import { STYLE } from './charstyle.js';          // optional procedural look (null = the KayKit models as shipped)
import { buildStyled, reshapeRig, makeGy } from './charkit.js';
import { BOT_CHARS, REG, pickedLook, skinTexUrl } from './roster.js';
export { toonRamp, critterMaterial, BODY_COLORS } from './bean.js';
const { toonRamp, critterMaterial } = BEAN;

const BASE = './assets/chars/';
export const CHARS = BOT_CHARS.map(c => c.id);          // bot deck; the player's character comes from the 角色仓库 (roster.js)
const BLASTERS = ['b', 'c', 'd', 'h', 'k'];
const PLAYER_BLASTER = 'h';
const SCALE = 0.79;                    // model units -> metres: bare head-top 2.15 u -> 1.70 m (see main.js hitBoxes)
const GUN_LEN = 0.62;
const BOW3_S = 1.13, BOW3_TH = 1.9;     // third-person bow: 1.13 x 1.15 m ≈ 1.3 m tall (characters ~1.72 m), limbs 1.9x thicker
const TWIST = STYLE?.twist ?? 0.85;                     // how much of the crossbow stance's sideways twist is squared to the front                   // blaster length, metres
const ASSETS = STYLE?.assets || null;   // a style that swaps in another KayKit-rig character set (Rig_Medium: same bone names)
const LOWER = ['idle', 'walk', 'sprint', 'crouch'], UPPER = ASSETS ? ['hold', 'reload', 'hold1', 'reload1', 'sprintGun', 'idleU', 'walkU', 'sprintU'] : ['hold', 'reload'], FULL = ['fall', 'drive', 'die', 'cheer'];
const UPPER_BONE = /^(chest|upperarm|lowerarm|wrist|hand|handslot)/;   // head follows the lower-body clip (looks ahead)
// characters with their own headgear (helmet, wizard hat, hood, bear hat): no party hat stacked on it
const CAPPED = { has: () => true };     // every character has its own hair / headgear: no party hats
const TEAM_TINT = { blue: 0x7fb4ff, red: 0xff8a80 };

// hit boxes (main.js): default = the measured KayKit numbers; a style re-measures its own body
export const HIT = { top: 0.92, ctop: 0.72, hh: 0.80, chh: 0.84, hw: 0.4 };
const T = { chars: {}, looks: {}, blasters: {}, clips: {}, mats: {}, gunMat: null, outline: null, gunQ: null, ok: false };

function toonVC(tint) {
  const k = 'vc' + (tint || '');
  return T.mats[k] || (T.mats[k] = new THREE.MeshToonMaterial({ vertexColors: true, color: tint ? new THREE.Color(0xffffff).lerp(new THREE.Color(tint), STYLE?.tintK ?? 0.25) : 0xffffff, gradientMap: toonRamp() }));
}
const glowVC = new THREE.MeshBasicMaterial({ vertexColors: true });
function toonOf(map, tint, vary) {
  const k = (map ? map.uuid : 'none') + (tint || '') + ':' + (vary || '');
  if (T.mats[k]) return T.mats[k];
  const c = new THREE.Color(0xffffff); if (vary) c.lerp(new THREE.Color(vary), 0.45); if (tint) c.lerp(new THREE.Color(tint), ASSETS ? 0.25 : 0.35);
  return (T.mats[k] = new THREE.MeshToonMaterial({ map, color: c, gradientMap: toonRamp() }));
}
// several skinned parts on one skeleton -> one mesh (one draw call + one outline per character)
function mergeSkinned(sc, drop) {
  const parts = [], gone = []; sc.traverse(o => { if (o.isMesh && drop && drop.some(d => o.name.includes(d))) gone.push(o); else if (o.isSkinnedMesh) parts.push(o); });
  for (const o of gone) o.parent.remove(o);
  const keep = parts.filter(o => o.parent);
  if (keep.length < 2) return;
  const base = keep[0], same = keep.filter(o => o.skeleton.bones.length === base.skeleton.bones.length && o.skeleton.bones.every((b, i) => b === base.skeleton.bones[i]) && o.material.map === base.material.map && o.bindMatrix.equals(base.bindMatrix));
  if (same.length < 2) return;
  const plain = (a, T) => { const out = new T(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, a.itemSize); };
  const geos = same.map(o => { const c = new THREE.BufferGeometry(), g = o.geometry;
    for (const n of ['position', 'normal', 'uv', 'skinWeight']) if (g.attributes[n]) c.setAttribute(n, plain(g.attributes[n], Float32Array));
    if (g.attributes.skinIndex) c.setAttribute('skinIndex', plain(g.attributes.skinIndex, Uint16Array));
    c.setIndex(g.index ? Array.from(g.index.array) : null); return c; });
  const merged = mergeGeometries(geos, false); if (!merged) return;
  base.geometry = merged; base.name = 'Body';
  for (const o of same) if (o !== base) o.parent.remove(o);
}
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff06a });
function makeOutlineMat(skinned) {
  const m = new THREE.MeshBasicMaterial({ color: STYLE?.outlineColor ?? 0x2a1f2e, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = '#define OUTLINE_W ' + (STYLE?.outlineW ?? 0.022).toFixed(4) + '\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(' + (skinned ? 'objectNormal' : 'normal') + ') * OUTLINE_W;'); };
  m.customProgramCacheKey = () => 'charOutlineKK' + skinned;
  return m;
}
const part = (clip, upper, name) => new THREE.AnimationClip(name || clip.name, clip.duration, clip.tracks.filter(t => UPPER_BONE.test(t.name.split('.')[0]) === upper));
// crouch: a half-way blend between standing idle and the sit pose (lower body only), first frame of each
function makeCrouch(idle, sit, k) {
  const tracks = [];
  for (const st of sit.tracks) {
    if (UPPER_BONE.test(st.name.split('.')[0])) continue;
    const it = idle.tracks.find(t => t.name === st.name); const n = st.getValueSize();
    const a = it ? it.values.slice(0, n) : st.values.slice(0, n), b = st.values.slice(0, n), v = [];
    if (n === 4) {
      const q = new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), k);
      if (st.name === 'spine.quaternion') q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38));   // lean in
      v.push(q.x, q.y, q.z, q.w);
    }
    else for (let i = 0; i < n; i++) v.push(a[i] + (b[i] - a[i]) * k);
    tracks.push(new (n === 4 ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack)(st.name, [0], v));
  }
  return new THREE.AnimationClip('crouch', 1, tracks);
}

function sampleQ(root, clip, t, bone) {
  const mx = new THREE.AnimationMixer(root), a = mx.clipAction(clip); a.play(); a.time = t; mx.update(0); root.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); root.getObjectByName(bone).getWorldQuaternion(q); mx.stopAllAction(); mx.uncacheRoot(root); return q;
}
function stance(root, clip, last, idle) {
  const ct = clip.tracks.find(t => t.name === 'chest.quaternion');
  const times = last ? [clip.duration] : Array.from(ct.times);
  const qs = sampleQ(root, idle, 0, 'spine').invert(), f = new THREE.Vector3(), ry = new THREE.Quaternion(), vals = [];
  for (const t of times) {
    const qc = sampleQ(root, clip, Math.min(t, clip.duration - 1e-4), 'chest');
    f.set(0, 0, 1).applyQuaternion(qc); ry.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(f.x, f.z) * TWIST);
    const l = qc.premultiply(ry).premultiply(qs); vals.push(l.x, l.y, l.z, l.w);
  }
  const tracks = [new THREE.QuaternionKeyframeTrack('chest.quaternion', last ? [0] : times, vals)];
  for (const t of clip.tracks) {
    const bn = t.name.split('.')[0]; if (bn === 'chest' || !UPPER_BONE.test(bn)) continue;
    if (!last) { tracks.push(t); continue; }
    const n = t.getValueSize(), i = t.times.length - 1;
    tracks.push(new (n === 4 ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack)(t.name, [0], Array.from(t.values.slice(i * n, i * n + n))));
  }
  return new THREE.AnimationClip(clip.name, last ? 1 : clip.duration, tracks);
}
const _v = new THREE.Vector3();
// gait of a looping locomotion clip: ground speed (m/s at timeScale 1, from how fast a planted foot slides back) and the
// normalised time the left foot is furthest forward (so walk and sprint can share one phase and never cross-step)
function gait(root, clip) {
  const mx = new THREE.AnimationMixer(root), a = mx.clipAction(clip), foot = root.getObjectByName('footl'), N = 64, ys = [], zs = [];
  a.play();
  for (let i = 0; i < N; i++) { a.time = clip.duration * i / N; mx.update(0); root.updateMatrixWorld(true); foot.getWorldPosition(_v); ys.push(_v.y); zs.push(_v.z); }
  mx.stopAllAction(); mx.uncacheRoot(root);
  const yMin = Math.min(...ys), yCut = yMin + 0.35 * (Math.max(...ys) - yMin), dts = clip.duration / N, sp = [];
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (ys[i] < yCut && ys[j] < yCut) sp.push(Math.abs(zs[j] - zs[i]) / dts); }
  sp.sort((x, y) => x - y);
  const v = (sp.length ? sp[sp.length >> 1] : 1) * SCALE;
  let fwd = 0; for (let i = 1; i < N; i++) if (zs[i] > zs[fwd]) fwd = i;
  return { v: Math.max(0.5, v), dur: clip.duration, fwd: fwd / N };
}
// ---------- detail pass: small original add-ons skinned to the shared rig (eye shine, blush, shoe soles, team armband, back emblem) ----------
// Everything for one character is ONE extra SkinnedMesh (rigid-skinned, vertex colours) -> +1 draw call per character, ~400 tris.
const FACE = new Set(['knight', 'barbarian', 'mage', 'rogue-hood']);      // painted-face heroes (skeletons have glowing eyes)
const SOLES = new Set(['knight', 'barbarian', 'mage', 'rogue-hood']);
// measure rest-pose surface points once per character (raycast the rest pose), in model (scene) space
function measure(n, sc) {
  let sk = null; sc.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; }); if (!sk) return null;
  const bi = (name) => sk.skeleton.bones.findIndex(b => b.name === name);
  const rc = new THREE.Raycaster(), head = sc.getObjectByName('head').matrixWorld, chest = sc.getObjectByName('chest').matrixWorld;
  // cast from in front (+Z) toward the body at a point given in a bone's local frame; returns { p, n } in mesh space
  const hit = (m, x, y, back = false) => {
    const o = new THREE.Vector3(x, y, back ? -3 : 3).applyMatrix4(m), d = new THREE.Vector3(0, 0, back ? 1 : -1).transformDirection(m);
    rc.set(o, d); const h = rc.intersectObject(sk, false)[0]; if (!h) return null;
    const nn = h.face ? h.face.normal.clone() : new THREE.Vector3(0, 0, 1);
    return { p: h.point.clone(), n: nn.transformDirection(sk.matrixWorld) };
  };
  const bbox = (names) => {          // mesh-space bounds of the vertices skinned to these bones
    const ids = names.map(bi), J = sk.geometry.attributes.skinIndex, W = sk.geometry.attributes.skinWeight, b = new THREE.Box3();
    for (let k = 0; k < J.count; k++) if (ids.includes(J.getX(k)) && W.getX(k) > 0.5) b.expandByPoint(sk.getVertexPosition(k, _v).applyMatrix4(sk.matrixWorld));
    return b;
  };
  const S = { sk, bone: bi, feet: { l: bbox(['footl', 'toesl']), r: bbox(['footr', 'toesr']) }, arm: bbox(['upperarml']), backPin: hit(chest, 0, -0.12, true) };
  const ua = sc.getObjectByName('upperarml'); S.armM = ua.matrixWorld.clone();
  // the rig's bind pose differs from the GLB's rest pose: map a rest-pose point on bone i back into bind space
  const ibm = sk.bindMatrix.clone().invert();
  S.boneMats = sk.skeleton.bones.map((b, i) => ibm.clone().multiply(sk.skeleton.boneInverses[i].clone().invert()).multiply(b.matrixWorld.clone().invert()));
  // arm radius around the bone axis (bone-local X/Z extent of its vertices)
  { const ib = ua.matrixWorld.clone().invert(), J = sk.geometry.attributes.skinIndex, W = sk.geometry.attributes.skinWeight, id = bi('upperarml'); let r = 0, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < J.count; k++) if (J.getX(k) === id && W.getX(k) > 0.5) { sk.getVertexPosition(k, _v).applyMatrix4(sk.matrixWorld).applyMatrix4(ib); r = Math.max(r, Math.hypot(_v.x, _v.z)); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    S.armR = r; S.armY = [y0, y1]; }
  // rest-pose surface points of the torso and head (all skinned parts), for fitting the BR gear shells
  { const tor = [], hd = []; sc.traverse(o => { if (!o.isSkinnedMesh) return;
      const names = o.skeleton.bones.map(b => b.name), J = o.geometry.attributes.skinIndex, W = o.geometry.attributes.skinWeight;
      for (let k = 0; k < J.count; k++) { if (W.getX(k) < 0.5) continue; const bn = names[J.getX(k)];
        const arr = bn === 'head' ? hd : (bn === 'chest' || bn === 'spine') ? tor : null; if (!arr) continue;
        o.getVertexPosition(k, _v).applyMatrix4(o.matrixWorld); arr.push(_v.x, _v.y, _v.z); } });
    S.torsoPts = tor; S.headPts = hd; }
  if (FACE.has(n)) {
    S.eyes = [-1, 1].map(s => [hit(head, s * 0.195 - 0.022, 0.378), hit(head, s * 0.195 + 0.026, 0.333)]);
    if (n !== 'barbarian') S.cheeks = [-1, 1].map(s => hit(head, s * 0.29, 0.245));
  }
  return S;
}
const EXTRA = {};
function starGeo(R, r, t) {        // 5-point star lying in XZ, thickness t along +Y
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, k = i % 2 ? r : R; const x = Math.cos(a) * k, y = Math.sin(a) * k; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2); g.rotateX(-Math.PI / 2); return g;
}
const _qn = new THREE.Quaternion(), _zA = new THREE.Vector3(0, 0, 1);
function extrasGeo(n, color, noBadge = false) {
  const key = n + ':' + color + (noBadge ? ':nb' : ''); if (EXTRA[key]) return EXTRA[key];
  const S = T.chars[n].spots; if (!S) return null;
  const B = new Builder(), bone = (b) => ({ bone: S.bone(b) }); B.boneMats = S.boneMats;
  // a flattened blob sitting on the surface along its normal (half sunk in, so it never floats off curved faces)
  const onSurf = (h, r, flat, sx, sy, col, b, sink = 0.45) => {
    if (!h) return; _qn.setFromUnitVectors(_zA, h.n);
    const p = h.p.clone().addScaledVector(h.n, -r * flat * sink);
    B.add(new THREE.SphereGeometry(r, 10, 6), new THREE.Matrix4().compose(p, _qn, new THREE.Vector3(sx, sy, flat)), col, bone(b));
  };
  if (S.eyes) for (const [big, small] of S.eyes) { onSurf(big, 0.026, 0.45, 1, 1.1, 0xffffff, 'head', 0.2); onSurf(small, 0.013, 0.45, 1, 1, 0xffffff, 'head', 0.2); }
  if (S.cheeks) for (const c of S.cheeks) onSurf(c, 0.062, 0.3, 1.25, 0.62, 0xf59a92, 'head', 0.55);
  // shoe soles: a cream rubber rim under each boot, with a darker heel block
  if (SOLES.has(n)) for (const [side, f] of [['l', S.feet.l], ['r', S.feet.r]]) {
    if (f.isEmpty()) continue;
    const w = f.max.x - f.min.x + 0.035, d = f.max.z - f.min.z + 0.04, cx = (f.min.x + f.max.x) / 2, cz = (f.min.z + f.max.z) / 2, y = f.min.y;
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), M(cx, y + 0.028, cz + 0.005, 0, 0, 0, w, 0.055, d), 0xf1e6cf, bone('foot' + side));
    B.add(new THREE.BoxGeometry(w * 0.86, 0.03, d * 0.28), M(cx, y + 0.016, f.min.z + d * 0.16), 0x5a4636, bone('foot' + side));
  }
  // left-arm team / party band with a white stripe
  if (S.armR > 0) {
    const r = S.armR + 0.012, yb = S.armY[0] + (S.armY[1] - S.armY[0]) * 0.55;
    B.add(new THREE.CylinderGeometry(r, r, 0.085, 14, 1, true), new THREE.Matrix4().multiplyMatrices(S.armM, M(0, yb, 0)), color, bone('upperarml'));
    B.add(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.022, 14, 1, true), new THREE.Matrix4().multiplyMatrices(S.armM, M(0, yb, 0)), 0xffffff, bone('upperarml'));
  }
  // round party emblem on the back (what the third-person camera sees most): white rim, coloured disc, white star
  if (S.backPin && !noBadge) {
    const h = S.backPin, up = new THREE.Vector3(0, 1, 0); _qn.setFromUnitVectors(up, h.n);
    const at = (geo, off, col) => B.add(geo, new THREE.Matrix4().compose(h.p.clone().addScaledVector(h.n, off), _qn, new THREE.Vector3(1, 1, 1)), col, bone('chest'));
    at(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 18), 0.0, 0xffffff); at(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 18), 0.012, color);
    at(starGeo(0.085, 0.036, 0.03), 0.035, 0xffffff);
  }
  const g = B.build(true); g.userData.tris = B.tris;
  return (EXTRA[key] = g);
}
// ---------- BR gear (helmet / vest / backpack): skin-tight shells fitted to each character's rest-pose surface ----------
// One SkinnedMesh per character (all worn pieces merged, cached per char + levels) + its outline: +2 draw calls when geared.
const GEAR_ACC = [0, 0xe8eef2, 0x4d9bff, 0xb46bff];        // level accents = HUD colours (white / blue / purple)
const GEARGEO = {};
// widest distance from the vertical axis (x = 0, z = cz) of the surface points near height y, around direction th
// (th = 0 is the character's front, +Z; th = +PI/2 is +X)
function radAt(pts, y, th, dy, dth, cz) {
  let r = -1;
  for (let i = 0; i < pts.length; i += 3) {
    if (Math.abs(pts[i + 1] - y) > dy) continue;
    const x = pts[i], z = pts[i + 2] - cz;
    let d = Math.abs(Math.atan2(x, z) - th); if (d > Math.PI) d = Math.PI * 2 - d; if (d > dth) continue;
    const rr = Math.hypot(x, z); if (rr > r) r = rr;
  }
  return r;
}
// shell: nR rings (height o.y(t, th), t = 0..1) x nA angle steps over th0..th1, radius = surface (dilated, clamped) + pad + o.add(t, th)
function shell(pts, o) {
  const nR = o.nR, nA = o.nA, th0 = o.th0 ?? -Math.PI, th1 = o.th1 ?? Math.PI, cz = o.cz || 0, rMin = o.rMin ?? 0.08, rMax = o.rMax ?? 0.7;
  const full = th1 - th0 > Math.PI * 2 - 1e-4, nAv = full ? nA : nA + 1, dth = Math.max(0.2, (th1 - th0) / nA * 0.9);
  const thJ = (j) => th0 + (th1 - th0) * j / nA, yIJ = (i, j) => o.y(nR > 1 ? i / (nR - 1) : 0, thJ(j));
  const R = [];
  for (let i = 0; i < nR; i++) { const row = []; for (let j = 0; j < nAv; j++) row.push(radAt(pts, yIJ(i, j), thJ(j), o.dy || 0.06, dth, cz)); R.push(row); }
  for (const row of R) { let m = -1; for (const r of row) m = Math.max(m, r); for (let j = 0; j < nAv; j++) if (row[j] < 0) row[j] = m; }
  for (let i = 0; i < nR; i++) if (R[i][0] < 0) { const k = R.findIndex(r => r[0] > 0); R[i] = k >= 0 ? R[k].slice() : R[i].map(() => rMin); }
  // optional dome envelope: ring i may be no wider than ring 0 x o.env(t) (horns / hat brims poke through instead of boxing the shell)
  if (o.env) for (let i = 1; i < nR; i++) { const k = o.env(i / (nR - 1)); for (let j = 0; j < nAv; j++) R[i][j] = Math.min(R[i][j], Math.min(rMax, R[0][j]) * k); }
  const at = (i, j) => { if (!R[i]) return -1; if (full) j = (j + nAv) % nAv; return R[i][j] ?? -1; };
  const pos = [], idx = [];
  for (let i = 0; i < nR; i++) for (let j = 0; j < nAv; j++) {
    let r = R[i][j];
    for (const [a, b, k] of [[i, j - 1, 1], [i, j + 1, 1], [i - 1, j, 0.96], [i + 1, j, 0.96]]) r = Math.max(r, at(a, b) * k);   // never dip into the body between samples
    if (o.env && i) r = Math.min(r, Math.min(rMax, R[0][j]) * o.env(i / (nR - 1)));
    r = Math.min(rMax, Math.max(rMin, r)) + o.pad + (o.add ? o.add(nR > 1 ? i / (nR - 1) : 0, thJ(j)) : 0);
    const th = thJ(j); pos.push(Math.sin(th) * r, yIJ(i, j), cz + Math.cos(th) * r);
  }
  for (let i = 0; i < nR - 1; i++) for (let j = 0; j < nA; j++) {
    const a = i * nAv + j, b = i * nAv + (full ? (j + 1) % nAv : j + 1), c = a + nAv, d = b + nAv;
    idx.push(a, b, c, b, d, c);
  }
  if (o.cap != null) {
    const t = pos.length / 3; pos.push(0, o.cap, cz); const base = (nR - 1) * nAv;
    for (let j = 0; j < nA; j++) idx.push(base + j, base + (full ? (j + 1) % nAv : j + 1), t);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const facing = (x, y, z, th, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, th, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
// a thin box between two points (straps)
function strapM(a, b, w, t) { const d = new THREE.Vector3().subVectors(b, a), len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return { m: new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(w, len, t)) }; }
function gearGeo(n, a, h, bg, color) {
  const key = [n, a, h, bg, color].join(':'); if (GEARGEO[key]) return GEARGEO[key];
  const C = T.chars[n], S = C.spots; if (!S || !S.torsoPts) return null;
  const B = new Builder(); B.boneMats = S.boneMats;
  const bone = (b) => ({ bone: S.bone(b) }), I = new THREE.Matrix4(), gy = C.gy, gw = C.gw;
  const tp = S.torsoPts, hp = S.headPts;
  const vestPad = [0, 0.04, 0.05, 0.06][a];
  // ---- vest: lower half follows the spine, upper half the chest (overlapping a little so bending never opens a gap)
  if (a) {
    const body = [0, 0xe8eef2, 0x5b6673, 0x3d3552][a], acc = GEAR_ACC[a], Y0 = gy(0.72), Y1 = gy(1.24), YS = gy(0.97);
    const lerpY = (p, q) => (t) => p + (q - p) * t;
    B.add(shell(tp, { nR: 4, nA: 18, y: lerpY(Y0, YS + 0.03), pad: vestPad }), I, body, bone('spine'));
    B.add(shell(tp, { nR: 4, nA: 18, y: lerpY(YS - 0.03, Y1), pad: vestPad, rMin: 0.2 }), I, body, bone('chest'));
    // hem + collar trims in the level colour
    B.add(shell(tp, { nR: 2, nA: 18, y: lerpY(Y0 - 0.01, Y0 + 0.05), pad: vestPad + 0.012 }), I, a === 1 ? 0xaab6c0 : acc, bone('spine'));
    B.add(shell(tp, { nR: 2, nA: 18, y: lerpY(Y1 - 0.05, Y1 + 0.01), pad: vestPad + 0.012, rMin: 0.2 }), I, a === 1 ? 0xaab6c0 : acc, bone('chest'));
    const surf = (y, th) => radAt(tp, y, th, 0.12, 0.35, 0) + vestPad;
    if (a === 1) {          // soft vest: two front pouches
      for (const s of [-1, 1]) { const th = s * 0.42, r = surf(gy(0.86), th) + 0.03; B.add(new THREE.BoxGeometry(0.15, 0.13, 0.07), facing(Math.sin(th) * r, gy(0.86), Math.cos(th) * r, th), 0xc9d2d9, bone('spine')); }
    } else {                // plate carrier: front + back plates (lv3: bigger, + shoulder pads)
      const pw = (a === 2 ? 0.4 : 0.46) * gw, ph = a === 2 ? 0.3 : 0.36, py = gy(1.02);
      for (const th of [0, Math.PI]) {
        const r = surf(py, th) + 0.03;
        B.add(new THREE.BoxGeometry(pw, ph, 0.06), facing(Math.sin(th) * r, py, Math.cos(th) * r, th), acc, bone('chest'));
        B.add(new THREE.BoxGeometry(pw * 0.7, 0.04, 0.03), facing(Math.sin(th) * (r + 0.035), py + ph * 0.25, Math.cos(th) * (r + 0.035), th), 0xffffff, bone('chest'));
      }
      if (a === 3) for (const s of [-1, 1]) {
        const th = s * Math.PI / 2, r = surf(gy(1.16), th) + 0.02;
        B.add(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(s * r, gy(1.2), 0, 0, 0, -s * 0.5, 1, 0.55, 1.15), acc, bone(s > 0 ? 'upperarml' : 'upperarmr'));
        B.add(new THREE.TorusGeometry(0.165, 0.022, 5, 14), M(s * r, gy(1.2), 0, Math.PI / 2, s * 0.5, 0, 1, 1.15, 1), 0x2b2540, bone(s > 0 ? 'upperarml' : 'upperarmr'));
      }
    }
  }
  // ---- backpack on the back (behind the vest), carrying the party emblem; straps over the shoulders
  if (bg) {
    const acc = GEAR_ACC[bg], canvas = [0, 0x8a7652, 0x6f6448, 0x4e4a3c][bg];
    const [w0, ph, d] = [null, [0.44, 0.44, 0.2], [0.52, 0.54, 0.25], [0.6, 0.64, 0.3]][bg], w = w0 * gw;
    let rb = 0; for (let y = gy(0.8); y <= gy(1.2); y += 0.05) rb = Math.max(rb, radAt(tp, y, Math.PI, 0.05, 0.5, 0));
    rb += 0.06;                                           // clears the thickest vest
    const top = gy(1.2), cy = top - ph / 2, cz = -rb - d / 2, back = cz - d / 2;
    B.add(new THREE.BoxGeometry(w, ph, d), M(0, cy, cz), canvas, bone('chest'));
    B.add(new THREE.BoxGeometry(w + 0.03, 0.14, d + 0.03), M(0, top - 0.06, cz - 0.005), acc, bone('chest'));                // lid
    B.add(new THREE.BoxGeometry(w * 0.72, ph * 0.42, 0.07), M(0, cy - ph * 0.14, back - 0.03), mixC(canvas, 0x000000, 0.18), bone('chest'));   // front pocket
    if (bg >= 2) for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.07, ph * 0.5, d * 0.7), M(s * (w / 2 + 0.03), cy - ph * 0.12, cz), acc, bone('chest'));   // side pockets
    if (bg === 3) B.add(new THREE.CylinderGeometry(0.1, 0.1, w + 0.08, 12), M(0, top + 0.08, cz + 0.02, 0, 0, Math.PI / 2), acc, bone('chest'));   // bedroll
    // emblem on the pocket (the back badge moves here while a bag is worn)
    const ez = back - 0.07, ey = cy + ph * 0.12, rx = -Math.PI / 2;
    B.add(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 18), M(0, ey, ez, rx), 0xffffff, bone('chest'));
    B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 18), M(0, ey, ez - 0.008, rx), color, bone('chest'));
    B.add(starGeo(0.068, 0.029, 0.025), M(0, ey, ez - 0.025, rx), 0xffffff, bone('chest'));
    // straps: from the lid over the shoulder tops
    const sh = radAt(tp, gy(1.22), 0, 0.06, 0.5, 0);
    for (const s of [-1, 1]) {
      const p0 = new THREE.Vector3(s * w * 0.28, top - 0.04, -rb + 0.02), p1 = new THREE.Vector3(s * w * 0.3, gy(1.29), -0.05), p2 = new THREE.Vector3(s * w * 0.3, gy(1.15), Math.max(0.12, sh));
      B.add(new THREE.BoxGeometry(1, 1, 1), strapM(p0, p1, 0.075, 0.03).m, acc, bone('chest'));
      B.add(new THREE.BoxGeometry(1, 1, 1), strapM(p1, p2, 0.075, 0.03).m, acc, bone('chest'));
    }
  }
  // ---- helmet: shell over the top of the head (from just above the eyes), neck guard grows with level
  if (h) {
    const acc = GEAR_ACC[h], shellC = [0, 0xe8eef2, 0x3f7fd6, 0x6b45b0][h], rimC = [0, 0xa9b4bd, 0x27313d, 0x2b2540][h];
    const pad = [0, 0.055, 0.07, 0.085][h], drop = [0, 0.08, 0.16, 0.26][h];
    const headTopAbs = C.headTop + C.headY;
    let zmin = 1e9, zmax = -1e9; for (let i = 0; i < hp.length; i += 3) if (hp[i + 1] > gy(1.75) && hp[i + 1] < gy(1.95) && Math.abs(hp[i]) < 0.3) { zmin = Math.min(zmin, hp[i + 2]); zmax = Math.max(zmax, hp[i + 2]); }
    const cz = zmin < zmax ? (zmin + zmax) / 2 : 0, yb = gy(1.7), yTop = Math.min(headTopAbs, yb + (gy(2.42) - gy(1.7)));
    const y0 = (th) => yb - drop * Math.max(0, -Math.cos(th));
    const hs = { nA: 20, cz, rMax: 0.74, dy: 0.05 };
    B.add(shell(hp, { ...hs, nR: 7, y: (t, th) => y0(th) + (yTop - 0.02 - y0(th)) * Math.pow(t, 0.85), pad, env: (t) => 1.12 * Math.pow(Math.max(0.01, 1 - Math.pow(t, 2.6)), 0.4), cap: yTop + pad * 0.9 }), I, shellC, bone('head'));
    B.add(shell(hp, { ...hs, nR: 2, y: (t, th) => y0(th) - 0.012 + 0.07 * t, pad: pad + 0.022 }), I, h === 1 ? rimC : acc, bone('head'));   // rim
    const crestR = radAt(hp, yTop - 0.15, 0, 0.08, 0.5, cz) + pad;
    if (h === 1) {          // padded cap: soft peak in front + seams
      B.add(shell(hp, { ...hs, nR: 2, nA: 10, th0: -0.95, th1: 0.95, y: (t) => yb + 0.03 - 0.035 * t, pad: pad + 0.01, add: (t) => 0.14 * t }), I, 0xcfd8df, bone('head'));
      B.add(new THREE.SphereGeometry(1, 10, 6), M(0, yTop + pad * 0.6, cz, 0, 0, 0, 0.045, 0.045, 0.045), rimC, bone('head'));
    } else {                // crest ridge front-to-back (lv3 taller, level colour)
      B.add(new THREE.SphereGeometry(1, 12, 6), M(0, yTop + pad - 0.03, cz, 0, 0, 0, 0.04, h === 2 ? 0.07 : 0.13, Math.max(0.2, crestR * 0.75)), h === 2 ? 0x27313d : acc, bone('head'));
    }
    if (h === 3) {          // visor band across the brow + side discs
      B.add(shell(hp, { ...hs, nR: 2, nA: 12, th0: -1.15, th1: 1.15, y: (t) => yb + 0.02 + 0.13 * t, pad: pad + 0.03, add: (t) => 0.03 * (1 - t) }), I, 0x2a2340, bone('head'));
      B.add(shell(hp, { ...hs, nR: 2, nA: 12, th0: -1.15, th1: 1.15, y: (t) => yb + 0.15 + 0.035 * t, pad: pad + 0.035 }), I, acc, bone('head'));
      for (const s of [-1, 1]) { const r = radAt(hp, yb + 0.05, s * Math.PI / 2, 0.08, 0.4, cz) + pad + 0.02; B.add(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), M(s * r, yb + 0.04, cz, 0, 0, Math.PI / 2), acc, bone('head')); }
    }
  }
  const g = B.build(true); g.userData.tris = B.tris;
  return (GEARGEO[key] = g);
}
let GEAR_MAT = null;
const gearMat = () => GEAR_MAT || (GEAR_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide }));
// BR loot shown on the body: armor / helmet / bag level 0..3. Cheap to call every frame (no-op unless a level changed).
export function setSoldierGear(g, armor = 0, helmet = 0, bag = 0) {
  const u = g.userData; if (!u || !u.mixer) return;
  const key = armor + '|' + helmet + '|' + bag; if (u.gearKey === key) return; u.gearKey = key;
  const geo = armor || helmet || bag ? gearGeo(u.char, armor, helmet, bag, u.exColor) : null;
  if (geo && !u.gearMesh) {
    const sk = u.meshes[0];
    u.gearMesh = new THREE.SkinnedMesh(geo, gearMat()); u.gearMesh.bind(sk.skeleton, sk.bindMatrix); u.gearMesh.boundingSphere = sk.boundingSphere;
    u.gearOl = new THREE.SkinnedMesh(geo, T.outline); u.gearOl.bind(sk.skeleton, sk.bindMatrix); u.gearOl.boundingSphere = sk.boundingSphere;
    sk.parent.add(u.gearMesh, u.gearOl);
  }
  if (u.gearMesh) { if (geo) { u.gearMesh.geometry = geo; u.gearOl.geometry = geo; } u.gearMesh.visible = !!geo; u.gearOl.visible = !!geo && !u.lo; }
  if (u.hatMesh) u.hatMesh.visible = !helmet;                        // party hat off while a helmet is worn
  if (u.extras) { const eg = extrasGeo(u.char, u.exColor, !!bag); if (eg) u.extras.geometry = eg; }   // emblem moves onto the backpack
}
const LOADER = new GLTFLoader(), LOADING = {};
// one character: load its GLB, merge its parts into one skinned mesh, measure it (head top, gear fitting spots)
function prepChar(n, sc) {
  let headTop = 0, tris = 0;
  sc.updateMatrixWorld(true);
  sc.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    if (o.isSkinnedMesh) {   // head top = highest vertex bound to the head bone (skinned + quantised: measure posed vertices)
      const hi = o.skeleton.bones.findIndex(b => b.name === 'head'), J = o.geometry.attributes.skinIndex, W = o.geometry.attributes.skinWeight;
      for (let k = 0; k < J.count; k++) if (J.getX(k) === hi && W.getX(k) > 0.5) headTop = Math.max(headTop, o.getVertexPosition(k, _v).applyMatrix4(o.matrixWorld).y);
    }
  });
  const head = sc.getObjectByName('head'), hp = new THREE.Vector3(); head.getWorldPosition(hp);
  const C = T.chars[n] = { scene: sc, headTop: headTop - hp.y, headY: hp.y, tris, spots: measure(n, sc) };
  C.gy = makeGy(sc, headTop, true); C.gw = Math.min(1.25, Math.max(0.75, Math.abs(sc.getObjectByName('upperarml').getWorldPosition(new THREE.Vector3()).x) / 0.212));
}
async function loadChar(id) {
  const e = REG[id]; if (!e) throw new Error('unknown character ' + id);
  const gl = await LOADER.loadAsync(e.url); const sc = gl.scene; mergeSkinned(sc, e.drop); prepChar(id, sc);
  sc.traverse(o => { if (o.isSkinnedMesh && o.material.map && !T.chars[id].map) T.chars[id].map = o.material.map; });   // the character's atlas (skins swap it)
}
// skins: a pre-baked recolor of the character's own atlas; swapped in for that atlas only (same material count, same draw calls)
const TEXLOADER = new THREE.TextureLoader(), LOOKING = {};
function ensureLook(id, look) {
  const k = id + '|' + look;
  if (!look || T.looks[k]) return Promise.resolve(true);
  return LOOKING[k] || (LOOKING[k] = ensureChar(id).then(ok => ok && TEXLOADER.loadAsync(skinTexUrl(id, look)).then(tex => {
    const a = T.chars[id].map; tex.flipY = false; tex.colorSpace = a ? a.colorSpace : THREE.SRGBColorSpace;
    if (a) { tex.wrapS = a.wrapS; tex.wrapT = a.wrapT; tex.magFilter = a.magFilter; tex.minFilter = a.minFilter; tex.anisotropy = a.anisotropy; }
    T.looks[k] = tex; return true;
  })).catch(err => { console.warn('skin failed to load', k, err); delete LOOKING[k]; return false; }));
}
export const hasChar = (id) => !!T.chars[id];
// lazy load: the match / wardrobe preview awaits this before creating a soldier with that character
export function ensureChar(id, look) {
  if (look) return Promise.all([ensureChar(id), ensureLook(id, look)]).then(r => r[0]);
  if (T.chars[id] || !REG[id]) return Promise.resolve(!!T.chars[id]);
  return LOADING[id] || (LOADING[id] = loadChar(id).then(() => true, (err) => { console.warn('character failed to load', id, err); delete LOADING[id]; return false; }));
}
export const loadedChars = () => Object.keys(T.chars);
async function load() {
  const L = LOADER;
  const pick = pickedLook();
  const [anims, ...bl] = await Promise.all([L.loadAsync(ASSETS.dir + ASSETS.anims), ...BLASTERS.map(b => L.loadAsync(BASE + 'blaster-' + b + '.glb')),
    ...CHARS.map(n => ensureChar(n)), ensureChar(pick.char, pick.look)]);
  for (const n of CHARS) if (!T.chars[n]) throw new Error('bot character missing ' + n);
  const rest = bl.slice(0, BLASTERS.length);
  const byName = Object.fromEntries(anims.animations.map(a => [a.name, a]));
  for (const n of ['idle', 'walk', 'sprint']) T.clips[n] = part(byName[n], false);
  for (const n of FULL) T.clips[n] = byName[n];
  T.clips.crouch = makeCrouch(byName.idle, byName.drive, 0.85);
  BLASTERS.forEach((b, i) => {
    const sc = rest[i].scene;
    sc.traverse(o => { if (o.isMesh) { if (!T.gunMat) T.gunMat = toonOf(o.material.map); o.material = T.gunMat; } });
    const box = new THREE.Box3().setFromObject(sc); T.blasters[b] = { scene: sc, box };
  });
  // upper-body stances: the crossbow clips twist the whole body sideways; keep the arms, square the chest to the front
  const tmp = SkeletonUtils.clone(T.chars[CHARS[0]].scene);
  T.clips.hold = stance(tmp, byName.hold, true, byName.idle);
  T.clips.reload = stance(tmp, byName.reload, false, byName.idle);
  if (ASSETS) {
    T.clips.hold1 = stance(tmp, byName.hold1, true, byName.idle); T.clips.reload1 = stance(tmp, byName.reload1, false, byName.idle);
    T.clips.sprintGun = part(byName.sprintGun, true, 'sprintGun');
    for (const n of ['idle', 'walk', 'sprint']) T.clips[n + 'U'] = part(byName[n], true, n + 'U');
  }
  // blaster orientation: in the holding pose the barrel points straight ahead (model +Z), upright
  const mx = new THREE.AnimationMixer(tmp);
  mx.clipAction(T.clips.idle).play(); mx.clipAction(T.clips.hold).play(); mx.update(0); tmp.updateMatrixWorld(true);
  const hq = new THREE.Quaternion(); tmp.getObjectByName('handslotr').getWorldQuaternion(hq);
  T.gunQ = hq.clone().invert();
  if (ASSETS) {
    const aim = (hr, hl) => { const d = hl.clone().sub(hr).normalize(), up = new THREE.Vector3(0, 1, 0); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d.clone().negate(), up); return new THREE.Quaternion().setFromRotationMatrix(m); };
    const pr = new THREE.Vector3(), pl = new THREE.Vector3(); tmp.getObjectByName('handslotr').getWorldPosition(pr); tmp.getObjectByName('handslotl').getWorldPosition(pl);
    const tmpQ = tmp.getWorldQuaternion(new THREE.Quaternion());
    const fw0 = new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ), dir = pl.clone().sub(pr).normalize().lerp(fw0, STYLE?.gunFwd ?? 0.5).normalize();
    T.gunQ = hq.clone().invert().multiply(aim(pr, pr.clone().add(dir)));
    const m1 = new THREE.AnimationMixer(tmp); mx.stopAllAction(); m1.clipAction(T.clips.idle).play(); m1.clipAction(T.clips.hold1).play(); m1.update(0); tmp.updateMatrixWorld(true);
    const hq1 = tmp.getObjectByName('handslotr').getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ), p0 = new THREE.Vector3(); tmp.getObjectByName('handslotr').getWorldPosition(p0);
    T.gunQ1 = hq1.clone().invert().multiply(aim(p0, p0.clone().add(fwd)));
    m1.stopAllAction(); mx.clipAction(T.clips.idle).play(); mx.clipAction(T.clips.hold).play(); mx.update(0); tmp.updateMatrixWorld(true);
  }
  // ...and sits between both fists (grip at the midpoint of the two hand slots), so it reads as held two-handed
  const hr = tmp.getObjectByName('handslotr'), hl = tmp.getObjectByName('handslotl'), mid = new THREE.Vector3(), pl = new THREE.Vector3();
  hr.getWorldPosition(mid); hl.getWorldPosition(pl); mid.lerp(pl, 0.5); T.gunOff = ASSETS ? new THREE.Vector3() : hr.worldToLocal(mid);
  // crouch: drop the hips so the feet stay on the ground
  const mc = new THREE.AnimationMixer(tmp); mx.stopAllAction(); mc.clipAction(T.clips.crouch).play(); mc.update(0); tmp.updateMatrixWorld(true);
  const fy = new THREE.Vector3(); tmp.getObjectByName('footl').getWorldPosition(fy);
  const mi = new THREE.AnimationMixer(tmp); mc.stopAllAction(); mi.clipAction(T.clips.idle).play(); mi.update(0); tmp.updateMatrixWorld(true);
  const fi = new THREE.Vector3(); tmp.getObjectByName('footl').getWorldPosition(fi);
  const ht = T.clips.crouch.tracks.find(t => t.name === 'hips.position'); if (ht) ht.values[1] -= fy.y - fi.y;
  T.loco = { walk: gait(tmp, T.clips.walk), sprint: gait(tmp, T.clips.sprint) };
  T.outline = makeOutlineMat(true); T.outlineRigid = makeOutlineMat(false);
  {     // hit boxes that match the drawn body: neck height standing / crouched, head height and half-width (metres)
    const hy = (clip) => { const m = new THREE.AnimationMixer(tmp); m.clipAction(clip).play(); m.update(0); tmp.updateMatrixWorld(true); const v = tmp.getObjectByName('head').getWorldPosition(new THREE.Vector3()).y; m.stopAllAction(); m.uncacheRoot(tmp); return v; };
    const C0 = T.chars[CHARS[0]], hp = C0.spots.headPts; let hw = 0; for (let i = 0; i < hp.length; i += 3) hw = Math.max(hw, Math.abs(hp[i]), Math.abs(hp[i + 2]));
    const neck = (STYLE?.neckK ?? 0) * C0.headTop;
    HIT.top = (hy(T.clips.idle) + neck) * SCALE; HIT.ctop = (hy(T.clips.crouch) + neck) * SCALE; HIT.hh = HIT.chh = (C0.headTop - neck) * SCALE * 1.05; HIT.hw = Math.max(0.16, hw * SCALE * 1.1);
  }
  T.ok = true;
}
// a flaky phone network can drop one GLB: retry twice before falling back to bean critters
for (let i = 0; i < 3 && !T.ok; i++) { try { await load(); } catch (e) { console.warn('character GLBs failed (try ' + (i + 1) + ')', e); if (i < 2) await new Promise(r => setTimeout(r, 800 * (i + 1))); } }
if (!T.ok) console.warn('character GLBs failed, using bean critters');
export const charsReady = () => T.ok;

// ---------- hats (vertex-coloured, shared critter toon material), built in metres, attached to the head bone ----------
export const HATS = ['cone', 'propeller', 'bow', 'sprout', 'crown', 'cone', 'none'];
const HAT_SCALE = 1.55;
const HAT_COLORS = [0xff4d6d, 0x2ec4b6, 0xffbe0b, 0x3a86ff, 0x8338ec, 0xfb5607, 0x06d6a0];
const TEAM_HAT = { blue: 0x3a86ff, red: 0xff4d4d };
const HATGEO = {};
const mixC = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
function hatGeo(hat, hc) {
  const key = hat + hc; if (HATGEO[key]) return HATGEO[key];
  const B = new Builder(), hc2 = mixC(hc, 0xffffff, 0.6);
  const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
  if (hat === 'cone') {
    B.add(new THREE.ConeGeometry(0.17, 0.38, 16), M(0.06, 0.17, 0, 0, 0, -0.22), hc);
    B.add(new THREE.TorusGeometry(0.15, 0.03, 6, 16), M(0.02, 0.0, 0, Math.PI / 2, 0.22, 0), hc2);
    B.add(sph(0.06), M(0.14, 0.37, 0), 0xffffff);
  } else if (hat === 'propeller') {
    B.add(sph(0.2, 16, 8), M(0, 0, 0, 0, 0, 0, 1, 0.45, 1), hc);
    B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), M(0, 0.12, 0), 0x666677);
    B.add(new THREE.BoxGeometry(0.42, 0.02, 0.07), M(0, 0.18, 0, 0, 0.6, 0), 0xffbe0b);
    B.add(new THREE.BoxGeometry(0.42, 0.02, 0.07), M(0, 0.18, 0, 0, -0.97, 0), 0xff4d6d);
    B.add(sph(0.035), M(0, 0.185, 0), hc2);
  } else if (hat === 'bow') {
    for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.1, 0.18, 10), M(0.14 + s * 0.1, 0.0, 0.05, 0, 0, s * Math.PI / 2), hc);
    B.add(sph(0.055), M(0.14, 0.0, 0.05), hc2);
  } else if (hat === 'sprout') {
    B.add(new THREE.CylinderGeometry(0.016, 0.02, 0.2, 6), M(0, 0.08, 0), 0x3f9b3a);
    for (const s of [-1, 1]) B.add(sph(0.085), M(s * 0.085, 0.19, 0, 0, 0, s * 0.6, 1.5, 0.45, 0.8), 0x66d158);
  } else if (hat === 'crown') {
    B.add(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16, 1, true), M(0, 0.03, 0), 0xffc93c);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.add(new THREE.ConeGeometry(0.04, 0.09, 6), M(Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14), 0xffc93c); }
    B.add(sph(0.03), M(0, 0.04, 0.15), hc);
  }
  return (HATGEO[key] = B.build(false));
}

// ---------- shared fx (muzzle flash, blob shadow, death puff) ----------
let FLASH = null;
function flashGeo() {
  if (FLASH) return FLASH;
  const B = new Builder();
  B.add(new THREE.PlaneGeometry(0.22, 0.4), M(0, 0, -0.14, Math.PI / 2), 0xffffff);
  B.add(new THREE.PlaneGeometry(0.22, 0.4), M(0, 0, -0.14, Math.PI / 2, 0, Math.PI / 2), 0xffffff);
  B.add(new THREE.CircleGeometry(0.15, 8), M(0, 0, 0), 0xffffff);
  return (FLASH = B.build(false));
}
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(0.42, 16); blobGeo.rotateX(-Math.PI / 2);
// team marker: a bright ring around the feet (the tint alone is too subtle at range)
const ringGeo = new THREE.RingGeometry(0.42, 0.56, 24); ringGeo.rotateX(-Math.PI / 2);
const RING_MAT = {};
const ringMat = (c) => RING_MAT[c] || (RING_MAT[c] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false }));
const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
const puffGeo = new THREE.IcosahedronGeometry(0.22, 1);

const pick = (a) => a[(Math.random() * a.length) | 0];
// bots draw characters from a shuffled deck so a match shows the whole cast, not five of the same
let DECK = [];
function nextChar() { if (!DECK.length) DECK = CHARS.slice().sort(() => Math.random() - 0.5); return DECK.pop(); }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;

// skin: 'blue' | 'red' (team tint + team hat where it fits) | 'player' | anything else (random party look)
export function createSoldier(skin = 'party', variant) {
  if (!T.ok) return BEAN.createSoldier(skin, variant);
  const team = skin === 'blue' || skin === 'red';
  const PL = skin === 'player' && !variant?.char ? pickedLook() : null;     // the 角色仓库 pick: base + skin (recolor or model)
  let char = variant?.char ?? (PL ? PL.char : nextChar());
  if (!T.chars[char]) { ensureChar(char); char = CHARS[0]; }     // not loaded yet (callers await ensureChar first)
  const look = variant?.look ?? (PL && PL.char === char ? PL.look : ''), lookTex = look ? T.looks[char + '|' + look] : null;
  if (look && !lookTex) ensureLook(char, look);                   // not loaded yet: original atlas this time
  let hat = variant?.hat ?? (skin === 'player' || team ? 'cone' : pick(HATS));
  if (CAPPED.has(char)) hat = 'none';
  const hatColor = variant?.hatColor ?? (skin === 'player' ? 0xff4d6d : team ? TEAM_HAT[skin] : pick(HAT_COLORS));
  const gunId = variant?.gun ?? (skin === 'player' ? PLAYER_BLASTER : pick(BLASTERS));
  const tint = team ? TEAM_TINT[skin] : 0;
  const C = T.chars[char];

  const g = new THREE.Group();
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; g.add(root);
  const model = SkeletonUtils.clone(C.scene); model.scale.setScalar(SCALE); model.rotation.y = Math.PI; root.add(model);
  const meshes = [], rigid = [], outlines = [];
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); else if (o.isMesh) rigid.push(o); });
  const noOl = new Set(meshes.filter(m => m.material.name === 'GlowVC' || m.material.name === 'DecoVC'));
  const vary = REG[char]?.vary || 0;
  for (const m of [...meshes, ...rigid]) m.material = m.material.name === 'GlowVC' ? glowVC : m.material.name === 'Glow' ? glowMat : m.material.vertexColors ? toonVC(tint) : toonOf(lookTex && m.material.map === C.map ? lookTex : m.material.map, tint, vary);
  for (const m of meshes) {
    m.computeBoundingSphere(); if (noOl.has(m)) { m.boundingSphere.radius *= 1.7; continue; } m.boundingSphere.radius *= 1.7;     // room for poses (lying down, arms up)
    const ol = new THREE.SkinnedMesh(m.geometry, T.outline); ol.bind(m.skeleton, m.bindMatrix); ol.boundingSphere = m.boundingSphere;
    m.parent.add(ol); outlines.push(ol);
  }
  for (const m of rigid) { const ol = new THREE.Mesh(m.geometry, T.outlineRigid); m.add(ol); outlines.push(ol); }
  // detail add-ons (eye shine, blush, soles, armband, back emblem) share the body's skeleton
  const exColor = team ? TEAM_HAT[skin] : hatColor, exGeo = REG[char]?.old ? extrasGeo(char, exColor) : null;
  let extras = null;
  if (exGeo && meshes[0]) { extras = new THREE.SkinnedMesh(exGeo, critterMaterial()); extras.bind(meshes[0].skeleton, meshes[0].bindMatrix); extras.boundingSphere = meshes[0].boundingSphere; meshes[0].parent.add(extras); }
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const rest = { upperlegl: bones.upperlegl.quaternion.clone(), upperlegr: bones.upperlegr.quaternion.clone() };
  // toy blaster in the right hand slot, barrel straight ahead in the holding pose
  const gunT = T.blasters[gunId];
  const gun = gunT.scene.clone(); const gs = GUN_LEN * (STYLE?.gunK ?? 1) / SCALE / (gunT.box.max.z - gunT.box.min.z);
  gun.scale.setScalar(gs);
  const gunPivot = new THREE.Group(); gunPivot.quaternion.copy(T.gunQ); gunPivot.position.copy(T.gunOff);
  gun.position.set(0, -(gunT.box.min.y + (gunT.box.max.y - gunT.box.min.y) * 0.3) * gs, -(gunT.box.min.z + (gunT.box.max.z - gunT.box.min.z) * (ASSETS ? 0.3 : 0.4)) * gs);
  gunPivot.add(gun); bones.handslotr.add(gunPivot);
  // bow (shown instead of the blaster when the owner carries 弓箭): held in the LEFT fist, arm swung out to the side so it reads
  // from behind; ~1.3 m tall with chunky limbs; the string is pulled toward the right fist while charging (see bowPose)
  const bow = makeBow(BOW3_S / SCALE, BOW3_TH); bow.visible = false; bones.handslotl.add(bow);
  const muzzle = new THREE.Mesh(flashGeo(), flashMat);
  muzzle.position.set(0, (gunT.box.max.y - gunT.box.min.y) * 0.62 * gs + gun.position.y, gunT.box.max.z * gs + gun.position.z + 0.01);
  muzzle.rotation.set(0, Math.PI, 0); muzzle.scale.setScalar(0.9 / SCALE); muzzle.visible = false; gunPivot.add(muzzle);
  // hat on the head bone (head-bone space is upright in the rest pose)
  let hatMesh = null;
  if (hat !== 'none') {
    hatMesh = new THREE.Mesh(hatGeo(hat, hatColor), critterMaterial());
    hatMesh.scale.setScalar(HAT_SCALE * (STYLE?.hatScale ?? 1) / SCALE); hatMesh.position.y = C.headTop - 0.07;
    bones.head.add(hatMesh);
  }
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.03; g.add(blob);
  if (team) { const ring = new THREE.Mesh(ringGeo, ringMat(TEAM_HAT[skin])); ring.position.y = 0.005; ring.renderOrder = 1; blob.add(ring); }
  const puffs = new THREE.Group(); puffs.visible = false; g.add(puffs);
  for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(puffGeo, puffMat); const a = i / 7 * Math.PI * 2; p.userData.d = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.8, Math.sin(a)); puffs.add(p); }

  const mixer = new THREE.AnimationMixer(model);
  const A = {};
  for (const k of [...LOWER, ...UPPER, ...FULL]) { const a = mixer.clipAction(T.clips[k]); a.play(); a.setEffectiveWeight(0); A[k] = a; }
  A.die.setLoop(THREE.LoopOnce); A.die.clampWhenFinished = true;
  A.reload.timeScale = 0; A.walk.timeScale = 0; A.sprint.timeScale = 0;
  if (ASSETS) for (const k of ['reload1', 'walkU', 'sprintU', 'sprintGun']) A[k].timeScale = 0;
  A.idle.time = Math.random() * T.clips.idle.duration;

  g.userData = {
    gunPivot, skin, char, look: lookTex ? look : '', hat, hatColor, exColor, gearKey: '0|0|0', gearMesh: null, gearOl: null, gun: gunId, root, model, bones, rest, mixer, A, meshes, outlines, extras, gunMesh: gun, bow, hatMesh, muzzle, blob, puffs,
    mesh: meshes[0], phase: Math.random() * 6, moveK: 0, crouchK: 0, aimK: 0, fullK: 0, full: null, kick: 0, t: Math.random() * 10, pitch: 0, lo: false, acc: 0, relK: 0,
    tris: C.tris,
    // motion state (see animateSoldier): measured ground velocity, gait phase, run blend, hip twist for strafing, smoothed yaw / lean,
    // in-air tuck and landing squash, per-clip full-body weights, hit flinch
    last: null, vx: 0, vz: 0, gait: Math.random(), stride: 1, runK: 0, twist: 0, back: false, visYaw: null, yawRate: 0, lean: 0, fwdLean: 0,
    airK: 0, wasAir: false, minVy: 0, land: 0, landT: 1, diveK: 0, fullW: { fall: 0, drive: 0, cheer: 0 }, flinch: 0, flinchS: 1,
    freeK: 0, oneK: 0, sprGunK: 0, oneNow: false,
  };
  return g;
}
export function gaitInfo() { return T.loco; }
export function soldierTris() { return T.ok ? T.chars[CHARS[0]].tris : BEAN.soldierTris(); }
// far / low quality: no outline, animation ticks at ~15 Hz
export function setSoldierLOD(g, lo) {
  const u = g.userData; if (!u.outlines || u.lo === lo) return;
  u.lo = lo; for (const o of u.outlines) o.visible = !lo;
  if (u.extras) u.extras.visible = !lo;
  if (u.gearOl) u.gearOl.visible = !lo && u.gearMesh.visible;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _yA = new THREE.Vector3(0, 1, 0);
const FULLFADE = ['fall', 'drive', 'cheer'];
const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));     // frame-rate independent approach
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
function setW(u, wIdle, wWalk, wSprint, wCrouch, wHold, wRel, nf) {
  const A = u.A;
  A.idle.setEffectiveWeight(wIdle * nf); A.walk.setEffectiveWeight(wWalk * nf); A.sprint.setEffectiveWeight(wSprint * nf); A.crouch.setEffectiveWeight(wCrouch * nf);
  if (ASSETS) {     // upper body: rifle (2H) / pistol (1H) aim, rifle carried while sprinting, or free arms swinging with the gait
    const g = u.gunK, one = u.oneK, armed = 1 - u.freeK, sg = u.sprGunK;
    const ready = armed * (1 - sg);
    A.hold.setEffectiveWeight(wHold * ready * (1 - one) * nf); A.reload.setEffectiveWeight(wRel * armed * (1 - one) * nf);
    A.hold1.setEffectiveWeight(wHold * ready * one * nf); A.reload1.setEffectiveWeight(wRel * armed * one * nf);
    A.sprintGun.setEffectiveWeight(armed * sg * (1 - wRel) * nf);
    const free = u.freeK * (1 - wRel * 0) * nf, ls = wIdle + wWalk + wSprint + wCrouch || 1;
    A.idleU.setEffectiveWeight(free * (wIdle + wCrouch) / ls); A.walkU.setEffectiveWeight(free * wWalk / ls); A.sprintU.setEffectiveWeight(free * wSprint / ls);
    for (const k of FULLFADE) A[k].setEffectiveWeight(u.fullW[k]);
    return;
  }
  A.hold.setEffectiveWeight(wHold * nf); A.reload.setEffectiveWeight(wRel * nf);
  for (const k of FULLFADE) A[k].setEffectiveWeight(u.fullW[k]);
}
// o: { moveX, moveZ, speed, yaw, crouch, aim, pitch, reload (-1 | 0..1), air: 'fall'|'chute'|null, seat, cheer, ground, vy }
// Locomotion is driven by how the body REALLY moves (position delta), so feet never slide against walls or at odd speeds.
export function animateSoldier(g, dt, o) {
  const u = g.userData;
  if (!u.mixer) return BEAN.animateSoldier(g, dt, o);
  if (u.dying) return;
  u.t += dt;
  const L = T.loco;
  // --- measured ground velocity (world), smoothed; teleports / seats / sky-diving read as standing still
  const P = g.position;
  if (!u.last) u.last = P.clone();
  if (dt > 0) {
    let vx = (P.x - u.last.x) / dt, vz = (P.z - u.last.z) / dt;
    if (dt > 0.25 || vx * vx + vz * vz > 225 || o.seat || o.air) vx = vz = 0;
    u.vx = ease(u.vx, vx, 14, dt); u.vz = ease(u.vz, vz, 14, dt);
  }
  u.last.copy(P);
  const gs = Math.hypot(u.vx, u.vz);
  // --- smoothed body yaw: the root lags the logical yaw a touch (no instant snaps); big jumps (respawn) snap
  const yaw = g.rotation.y;
  if (u.visYaw == null) u.visYaw = yaw;
  const dy = wrapA(yaw - u.visYaw);
  if (Math.abs(dy) > 2.2) u.visYaw = yaw;
  else { const pv = u.visYaw; u.visYaw = wrapA(u.visYaw + dy * (1 - Math.exp(-18 * dt))); if (dt > 0) u.yawRate = ease(u.yawRate, wrapA(u.visYaw - pv) / dt, 10, dt); }
  const yawOff = clamp(wrapA(u.visYaw - yaw), -0.6, 0.6);
  // --- move direction in model space (+Z forward, +X = character's left); backpedal plays the gait in reverse
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const lmx = -(u.vx * cy - u.vz * sy), lmz = -(u.vx * sy + u.vz * cy);
  const moving = gs > 0.35 && !o.seat && !o.air;
  const turning = !moving && !o.seat && !o.air && Math.abs(u.yawRate) > 1.4;          // pivot on the spot: small shuffle steps
  let twistT = 0;
  if (gs > 0.6 && moving) {
    const a = Math.atan2(lmx, lmz);
    u.back = Math.abs(a) > (u.back ? 1.65 : 1.95);
    twistT = clamp(u.back ? wrapA(a - Math.PI) : a, -1.15, 1.15);
  }
  u.twist = ease(u.twist, twistT, 10, dt);
  // --- air / landing (normal jumps and drops off ledges; the sky-dive is o.air)
  const inAir = o.ground === false && !o.air && !o.seat;
  if (inAir) u.minVy = Math.min(u.minVy, o.vy || 0);
  else if (u.wasAir) { const imp = clamp((-u.minVy - 2) / 8, 0, 1); if (imp > 0.05) { u.land = Math.max(u.land * (1 - u.landT), imp); u.landT = 0; } u.minVy = 0; }
  u.wasAir = inAir;
  u.airK = ease(u.airK, inAir ? 1 : 0, 12, dt);
  u.landT = Math.min(1, u.landT + dt / 0.32);
  const sq = u.land * Math.sin(Math.PI * u.landT);                                   // 0 -> peak -> 0 over ~0.32 s
  // --- blends
  u.moveK = ease(u.moveK, moving ? 1 : turning ? 0.5 : 0, 10, dt);
  const runAt = (L.walk.v + L.sprint.v) * 0.5;
  u.runK = ease(u.runK, gs > runAt * (u.runK > 0.5 ? 0.8 : 1) ? 1 : 0, 8, dt);
  u.crouchK = ease(u.crouchK, o.crouch && !o.seat ? 1 : 0, 12, dt);
  u.aimK = ease(u.aimK, o.aim ? 1 : 0, o.aim ? 12 : 5, dt);
  u.kick = Math.max(0, u.kick - dt * 9);
  u.flinch = Math.max(0, u.flinch - dt * 5);
  u.pitch = ease(u.pitch, o.aim ? o.pitch : 0, 12, dt);
  const reloading = o.reload >= 0;
  u.relK = ease(u.relK, reloading ? 1 : 0, 12, dt);
  if (reloading) u.A.reload.time = clamp(o.reload, 0, 0.999) * T.clips.reload.duration;
  const full = o.seat ? 'drive' : o.air ? 'fall' : o.cheer ? 'cheer' : null;
  u.full = full;
  let fsum = 0;
  for (const k of FULLFADE) { let w = ease(u.fullW[k], k === full ? 1 : 0, 9, dt); if (w < 0.01) w = 0; if (w > 0.99) w = 1; u.fullW[k] = w; fsum += w; }
  if (fsum > 1) { for (const k of FULLFADE) u.fullW[k] /= fsum; fsum = 1; }
  u.fullK = fsum;
  const nf = 1 - fsum, mk = u.moveK, ck = u.crouchK;
  const wCrouch = clamp(ck * (1 - 0.45 * mk) + 0.4 * u.airK + 0.6 * sq, 0, 1);
  const wLoco = mk * (1 - u.airK) * (1 - wCrouch), wIdle = Math.max(0, 1 - wCrouch - wLoco);
  setW(u, wIdle, wLoco * (1 - u.runK), wLoco * u.runK, wCrouch, 1 - u.relK, u.relK, nf);
  // --- one shared gait phase for walk + sprint, advanced at the rate that matches the ground speed (no foot sliding)
  // (the chunky KayKit gait covers ~2 m/s at 1x while the game runs at 6-9 m/s: cadence goes up to 2.3x, the rest is hidden by
  // the stride stretch below)
  u.stride = 1 + 0.3 * u.runK * clamp((gs - 2) / 4, 0, 1) * (1 - u.airK);
  const tsW = clamp((moving ? gs : 0.9) / L.walk.v, 0.5, 2.0), tsS = clamp(gs / (L.sprint.v * u.stride), 0.6, 2.3);
  const cps = lerp(tsW / L.walk.dur, tsS / L.sprint.dur, u.runK) * (1 - u.airK) * (mk > 0.02 ? 1 : 0);
  u.gait = (u.gait + (u.back ? -1 : 1) * cps * dt + 1) % 1;
  u.A.walk.time = ((u.gait + L.walk.fwd) % 1) * L.walk.dur;
  u.A.sprint.time = ((u.gait + L.sprint.fwd) % 1) * L.sprint.dur;
  if (ASSETS) {
    u.A.walkU.time = u.A.walk.time; u.A.sprintU.time = u.A.sprint.time; u.A.sprintGun.time = ((u.gait + L.sprint.fwd) % 1) * T.clips.sprintGun.duration;
    const wep = o.wep || 'rifle', free = wep === 'knife' || wep === 'none' || !!o.bow;
    u.freeK = ease(u.freeK ?? 0, free ? 1 : 0, 10, dt);
    u.oneK = ease(u.oneK ?? 0, wep === 'pistol' ? 1 : 0, 12, dt);
    // sprinting: the rifle is carried (no aiming) unless the character is shooting / zoomed (aim + slower than a run)
    u.sprGunK = ease(u.sprGunK ?? 0, u.runK > 0.5 && moving && !(o.aim && o.firing) ? 1 : 0, 8, dt);
    const one = wep === 'pistol';
    if (u.gunPivot && u.oneNow !== one) { u.oneNow = one; u.gunPivot.quaternion.copy(one ? T.gunQ1 : T.gunQ); }
    if (reloading) u.A.reload1.time = clamp(o.reload, 0, 0.999) * T.clips.reload1.duration;
  }
  const showW = !o.air && !o.seat && full !== 'cheer';
  u.gunMesh.visible = showW && !o.bow && !(ASSETS && (o.wep === 'knife' || o.wep === 'none')); u.bow.visible = showW && !!o.bow;
  if (o.bow) u.bow.userData.setNocked(o.nocked !== false);
  // advance (far bots at ~15 Hz)
  u.acc += dt;
  if (u.lo && u.acc < 1 / 15) return;
  u.mixer.update(u.acc); u.acc = 0;
  // --- whole-body: yaw lag, lean into turns, a little forward lean when running, sky-dive tilt, landing squash
  u.diveK = ease(u.diveK, o.air === 'fall' ? 1 : 0, 8, dt);
  u.lean = ease(u.lean, moving ? clamp(u.yawRate * 0.05 * Math.min(1, gs / 4), -0.14, 0.14) : 0, 8, dt);
  u.fwdLean = ease(u.fwdLean, moving ? (u.back ? 0.04 : -0.07) * u.runK * Math.min(1, gs / (2 * L.sprint.v)) : 0, 6, dt);   // backpedal leans back
  const fl = u.flinch * u.flinch;
  u.root.rotation.set(-1.1 * u.diveK + u.fwdLean * nf + fl * 0.06, yawOff * (1 - u.diveK), u.lean * nf + (o.air === 'chute' ? Math.sin(u.t * 2) * 0.08 : 0) + fl * 0.05 * u.flinchS);
  u.root.position.set(0, 0, 0.6 * u.diveK);
  u.root.scale.set(1 + 0.07 * sq, 1 - 0.13 * sq, 1 + 0.07 * sq);
  if (nf < 0.02) return;
  // --- stride stretch: swing the thighs further than the clip at high speed (longer steps, less foot slide)
  const sk = 1 + (u.stride - 1) * nf;
  stretchBone(u, 'upperlegl', sk); stretchBone(u, 'upperlegr', sk);
  // --- layered offsets (one combined rotation per bone per frame)
  // hips turn toward the move direction, spine + chest turn back so the blaster keeps pointing where the character aims
  const tw = u.twist * nf;
  _q.setFromAxisAngle(_yA, tw); offsetBone(u, 'hips', _q);
  _q.setFromAxisAngle(_yA, -0.55 * tw); offsetBone(u, 'spine', _q);
  // chest: lowered <-> aimed pitch, recoil kick, hit flinch (game pitch + = up; a rotation of -p about X raises the chest)
  const p = (lerp(-0.12, u.pitch, u.aimK) * (1 - u.relK) + u.kick * 0.16 + fl * 0.3) * nf;
  _q.setFromAxisAngle(_yA, -0.45 * tw); _q2.setFromEuler(_e.set(-p * 0.75, 0, 0)); _q.multiply(_q2); offsetBone(u, 'chest', _q);
  _q.setFromEuler(_e.set(p * 0.35 - fl * 0.15, 0, fl * 0.12 * u.flinchS)); offsetBone(u, 'head', _q);   // head stays a bit more level
  if (o.bow && u.bow.visible) bowPose(g, u, o.draw || 0);
  else if (u.bowArm) { u.bowArm = false; _q.identity(); offsetBone(u, 'upperarml', _q); offsetBone(u, 'upperarmr', _q); offsetBone(u, 'lowerarmr', _q); }
}
// archer stance, in model space (+Z forward, +Y up, +X = character's left): left arm swung out to the side holding the bow upright,
// right arm pulls back toward the shoulder with the draw; then the string's nock follows the right fist
// la/ra/fa: left upper arm, right upper arm, right forearm (Euler ZYX, radians; *K = extra at full draw); yaw/cant: bow in model space
const BT = { la: [-0.6, 1.4, 0.2], ra: [-0.4, 1.1, 0], raK: [0, -1.8, 0], fa: [0, 0, 0], faK: [0, 1.4, 0], cant: 0, yaw: -0.7 };
const _ea = new THREE.Euler(0, 0, 0, 'ZYX'), _mq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _aq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _hp = new THREE.Vector3();
function armOffset(u, name, ex, ey, ez) {      // rotate a bone about model-space axes (through its own pivot)
  const b = u.bones[name];
  b.parent.getWorldQuaternion(_pq);
  _aq.setFromEuler(_ea.set(ex, ey, ez)); _aq.premultiply(_mq).multiply(_bq.copy(_mq).invert());   // M E M^-1 (world)
  _q.copy(_pq).invert().multiply(_aq).multiply(_pq);                                               // into the parent's frame
  offsetBone(u, name, _q);
  b.updateMatrixWorld(true);
}
function bowPose(g, u, k) {
  u.bowArm = true;
  g.updateMatrixWorld(true); u.model.getWorldQuaternion(_mq);
  armOffset(u, 'upperarml', BT.la[0], BT.la[1], BT.la[2]);
  armOffset(u, 'upperarmr', BT.ra[0] + BT.raK[0] * k, BT.ra[1] + BT.raK[1] * k, BT.ra[2] + BT.raK[2] * k);
  armOffset(u, 'lowerarmr', BT.fa[0] + BT.faK[0] * k, BT.fa[1] + BT.faK[1] * k, BT.fa[2] + BT.faK[2] * k);
  // bow upright in model space (slight outward cant), whatever the fist's own twist
  const sl = u.bones.handslotl; sl.getWorldQuaternion(_pq);
  _aq.setFromEuler(_ea.set(0, BT.yaw, BT.cant)); _aq.premultiply(_mq);
  u.bow.quaternion.copy(_pq.invert().multiply(_aq)); u.bow.updateMatrixWorld(true);
  u.bones.handslotr.getWorldPosition(_hp); u.bow.worldToLocal(_hp);
  u.bow.userData.setDrawTo(k, _hp);
}
// extrapolate a bone's animated rotation away from its rest pose by k (k > 1 exaggerates the swing), same base-pose memory
function stretchBone(u, n, k) {
  const b = u.bones[n], o = u.off || (u.off = {});
  const r = o[n] || (o[n] = { base: new THREE.Quaternion(), post: new THREE.Quaternion(1, 1, 1, 1), rest: u.rest[n] });
  if (!b.quaternion.equals(r.post)) r.base.copy(b.quaternion);
  b.quaternion.copy(r.rest).slerp(r.base, k); r.post.copy(b.quaternion);
}
// the mixer skips re-writing a bone whose animated value did not change, so layer offsets on a remembered base pose
function offsetBone(u, n, q) {
  const b = u.bones[n], o = u.off || (u.off = {}), r = o[n] || (o[n] = { base: new THREE.Quaternion(), post: new THREE.Quaternion(1, 1, 1, 1) });
  if (!b.quaternion.equals(r.post)) r.base.copy(b.quaternion);
  b.quaternion.copy(r.base).premultiply(q); r.post.copy(b.quaternion);
}
export function soldierFired(g) { g.userData.kick = 1; }
// taking a hit: a quick snap back of the chest + head tilt (cheap, decays in ~0.2 s)
export function soldierHit(g) { const u = g.userData; if (!u || !u.mixer || u.dying) return; u.flinch = 1; u.flinchS = Math.random() < 0.5 ? -1 : 1; }

// death: topple over (die clip), then pop into a puff of cloud
export function animateDeath(g, t) {
  const u = g.userData;
  if (!u.mixer) return BEAN.animateDeath(g, t);
  if (!u.dying) {
    u.dying = true; u.full = 'die';
    // remember the live pose's weights and fade them out over ~0.2 s instead of snapping into the fall
    u.deathFrom = Object.keys(u.A).filter(k => k !== 'die').map(k => [u.A[k], u.A[k].getEffectiveWeight()]);
    u.A.die.reset().play(); u.A.die.setEffectiveWeight(0);
    u.muzzle.visible = false; u.kick = 0; u.flinch = 0;
  }
  const xk = clamp(t / 0.2, 0, 1);
  for (const [a, w] of u.deathFrom) a.setEffectiveWeight(w * (1 - xk));
  u.A.die.setEffectiveWeight(Math.max(0.001, xk)); u.fullK = 1;
  u.A.die.time = Math.min(t * 1.1, T.clips.die.duration - 0.001); u.mixer.update(0);
  u.root.rotation.set(0, 0, 0); u.root.position.set(0, 0, 0); if (t < 1.1) u.root.scale.setScalar(1);
  const pk = clamp((t - 1.1) / 0.5, 0, 1);
  if (pk > 0) {
    const s = pk < 0.25 ? 1 + pk * 0.8 : Math.max(0.001, 1.2 * (1 - (pk - 0.25) / 0.75));
    u.root.scale.setScalar(s);
    u.puffs.visible = true;
    u.puffs.children.forEach((p) => { p.position.copy(p.userData.d).multiplyScalar(0.3 + pk * 1.1); p.position.y += 0.4; p.scale.setScalar(1 + pk * 1.5); });
  }
  u.blob.visible = pk < 0.5;
  if (pk >= 1) u.puffs.visible = false;
}
export function resetSoldier(g) {
  const u = g.userData;
  if (!u.mixer) return BEAN.resetSoldier(g);
  if (!u.dying) return;
  u.dying = false; u.full = null; u.fullK = 0; u.A.die.setEffectiveWeight(0);
  for (const k of FULLFADE) u.fullW[k] = 0;
  u.last = null; u.vx = u.vz = 0; u.visYaw = null; u.yawRate = 0; u.twist = 0; u.lean = 0; u.fwdLean = 0; u.airK = 0; u.wasAir = false; u.minVy = 0; u.land = 0; u.landT = 1; u.diveK = 0; u.moveK = 0; u.runK = 0;
  u.blob.visible = true; u.puffs.visible = false;
  u.root.rotation.set(0, 0, 0); u.root.position.set(0, 0, 0); u.root.scale.setScalar(1);
}
