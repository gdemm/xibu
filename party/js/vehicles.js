// 载具: 吉普 / 摩托 / 自行车 / 大巴 / 卡车, parked on the island roads. Player-only driving.
import * as THREE from 'three';

// len/wid: footprint half sizes; max: top speed m/s; acc; turn; cam: chase distance; seatY: driver eye height
export const VTYPES = {
  jeep:  { name: '吉普', len: 1.9, wid: 1.0, max: 22, acc: 11, turn: 1.9, cam: 7, seatY: 1.9, hitK: 1 },
  moto:  { name: '摩托', len: 1.1, wid: 0.4, max: 27, acc: 14, turn: 2.4, cam: 5, seatY: 1.75, hitK: 0.8 },
  bike:  { name: '自行车', len: 0.9, wid: 0.3, max: 10, acc: 5, turn: 2.6, cam: 4.2, seatY: 1.8, hitK: 0.3 },
  bus:   { name: '大巴', len: 5.6, wid: 1.3, max: 15, acc: 5, turn: 1.1, cam: 14, seatY: 4.2, hitK: 1.6 },
  truck: { name: '卡车', len: 3.6, wid: 1.25, max: 17, acc: 6.5, turn: 1.3, cam: 11, seatY: 3.9, hitK: 1.5 },
};
const SPOTS = [
  ['jeep', -60, 0, Math.PI / 2], ['jeep', 0, 60, 0], ['jeep', -110, -6, Math.PI / 2],
  ['moto', 20, 0, Math.PI / 2], ['moto', 0, -62, 0], ['moto', -72, 43, Math.PI / 2],
  ['bike', -40, 0, Math.PI / 2], ['bike', 0, -90, 0], ['bike', 6, -118, 0], ['bike', 0, 30, 0],
  ['bus', 0, 112, Math.PI], ['bus', -100, 0, -Math.PI / 2],
  ['truck', 33, -52, 0], ['truck', 96, 0, -Math.PI / 2], ['truck', 70, 8, Math.PI / 2],
];
const COLORS = { jeep: [0x5b6b3a, 0x3b6fb6, 0xc0392b], moto: [0x111111, 0xc0392b, 0x2e6fb6], bike: [0x2e8b57, 0xd4a017, 0x3b6fb6, 0xe67e22], bus: [0xe1b12c, 0x3b7fc4], truck: [0x8a2f24, 0x2f5f8a, 0x51633a] };

