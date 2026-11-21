// 派对突击 characters: KayKit "Character Pack: Adventurers" + "Skeletons" by Kay Lousberg (CC0) — chunky stylised rigged heroes
// sharing one rig and one animation set, holding a Kenney "Blaster Kit" (CC0) toy blaster.
// Same API as before (createSoldier / animateSoldier / animateDeath / resetSoldier / soldierFired / setSoldierLOD / soldierTris).
// Falls back to the procedural bean critters (bean.js) if the GLBs fail to load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BEAN from './bean.js';
import { Builder, M } from './soldier.js';
import { makeBow } from './bow.js';
export { toonRamp, critterMaterial, BODY_COLORS } from './bean.js';
const { toonRamp, critterMaterial } = BEAN;

const BASE = './assets/chars/';
export const CHARS = ['rogue', 'knight', 'barbarian', 'mage', 'rogue-hood', 'skel-minion', 'skel-rogue', 'skel-warrior', 'skel-mage'];
const BLASTERS = ['b', 'c', 'd', 'h', 'k'];
const PLAYER_CHAR = 'rogue', PLAYER_BLASTER = 'h';
const SCALE = 0.79;                    // model units -> metres: bare head-top 2.15 u -> 1.70 m (see main.js hitBoxes)
const GUN_LEN = 0.62;
const BOW3_S = 1.13, BOW3_TH = 1.9;     // third-person bow: 1.13 x 1.15 m ≈ 1.3 m tall (characters ~1.72 m), limbs 1.9x thicker
const TWIST = 0.85;                     // how much of the crossbow stance's sideways twist is squared to the front                   // blaster length, metres
const LOWER = ['idle', 'walk', 'sprint', 'crouch'], UPPER = ['hold', 'reload'], FULL = ['fall', 'drive', 'die', 'cheer'];
const UPPER_BONE = /^(chest|upperarm|lowerarm|wrist|hand|handslot)/;   // head follows the lower-body clip (looks ahead)
// characters with their own headgear (helmet, wizard hat, hood, bear hat): no party hat stacked on it
const CAPPED = new Set(['knight', 'barbarian', 'mage', 'rogue-hood', 'skel-rogue', 'skel-warrior', 'skel-mage']);
const TEAM_TINT = { blue: 0x7fb4ff, red: 0xff8a80 };

const T = { chars: {}, blasters: {}, clips: {}, mats: {}, gunMat: null, outline: null, gunQ: null, ok: false };

