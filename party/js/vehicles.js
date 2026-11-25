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
  // 2026-11 迈阿密 car set (original low-poly designs, no real brands): pastel / neon paint, chrome bits
  coupe:   { name: '霓虹跑车', len: 2.1, wid: 0.95, max: 31, acc: 15, turn: 2.0, cam: 6.5, seatY: 1.55, hitK: 1, closed: true },
  muscle:  { name: '肌肉车', len: 2.3, wid: 1.0, max: 29, acc: 14, turn: 1.8, cam: 7, seatY: 1.6, hitK: 1.1, closed: true },
  convert: { name: '敞篷车', len: 2.2, wid: 0.98, max: 27, acc: 12, turn: 1.9, cam: 6.5, seatY: 1.6, hitK: 1 },
  police:  { name: '警车', len: 2.3, wid: 1.0, max: 29, acc: 13, turn: 1.9, cam: 7, seatY: 1.65, hitK: 1.1, closed: true },
  pickup:  { name: '皮卡', len: 2.5, wid: 1.05, max: 23, acc: 10, turn: 1.7, cam: 7.5, seatY: 1.9, hitK: 1.2, closed: true },
  yacht:   { name: '快艇', len: 3.4, wid: 1.2, max: 26, acc: 9, turn: 1.3, cam: 10, seatY: 1.9, hitK: 0, water: true },
  jetski:  { name: '摩托艇', len: 1.3, wid: 0.5, max: 30, acc: 16, turn: 2.4, cam: 5.5, seatY: 1.6, hitK: 0, water: true },
  armored: { name: '运钞车', len: 2.5, wid: 1.2, max: 17, acc: 7, turn: 1.5, cam: 8.5, seatY: 2.2, hitK: 1.5, closed: true },
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
const COLORS = { coupe: [0xff4fa3, 0x2fe0d0, 0xffe14d, 0xb46bff], muscle: [0xff7a1a, 0x7dff4a, 0x3a86ff, 0xffffff], convert: [0xffb3c7, 0x9fe3d6, 0xfff0a8, 0xc9b6ff], police: [0xffffff], pickup: [0xff6b6b, 0x5fd3c8, 0xf4f1e8], jeep: [0x5b6b3a, 0x3b6fb6, 0xc0392b], moto: [0x111111, 0xc0392b, 0x2e6fb6], bike: [0x2e8b57, 0xd4a017, 0x3b6fb6, 0xe67e22], bus: [0xe1b12c, 0x3b7fc4], heli: [0x2f6e8f, 0xd35400], truck: [0x8a2f24, 0x2f5f8a, 0x51633a], armored: [0xe8eef5], yacht: [0x1f5fbf, 0xff4fa3, 0x16b3a8], jetski: [0xffe14d, 0xff4fa3, 0x2fe0d0] };

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
  const g = new THREE.Group(); g.add(m); g.userData.wheels = []; g.userData.kenney = true;
  // 2026-11 帧率: a ~15% simplified copy drawn beyond ~40 m (main.js swaps them)
  const lg = PROPS[K.k + '_lo']; if (lg) { const lo = new THREE.Mesh(lg, m.material); lo.scale.copy(m.scale); lo.rotation.copy(m.rotation); lo.visible = false; g.add(lo); g.userData.hi = m; g.userData.lo = lo; }
  return g;
}
// 2026-11 帧率: parked procedural vehicles are 8-20 parts each (one draw call per part). Beyond ~40 m main.js shows instead one merged,
// vertex-coloured copy of the opaque parts (1 draw call); the real parts (spinning wheels, rotor) come back up close.
const FARMAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const _hsl = {}; function boost(c) { c.getHSL(_hsl); c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.35 + 0.08), Math.min(0.92, _hsl.l * 1.08 + 0.02)); return c; }
function farLod(g) {
  g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), M = new THREE.Matrix4(), P = [], N = [], C = [];
  g.traverse(o => {
    if (!o.isMesh || o.material.transparent) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld));
    const c = boost(o.material.color.clone()), pa = geo.attributes.position, na = geo.attributes.normal;   // same colour boost as party.js toonify
    for (let i = 0; i < pa.count; i++) { P.push(pa.getX(i), pa.getY(i), pa.getZ(i)); N.push(na.getX(i), na.getY(i), na.getZ(i)); C.push(c.r, c.g, c.b); }
    geo.dispose();
  });
  if (!P.length) return;
  const hi = new THREE.Group(); while (g.children.length) hi.add(g.children[0]); g.add(hi);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.computeBoundingSphere();
  const lo = new THREE.Mesh(geo, FARMAT); lo.visible = false; g.add(lo); g.userData.hi = hi; g.userData.lo = lo;
}
function vehicleMesh(type, color) {
  if (CARS[type]) return carMesh(type, color);
  if (KENNEY[type] && hasProps()) { const k = kenneyMesh(type, color); if (k) return k; }
  const g = new THREE.Group(), { box, wheel, wheels } = builder(g);
  const DARK = 0x2a2c30, METAL = 0x9aa0a6, GLASS = 0x8fb8d8;
  if (type === 'yacht') {   // white speed-yacht: V hull, coloured stripe, cabin + tinted glass, flybridge rail
    box(2.3, 0.9, 6.0, 0, 0.45, 0.3, 0xfafafa); box(1.5, 0.7, 1.2, 0, 0.55, -3.1, 0xfafafa); box(0.8, 0.5, 0.6, 0, 0.6, -3.9, 0xfafafa);
    box(2.34, 0.22, 6.04, 0, 0.35, 0.3, color); box(1.9, 0.08, 4.6, 0, 0.94, 0.6, 0xc8a070);
    box(1.7, 0.75, 2.0, 0, 1.35, 0.4, 0xffffff); box(1.72, 0.45, 1.6, 0, 1.4, 0.2, 0x2a4a6a); box(1.8, 0.08, 2.4, 0, 1.76, 0.4, 0xffffff);
    box(0.06, 0.4, 2.2, -0.85, 1.98, 0.4, METAL); box(0.06, 0.4, 2.2, 0.85, 1.98, 0.4, METAL); box(0.5, 0.35, 0.4, 0.4, 1.2, -0.7, DARK);
  } else if (type === 'jetski') {   // stand-up jet ski
    box(0.9, 0.5, 2.5, 0, 0.35, 0.1, color); box(0.6, 0.3, 0.8, 0, 0.55, -1.05, color); box(0.55, 0.22, 1.0, 0, 0.72, 0.4, DARK);
    box(0.08, 0.5, 0.08, 0, 0.9, -0.45, METAL); box(0.75, 0.06, 0.06, 0, 1.15, -0.45, METAL); box(0.92, 0.1, 2.52, 0, 0.12, 0.1, 0xfafafa);
  } else if (type === 'jeep') {
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
  } else if (type === 'armored') {   // 运钞车: white/blue armoured box with a rear door (opens after it is robbed)
    box(2.3, 0.5, 4.8, 0, 0.7, 0, 0xe8eef5);
    box(2.5, 2.0, 4.4, 0, 1.7, 0.2, 0xdfe8f2);
    box(2.54, 0.34, 4.42, 0, 1.16, 0.2, 0x2a5bd7); box(2.54, 0.3, 4.42, 0, 2.38, 0.2, 0x2a5bd7);
    box(1.7, 0.7, 0.06, 0, 2.16, -2.02, GLASS, 0.6); box(2.2, 0.14, 0.3, 0, 1.0, -2.35, DARK);
    box(1.8, 0.18, 0.5, 0, 2.76, 0.25, 0x2a5bd7); box(1.2, 0.08, 0.26, 0, 2.87, 0.25, 0x28e8ff);
    for (const s of [-1, 1]) box(0.34, 0.14, 0.06, s * 0.86, 1.06, -2.35, 0xfff6c8);
    const door = new THREE.Group(); door.position.set(0, 1.7, 2.42); g.add(door);
    const dm = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.96, 0.12), mat(0xcfd9e6)); dm.position.set(0, 0, 0.06); door.add(dm);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.13), mat(0x2a5bd7)); stripe.position.set(0, 0.3, 0.065); door.add(stripe);
    g.userData.door = door;
    for (const z of [-1.4, 1.4]) for (const x of [-1.02, 1.02]) wheel(0.52, 0.38, x, 0.52, z);
  } else { // truck: tractor unit only (cab + short chassis with fifth-wheel plate, no trailer)
    box(2.3, 1.8, 2.0, 0, 1.6, -0.75, color); box(2.1, 0.8, 0.06, 0, 2.05, -1.77, GLASS, 0.6); box(2.32, 0.5, 0.9, 0, 1.6, -0.75, GLASS, 0.55);
    box(2.2, 0.35, 0.25, 0, 0.75, -1.85, DARK); box(1.6, 0.5, 0.08, 0, 1.05, -1.8, METAL);   // bumper + grille
    box(2.4, 0.3, 3.8, 0, 0.75, 0.0, DARK); box(1.3, 0.12, 1.3, 0, 0.96, 1.1, METAL);       // chassis + fifth wheel
    box(0.18, 1.6, 0.18, 0.95, 2.4, 0.35, METAL); box(0.5, 0.5, 0.9, -1.25, 0.95, 0.4, METAL); // exhaust stack + fuel tank
    box(2.3, 0.08, 0.6, 0, 1.25, 1.75, DARK);                                                  // rear mudguard
    for (const z of [-1.1, 1.3]) for (const x of [-1.05, 1.05]) wheel(0.55, 0.4, x, 0.55, z);
  }
  g.userData.wheels = wheels;
  farLod(g);
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
  return (map.vehicleSpots || SPOTS).map(([type, x, z, yaw]) => {
    const k = n[type] = (n[type] || 0) + 1, cs = COLORS[type];
    if (type === 'heli' && !heliClear(map, x, z)) [x, z] = openSpot(map, x, z); // never park a helicopter indoors / under a roof
    const mesh = vehicleMesh(type, cs[(k - 1) % cs.length]); scene.add(mesh);
    const v = { type, T: VTYPES[type], pos: new THREE.Vector3(x, 0, z), yaw, speed: 0, mesh, driver: null, spin: 0, lean: 0 };
    poseVehicle(v, 0); return v;
  });
}

