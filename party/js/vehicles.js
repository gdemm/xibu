// 载具: 吉普 / 摩托 / 自行车 / 大巴 / 卡车, parked on the island roads. Player-only driving.
import * as THREE from 'three';
import { PROPS, propSize, hasProps } from './props.js';

// len/wid: footprint half sizes; max: top speed m/s; acc; turn; cam: chase distance; seatY: driver eye height
export const VTYPES = {
  jeep:  { name: '吉普', len: 1.9, wid: 1.0, max: 22, acc: 11, turn: 1.9, cam: 7, seatY: 1.9, hitK: 1 },
  moto:  { name: '摩托', len: 1.1, wid: 0.4, max: 27, acc: 14, turn: 2.4, cam: 5, seatY: 1.75, hitK: 0.8 },
  bike:  { name: '自行车', len: 0.9, wid: 0.3, max: 10, acc: 5, turn: 2.6, cam: 4.2, seatY: 1.8, hitK: 0.3 },
  bus:   { name: '大巴', len: 5.6, wid: 1.3, max: 15, acc: 5, turn: 1.1, cam: 14, seatY: 4.2, hitK: 1.6 },
  heli:  { name: '直升机', len: 2.4, wid: 1.1, max: 32, acc: 9, turn: 1.5, cam: 13, seatY: 2.4, hitK: 0, fly: true },
  truck: { name: '卡车', len: 1.9, wid: 1.25, max: 19, acc: 8, turn: 1.6, cam: 8, seatY: 3.3, hitK: 1.3 },
};
// parked at the roadside (road edge + half width + gap), facing along the road
const SPOTS = [
  ['jeep', -60, 5.6, Math.PI / 2], ['jeep', 5.6, 60, 0], ['jeep', -110, -5.6, Math.PI / 2],
  ['moto', 20, 5.0, Math.PI / 2], ['moto', -5.0, -62, 0], ['moto', -72, 47.0, Math.PI / 2],
  ['bike', -40, -4.9, Math.PI / 2], ['bike', 4.9, -90, 0], ['bike', 4.9, -118, 0], ['bike', -4.9, 30, 0],
  ['bus', 5.9, 112, Math.PI], ['bus', -100, -5.9, -Math.PI / 2],
  ['heli', -24, 18, 0], ['heli', 60, -30, Math.PI / 2],
  ['truck', 37.9, -52, 0], ['truck', 96, 5.9, -Math.PI / 2], ['truck', 70, -5.9, Math.PI / 2],
  // 2026-11 扩图: the new ring / coast roads
  ['jeep', -120, -198.4, Math.PI / 2], ['jeep', 168.4, 40, 0], ['jeep', 150, 5.6, Math.PI / 2], ['moto', 60, -207.6, Math.PI / 2], ['moto', -168.4, 100, 0],
  ['moto', 168.4, -150, 0], ['bike', 140, -198.6, Math.PI / 2], ['bike', -4.9, -180, 0], ['truck', -168.1, -100, 0], ['heli', -100, -172, 0], ['bus', -150, 5.9, -Math.PI / 2],
];
const COLORS = { jeep: [0x5b6b3a, 0x3b6fb6, 0xc0392b], moto: [0x111111, 0xc0392b, 0x2e6fb6], bike: [0x2e8b57, 0xd4a017, 0x3b6fb6, 0xe67e22], bus: [0xe1b12c, 0x3b7fc4], heli: [0x2f6e8f, 0xd35400], truck: [0x8a2f24, 0x2f5f8a, 0x51633a] };