const MAT = {}; const mat = (c, o) => MAT[c + (o || '')] || (MAT[c + (o || '')] = new THREE.MeshLambertMaterial(o ? { color: c, transparent: true, opacity: o } : { color: c }));
function builder(g) {
  const box = (w, h, d, x, y, z, c, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); g.add(m); return m; };
  const wheels = [];
  const wheel = (r, t, x, y, z) => { const geo = new THREE.CylinderGeometry(r, r, t, 12); geo.rotateZ(Math.PI / 2); const w = new THREE.Mesh(geo, mat(0x1d1f22)); w.position.set(x, y, z); g.add(w); wheels.push({ w, r }); return w; };
  return { box, wheel, wheels };
}
function vehicleMesh(type, color) {
  const g = new THREE.Group(), { box, wheel, wheels } = builder(g);
  const DARK = 0x2a2c30, METAL = 0x9aa0a6, GLASS = 0x8fb8d8;
  if (type === 'jeep') {
    box(2.0, 0.55, 3.8, 0, 0.75, 0, color); box(1.9, 0.35, 1.2, 0, 1.15, -1.25, color);
    box(1.8, 0.6, 0.06, 0, 1.6, -0.5, GLASS, 0.5);
    box(0.12, 0.9, 0.12, -0.85, 1.5, 0.6, METAL); box(0.12, 0.9, 0.12, 0.85, 1.5, 0.6, METAL); box(1.82, 0.12, 0.12, 0, 1.95, 0.6, METAL);
    box(0.8, 0.5, 0.7, -0.45, 1.25, 0.2, DARK); box(0.8, 0.5, 0.7, 0.45, 1.25, 0.2, DARK);
    box(2.05, 0.25, 0.3, 0, 0.6, -1.95, DARK); box(2.05, 0.25, 0.3, 0, 0.6, 1.95, DARK);
    for (const [x, z] of [[-1.05, -1.25], [1.05, -1.25], [-1.05, 1.25], [1.05, 1.25]]) wheel(0.45, 0.35, x, 0.45, z);
  } else if (type === 'moto') {
    box(0.35, 0.4, 1.3, 0, 0.75, 0, color); box(0.4, 0.3, 0.5, 0, 1.0, -0.25, color); box(0.32, 0.15, 0.6, 0, 1.0, 0.35, DARK);
    box(0.06, 0.55, 0.06, 0, 1.05, -0.7, METAL); box(0.7, 0.05, 0.05, 0, 1.3, -0.68, METAL); box(0.25, 0.2, 0.15, 0, 1.15, -0.78, 0xf2e6a0);
    box(0.12, 0.12, 0.6, 0.2, 0.5, 0.35, METAL);
    wheel(0.36, 0.14, 0, 0.36, -0.75); wheel(0.36, 0.16, 0, 0.36, 0.72);
  } else if (type === 'bike') {
    box(0.05, 0.05, 1.0, 0, 0.75, 0, color); box(0.05, 0.6, 0.05, 0, 0.6, 0.15, color); box(0.05, 0.55, 0.05, 0, 0.72, -0.48, color);
    box(0.2, 0.06, 0.28, 0, 0.95, 0.15, DARK); box(0.55, 0.04, 0.04, 0, 1.0, -0.5, METAL);
    wheel(0.34, 0.05, 0, 0.34, -0.55); wheel(0.34, 0.05, 0, 0.34, 0.55);
  } else if (type === 'bus') {
    box(2.5, 2.4, 11, 0, 1.85, 0, color); box(2.52, 0.75, 10.2, 0, 2.35, 0.2, GLASS, 0.75); box(2.3, 1.0, 0.06, 0, 2.3, -5.52, GLASS, 0.6);
    box(2.54, 0.25, 11.02, 0, 0.85, 0, DARK); box(2.4, 0.15, 10.8, 0, 3.1, 0, 0xeeeeee); box(0.9, 1.6, 0.06, 1.25, 1.5, -3.5, DARK);
    for (const z of [-3.8, 3.4]) for (const x of [-1.15, 1.15]) wheel(0.55, 0.4, x, 0.55, z);
  } else { // truck
    box(2.3, 1.8, 2.0, 0, 1.6, -2.4, color); box(2.1, 0.8, 0.06, 0, 2.05, -3.42, GLASS, 0.6); box(2.32, 0.5, 0.9, 0, 1.6, -2.4, GLASS, 0.55);
    box(2.4, 0.3, 7.2, 0, 0.75, 0, DARK); box(2.4, 0.25, 4.8, 0, 1.0, 1.2, 0x6b5a40);
    box(0.1, 0.9, 4.8, -1.15, 1.55, 1.2, 0x6b5a40); box(0.1, 0.9, 4.8, 1.15, 1.55, 1.2, 0x6b5a40); box(2.4, 0.9, 0.1, 0, 1.55, 3.55, 0x6b5a40);
    box(2.2, 1.6, 4.4, 0, 2.6, 1.2, 0x55603a, 0.95);
    for (const z of [-2.6, 1.0, 2.6]) for (const x of [-1.05, 1.05]) wheel(0.55, 0.4, x, 0.55, z);
  }
  g.userData.wheels = wheels;
  return g;
}

export function spawnVehicles(scene, map) {
  if (map.kind !== 'island') return [];
  const n = {};
  return SPOTS.map(([type, x, z, yaw]) => {
    const k = n[type] = (n[type] || 0) + 1, cs = COLORS[type];
    const mesh = vehicleMesh(type, cs[(k - 1) % cs.length]); scene.add(mesh);
    const v = { type, T: VTYPES[type], pos: new THREE.Vector3(x, 0, z), yaw, speed: 0, mesh, driver: null, spin: 0, lean: 0 };
    poseVehicle(v, 0); return v;
  });
}

