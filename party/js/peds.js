// 自由模式路人 (2026-11): 低多边形但有四肢/头发/穿搭/配件的迈阿密行人, 全原创.
// 每个部件一个 InstancedMesh; 手臂绕肩、腿绕髋摆动; 死亡躺平; 远处不做动画.
import * as THREE from 'three';

const SKIN = [0xffe0c4, 0xf2c6a0, 0xd9a27a, 0xb97c55, 0x8d5a3b, 0x6a4129];
const HAIR = [0x1a1410, 0x3b2616, 0x6b4426, 0xc89a52, 0xe8d6a8, 0x9a2a2a, 0xff7ab8, 0x2a2a2a];
const SHIRT = [0xff8fb4, 0x52dcc8, 0xffcc6e, 0xb194ff, 0x6fc4ff, 0xffa078, 0x8ae89a, 0xfff1f5, 0xff5fa0, 0x30d0ff];
const SHORTS = [0xf4e9d0, 0x6fa8dc, 0xffffff, 0x2d6a8a, 0xff9bc0, 0x9be0c8];
const JEANS = [0x3a5a8c, 0x2a3e66, 0x1f2430, 0xd8d0c0];
const SUIT = [0xf2f2ee, 0x2a2e38, 0xd6c3a0, 0x8cc8e6];
// outfit kinds: 0 floral shirt+shorts, 1 tank+shorts, 2 tee+jeans, 3 tracksuit, 4 dress, 5 suit
const OUTFIT_W = [0.24, 0.18, 0.2, 0.12, 0.18, 0.08];

const pick = (a) => a[(Math.random() * a.length) | 0];
function pickOutfit() { let r = Math.random(); for (let i = 0; i < OUTFIT_W.length; i++) { r -= OUTFIT_W[i]; if (r <= 0) return i; } return 0; }

const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _l = new THREE.Matrix4(), _r = new THREE.Matrix4(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function legGeo() {   // pivot at hip (y=0), hangs down 0.88 m; bottom 0.1 m darker = shoe
  const g = new THREE.BoxGeometry(0.17, 0.88, 0.19, 1, 4, 1); g.translate(0, -0.44, 0);
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = y < -0.77 ? 0.22 : 1; col.push(k, k, k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // shoe toe sticks forward
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.77 && pos.getZ(i) > 0) pos.setZ(i, pos.getZ(i) + 0.07);
  return g;
}
function armGeo() {   // pivot at shoulder, hangs down 0.62 m; bottom 0.12 m tinted toward skin by vertex colour
  const g = new THREE.BoxGeometry(0.12, 0.62, 0.13, 1, 4, 1); g.translate(0, -0.31, 0); return g;
}

export function createPeds(scene, n) {
  const mat = (o = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...o });
  const mk = (geo, m) => { const im = new THREE.InstancedMesh(geo, m || mat(), n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO); scene.add(im); return im; };
  const torso = new THREE.BoxGeometry(0.42, 0.56, 0.24); torso.translate(0, 1.31, 0);
  const hips = new THREE.BoxGeometry(0.4, 0.26, 0.25); hips.translate(0, 0.94, 0);
  const shorts = new THREE.BoxGeometry(0.42, 0.5, 0.27); shorts.translate(0, 0.83, 0);
  const neck = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6); neck.translate(0, 1.62, 0);
  const head = new THREE.SphereGeometry(0.15, 10, 8); head.scale(0.92, 1.08, 1); head.translate(0, 1.76, 0);
  const nose = new THREE.BoxGeometry(0.04, 0.05, 0.05); nose.translate(0, 1.75, 0.15);
  const hairS = new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); hairS.translate(0, 1.79, -0.012);
  const hairL = new THREE.CylinderGeometry(0.15, 0.17, 0.42, 10, 1, true, Math.PI * 0.6, Math.PI * 1.8); hairL.translate(0, 1.66, -0.02);
  const bun = new THREE.SphereGeometry(0.07, 6, 5); bun.translate(0, 1.95, -0.07);
  const glasses = new THREE.BoxGeometry(0.25, 0.055, 0.04); glasses.translate(0, 1.79, 0.135);
  const crown = new THREE.CylinderGeometry(0.155, 0.165, 0.12, 10); crown.translate(0, 1.9, 0);
  const brim = new THREE.CylinderGeometry(0.29, 0.29, 0.02, 12); brim.translate(0, 1.85, 0);
  const visor = new THREE.BoxGeometry(0.2, 0.02, 0.16); visor.translate(0, 1.86, 0.2);
  const skirt = new THREE.CylinderGeometry(0.21, 0.34, 0.5, 10); skirt.translate(0, 0.8, 0);
  const lapel = new THREE.BoxGeometry(0.12, 0.3, 0.02); lapel.translate(0, 1.43, 0.125);   // shirt/tie strip on suits & floral pattern patch
  const bag = new THREE.BoxGeometry(0.08, 0.3, 0.22); bag.translate(0.27, 1.02, 0);
  const phone = new THREE.BoxGeometry(0.05, 0.12, 0.02); phone.translate(0, -0.6, 0.06);
  const P = {
    n, list: [],
    torso: mk(torso), hips: mk(hips), shorts: mk(shorts), neck: mk(neck), head: mk(head), nose: mk(nose),
    hairS: mk(hairS), hairL: mk(hairL), bun: mk(bun), glasses: mk(glasses, mat({ color: 0x141414 })),
    crown: mk(crown), brim: mk(brim), visor: mk(visor), skirt: mk(skirt), lapel: mk(lapel), bag: mk(bag),
    armL: mk(armGeo()), armR: mk(armGeo()), legL: mk(legGeo(), mat({ vertexColors: true })), legR: mk(legGeo(), mat({ vertexColors: true })),
    phone: mk(phone, mat({ color: 0x101018 })),
  };
  P.meshes = Object.values(P).filter(v => v && v.isInstancedMesh);
  return P;
}