const MAT = {}; const mat = (c, o) => MAT[c + (o || '')] || (MAT[c + (o || '')] = new THREE.MeshLambertMaterial(o ? { color: c, transparent: true, opacity: o } : { color: c }));
function builder(g) {
  const box = (w, h, d, x, y, z, c, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); g.add(m); return m; };
  const wheels = [];
  const wheel = (r, t, x, y, z) => { const geo = new THREE.CylinderGeometry(r, r, t, 12); geo.rotateZ(Math.PI / 2); const w = new THREE.Mesh(geo, mat(0x1d1f22)); w.position.set(x, y, z); g.add(w); wheels.push({ w, r }); return w; };
  return { box, wheel, wheels };
}
// 2026-11: jeep / truck use the Kenney Car Kit (CC0) SUV and truck, scaled to the same footprint (collision unchanged);
// moto / bike / bus / heli keep their procedural meshes (no CC0 match in the kit). Baked models have no spinning wheels.
const KENNEY = { jeep: { k: 'car_suv', flip: true }, truck: { k: 'car_truck', flip: true } };
const KMAT = {};
function kenneyMesh(type, color) {
  const K = KENNEY[type], geo = PROPS[K.k]; if (!geo) return null;
  const T = VTYPES[type], sz = propSize(K.k), s = Math.min((T.len * 2) / sz.z, (T.wid * 2) / sz.x) * 1.04;
  const c = new THREE.Color(0xffffff).lerp(new THREE.Color(color), 0.35), key = type + c.getHex();
  const m = new THREE.Mesh(geo, KMAT[key] || (KMAT[key] = new THREE.MeshLambertMaterial({ vertexColors: true, color: c })));
  m.scale.setScalar(s); if (K.flip) m.rotation.y = Math.PI;     // Kenney cars face +Z, ours drive toward -Z
  const g = new THREE.Group(); g.add(m); g.userData.wheels = []; g.userData.kenney = true; return g;
}
function vehicleMesh(type, color) {
  if (KENNEY[type] && hasProps()) { const k = kenneyMesh(type, color); if (k) return k; }
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
  } else if (type === 'heli') {   // light helicopter: cabin, glass nose, tail boom, skids, main + tail rotor
    box(1.8, 1.5, 2.6, 0, 1.55, 0, color); box(1.7, 1.1, 0.9, 0, 1.6, -1.65, GLASS, 0.55); box(1.2, 0.9, 1.0, 0, 2.5, 0.2, color);
    box(0.35, 0.4, 4.2, 0, 1.9, 3.3, color); box(0.08, 1.1, 0.7, 0, 2.4, 5.2, color); box(1.4, 0.06, 0.4, 0, 2.0, 5.0, color);
    box(0.1, 0.1, 3.6, -0.85, 0.3, 0, METAL); box(0.1, 0.1, 3.6, 0.85, 0.3, 0, METAL);
    for (const z of [-0.8, 0.8]) for (const x of [-0.75, 0.75]) box(0.08, 0.6, 0.08, x, 0.6, z, METAL);
    box(0.2, 0.4, 0.2, 0, 3.15, 0.2, DARK);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.38, 0.2); g.add(rotor);
    for (const r of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 0.28), mat(DARK)); bl.rotation.y = r; rotor.add(bl); }
    const tail = new THREE.Group(); tail.position.set(0.12, 2.4, 5.25); g.add(tail);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.16), mat(DARK)); tail.add(tb);
    g.userData.rotor = rotor; g.userData.tail = tail;
  } else { // truck: tractor unit only (cab + short chassis with fifth-wheel plate, no trailer)
    box(2.3, 1.8, 2.0, 0, 1.6, -0.75, color); box(2.1, 0.8, 0.06, 0, 2.05, -1.77, GLASS, 0.6); box(2.32, 0.5, 0.9, 0, 1.6, -0.75, GLASS, 0.55);
    box(2.2, 0.35, 0.25, 0, 0.75, -1.85, DARK); box(1.6, 0.5, 0.08, 0, 1.05, -1.8, METAL);   // bumper + grille
    box(2.4, 0.3, 3.8, 0, 0.75, 0.0, DARK); box(1.3, 0.12, 1.3, 0, 0.96, 1.1, METAL);       // chassis + fifth wheel
    box(0.18, 1.6, 0.18, 0.95, 2.4, 0.35, METAL); box(0.5, 0.5, 0.9, -1.25, 0.95, 0.4, METAL); // exhaust stack + fuel tank
    box(2.3, 0.08, 0.6, 0, 1.25, 1.75, DARK);                                                  // rear mudguard
    for (const z of [-1.1, 1.3]) for (const x of [-1.05, 1.05]) wheel(0.55, 0.4, x, 0.55, z);
  }
  g.userData.wheels = wheels;
  return g;
}

