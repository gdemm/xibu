// 马：唤马（口哨）、上马/下马、骑行（慢步/跑步/疾驰）、马上射击
import * as THREE from 'three';
import { horse as makeHorse, alignPelvis, straddle } from './assets.js';
import { terrainH, collide } from './scene.js';

const WALK = 1.9, CANTER = 6.2, GALLOP = 11.5;
// ---- 缰绳：两条下垂的扁皮带（二次曲线），每帧更新顶点 ----
const RN = 14;
function makeRein() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RN + 1) * 2 * 3), 3));
  const idx = []; for (let i = 0; i < RN; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: .7, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.castShadow = true; return m;
}
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _rs = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function setRein(m, a, b, sag) {
  const pos = m.geometry.attributes.position;
  _rc.addVectors(a, b).multiplyScalar(.5); _rc.y -= sag;
  for (let i = 0; i <= RN; i++) {
    const t = i / RN, u = 1 - t;
    _rp.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(_rc, 2 * u * t).addScaledVector(b, t * t);
    _rt.subVectors(_rc, a).multiplyScalar(2 * u).addScaledVector(_rs.subVectors(b, _rc), 2 * t).normalize();
    _rs.crossVectors(_rt, _up); if (_rs.lengthSq() < 1e-6) _rs.set(1, 0, 0); _rs.normalize().multiplyScalar(.009);
    pos.setXYZ(i * 2, _rp.x + _rs.x, _rp.y + _rs.y, _rp.z + _rs.z);
    pos.setXYZ(i * 2 + 1, _rp.x - _rs.x, _rp.y - _rs.y, _rp.z - _rs.z);
  }
  pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
}
export function updateReins(H, ch, aiming) {
  const h = H.h; if (!h.bits || !H.reins) return;
  h.root.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    h.bits[i].getWorldPosition(_ra);
    if (ch) {
      // 左缰到左手；右缰到右手（举枪瞄准时两根都收在左手）
      const hand = i === 1 && !aiming ? ch.bones.handR : ch.bones.handL;
      hand.getWorldPosition(_rb);
      setRein(H.reins[i], _ra, _rb, .06 + Math.min(.12, _ra.distanceTo(_rb) * .08));
    } else {
      h.horn.getWorldPosition(_rb);       // 没人骑：缰绳搭在鞍角上，垂在脖子两侧
      _rb.addScaledVector(_rs.set(Math.cos(H.yaw), 0, -Math.sin(H.yaw)), i === 0 ? .06 : -.06);
      setRein(H.reins[i], _ra, _rb, .22);
    }
  }
}
const _v = new THREE.Vector3(), _seat = new THREE.Vector3();

export function createHorse(scene, at) {
  const h = makeHorse();
  scene.add(h.root);
  const reins = [makeRein(), makeRein()]; for (const r of reins) scene.add(r);
  const H = { reins,
    h, pos: at.clone(), yaw: 0, speed: 0, target: null, state: 'idle', rider: null, pitch: 0, cur: null, lastStep: 0, gaitScale: 1,
  };
  H.pos.y = terrainH(H.pos.x, H.pos.z);
  playH(H, 'Idle', 0);
  return H;
}
function playH(H, name, fade = .3) {
  const a = H.h.acts[name]; if (!a || H.cur === a) return;
  a.reset().play(); a.enabled = true;
  if (H.cur) a.crossFadeFrom(H.cur, fade, true); else a.fadeIn(fade);
  H.cur = a;
}

// 口哨唤马：马跑到玩家身边
export function callHorse(H, playerPos) {
  if (H.rider) return false;
  H.target = playerPos.clone(); H.state = 'called';
  return true;
}
export const canMount = (H, P) => !H.rider && H.pos.distanceTo(P.pos) < 3.6 && H.speed < 7;