// 2026-11 free mode boats: water = outside the Miami sea wall, not on the downtown island / piers / cruise liner
export function isWater(map, x, z) {
  const B = map.bounds; if (!B) return false; const m = 13.6;
  if (x > B.minX - m && x < B.maxX + m && z > B.minZ - m && z < B.maxZ + m) return false;
  if (Math.abs(x) > 300 || Math.abs(z) > 300) return false;
  if (x < -185 && Math.abs(z) < 167) return false;
  if (Math.abs(x - (B.maxX + 120)) < 12.5 && Math.abs(z + 40) < 61) return false;
  const ZN = B.minZ - 12; if (z < ZN - 0.5 && z > ZN - 28) for (let k = 0; k < 6; k++) if (Math.abs(x - (-130 + k * 20)) < 1.4) return false;
  return true;
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
  if (T.water) {
    const ok = [-1, 0, 1].every(t => isWater(map, nx + fx * T.len * t, nz + fz * T.len * t) && isWater(map, nx + fz * T.wid * t, nz - fx * T.wid * t));
    if (ok) { v.pos.x = nx; v.pos.z = nz; } else { hit = Math.abs(v.speed) * 0.3; v.speed *= -0.3; }
    v.alt = -0.9 + Math.sin(performance.now() / 420 + v.pos.x) * 0.06; v.lean = (v.lean || 0) * 0.9 - steer * Math.min(1, Math.abs(v.speed) / 10) * 0.012;
    return hit;
  }
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
  const bar = v.mesh.userData.bar; if (bar) { const on = v.siren && ((performance.now() / 160) | 0) % 2; bar[0].material = on ? SIREN_R : SIREN_OFF; bar[1].material = v.siren && !on ? SIREN_B : SIREN_OFF; }
  const ro = v.mesh.userData.rotor; if (ro) { v.rpm = Math.max(0, Math.min(1, (v.rpm || 0) + (v.driver ? dt : -dt * 0.4))); ro.rotation.y += v.rpm * 28 * dt; v.mesh.userData.tail.rotation.x += v.rpm * 40 * dt; }
}
// axis-aligned box around a vehicle so people can't walk through it
export function vehicleBox(v) {
  const T = v.T, c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
  const hx = T.wid * c + T.len * s, hz = T.wid * s + T.len * c, h = { jeep: 1.6, moto: 1.1, bike: 1.0, bus: 3.1, truck: 2.6, heli: 2.6, armored: 3.0, yacht: 2.2, jetski: 1.2 }[v.type] || 1.6;
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

// ---------------- 迈阿密 cars: each one merged into ONE vertex-coloured mesh + ONE glass mesh (2 draw calls; police +2 lights +1 decal) ----------------
const CARS = { coupe: 1, muscle: 1, convert: 1, police: 1, pickup: 1 };
const CARMAT = new THREE.MeshLambertMaterial({ vertexColors: true }), GLASSMAT = new THREE.MeshLambertMaterial({ color: 0x35607e, transparent: true, opacity: 0.58, depthWrite: false });
const SIREN_R = new THREE.MeshBasicMaterial({ color: 0xff2a3a }), SIREN_B = new THREE.MeshBasicMaterial({ color: 0x2a6bff }), SIREN_OFF = new THREE.MeshLambertMaterial({ color: 0x5a5f6a });
let POLICE_TEX = null;
function policeTex() {
  if (POLICE_TEX) return POLICE_TEX;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1b2a6b'; g.fillRect(0, 44, 256, 12);
  g.font = '900 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1b2a6b'; g.fillText('POLICE', 128, 24);
  POLICE_TEX = new THREE.CanvasTexture(c); POLICE_TEX.colorSpace = THREE.SRGBColorSpace; return POLICE_TEX;
}
const CARGEO = {};
function carGeo(type, color) {
  const key = type + color; if (CARGEO[key]) return CARGEO[key];
  const P = [], G = [], col = new THREE.Color(), m = new THREE.Matrix4(), e = new THREE.Euler();
  const add = (list, geo, x, y, z, c, rx = 0, ry = 0, rz = 0) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m.makeRotationFromEuler(e.set(rx, ry, rz)).setPosition(x, y, z)); g.deleteAttribute('uv');
    if (list === P) { col.set(c); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); } list.push(g); };
  const bx = (w, h, d, x, y, z, c, rx = 0) => add(P, new THREE.BoxGeometry(w, h, d), x, y, z, c, rx);
  const gl = (w, h, d, x, y, z, rx = 0) => add(G, new THREE.BoxGeometry(w, h, d), x, y, z, 0, rx);
  // hollow cabin (roof slab + corner pillars + seat backs) so the driver shows through the glass; was a solid block
  const cab = (w, h, d, x, y, z, c) => { bx(w, 0.07, d, x, y + h / 2 - 0.035, z, c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.07, h, 0.08, x + sx * (w / 2 - 0.035), y, z + sz * (d / 2 - 0.04), c); for (const sx of [-1, 1]) bx(w / 2 - 0.12, h * 0.75, 0.08, x + sx * w / 4, y - h * 0.12, z + d / 2 - 0.12, 0x2a2c30); };
  const CHROME = 0xd8dde4, DARK = 0x22252b, TIRE = 0x1b1c1f, LIGHT = 0xfff6c8, TAIL = 0xff2244;
  const wheel = (x, z, r = 0.38, w = 0.3) => { add(P, new THREE.CylinderGeometry(r, r, w, 10), x, r, z, TIRE, 0, 0, Math.PI / 2); add(P, new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8), x, r, z, CHROME, 0, 0, Math.PI / 2); };
  const T = VTYPES[type], L = T.len * 2, W = T.wid * 2;
  // 2026-11-26 车身重做: sculpted side-profile bodies (extruded + bevelled, real wheel arches) and a solid tinted greenhouse
  // with body-colour roof and pillars, replacing the flat box + thin-pillar "paper" cabin.
  const PR = {
    coupe:   { y0: 0.3, wr: 0.38, nose: 0.66, hood: 0.78, belt: 0.84, deck: 0.86, tail: 0.74, roof: 1.22, wsF: -0.6, roofF: 0.0, roofR: 0.55, backR: 1.45 },
    muscle:  { y0: 0.3, wr: 0.4, nose: 0.72, hood: 0.86, belt: 0.9, deck: 0.9, tail: 0.82, roof: 1.33, wsF: -0.45, roofF: 0.05, roofR: 0.75, backR: 1.25 },
    police:  { y0: 0.3, wr: 0.38, nose: 0.68, hood: 0.84, belt: 0.88, deck: 0.88, tail: 0.8, roof: 1.36, wsF: -0.85, roofF: -0.25, roofR: 0.75, backR: 1.3 },
    convert: { y0: 0.3, wr: 0.38, nose: 0.66, hood: 0.8, belt: 0.84, deck: 0.84, tail: 0.76 },
    pickup:  { y0: 0.45, wr: 0.44, nose: 0.95, hood: 1.08, belt: 1.12, deck: 1.12, tail: 1.08, roof: 1.75, wsF: -1.1, roofF: -0.7, roofR: 0.25, backR: 0.3 },
  }[type];
  const body = type === 'police' ? 0xffffff : color, dark2 = new THREE.Color(body).multiplyScalar(0.75).getHex();
  const wz = L / 2 - 0.75, wr = PR.wr, y0 = PR.y0, BT = 0.06;
  // profile [z, y] (front = -z) -> Shape (x = -z), extruded across the width and turned to the car's axes
  const ext = (pts, width, bev, list, c) => {
    const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(-z, y) : sh.moveTo(-z, y));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 4 });
    geo.rotateY(Math.PI / 2); geo.translate(-(width - 2 * bev) / 2, 0, 0); add(list, geo, 0, 0, 0, c);
  };
  const arc = (out, zc, yc, r, a0, a1, n = 8) => { for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * k / n; out.push([zc + Math.cos(t) * r, yc + Math.sin(t) * r]); } };
  const curve = (out, p0, c, p1, n = 5) => { for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); } };
  { // lower body: bottom with two arches, rounded nose and tail, hood -> belt -> deck
    const ar = wr + 0.1, wc = wr, p = [[-L / 2 + 0.1, y0]];
    for (const zc of [-wz, wz]) { p.push([zc - ar, y0], [zc - ar, wc]); arc(p, zc, wc, ar, Math.PI, 0); p.push([zc + ar, y0]); }
    p.push([L / 2 - 0.1, y0], [L / 2, y0 + 0.12]);
    curve(p, [L / 2, y0 + 0.12], [L / 2 + 0.02, PR.tail + 0.04], [L / 2 - 0.3, PR.deck]);
    p.push([PR.backR ?? L / 2 - 0.9, PR.belt], [PR.wsF ?? -0.4, PR.belt], [-L / 2 + 0.45, PR.hood]);
    curve(p, [-L / 2 + 0.45, PR.hood], [-L / 2 - 0.02, PR.hood - 0.02], [-L / 2, PR.nose - 0.08]);
    p.push([-L / 2, y0 + 0.1]);
    ext(p, W, BT, P, body);
  }
  if (PR.roof) { // greenhouse: tinted glass solid, body-colour roof skin, A/C pillars, black B pillar
    const Wg = W - 0.28, b = PR.belt - 0.02;
    ext([[PR.wsF, b], [PR.roofF, PR.roof], [PR.roofR, PR.roof], [PR.backR, b]], Wg, 0.05, G, 0);
    ext([[PR.roofF + 0.04, PR.roof - 0.03], [PR.roofF + 0.1, PR.roof + 0.04], [PR.roofR - 0.06, PR.roof + 0.04], [PR.roofR, PR.roof - 0.03]], Wg + 0.04, 0.04, P, body);
    const pil = (z0, y0p, z1, y1, c, t = 0.09) => { const dz = z1 - z0, dy = y1 - y0p, len = Math.hypot(dz, dy); for (const s of [-1, 1]) add(P, new THREE.BoxGeometry(t, len, 0.11), s * (Wg / 2 + 0.01), (y0p + y1) / 2, (z0 + z1) / 2, c, Math.atan2(dz, dy)); };
    pil(PR.wsF, b, PR.roofF + 0.05, PR.roof, body); pil(PR.roofR - 0.05, PR.roof, PR.backR, b, body, 0.14);
    if (type !== 'coupe') { const zb = PR.roofF + (PR.roofR - PR.roofF) * 0.55; pil(zb, b, zb, PR.roof, DARK, 0.08); }
  }
  // wheels (tucked into the arches) + 5-spoke rims
  { const RIM = type === 'muscle' ? 0xe8c04a : type === 'coupe' ? 0x2a2c30 : CHROME, xw = W / 2 - 0.14;
    for (const s of [-1, 1]) for (const z of [-wz, wz]) {
      add(P, new THREE.CylinderGeometry(wr, wr, 0.32, 12), s * xw, wr, z, TIRE, 0, 0, Math.PI / 2);
      add(P, new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.02, 10), s * (xw + 0.165), wr, z, CHROME, 0, 0, Math.PI / 2);
      for (let k = 0; k < 5; k++) add(P, new THREE.BoxGeometry(0.04, wr * 1.1, 0.07), s * (xw + 0.18), wr, z, RIM, k * Math.PI * 2 / 5, 0, 0);
      add(P, new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), s * (xw + 0.19), wr, z, DARK, 0, 0, Math.PI / 2);
    } }
  // bumpers, lights, grille, plates, mirrors, handles, underglow, exhausts
  bx(W + 0.04, 0.16, 0.2, 0, y0 + 0.1, -L / 2 - 0.04, CHROME); bx(W + 0.04, 0.16, 0.2, 0, y0 + 0.1, L / 2 + 0.04, CHROME);
  for (const s of [-1, 1]) { bx(0.36, 0.13, 0.06, s * (W / 2 - 0.3), PR.nose - 0.12, -L / 2 - 0.02, LIGHT); bx(0.36, 0.11, 0.06, s * (W / 2 - 0.3), PR.tail - 0.1, L / 2 + 0.02, TAIL); }
  bx(W * 0.5, 0.16, 0.05, 0, PR.nose - 0.18, -L / 2 - 0.02, DARK); bx(W * 0.52, 0.03, 0.06, 0, PR.nose - 0.08, -L / 2 - 0.025, CHROME);
  bx(0.5, 0.13, 0.03, 0, y0 + 0.24, L / 2 + 0.03, 0xf4f4f0); bx(0.5, 0.13, 0.03, 0, y0 + 0.24, -L / 2 - 0.03, 0xf4f4f0);
  bx(W - 0.2, 0.05, L - 0.6, 0, 0.2, 0, type === 'police' ? DARK : NEONUNDER[(color >>> 3) % NEONUNDER.length]);
  for (const s of [-1, 1]) {
    const mz = (PR.wsF ?? -0.4) + 0.12;
    bx(0.1, 0.08, 0.05, s * (W / 2 + 0.02), PR.belt + 0.04, mz, body); bx(0.14, 0.1, 0.16, s * (W / 2 + 0.1), PR.belt + 0.08, mz, body); bx(0.02, 0.08, 0.13, s * (W / 2 + 0.175), PR.belt + 0.08, mz, 0xbfe6ff);
    bx(0.02, PR.belt - y0 - 0.12, 0.025, s * (W / 2 + 0.005), (PR.belt + y0) / 2 + 0.02, (PR.wsF ?? -0.4) + 0.9, dark2);
    bx(0.03, 0.035, 0.16, s * (W / 2 + 0.01), PR.belt - 0.1, (PR.wsF ?? -0.4) + 0.65, CHROME);
    if (type !== 'pickup') add(P, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), s * (W / 2 - 0.35), y0 + 0.02, L / 2 + 0.1, CHROME, Math.PI / 2, 0, 0);
  }
  const strip = (x, y, z0, y0s, z1, y1, c, w = 0.16) => { const dz = z1 - z0, dy = y1 - y0s; add(P, new THREE.BoxGeometry(w, 0.02, Math.hypot(dz, dy)), x, y + (y0s + y1) / 2, (z0 + z1) / 2, c, -Math.atan2(dy, dz)); };
  if (type === 'coupe') {         // rear wing + side stripe + hood vents
    bx(W - 0.12, 0.05, 0.36, 0, PR.deck + 0.24, L / 2 - 0.25, dark2); for (const s of [-1, 1]) bx(0.06, 0.24, 0.16, s * 0.6, PR.deck + 0.12, L / 2 - 0.25, dark2);
    for (const s of [-1, 1]) bx(0.02, 0.07, L * 0.62, s * (W / 2 + 0.005), PR.belt - 0.24, 0.1, 0xffffff);
    for (const s of [-1, 1]) strip(s * 0.35, 0.012, -L / 2 + 0.7, PR.hood + 0.01, -L / 2 + 1.2, PR.hood + 0.03, DARK, 0.22);
  } else if (type === 'muscle') { // hood scoop + twin racing stripes over hood, roof, deck + chrome trim
    bx(0.5, 0.12, 0.6, 0, PR.hood + 0.07, -L / 2 + 1.1, DARK);
    for (const x of [-0.22, 0.22]) { strip(x, 0.012, -L / 2 + 0.45, PR.hood, PR.wsF, PR.belt, 0xffffff); bx(0.16, 0.02, PR.roofR - PR.roofF - 0.1, x, PR.roof + 0.05, (PR.roofF + PR.roofR) / 2, 0xffffff); bx(0.16, 0.02, L / 2 - 0.3 - PR.backR, x, PR.deck + 0.012, (PR.backR + L / 2 - 0.3) / 2, 0xffffff); }
    for (const s of [-1, 1]) bx(0.03, 0.05, L * 0.78, s * (W / 2 + 0.005), y0 + 0.16, 0, CHROME);
  } else if (type === 'convert') { // open top: interior tub, windscreen frame, seats, roll hoops
    bx(W - 0.34, 0.03, 1.9, 0, PR.belt + 0.01, 0.4, 0x3a2a22);
    gl(W - 0.24, 0.38, 0.05, 0, PR.belt + 0.18, -0.35, -0.4); bx(W - 0.22, 0.05, 0.08, 0, PR.belt + 0.36, -0.42, CHROME);
    for (const s of [-1, 1]) add(P, new THREE.BoxGeometry(0.05, 0.42, 0.06), s * (W / 2 - 0.12), PR.belt + 0.17, -0.35, CHROME, -0.4);
    for (const z of [0.05, 0.9]) for (const s of [-1, 1]) { bx(0.5, 0.1, 0.5, s * 0.4, PR.belt + 0.05, z, 0xf4efe6); bx(0.5, 0.46, 0.12, s * 0.4, PR.belt + 0.26, z + 0.26, 0xf4efe6); }
    bx(0.36, 0.24, 0.08, -0.4, PR.belt + 0.14, -0.2, DARK);
  } else if (type === 'police') { // navy door panels + push bar + light-bar base
    for (const s of [-1, 1]) bx(0.02, PR.belt - y0 - 0.16, 2.2, s * (W / 2 + 0.008), (PR.belt + y0) / 2 + 0.02, 0.1, 0x1b2a6b);
    bx(W - 0.4, 0.4, 0.1, 0, y0 + 0.28, -L / 2 - 0.2, DARK); bx(W - 0.6, 0.07, 0.5, 0, PR.roof + 0.075, (PR.roofF + PR.roofR) / 2, DARK);
  } else if (type === 'pickup') { // bed: dark floor + rails + tailgate line, roof marker lights
    bx(W - 0.24, 0.03, L / 2 - 0.55, 0, PR.belt + 0.01, (0.4 + L / 2 - 0.15) / 2, DARK);
    for (const s of [-1, 1]) bx(0.08, 0.06, L / 2 - 0.5, s * (W / 2 - 0.05), PR.belt + 0.04, (0.4 + L / 2 - 0.1) / 2, CHROME);
    bx(W - 0.1, 0.02, 0.02, 0, PR.belt - 0.08, L / 2 + 0.005, dark2);
    for (const x of [-0.4, 0, 0.4]) bx(0.12, 0.05, 0.07, x, PR.roof + 0.06, PR.roofF + 0.12, 0xffb020);
  }
  const merge = (list) => { if (!list.length) return null; let n = 0; for (const g of list) n += g.attributes.position.count; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cc = list[0].attributes.color ? new Float32Array(n * 3) : null; let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (cc) cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (cc) g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeBoundingSphere(); return g; };
  return (CARGEO[key] = { body: merge(P), glass: merge(G) });
}
const NEONUNDER = [0xff2bd6, 0x28e8ff, 0x7dff4a, 0xffe600];
// 2026-11-25 seated driver (shown while an NPC drives; hidden when empty or the player is at the wheel)
// [x, z, head height above the car's floor line lowY] — head sits just under each roof
const DRV_SEAT = { coupe: [0.36, 0.2, 0.45], muscle: [0.36, 0.3, 0.52], convert: [0.42, 0.1, 0.55], police: [0.38, -0.05, 0.5], pickup: [0.38, -0.3, 0.74] };
const DRV_SKIN = [0xffe0c4, 0xf2c6a0, 0xd9a27a, 0xb97c55, 0x8d5a3b], DRV_HAIR = [0x1a1410, 0x3b2616, 0x6b4426, 0xc89a52, 0x9a2a2a, 0x2a2a2a], DRV_SHIRT = [0xff8fb4, 0x52dcc8, 0xffcc6e, 0xb194ff, 0x6fc4ff, 0xffffff, 0xff5fa0];
const DRV_GEO = { torso: new THREE.BoxGeometry(0.34, 0.4, 0.22), head: new THREE.SphereGeometry(0.12, 12, 10), hair: new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), arm: new THREE.BoxGeometry(0.08, 0.08, 0.34), wheel: new THREE.TorusGeometry(0.15, 0.025, 6, 16), cap: new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), brim: new THREE.BoxGeometry(0.2, 0.02, 0.12), shades: new THREE.BoxGeometry(0.2, 0.04, 0.03) };
const DRV_MAT = {}; const drvMat = (c) => DRV_MAT[c] || (DRV_MAT[c] = new THREE.MeshLambertMaterial({ color: c }));
const rpick = (a) => a[(Math.random() * a.length) | 0];
function makeDriver(type) {
  const seat = DRV_SEAT[type]; if (!seat) return null;
  const lowY = type === 'pickup' ? 0.75 : 0.6, g = new THREE.Group(), cop = type === 'police';
  const skin = drvMat(rpick(DRV_SKIN)), shirt = drvMat(cop ? 0x1b2a6b : rpick(DRV_SHIRT)), hair = drvMat(rpick(DRV_HAIR));
  const M = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const by = lowY + seat[2] - 0.33;
  M(DRV_GEO.torso, shirt, 0, by, 0);
  M(DRV_GEO.head, skin, 0, by + 0.33, -0.01);
  if (cop) { M(DRV_GEO.cap, drvMat(0x1b2a6b), 0, by + 0.44, 0); M(DRV_GEO.brim, drvMat(0x111111), 0, by + 0.42, -0.1); }
  else { const h = M(DRV_GEO.hair, hair, 0, by + 0.34, 0.01); h.rotation.x = -0.25; if (Math.random() < 0.45) M(DRV_GEO.shades, drvMat(0x111111), 0, by + 0.35, -0.115); }
  for (const s of [-1, 1]) { const a = M(DRV_GEO.arm, shirt, s * 0.15, by + 0.1, -0.2); a.rotation.x = 0.35; M(DRV_GEO.head, skin, s * 0.12, by + 0.06, -0.38).scale.setScalar(0.3); }
  const w = M(DRV_GEO.wheel, drvMat(0x222222), 0, by + 0.08, -0.42); w.rotation.x = -0.35;
  g.position.set(seat[0], 0, seat[1]); g.visible = false; return g;
}
function carMesh(type, color) {
  const { body, glass } = carGeo(type, color), g = new THREE.Group();
  g.add(new THREE.Mesh(body, CARMAT)); if (glass) g.add(new THREE.Mesh(glass, GLASSMAT));
  { const d = makeDriver(type); if (d) { g.add(d); g.userData.drv = d; } }
  g.userData.wheels = []; g.userData.car = true;
  if (type === 'police') {
    const T = VTYPES.police, W = T.wid * 2, y = 1.36 + 0.11 + 0.07;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.32), SIREN_OFF), b = r.clone(); r.position.set(-0.32, y, 0); b.position.set(0.32, y, 0); g.add(r, b); g.userData.bar = [r, b];
    const dm = new THREE.MeshBasicMaterial({ map: policeTex() });
    for (const s of [-1, 1]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), dm); q.position.set(s * (W / 2 + 0.03), 0.62, 0.3); q.rotation.y = s * Math.PI / 2; g.add(q); }
  }
  return g;
}