// open sky around (x,z): no wall/roof/prop within the rotor disc, from the ground up to 12 m
function heliClear(map, x, z, R = 4.5) {
  for (const b of map.solids) { if (b.max.y < 0.35 || b.min.y > 12) continue; if (x + R > b.min.x && x - R < b.max.x && z + R > b.min.z && z - R < b.max.z) return false; }
  const B = map.bounds; return x > B.minX + 6 && x < B.maxX - 6 && z > B.minZ + 6 && z < B.maxZ - 6;
}
function openSpot(map, x, z) {
  for (let r = 4; r < 90; r += 3) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (heliClear(map, px, pz)) return [px, pz]; }
  return [x, z];
}
export function spawnVehicles(scene, map) {
  if (map.kind !== 'island') return [];
  const n = {};
  return SPOTS.map(([type, x, z, yaw]) => {
    const k = n[type] = (n[type] || 0) + 1, cs = COLORS[type];
    if (type === 'heli' && !heliClear(map, x, z)) [x, z] = openSpot(map, x, z); // never park a helicopter indoors / under a roof
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
// helicopter: same throttle/steer as cars plus lift (-1..1); collides with buildings only near their height
export function flyVehicle(v, dt, throttle, steer, lift, map) {
  const T = v.T; v.alt = v.alt || 0;
  const rpmOK = (v.rpm || 0) > 0.6;
  v.vy = rpmOK ? lift * 7 : -4; if (!rpmOK && v.alt <= 0) v.vy = 0;
  const na = Math.max(0, Math.min(70, v.alt + v.vy * dt));
  const air = na > 0.05;
  if (air || throttle > 0) { if (throttle && rpmOK) v.speed += throttle * T.acc * dt; else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 4 * dt); }
  if (!air) v.speed *= Math.max(0, 1 - dt * 3);
  v.speed = Math.max(-T.max * 0.3, Math.min(T.max, v.speed));
  v.yaw -= steer * T.turn * (air ? 1 : 0.3) * dt;
  v.lean += (-steer * Math.min(1, Math.abs(v.speed) / 10) * 0.25 - v.lean) * Math.min(1, dt * 4);
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), nx = v.pos.x + fx * v.speed * dt, nz = v.pos.z + fz * v.speed * dt;
  const blockedAt = (x, z, y) => { const r = T.wid + 0.3; const list = map.near ? map.near({ x, z }) : map.solids; for (const b of list) { if (b.max.y < y + 0.2 || b.min.y > y + 3.4) continue; if (x + r > b.min.x && x - r < b.max.x && z + T.len > b.min.z && z - T.len < b.max.z) return b; } return null; };
  let hit = 0;
  if (blockedAt(nx, nz, na)) { hit = Math.abs(v.speed); v.speed *= -0.25; } else { v.pos.x = nx; v.pos.z = nz; }
  const below = blockedAt(v.pos.x, v.pos.z, na); v.alt = below ? Math.max(na, below.max.y) : na;
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
  v.mesh.position.set(v.pos.x, v.alt || 0, v.pos.z); v.mesh.rotation.set(0, v.yaw, v.lean, 'YXZ');
  v.spin += v.speed * dt;
  for (const { w, r } of v.mesh.userData.wheels) w.rotation.x = -v.spin / r;
  const ro = v.mesh.userData.rotor; if (ro) { v.rpm = Math.max(0, Math.min(1, (v.rpm || 0) + (v.driver ? dt : -dt * 0.4))); ro.rotation.y += v.rpm * 28 * dt; v.mesh.userData.tail.rotation.x += v.rpm * 40 * dt; }
}
// axis-aligned box around a vehicle so people can't walk through it
export function vehicleBox(v) {
  const T = v.T, c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
  const hx = T.wid * c + T.len * s, hz = T.wid * s + T.len * c, h = { jeep: 1.6, moto: 1.1, bike: 1.0, bus: 3.1, truck: 2.6, heli: 2.6 }[v.type];
  if (!v.box) v.box = new THREE.Box3(); const y0 = v.alt || 0;
  v.box.min.set(v.pos.x - hx, y0, v.pos.z - hz); v.box.max.set(v.pos.x + hx, y0 + h, v.pos.z + hz);
  return v.box;
}
export function exitSpot(v, free, support) {
  const y = v.alt || 0, rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), d0 = v.T.wid + 1, L = v.T.len + 1.2;
  const cand = [];
  for (const s of [-1, 1]) for (const d of [d0, d0 + 0.7, d0 + 1.5]) cand.push([v.pos.x + rx * d * s, v.pos.z + rz * d * s]);
  for (const s of [1, -1]) cand.push([v.pos.x + fx * L * s, v.pos.z + fz * L * s]);
  for (const [x, z] of cand) if (free(x, z, y) && (!support || support(x, z, y))) return new THREE.Vector3(x, y, z);
  for (const [x, z] of cand) if (free(x, z, y)) return new THREE.Vector3(x, y, z); // nothing under it: step off and drop
  return new THREE.Vector3(cand[6][0], y, cand[6][1]);
}