// 每帧更新。input: { mx, mz, gallop, camYaw }（摇杆值 -1..1，mz<0 为前）
export function updateHorse(H, dt, input, fx) {
  const h = H.h;
  let want = 0, turnTo = null;
  if (H.rider) {
    const mag = Math.min(1, Math.hypot(input.mx, input.mz));
    if (mag > .08) {
      want = input.gallop ? GALLOP : mag > .92 ? CANTER * 1.25 : mag > .5 ? CANTER : WALK;
      // 摇杆方向相对镜头 → 马要朝的方向
      const cy = input.camYaw, fx_ = -Math.sin(cy), fz_ = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
      const mvx = rx * input.mx - fx_ * input.mz, mvz = rz * input.mx - fz_ * input.mz;
      turnTo = Math.atan2(mvx, mvz);             // 与人物朝向约定一致：root.rotation.y
    }
  } else if (H.state === 'called' && H.target) {
    _v.subVectors(H.target, H.pos); _v.y = 0; const d = _v.length();
    if (d < 2.6) { H.state = 'idle'; H.target = null; }
    else { want = d > 18 ? GALLOP * .85 : d > 6 ? CANTER : WALK; turnTo = Math.atan2(_v.x, _v.z); }
  }
  // 速度与转向
  const acc = want > H.speed ? 4.5 : 9;
  H.speed += Math.sign(want - H.speed) * Math.min(Math.abs(want - H.speed), acc * dt);
  if (turnTo !== null) {
    let d = turnTo - H.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const rate = H.speed > 7 ? 1.6 : H.speed > 2.5 ? 2.2 : 2.8;
    H.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }
  const fwd = _v.set(Math.sin(H.yaw), 0, Math.cos(H.yaw));
  H.pos.addScaledVector(fwd, H.speed * dt);
  const before = H.pos.clone();
  collide(H.pos, .9, H.pos.y);
  if (before.distanceToSquared(H.pos) > 1e-4 && H.speed > 3) H.speed *= .9;   // 撞墙减速
  // 贴地 + 沿坡度俯仰
  const fy = terrainH(H.pos.x + fwd.x * 1.1, H.pos.z + fwd.z * 1.1), by = terrainH(H.pos.x - fwd.x * 1.1, H.pos.z - fwd.z * 1.1);
  H.pos.y = (fy + by) / 2;
  H.pitch += (Math.atan2(by - fy, 2.2) - H.pitch) * Math.min(1, dt * 6);
  h.root.position.copy(H.pos);
  h.root.rotation.set(0, H.yaw, 0); h.root.rotateX(H.pitch);
  // 动作：按速度切换并调节播放速度，避免滑步
  if (H.speed < .25) playH(H, 'Idle');
  else if (H.speed < 3.2) { playH(H, 'Walk'); H.cur.timeScale = H.speed / WALK * .95; }
  else { playH(H, 'Gallop'); H.cur.timeScale = .55 + H.speed / GALLOP * .55; }
  h.mixer.update(dt);
  if (!H.rider) updateReins(H, null);
  // 疾驰扬尘
  if (fx && H.speed > 5) { H.lastStep -= dt; if (H.lastStep <= 0) { H.lastStep = .09 + Math.random() * .06; fx.dustKick(_seat.copy(H.pos).addScaledVector(fwd, -1.0 + Math.random() * .4).setY(H.pos.y + .1), .5 + H.speed * .05); } }
}

// 把骑手放到马鞍上（在骑手动作更新之后调用）
export function seatRider(H, ch) {
  ch.root.rotation.set(0, H.yaw, 0); ch.root.rotateX(H.pitch);
  straddle(ch, .42);
  H.h.root.updateMatrixWorld(true);
  H.h.seat.getWorldPosition(_seat);
  // 随步伐轻微起伏
  alignPelvis(ch, _seat);
}

export function mount(H, P) { H.rider = P; H.state = 'ridden'; H.target = null; }
export function dismount(H, P) {
  H.rider = null; H.state = 'idle';
  // 从左侧下马
  const left = new THREE.Vector3(Math.cos(H.yaw), 0, -Math.sin(H.yaw));
  P.pos.copy(H.pos).addScaledVector(left, 1.2);
  P.pos.y = terrainH(P.pos.x, P.pos.z);
  H.speed = Math.min(H.speed, 1);
}