// pick an outfit and colour every part for instance i
export function dressPed(P, i, ped) {
  const o = ped.look = ped.look || {};
  o.kind = pickOutfit();
  o.skin = pick(SKIN);
  o.hair = Math.random() < 0.12 ? 0 : (Math.random() < 0.45 ? 2 : 1);  // 0 bald, 1 short, 2 long
  o.bun = o.hair === 2 && Math.random() < 0.3;
  o.hairC = pick(HAIR);
  o.glasses = Math.random() < 0.4;
  o.hat = Math.random() < 0.28 ? (Math.random() < 0.5 ? 1 : 2) : 0;  // 1 cap, 2 straw hat
  o.bag = Math.random() < 0.25;
  o.talker = Math.random() < 0.22;
  const set = (m, c) => P[m].setColorAt(i, _c.setHex(c));
  let top = pick(SHIRT), bottom = pick(SHORTS), legs = o.skin, arms = o.skin, patch = top;
  switch (o.kind) {
    case 0: patch = pick(SHIRT); break;                       // floral: contrasting patch
    case 1: patch = top; break;
    case 2: bottom = pick(JEANS); legs = bottom; patch = 0xffffff; break;
    case 3: top = pick([0x2a2a35, 0xff3a7a, 0x2fbfa8, 0x6a4cff]); bottom = top; legs = top; arms = top; patch = 0xffffff; break;
    case 4: bottom = top; break;
    case 5: top = pick(SUIT); bottom = top; legs = top; arms = top; patch = pick([0xffffff, 0x1a1a1a, 0xff8fb4]); break;
  }
  o.top = top; o.bottom = bottom;
  set('torso', top); set('hips', bottom); set('shorts', bottom); set('skirt', top);
  set('neck', o.skin); set('head', o.skin); set('nose', o.skin);
  set('armL', arms); set('armR', arms); set('legL', legs); set('legR', legs);
  set('hairS', o.hairC); set('hairL', o.hairC); set('bun', o.hairC);
  const hatC = o.hat === 2 ? 0xe8d39a : pick([0xffffff, 0xff5fa0, 0x30d0ff, 0x222222, 0xffcc6e]);
  set('crown', hatC); set('brim', hatC); set('visor', hatC);
  set('lapel', patch); set('bag', pick([0x8a5a3a, 0x222222, 0xff8fb4, 0xf4e9d0]));
  for (const m of P.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

const put = (P, name, i, show, mat) => P[name].setMatrixAt(i, show ? mat : ZERO);
function limb(base, x, y, z, rx, rz = 0) {
  _e.set(rx, 0, rz); _q.setFromEuler(_e);
  _l.compose(_tmpV.set(x, y, z), _q, _one);
  return _r.multiplyMatrices(base, _l);
}
const _tmpV = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// write the instance matrices for ped i. pose: {swing, run, phone, dead}
export function posePed(P, i, ped, far) {
  const o = ped.look;
  if (!ped.alive && ped.deadT <= 0) { for (const m of P.meshes) m.setMatrixAt(i, ZERO); return; }
  if (!ped.alive) {
    _m.makeRotationY(ped.yaw); _b.makeRotationX(-Math.PI / 2); _m.multiply(_b); _m.setPosition(ped.pos.x, 0.14, ped.pos.z);
  } else {
    const bob = far ? 0 : Math.abs(Math.sin(ped.walk)) * (ped.fleeT > 0 ? 0.07 : 0.035);
    _m.makeRotationY(ped.yaw); _m.setPosition(ped.pos.x, bob, ped.pos.z);
    if (ped.fleeT > 0 && !far) { _b.makeRotationX(0.18); _m.multiply(_b); }
  }
  const base = _m;
  const dress = o.kind === 4, shorts = o.kind === 0 || o.kind === 1;
  put(P, 'torso', i, true, base); put(P, 'neck', i, true, base); put(P, 'head', i, true, base); put(P, 'nose', i, true, base);
  put(P, 'hips', i, !dress && !shorts, base); put(P, 'shorts', i, shorts, base); put(P, 'skirt', i, dress, base);
  put(P, 'lapel', i, o.kind !== 1, base);
  put(P, 'hairS', i, o.hair >= 1 && o.hat === 0 || o.hair === 2, base);
  put(P, 'hairL', i, o.hair === 2, base); put(P, 'bun', i, o.bun && o.hat === 0, base);
  put(P, 'glasses', i, o.glasses, base);
  put(P, 'crown', i, o.hat > 0, base); put(P, 'brim', i, o.hat === 2, base); put(P, 'visor', i, o.hat === 1, base);
  put(P, 'bag', i, o.bag, base);
  // limbs
  const moving = ped.alive && !far && ped.moving;
  const amp = !moving ? 0 : (ped.fleeT > 0 ? 0.95 : 0.5);
  const s = Math.sin(ped.walk) * amp;
  const phoneUp = ped.alive && ped.phone;
  const fleeArms = ped.alive && ped.fleeT > 0 && !far ? -0.6 : 0;
  P.legL.setMatrixAt(i, limb(base, -0.1, 0.86, 0, s));
  P.legR.setMatrixAt(i, limb(base, 0.1, 0.86, 0, -s));
  P.armL.setMatrixAt(i, limb(base, -0.28, 1.56, 0, -s * 0.9 + fleeArms * 0.3, -0.08));
  if (phoneUp) {
    P.armR.setMatrixAt(i, limb(base, 0.28, 1.56, 0, -2.5, -0.35));
    P.phone.setMatrixAt(i, _r);
  } else {
    P.armR.setMatrixAt(i, limb(base, 0.28, 1.56, 0, s * 0.9 + fleeArms * 0.3, 0.08));
    P.phone.setMatrixAt(i, ZERO);
  }
}
export function flushPeds(P) { for (const m of P.meshes) m.instanceMatrix.needsUpdate = true; }
export function disposePeds(P, scene) {
  if (!P) return;
  for (const m of P.meshes) { scene.remove(m); m.geometry?.dispose?.(); m.material?.dispose?.(); m.dispose?.(); }
}