export function driveVehicle(v, dt, throttle, steer, map, others = []) {
  const T = v.T;
  if (throttle) { const braking = Math.sign(throttle) !== Math.sign(v.speed) && Math.abs(v.speed) > 0.5; v.speed += throttle * (braking ? T.acc * 2 : T.acc) * dt; }
  else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 5 * dt);
  v.speed = Math.max(-T.max * 0.3, Math.min(T.max, v.speed));
  const sk = Math.max(-1, Math.min(1, v.speed / 5));
  v.yaw -= steer * T.turn * sk * dt;
  v.lean += ((v.type === 'moto' || v.type === 'bike' ? -steer * Math.min(1, Math.abs(v.speed) / 8) * 0.35 : 0) - v.lean) * Math.min(1, dt * 6);
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.pos.x + fx * v.speed * dt, nz = v.pos.z + fz * v.speed * dt;
  let hit = 0;
  if (collides(v, nx, nz, map, others)) { hit = Math.abs(v.speed); v.speed *= -0.25; }
  else { v.pos.x = nx; v.pos.z = nz; }
  const B = map.bounds; v.pos.x = Math.max(B.minX - 8, Math.min(B.maxX + 8, v.pos.x)); v.pos.z = Math.max(B.minZ - 8, Math.min(B.maxZ + 8, v.pos.z));
  return hit;
}
export function collides(v, x, z, map, others) {
  const T = v.T, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), r = T.wid + 0.05;
  const pts = []; const n = Math.max(1, Math.ceil(T.len / (r * 1.4)));
  for (let i = -n; i <= n; i++) { const t = (i / n) * (T.len - r * 0.6); pts.push([x + fx * t, z + fz * t]); }
  const list = map.near ? map.near({ x, z }) : map.solids;
  for (const b of list) {
    if (b.max.y < 0.6 || b.min.y > 1.6) continue;
    for (const [px, pz] of pts) if (px + r > b.min.x && px - r < b.max.x && pz + r > b.min.z && pz - r < b.max.z) return true;
  }
  if (others) for (const o of others) { if (o === v || o.pos.distanceTo(v.pos) > o.T.len + T.len + 2) continue; for (const [px, pz] of pts) if (inFootprint(o, px, pz, r)) return true; }
  return false;
}
// is point (px,pz) inside v's footprint (+pad)? used for run-over and vehicle-vehicle bumps
export function inFootprint(v, px, pz, pad = 0) {
  const dx = px - v.pos.x, dz = pz - v.pos.z, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const along = dx * fx + dz * fz, side = dx * -fz + dz * fx;
  return Math.abs(along) < v.T.len + pad && Math.abs(side) < v.T.wid + pad;
}
export function poseVehicle(v, dt) {
  v.mesh.position.set(v.pos.x, 0, v.pos.z); v.mesh.rotation.set(0, v.yaw, v.lean, 'YXZ');
  v.spin += v.speed * dt;
  for (const { w, r } of v.mesh.userData.wheels) w.rotation.x = -v.spin / r;
}
// axis-aligned box around a vehicle so people can't walk through it
export function vehicleBox(v) {
  const T = v.T, c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
  const hx = T.wid * c + T.len * s, hz = T.wid * s + T.len * c, h = { jeep: 1.6, moto: 1.1, bike: 1.0, bus: 3.1, truck: 3.0 }[v.type];
  if (!v.box) v.box = new THREE.Box3();
  v.box.min.set(v.pos.x - hx, 0, v.pos.z - hz); v.box.max.set(v.pos.x + hx, h, v.pos.z + hz);
  return v.box;
}
export function exitSpot(v, free) {
  const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), d0 = v.T.wid + 1;
  for (const s of [-1, 1]) for (const d of [d0, d0 + 0.7, d0 + 1.5]) { const x = v.pos.x + rx * d * s, z = v.pos.z + rz * d * s; if (free(x, z)) return new THREE.Vector3(x, 0, z); }
  const bx = v.pos.x + Math.sin(v.yaw) * (v.T.len + 1.2), bz = v.pos.z + Math.cos(v.yaw) * (v.T.len + 1.2);
  return new THREE.Vector3(bx, 0, bz);
}