function toonOf(map, tint) {
  const k = (map ? map.uuid : 'none') + (tint || '');
  return T.mats[k] || (T.mats[k] = new THREE.MeshToonMaterial({ map, color: tint ? new THREE.Color(0xffffff).lerp(new THREE.Color(tint), 0.35) : 0xffffff, gradientMap: toonRamp() }));
}
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff06a });
function makeOutlineMat(skinned) {
  const m = new THREE.MeshBasicMaterial({ color: 0x2a1f2e, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = '#define OUTLINE_W 0.022\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(' + (skinned ? 'objectNormal' : 'normal') + ') * OUTLINE_W;'); };
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
// ---------- detail pass: small original add-ons skinned to the shared rig (eye shine, blush, shoe soles, team armband, back emblem) ----------
// Everything for one character is ONE extra SkinnedMesh (rigid-skinned, vertex colours) -> +1 draw call per character, ~400 tris.
const FACE = new Set(['rogue', 'knight', 'barbarian', 'mage', 'rogue-hood']);      // painted-face heroes (skeletons have glowing eyes)
const SOLES = new Set(['rogue', 'knight', 'barbarian', 'mage', 'rogue-hood', 'skel-warrior', 'skel-rogue']);
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
function extrasGeo(n, color) {
  const key = n + ':' + color; if (EXTRA[key]) return EXTRA[key];
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
  if (S.backPin) {
    const h = S.backPin, up = new THREE.Vector3(0, 1, 0); _qn.setFromUnitVectors(up, h.n);
    const at = (geo, off, col) => B.add(geo, new THREE.Matrix4().compose(h.p.clone().addScaledVector(h.n, off), _qn, new THREE.Vector3(1, 1, 1)), col, bone('chest'));
    at(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 18), 0.0, 0xffffff); at(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 18), 0.012, color);
    at(starGeo(0.085, 0.036, 0.03), 0.035, 0xffffff);
  }
  const g = B.build(true); g.userData.tris = B.tris;
  return (EXTRA[key] = g);
}
async function load() {
  const L = new GLTFLoader();
  const [anims, ...rest] = await Promise.all([L.loadAsync(BASE + 'anims.glb'), ...CHARS.map(n => L.loadAsync(BASE + n + '.glb')), ...BLASTERS.map(b => L.loadAsync(BASE + 'blaster-' + b + '.glb'))]);
  const byName = Object.fromEntries(anims.animations.map(a => [a.name, a]));
  for (const n of ['idle', 'walk', 'sprint']) T.clips[n] = part(byName[n], false);
  for (const n of FULL) T.clips[n] = byName[n];
  T.clips.crouch = makeCrouch(byName.idle, byName.drive, 0.85);
  CHARS.forEach((n, i) => {
    const sc = rest[i].scene; let headTop = 0, tris = 0;
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
    T.chars[n] = { scene: sc, headTop: headTop - hp.y, tris, spots: measure(n, sc) };
  });
  BLASTERS.forEach((b, i) => {
    const sc = rest[CHARS.length + i].scene;
    sc.traverse(o => { if (o.isMesh) { if (!T.gunMat) T.gunMat = toonOf(o.material.map); o.material = T.gunMat; } });
    const box = new THREE.Box3().setFromObject(sc); T.blasters[b] = { scene: sc, box };
  });
  // upper-body stances: the crossbow clips twist the whole body sideways; keep the arms, square the chest to the front
  const tmp = SkeletonUtils.clone(T.chars[CHARS[0]].scene);
  T.clips.hold = stance(tmp, byName.hold, true, byName.idle);
  T.clips.reload = stance(tmp, byName.reload, false, byName.idle);
  // blaster orientation: in the holding pose the barrel points straight ahead (model +Z), upright
  const mx = new THREE.AnimationMixer(tmp);
  mx.clipAction(T.clips.idle).play(); mx.clipAction(T.clips.hold).play(); mx.update(0); tmp.updateMatrixWorld(true);
  const hq = new THREE.Quaternion(); tmp.getObjectByName('handslotr').getWorldQuaternion(hq);
  T.gunQ = hq.clone().invert();
  // ...and sits between both fists (grip at the midpoint of the two hand slots), so it reads as held two-handed
  const hr = tmp.getObjectByName('handslotr'), hl = tmp.getObjectByName('handslotl'), mid = new THREE.Vector3(), pl = new THREE.Vector3();
  hr.getWorldPosition(mid); hl.getWorldPosition(pl); mid.lerp(pl, 0.5); T.gunOff = hr.worldToLocal(mid);
  // crouch: drop the hips so the feet stay on the ground
  const mc = new THREE.AnimationMixer(tmp); mx.stopAllAction(); mc.clipAction(T.clips.crouch).play(); mc.update(0); tmp.updateMatrixWorld(true);
  const fy = new THREE.Vector3(); tmp.getObjectByName('footl').getWorldPosition(fy);
  const mi = new THREE.AnimationMixer(tmp); mc.stopAllAction(); mi.clipAction(T.clips.idle).play(); mi.update(0); tmp.updateMatrixWorld(true);
  const fi = new THREE.Vector3(); tmp.getObjectByName('footl').getWorldPosition(fi);
  const ht = T.clips.crouch.tracks.find(t => t.name === 'hips.position'); if (ht) ht.values[1] -= fy.y - fi.y;
  T.outline = makeOutlineMat(true); T.outlineRigid = makeOutlineMat(false);
  T.ok = true;
}
try { await load(); } catch (e) { console.warn('character GLBs failed, using bean critters', e); }

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
  const char = variant?.char ?? (skin === 'player' ? PLAYER_CHAR : nextChar());
  let hat = variant?.hat ?? (skin === 'player' || team ? 'cone' : pick(HATS));
  if (CAPPED.has(char)) hat = 'none';
  const hatColor = variant?.hatColor ?? (skin === 'player' ? 0xff4d6d : team ? TEAM_HAT[skin] : pick(HAT_COLORS));
  const gunId = variant?.gun ?? (skin === 'player' ? PLAYER_BLASTER : pick(BLASTERS));
  const tint = team ? TEAM_TINT[skin] : 0;
  const C = T.chars[char];

  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  const model = SkeletonUtils.clone(C.scene); model.scale.setScalar(SCALE); model.rotation.y = Math.PI; root.add(model);
  const meshes = [], rigid = [], outlines = [];
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); else if (o.isMesh) rigid.push(o); });
  for (const m of [...meshes, ...rigid]) m.material = m.material.name === 'Glow' ? glowMat : toonOf(m.material.map, tint);
  for (const m of meshes) {
    m.computeBoundingSphere(); m.boundingSphere.radius *= 1.7;     // room for poses (lying down, arms up)
    const ol = new THREE.SkinnedMesh(m.geometry, T.outline); ol.bind(m.skeleton, m.bindMatrix); ol.boundingSphere = m.boundingSphere;
    m.parent.add(ol); outlines.push(ol);
  }
  for (const m of rigid) { const ol = new THREE.Mesh(m.geometry, T.outlineRigid); m.add(ol); outlines.push(ol); }
  // detail add-ons (eye shine, blush, soles, armband, back emblem) share the body's skeleton
  const exGeo = extrasGeo(char, team ? TEAM_HAT[skin] : hatColor);
  let extras = null;
  if (exGeo && meshes[0]) { extras = new THREE.SkinnedMesh(exGeo, critterMaterial()); extras.bind(meshes[0].skeleton, meshes[0].bindMatrix); extras.boundingSphere = meshes[0].boundingSphere; meshes[0].parent.add(extras); }
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  // toy blaster in the right hand slot, barrel straight ahead in the holding pose
  const gunT = T.blasters[gunId];
  const gun = gunT.scene.clone(); const gs = GUN_LEN / SCALE / (gunT.box.max.z - gunT.box.min.z);
  gun.scale.setScalar(gs);
  const gunPivot = new THREE.Group(); gunPivot.quaternion.copy(T.gunQ); gunPivot.position.copy(T.gunOff);
  gun.position.set(0, -(gunT.box.min.y + (gunT.box.max.y - gunT.box.min.y) * 0.3) * gs, -(gunT.box.min.z + (gunT.box.max.z - gunT.box.min.z) * 0.4) * gs);
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
    hatMesh.scale.setScalar(HAT_SCALE / SCALE); hatMesh.position.y = C.headTop - 0.07;
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
  A.reload.timeScale = 0;
  A.idle.time = Math.random() * T.clips.idle.duration;

  g.userData = {
    skin, char, hat, hatColor, gun: gunId, root, model, bones, mixer, A, meshes, outlines, extras, gunMesh: gun, bow, hatMesh, muzzle, blob, puffs,
    mesh: meshes[0], phase: Math.random() * 6, moveK: 0, crouchK: 0, aimK: 0, fullK: 0, full: null, kick: 0, t: Math.random() * 10, pitch: 0, lo: false, acc: 0, relK: 0,
    tris: C.tris,
  };
  return g;
}
export function soldierTris() { return T.ok ? T.chars[CHARS[0]].tris : BEAN.soldierTris(); }
// far / low quality: no outline, animation ticks at ~15 Hz
export function setSoldierLOD(g, lo) {
  const u = g.userData; if (!u.outlines || u.lo === lo) return;
  u.lo = lo; for (const o of u.outlines) o.visible = !lo;
  if (u.extras) u.extras.visible = !lo;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function setW(u, wIdle, wWalk, wSprint, wCrouch, wHold, wRel, full) {
  const A = u.A, nf = 1 - u.fullK;
  A.idle.setEffectiveWeight(wIdle * nf); A.walk.setEffectiveWeight(wWalk * nf); A.sprint.setEffectiveWeight(wSprint * nf); A.crouch.setEffectiveWeight(wCrouch * nf);
  A.hold.setEffectiveWeight(wHold * nf); A.reload.setEffectiveWeight(wRel * nf);
  for (const k of FULL) A[k].setEffectiveWeight(k === full ? u.fullK : 0);
}
// o: { moveX, moveZ, speed, yaw, crouch, aim, pitch, reload (-1 | 0..1), air: 'fall'|'chute'|null, seat, cheer }
export function animateSoldier(g, dt, o) {
  const u = g.userData;
  if (!u.mixer) return BEAN.animateSoldier(g, dt, o);
  u.t += dt;
  const ml = Math.hypot(o.moveX, o.moveZ), moving = ml > 0.1;
  u.moveK += ((moving ? 1 : 0) - u.moveK) * Math.min(1, dt * 8);
  u.crouchK += ((o.crouch && !o.seat ? 1 : 0) - u.crouchK) * Math.min(1, dt * 10);
  u.aimK += ((o.aim ? 1 : 0) - u.aimK) * Math.min(1, dt * (o.aim ? 12 : 4));
  u.kick = Math.max(0, u.kick - dt * 10);
  u.pitch += ((o.aim ? o.pitch : 0) - u.pitch) * Math.min(1, dt * 10);
  const reloading = o.reload >= 0;
  u.relK += ((reloading ? 1 : 0) - u.relK) * Math.min(1, dt * 10);
  if (reloading) u.A.reload.time = clamp(o.reload, 0, 0.999) * T.clips.reload.duration;
  const full = o.seat ? 'drive' : o.air ? 'fall' : o.cheer ? 'cheer' : null;
  if (full !== u.full) { u.full = full; u.fullK = 0; }
  u.fullK = full ? Math.min(1, u.fullK + dt * 6) : 0;
  const mk = u.moveK, ck = u.crouchK;
  const run = (o.speed || 0) * ml > 3.2;
  const wCrouch = ck * (1 - 0.45 * mk), wLoco = mk * (1 - wCrouch), wIdle = Math.max(0, 1 - wCrouch - wLoco);
  setW(u, wIdle, run ? 0 : wLoco, run ? wLoco : 0, wCrouch, 1 - u.relK, u.relK, full);
  u.A.walk.timeScale = clamp((o.speed || 2) * ml / 2.4, 0.6, 1.6);
  u.A.sprint.timeScale = clamp((o.speed || 5) * ml / 5.0, 0.7, 1.4);
  const showW = !o.air && !o.seat && full !== 'cheer';
  u.gunMesh.visible = showW && !o.bow; u.bow.visible = showW && !!o.bow;
  if (o.bow) u.bow.userData.setNocked(o.nocked !== false);
  // advance (far bots at ~15 Hz)
  u.acc += dt;
  if (u.lo && u.acc < 1 / 15) return;
  u.mixer.update(u.acc); u.acc = 0;
  // body tilt: dive when free-falling, gentle sway under the canopy
  u.root.rotation.set(o.air === 'fall' ? -1.1 : 0, 0, o.air === 'chute' ? Math.sin(u.t * 2) * 0.08 : 0);
  u.root.position.set(0, 0, o.air === 'fall' ? 0.6 : 0);
  if (full) return;
  // upper body: lowered <-> aimed pitch and recoil kick, layered on the holding pose (chest carries arms + blaster)
  // game pitch: + = up; the model faces +Z so a rotation of -p about X raises the chest
  const p = lerp(-0.12, u.pitch, u.aimK) * (1 - u.relK) + u.kick * 0.12;
  _q.setFromEuler(_e.set(-p * 0.75, 0, 0)); offsetBone(u, 'chest', _q);
  _q.setFromEuler(_e.set(p * 0.35, 0, 0)); offsetBone(u, 'head', _q);   // head stays a bit more level
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
// the mixer skips re-writing a bone whose animated value did not change, so layer offsets on a remembered base pose
function offsetBone(u, n, q) {
  const b = u.bones[n], o = u.off || (u.off = {}), r = o[n] || (o[n] = { base: new THREE.Quaternion(), post: new THREE.Quaternion(1, 1, 1, 1) });
  if (!b.quaternion.equals(r.post)) r.base.copy(b.quaternion);
  b.quaternion.copy(r.base).premultiply(q); r.post.copy(b.quaternion);
}
export function soldierFired(g) { g.userData.kick = 1; }

// death: topple over (die clip), then pop into a puff of cloud
export function animateDeath(g, t) {
  const u = g.userData;
  if (!u.mixer) return BEAN.animateDeath(g, t);
  if (!u.dying) {
    u.dying = true; u.fullK = 1; u.full = 'die';
    setW(u, 0, 0, 0, 0, 0, 0, 'die'); u.A.die.reset().play(); u.A.die.setEffectiveWeight(1);
    u.muzzle.visible = false;
  }
  u.A.die.time = Math.min(t * 1.1, T.clips.die.duration - 0.001); u.mixer.update(0);
  u.root.rotation.set(0, 0, 0); u.root.position.set(0, 0, 0);
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
  u.blob.visible = true; u.puffs.visible = false;
  u.root.rotation.set(0, 0, 0); u.root.position.set(0, 0, 0); u.root.scale.setScalar(1);
}
