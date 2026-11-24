// 自由模式 (2026-11): 迈阿密开放世界犯罪玩法, all content original.
// 复用吃鸡模式的地图 / 载具 / 背包 / 拾取 / HUD, 但没有对手、不缩圈、不跳伞.
// 核心: 目击才报警 (crime), 6 星通缉 + 身份特征 (脸/衣/车), 路人 (InstancedMesh),
//       便利店摄像头 / 珠宝店二选一 / 运钞车 / 安全屋存款 / 医院复活.
import * as THREE from 'three';
import { addStars, addCash, refreshWantedHud } from './wanted.js';
import { spawnVehicles, driveVehicle, poseVehicle, vehicleBox, inFootprint } from './vehicles.js';
import { autoDrive, resetAuto } from './autodrive.js';
import { spawnLootDef } from './br.js';
import { centerMsg } from './hud.js';
import { buildFreeDeco, disposeFreeDeco } from './freedeco.js';
import * as PedBox from './peds.js';
import * as PedKit from './pedmodels.js';
// 路人: animated chibi models (pedmodels.js); the instanced box people (peds.js) only if the character GLBs failed
const PK = (P) => (P && P.models ? PedKit : PedBox);
const createPeds = (scene, n) => PedKit.createPeds(scene, n) || PedBox.createPeds(scene, n);
const dressPed = (P, i, ped) => PK(P).dressPed(P, i, ped);
const posePed = (P, i, ped, far, dt, pp) => PK(P).posePed(P, i, ped, far, dt, pp);
const flushPeds = (P) => PK(P).flushPeds(P);
const disposePeds = (P, scene) => PK(P).disposePeds(P, scene);

const $ = (id) => document.getElementById(id);
const ROB_R = 2.8, PED_N = 28, CIV_N = 8, ARMOR_HP = 200;
const PASTEL = [0xff8fb4, 0x52dcc8, 0xffcc6e, 0xb194ff, 0x6fc4ff, 0xffa078, 0x8ae89a, 0xfff1f5];
const CLERK = { name: '店员', team: 'police', isPlayer: false, kills: 0, pos: new THREE.Vector3() };
const CIV = { name: '司机', team: 'civ', isPlayer: false, kills: 0, pos: new THREE.Vector3() };
const GUARD = { name: '押运员', team: 'police', isPlayer: false, kills: 0, pos: new THREE.Vector3() };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
const _box = new THREE.Box3(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _col = new THREE.Color();
let UI_BOUND = false;

const segDist = (px, pz, x0, z0, x1, z1) => {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - x0) * dx + (pz - z0) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
};
function walkable(map, x, z, r = 0.5) {
  const B = map.bounds; if (x < B.minX + 2 || x > B.maxX - 2 || z < B.minZ + 2 || z > B.maxZ - 2) return false;
  const list = map.near ? map.near({ x, z }) : map.solids;
  for (const b of list) if (b.min.y < 1.6 && b.max.y > 0.3 && x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return false;
  return true;
}
function nearestOutside(map, x, z) {
  let best = null, bd = 1e9;
  for (const n of map.nodes || []) {
    if (!n.n.length || n.inside) continue;
    const d = (n.p.x - x) ** 2 + (n.p.z - z) ** 2;
    if (d < bd) { bd = d; best = n.p; }
  }
  return best ? { x: best.x, z: best.z } : { x, z };
}
function roadPoint(G, from, minD = 0) {
  const roads = G.map.roads || []; if (!roads.length) return { x: 0, z: 0, yaw: 0 };
  for (let i = 0; i < 90; i++) {
    const r = roads[(Math.random() * roads.length) | 0], horiz = r[2] - r[0] > r[3] - r[1];
    let x, z, yaw;
    if (horiz) { x = r[0] + 4 + Math.random() * Math.max(1, r[2] - r[0] - 8); z = (r[1] + r[3]) / 2; yaw = Math.PI / 2; }
    else { x = (r[0] + r[2]) / 2; z = r[1] + 4 + Math.random() * Math.max(1, r[3] - r[1] - 8); yaw = 0; }
    if (from && Math.hypot(x - from.x, z - from.z) < minD) continue;
    return { x, z, yaw };
  }
  const r = roads[0]; return { x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, yaw: 0 };
}

// ---------------- world markers ----------------
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,10,30,.62)'; g.beginPath(); g.roundRect ? g.roundRect(6, 8, 244, 48, 14) : g.rect(6, 8, 244, 48); g.fill();
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0'); g.lineWidth = 3; g.stroke();
  g.font = '900 30px system-ui, "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(4.4, 1.1, 1); return sp;
}
function addMarker(G, scene, x, z, color, text, kind) {
  const ringGeo = new THREE.RingGeometry(1.7, 2.15, 26); ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.set(x, 0.06, z); ring.renderOrder = 2; scene.add(ring);
  const sp = makeLabel(text, color); sp.position.set(x, kind === 'jewel' ? 6.2 : 4.4, z); sp.scale.set(3.3, 0.82, 1); scene.add(sp);
  return { kind, name: text, x, z, color, ring, sp };
}

export function freeCleanup(G, scene) {
  const F = G.freeState; if (!F) return;
  for (const l of F.locs || []) { if (l.ring) { scene.remove(l.ring); l.ring.geometry?.dispose?.(); l.ring.material?.dispose?.(); } if (l.sp) { scene.remove(l.sp); l.sp.material?.map?.dispose?.(); l.sp.material?.dispose?.(); } }
  for (const c of F.cams || []) if (c.m) { scene.remove(c.m); }
  for (const b of F.bags || []) if (b.m) scene.remove(b.m);
  disposePeds(F.pedMesh, scene);
  disposeFreeDeco(F.deco, scene, G.map); hideGunDlg();
  for (const v of F.traffic || []) { const i = G.vehicles?.indexOf(v); if (i != null && i >= 0) G.vehicles.splice(i, 1); scene.remove(v.mesh); }
  if (G.onCivJack) G.onCivJack = null;
  if (F.armored) { const i = G.vehicles?.indexOf(F.armored); if (i != null && i >= 0) G.vehicles.splice(i, 1); scene.remove(F.armored.mesh); }
  hideJewel();
  G.freeState = null;
}

// ---------------- setup ----------------
export function setupFree(G, h) {
  const scene = h.scene;
  freeCleanup(G, scene);
  const F = G.freeState = { locs: [], peds: [], traffic: [], pedPicks: null, extraShops: [], kiosks: [], foodCd: 0, gunCd: 0, cams: [], bags: [], rob: null, armored: null, hudT: 0, clothCd: 0, sprayCd: 0, safeT: 0, lastArmorDest: null };
  G.freeMask = false;
  const bm = $('bMask'); if (bm) bm.classList.remove('on');
  bindUI();
  const map = G.map;

  // ---- locations (walkable empty ground near the roads) ----
  const safe = nearestOutside(map, -40, 10), hospital = nearestOutside(map, 30, -42);
  const clothes = nearestOutside(map, 70, 42), spray = nearestOutside(map, -60, 60);
  F.safe = safe; F.hospital = hospital; F.clothes = clothes; F.spray = spray;
  F.locs.push(addMarker(G, scene, safe.x, safe.z, 0x4cd17a, '安全屋 · 存钱', 'safe'));
  F.locs.push(addMarker(G, scene, hospital.x, hospital.z, 0xff5a5a, '医院 · 复活', 'hospital'));
  F.locs.push(addMarker(G, scene, clothes.x, clothes.z, 0xff8fb4, '服装店 · 换衣 $100', 'clothes'));
  F.locs.push(addMarker(G, scene, spray.x, spray.z, 0xb46bff, '喷漆店 · 喷漆 $200', 'spray'));

  // ---- free-mode street extras: neon blade signs / arches, gun shop, food truck, gas station ----
  F.deco = buildFreeDeco(G, scene);
  F.extraShops = F.deco.extraShops; F.kiosks = F.deco.kiosks;
  for (const k of F.kiosks) F.locs.push(addMarker(G, scene, k.x, k.z, k.color, k.label, k.kind));

  // ---- two of the convenience stores become jewellery stores ----
  const shops = (map.shops || []).slice();
  if (shops.length >= 2) {
    const js = [shops[0], shops[shops.length - 1]];
    for (const s of js) {
      s.jewel = true; s.name = '珠宝店';
      const cx = (s.b.x0 + s.b.x1) / 2, cz = (s.b.z0 + s.b.z1) / 2;
      F.locs.push(addMarker(G, scene, cx, cz, 0xffd24a, '珠宝店', 'jewel'));
    }
  }
  // shop cameras: every convenience store ceiling corner (jewellery stores get none)
  for (const s of shops) {
    if (s.jewel) continue;
    const b = s.b;
    const cx = s.x < (b.x0 + b.x1) / 2 ? b.x0 + 0.7 : b.x1 - 0.7;
    const cz = b.z0 + 0.7, y = 2.85;
    const grp = new THREE.Group(); grp.position.set(cx, y, cz);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.36), new THREE.MeshLambertMaterial({ color: 0x2a2c34 })); grp.add(body);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
    lens.position.set(0, -0.02, 0.2); lens.rotation.x = 0.35; grp.add(lens);
    scene.add(grp);
    const box = new THREE.Box3(new THREE.Vector3(cx - 0.25, y - 0.22, cz - 0.25), new THREE.Vector3(cx + 0.25, y + 0.16, cz + 0.25));
    s.cam = { m: grp, lens, shop: s, broken: false, box };
    F.cams.push(s.cam);
  }

  // ---- pedestrians (two InstancedMesh: body + head) ----
  const nodes = (map.nodes || []).filter(n => n.n.length && !n.inside);
  let picks = nodes.filter(n => (map.roads || []).some(([x0, z0, x1, z1]) => segDist(n.p.x, n.p.z, x0, z0, x1, z1) < 13));
  if (picks.length < 40) picks = nodes;
  F.pedPicks = picks.length ? picks : nodes;
  F.pedMesh = createPeds(scene, PED_N);
  for (let i = 0; i < PED_N; i++) {
    const nd = picks[(Math.random() * picks.length) | 0] || nodes[0];
    const nidx = nodes.indexOf(nd) >= 0 ? map.nodes.indexOf(nd) : 0;
    const pos = new THREE.Vector3((nd ? nd.p.x : 0) + (Math.random() - 0.5) * 2, 0, (nd ? nd.p.z : 0) + (Math.random() - 0.5) * 2);
    if (!walkable(map, pos.x, pos.z, 0.4)) { pos.x = nd.p.x; pos.z = nd.p.z; }
    const ped = {
      pos, yaw: Math.random() * 6.28, node: nidx, prev: -1, tgt: { x: pos.x, z: pos.z }, alive: true,
      walk: Math.random() * 6, fleeT: 0, threat: new THREE.Vector3(), reportT: 0, reported: false,
      idleT: 0, phone: false, moving: false, deadT: 0,
    };
    pickNeighbor(G, ped);
    dressPed(F.pedMesh, i, ped);
    F.peds.push(ped);
  }
  // a few small groups standing and chatting on the pavement
  for (let g = 0; g < 3; g++) {
    const a0 = F.peds[g * 3], n = 2 + (g % 2);
    a0.idleT = 9999; a0.group = true;
    for (let k = 1; k < n; k++) {
      const q = F.peds[g * 3 + k], ang = (k / n) * Math.PI * 2;
      q.pos.set(a0.pos.x + Math.sin(ang) * 0.95, 0, a0.pos.z + Math.cos(ang) * 0.95);
      if (!walkable(map, q.pos.x, q.pos.z, 0.3)) q.pos.copy(a0.pos).add(new THREE.Vector3(0.9, 0, 0));
      q.idleT = 9999; q.group = true;
    }
    for (let k = 0; k < n; k++) { const q = F.peds[g * 3 + k]; q.yaw = Math.atan2(a0.pos.x + 0.3 - q.pos.x, a0.pos.z + 0.3 - q.pos.z); }
    if (g === 1) F.peds[g * 3 + 1].phone = true;
  }

  // ---- street traffic: civilian cars driving the road net ----
  const CT = ['coupe', 'muscle', 'convert', 'pickup'];
  const spots = [];
  for (let i = 0; i < CIV_N; i++) { const sp = roadPoint(G, G.player?.pos || { x: safe.x, z: safe.z }, 18); spots.push([CT[i % CT.length], sp.x, sp.z, sp.yaw]); }
  for (const c of spawnVehicles(scene, { kind: 'island', vehicleSpots: spots })) {
    h.toonify?.(c.mesh);
    c.driver = CIV; c.civ = true; c.civDest = null;
    G.vehicles.push(c); F.traffic.push(c);
  }
  G.onCivJack = (G2, h2, v) => civJack(G2, h2, v);

  // ---- armoured cash truck (auto-drives the road loop) ----
  const sp = { x: 24, z: -70, yaw: 0 };
  const [v] = spawnVehicles(scene, { kind: 'island', vehicleSpots: [['armored', sp.x, sp.z, sp.yaw]] });
  if (v) {
    h.toonify?.(v.mesh);
    v.driver = GUARD; v.freeArmor = { hp: ARMOR_HP, down: false, respawnT: 0, dest: null };
    G.vehicles.push(v); F.armored = v;
  }

  // ---- player spawns on foot beside the safehouse with a pistol ----
  const p = G.player;
  p.pos.set(safe.x, 0, safe.z); p.vel.set(0, 0, 0); p.onGround = true; p.air = null; p.hp = 100; p.alive = true;
  if (G.owned) G.owned.add('pistol');
  if (G.ammo && G.ammo.pistol) { G.ammo.pistol.mag = Math.max(1, h.WEAPONS?.pistol?.mag || 12); G.ammo.pistol.reserve = Math.max(24, h.WEAPONS?.pistol?.reserve || 48); }
  h.setWeapon?.('pistol', true);
  refreshWantedHud(G);
}

// ---------------- pedestrians ----------------
function pickNeighbor(G, ped) {
  const nodes = G.map.nodes, nd = nodes[ped.node]; if (!nd || !nd.n.length) return;
  let nb = nd.n[(Math.random() * nd.n.length) | 0];
  if (nd.n.length > 1 && nb === ped.prev) nb = nd.n[(nd.n.indexOf(nb) + 1) % nd.n.length];
  ped.prev = ped.node; ped.node = nb;
  const t = nodes[nb].p; ped.tgt.x = t.x; ped.tgt.z = t.z;
}
function scare(G, pos, radius) {
  const F = G.freeState; if (!F || !pos) return;
  const r2 = radius * radius;
  for (const p of F.peds) {
    if (!p.alive) continue;
    const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z; if (dx * dx + dz * dz > r2) continue;
    p.fleeT = Math.max(p.fleeT, 3.2 + Math.random() * 2);
    p.threat.set(pos.x, 0, pos.z);
    if (p.reportT <= 0 && !p.reported) p.reportT = 3;
  }
}
export function freeNoise(G, pos, radius = 45) { scare(G, pos, radius); }
function killPed(G, h, ped, why) {
  if (!ped.alive) return;
  ped.alive = false; ped.reportT = 0; ped.deadT = 20; ped.phone = false;
  h.addSpark?.(new THREE.Vector3(ped.pos.x, 1.0, ped.pos.z), 0xff3a3a);
  crime(G, h, 1, why || '打死路人', ped.pos);
  scare(G, ped.pos, 22);
}
function respawnPed(G, p) {
  const F = G.freeState, picks = F.pedPicks || [], pp = G.player?.pos;
  for (let t = 0; t < 30; t++) {
    const nd = picks[(Math.random() * picks.length) | 0]; if (!nd) break;
    if (pp && Math.hypot(nd.p.x - pp.x, nd.p.z - pp.z) < 55) continue;
    p.pos.set(nd.p.x, 0, nd.p.z); p.node = G.map.nodes.indexOf(nd); p.prev = -1; break;
  }
  p.alive = true; p.deadT = 0; p.fleeT = 0; p.reported = false; p.reportT = 0; p.idleT = 0; p.group = false; p.phone = false;
  pickNeighbor(G, p);
}
function updatePeds(G, dt, h) {
  const F = G.freeState, PM = F?.pedMesh; if (!PM) return;
  const pp = G.player?.pos;
  F.pedFrame = (F.pedFrame || 0) + 1;
  for (let i = 0; i < F.peds.length; i++) {
    const p = F.peds[i];
    const far = pp ? (p.pos.x - pp.x) ** 2 + (p.pos.z - pp.z) ** 2 > 4900 : false;
    if (!p.alive) {
      if (p.deadT > 0) { p.deadT -= dt; if (p.deadT <= 0) respawnPed(G, p); }
      posePed(PM, i, p, far, dt, pp); continue;
    }
    if (p.reportT > 0) {
      p.reportT -= dt;
      if (p.reportT <= 0 && !p.reported) { p.reported = true; p.phone = true; if (G.player?.alive) crime(G, h, 1, '路人报警', p.pos, true); }
    }
    let speed = 0, tx = p.tgt.x, tz = p.tgt.z;
    if (p.fleeT > 0) {
      p.fleeT -= dt; p.idleT = 0; p.group = false;
      const dx = p.pos.x - p.threat.x, dz = p.pos.z - p.threat.z, d = Math.hypot(dx, dz) || 1;
      speed = 4.2; tx = p.pos.x + dx / d * 5; tz = p.pos.z + dz / d * 5;
      if (p.fleeT <= 0) p.phone = false;
    } else if (p.idleT > 0) {
      p.idleT -= dt;
    } else {
      speed = 1.2;
      if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 0.6) {
        pickNeighbor(G, p); tx = p.tgt.x; tz = p.tgt.z;
        if (p.look?.talker && Math.random() < 0.3) { p.idleT = 6 + Math.random() * 8; p.phone = Math.random() < 0.6; }
        else p.phone = false;
      }
    }
    p.moving = false;
    if (speed) {
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d, speed * dt), nx = p.pos.x + dx / d * step, nz = p.pos.z + dz / d * step;
      if (walkable(G.map, nx, nz, 0.34)) { p.pos.x = nx; p.pos.z = nz; p.yaw = Math.atan2(dx, dz); p.moving = true; }
      else if (p.fleeT > 0) pickNeighbor(G, p);
    }
    p.walk += dt * speed * 2.6;
    if (!PM.models && far && (F.pedFrame + i) % 4) continue;   // box people far away: refresh the instance only every 4th frame
    posePed(PM, i, p, far, dt, pp);
  }
  flushPeds(PM);
}

// ---------------- street traffic ----------------
function civJack(G, h, v) {
  const F = G.freeState; if (!F) return;
  v.civ = false; v.driver = null; resetAuto(v);
  const i = F.traffic.indexOf(v); if (i >= 0) F.traffic.splice(i, 1);
  // the driver jumps out and runs: reuse a dead or the farthest pedestrian slot
  const pp = G.player.pos;
  let slot = F.peds.find(q => !q.alive);
  if (!slot) { let bd = -1; for (const q of F.peds) { const d = Math.hypot(q.pos.x - pp.x, q.pos.z - pp.z); if (d > bd) { bd = d; slot = q; } } }
  if (slot) {
    const sx = Math.cos(v.yaw) * 1.6, sz = -Math.sin(v.yaw) * 1.6;
    slot.alive = true; slot.deadT = 0; slot.group = false; slot.idleT = 0; slot.phone = false;
    slot.pos.set(v.pos.x + sx, 0, v.pos.z + sz);
    slot.fleeT = 5; slot.threat.set(pp.x, 0, pp.z); slot.reported = false; slot.reportT = 2.5;
  }
  crime(G, h, 1, '抢车', v.pos);
}
function updateTraffic(G, dt, h) {
  const F = G.freeState, pp = G.player?.pos; if (!F?.traffic?.length) return;
  for (const v of F.traffic) {
    if (v.dead || !v.civ) continue;
    // keep the streets busy: far-away cars hop to a road 60-90 m from the player, out of sight
    if (pp && Math.hypot(v.pos.x - pp.x, v.pos.z - pp.z) > 120) {
      for (let t = 0; t < 12; t++) {
        const sp = roadPoint(G, pp, 60);
        if (Math.hypot(sp.x - pp.x, sp.z - pp.z) > 90) continue;
        if (G.vehicles.some(o => o !== v && Math.hypot(o.pos.x - sp.x, o.pos.z - sp.z) < 6)) continue;
        v.pos.set(sp.x, 0, sp.z); v.yaw = sp.yaw + (Math.random() < 0.5 ? Math.PI : 0); v.speed = 0; v.civDest = null; resetAuto(v); poseVehicle(v, 0);
        break;
      }
    }
    if (!v.civDest || Math.hypot(v.civDest.x - v.pos.x, v.civDest.z - v.pos.z) < 14) { const sp = roadPoint(G, v.pos, 50); v.civDest = { x: sp.x, z: sp.z }; }
    const r = autoDrive(v, dt, G.map, G.vehicles, v.civDest, { cruise: 9, arrive: 10 });
    let thr = r.thr;
    // brake for people in front (pedestrians and the player on foot)
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), reach = v.T.len + 4;
    const blocked = (x, z) => { const dx = x - v.pos.x, dz = z - v.pos.z, al = dx * fx + dz * fz; return al > 0 && al < reach && Math.abs(dx * -fz + dz * fx) < v.T.wid + 0.6; };
    let stop = pp && !h.inCar?.() && G.player.alive && blocked(pp.x, pp.z);
    if (!stop) for (const q of F.peds) if (q.alive && blocked(q.pos.x, q.pos.z)) { stop = true; break; }
    if (stop) { thr = v.speed > 0.3 ? -1 : 0; if (!v.honkT || G.now > v.honkT) { v.honkT = G.now + 3; } }
    driveVehicle(v, dt, thr, r.st, G.map, G.vehicles);
    poseVehicle(v, dt);
    // cars that are not stopped still hurt careless pedestrians
    if (Math.abs(v.speed) > 5) for (const q of F.peds) if (q.alive && inFootprint(v, q.pos.x, q.pos.z, 0.3)) { q.alive = false; q.deadT = 20; scare(G, q.pos, 18); }
  }
}

// ---------------- crime / witnesses ----------------
export function crime(G, h, n, why, pos, force = false) {
  const W = G.wanted, p = G.player;
  if (!W || !p?.alive) return false;
  const F = G.freeState;
  const at = pos || p.pos;
  const px = at.x ?? p.pos.x, pz = at.z ?? p.pos.z;
  let seen = !!force, viaPed = null;
  // 警察在场 / 看得见
  if (!seen) for (const v of W.cops || []) {
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
    if (d < 8) { seen = true; break; }
    if (d < 42) { _a.set(v.pos.x, 1.4, v.pos.z); _b.set(p.pos.x, p.pos.y + 1.2, p.pos.z); if (G.map.hasLOS(_a, _b)) { seen = true; break; } }
  }
  // 该店监控摄像头完好
  if (!seen && F) for (const c of F.cams) if (!c.broken && Math.hypot(c.shop.x - px, c.shop.z - pz) < 12) { seen = true; break; }
  // 25 米内路人 + 视线
  if (!seen && F) for (const ped of F.peds) {
    if (!ped.alive) continue;
    const dx = ped.pos.x - px, dz = ped.pos.z - pz; if (dx * dx + dz * dz > 625) continue;
    _a.set(ped.pos.x, 1.6, ped.pos.z); _b.set(px, 0.8, pz);
    if (G.map.hasLOS(_a, _b)) { seen = true; viaPed = ped; break; }
  }
  if (!seen) { h.HUD.centerMsg('没人看见', 1000); return false; }
  if (viaPed && !viaPed.reported) { viaPed.reported = true; viaPed.fleeT = Math.max(viaPed.fleeT, 3); viaPed.threat.copy(p.pos); }
  // 身份特征
  if (!G.freeMask) W.traits.face = true;
  W.traits.clothes = true;
  const car = h.inCar?.();
  if (car) { W.traits.car = true; W.carRef = car; }
  W.hollow = !!G.freeMask;
  addStars(G, h, n, why);
  scare(G, at, 26);
  return true;
}

// ---------------- shooting: cameras, pedestrians, cash truck ----------------
export function freeShot(G, h, origin, dir, w) {
  const F = G.freeState; if (!F || w.melee) return;
  const wallD = G.map.rayWorld(origin, dir, w.range || 120);
  _ray.set(origin, dir);
  for (const c of F.cams) {
    if (c.broken) continue;
    const hit = _ray.intersectBox(c.box, _hit);
    if (hit && hit.distanceTo(origin) <= wallD) {
      c.broken = true; c.lens.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      h.addSpark?.(hit.clone(), 0xff5050); h.HUD.centerMsg('监控摄像头被打坏', 1000);
    }
  }
  for (const ped of F.peds) {
    if (!ped.alive) continue;
    _box.min.set(ped.pos.x - 0.36, ped.pos.y + 0.15, ped.pos.z - 0.36);
    _box.max.set(ped.pos.x + 0.36, ped.pos.y + 1.85, ped.pos.z + 0.36);
    const hit = _ray.intersectBox(_box, _hit);
    if (hit && hit.distanceTo(origin) <= wallD) { killPed(G, h, ped, '打死路人'); return; }
  }
  const v = F.armored;
  if (v && v.freeArmor && !v.freeArmor.down) {
    const hit = _ray.intersectBox(vehicleBox(v), _hit);
    if (hit && hit.distanceTo(origin) <= wallD) {
      const A = v.freeArmor; A.hp -= w.dmg;
      h.addSpark?.(hit.clone(), 0xffe08a);
      if (A.hp <= 0) downArmored(G, h, v);
    }
  }
}

// ---------------- armoured truck ----------------
function spawnBag(G, h, x, z) {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.34), new THREE.MeshLambertMaterial({ color: 0x2f8f4e })); bag.position.y = 0.23; g.add(bag);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.38), new THREE.MeshLambertMaterial({ color: 0x1c5a32 })); strap.position.y = 0.23; g.add(strap);
  g.position.set(x, 0, z); h.scene.add(g);
  G.freeState.bags.push({ m: g, x, z, taken: false });
}
function downArmored(G, h, v) {
  const A = v.freeArmor; A.down = true; A.hp = 0; A.respawnT = G.now + 90;
  v.driver = null; v.speed = 0; resetAuto(v);
  const door = v.mesh.userData.door; if (door) door.rotation.y = 1.25;
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  for (let i = 0; i < 3; i++) spawnBag(G, h, v.pos.x - fx * 2.2 + (i - 1) * 0.9, v.pos.z - fz * 2.2 + (i - 1) * 0.5);
  crime(G, h, 2, '袭击运钞车', v.pos, true);
  h.sfx?.kill?.(); h.HUD.centerMsg('运钞车被截停！掉落 3 个钱袋', 1700);
}
function respawnArmored(G, h, v) {
  const F = G.freeState;
  for (const b of F.bags) if (b.m) h.scene.remove(b.m);
  F.bags = [];
  const sp = roadPoint(G, G.player?.pos, 70);
  v.pos.set(sp.x, 0, sp.z); v.yaw = sp.yaw; v.speed = 0; v.lean = 0;
  const A = v.freeArmor; A.hp = ARMOR_HP; A.down = false; A.respawnT = 0; A.dest = null;
  const door = v.mesh.userData.door; if (door) door.rotation.y = 0;
  v.driver = GUARD; resetAuto(v); poseVehicle(v, 0);
}
function updateArmored(G, dt, h) {
  const F = G.freeState, v = F.armored; if (!v) return;
  const A = v.freeArmor;
  if (A.down) { if (G.now >= A.respawnT) respawnArmored(G, h, v); return; }
  if (!A.dest || Math.hypot(A.dest.x - v.pos.x, A.dest.z - v.pos.z) < 14) {
    const sp = roadPoint(G, v.pos, 55);
    A.dest = { x: sp.x, z: sp.z };
  }
  const r = autoDrive(v, dt, G.map, G.vehicles, A.dest, { cruise: 8, arrive: 10 });
  driveVehicle(v, dt, r.thr, r.st, G.map, G.vehicles);
  poseVehicle(v, dt);
  for (const b of F.bags) if (!b.taken && G.player?.alive && Math.hypot(b.x - G.player.pos.x, b.z - G.player.pos.z) < 1.6) {
    b.taken = true; h.scene.remove(b.m); addCash(G, 800);
    h.sfx?.reload?.(); h.HUD.centerMsg('捡到钱袋 +$800', 900);
  }
}

// ---------------- robberies ----------------
function nearShop(G) {
  const W = G.wanted, p = G.player; if (!W || !p?.alive || p.air) return null;
  for (const s of [...(G.map.shops || []), ...(G.freeState?.extraShops || [])]) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < ROB_R && (W.shopCd.get(s) || 0) < G.now) return s;
  return null;
}
export function freeRobStart(G) {
  const F = G.freeState; if (!F) return;
  const p = G.player; if (!p?.alive || p.air) return;
  if (F.rob) { if (F.rob.phase === 'code') F.rob.holding = true; return; }
  const s = nearShop(G); if (!s) return;
  F.rob = { s, phase: 'hold', t: 0, need: s.jewel ? 6 : 3, jewel: !!s.jewel, resist: !s.jewel && Math.random() < 0.25, dmgT: 0, holding: true };
  if (F.rob.resist) centerMsg('店员开始反抗！', 1200);
}
export function freeRobStop(G, h) {
  const F = G.freeState; if (!F?.rob) return;
  const r = F.rob;
  if (r.phase === 'blast' || r.phase === 'jewelMenu') return;
  if (r.phase === 'code') { r.holding = false; return; }
  F.rob = null; h?.HUD?.centerMsg?.('抢劫中断', 700);
}
function finishConvenience(G, h, r) {
  const F = G.freeState, W = G.wanted, s = r.s; F.rob = null;
  W.shopCd.set(s, G.now + 90);
  const cash = 300 + ((Math.random() * 7) | 0) * 100; addCash(G, cash);
  for (const k of ['ammo', 'med', Math.random() < 0.5 ? 'armor' : 'rifle']) spawnLootDef(G, h.scene, k, s.x + (Math.random() - 0.5) * 2, s.z + 0.6 + Math.random());
  const force = !!(s.cam && !s.cam.broken);
  crime(G, h, 2, '抢劫便利店', { x: s.x, z: s.z }, force);
  h.sfx?.kill?.(); h.HUD.centerMsg('抢劫成功 +$' + cash, 1300);
}
function finishJewel(G, h, r, phase) {
  const F = G.freeState, W = G.wanted, s = r.s; F.rob = null; hideJewel();
  W.shopCd.set(s, G.now + 90);
  const cash = phase === 'blast' ? 1500 + ((Math.random() * 1001) | 0) : 3000 + ((Math.random() * 1001) | 0);
  addCash(G, cash);
  if (phase === 'blast') crime(G, h, 3, '炸保险箱', { x: s.x, z: s.z }, true);
  else crime(G, h, 2, '珠宝店得手', { x: s.x, z: s.z }, false);
  h.sfx?.kill?.(); h.HUD.centerMsg((phase === 'blast' ? '保险箱炸开 +$' : '找到密码 +$') + cash, 1600);
}
const GUN_ITEMS = [['rifle', '步枪', 600], ['sniper', '狙击枪', 900], ['ammo', '弹药', 120], ['armor', '一级甲', 250], ['helmet', '一级头', 150], ['med', '医疗包', 80]];
function showGunDlg(G, h) {
  const F = G.freeState; F.gunOpen = true;
  let d = $('gunDlg');
  if (!d) {
    d = document.createElement('div'); d.id = 'gunDlg';
    d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:rgba(14,10,30,.92);border:2px solid #ff5a3a;border-radius:14px;padding:10px 12px;color:#fff;font:600 14px system-ui,sans-serif;display:grid;grid-template-columns:repeat(3,auto);gap:8px;text-align:center';
    document.body.appendChild(d);
  }
  d.innerHTML = '<div style="grid-column:1/-1;font-weight:900;color:#ff8a6a">枪械铺 · 买的东西放在脚下</div>' +
    GUN_ITEMS.map(([k, n, c]) => `<button data-k="${k}" data-c="${c}" style="background:#2a2140;color:#fff;border:1px solid #ff8a6a;border-radius:10px;padding:8px 10px;font:700 14px system-ui">${n}<br>$${c}</button>`).join('') +
    '<button data-k="close" style="grid-column:1/-1;background:#ff3a5a;color:#fff;border:0;border-radius:10px;padding:6px;font:900 14px system-ui">离开</button>';
  d.style.display = 'grid';
  d.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const W = G.wanted, p = G.player;
    if (b.dataset.k === 'close') { hideGunDlg(G); F.gunCd = G.now + 4; return; }
    const c = +b.dataset.c;
    if ((W.cash || 0) < c) { h.HUD.centerMsg('现金不够 $' + c, 900); return; }
    W.cash -= c; refreshWantedHud(G);
    spawnLootDef(G, h.scene, b.dataset.k, p.pos.x + (Math.random() - 0.5) * 0.8, p.pos.z + 0.8);
    h.sfx?.reload?.(); h.HUD.centerMsg('买下 ' + b.textContent.replace(/\$.*/, '') + ' -$' + c, 900);
  };
}
function hideGunDlg(G) { const d = $('gunDlg'); if (d) d.style.display = 'none'; if (G?.freeState) G.freeState.gunOpen = false; }
function showJewel() { $('jewelDlg')?.classList.remove('hidden'); }
function hideJewel() { $('jewelDlg')?.classList.add('hidden'); }
function chooseJewel(G, which) {
  const F = G.freeState, r = F?.rob;
  if (!r || r.phase !== 'jewelMenu') return;
  hideJewel();
  if (which === 'blast') { r.phase = 'blast'; r.t = 0; r.need = 2; }
  else { r.phase = 'code'; r.t = 0; r.need = 8; r.holding = false; }
}
function bindUI() {
  if (UI_BOUND) return; UI_BOUND = true;
  $('jBlast')?.addEventListener('click', () => chooseJewel(window.__game, 'blast'));
  $('jCode')?.addEventListener('click', () => chooseJewel(window.__game, 'code'));
}
function updateRob(G, dt, h) {
  const F = G.freeState, p = G.player, rb = $('bRob');
  if (!F || !p?.alive) { if (rb) rb.classList.add('hidden'); return; }
  const near = nearShop(G);
  const show = !!(near || F.rob) && !h.inCar?.() && !p.air;
  if (rb) rb.classList.toggle('hidden', !show);
  const r = F.rob;
  if (!r) { if (rb) rb.style.setProperty('--p', '0%'); return; }
  const s = r.s, d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
  if (!p.alive || h.inCar?.() || p.air || (r.phase !== 'blast' && d > ROB_R + 0.9)) {
    hideJewel(); F.rob = null; if (rb) rb.style.setProperty('--p', '0%'); return;
  }
  if (r.phase === 'hold') {
    r.t += dt;
    if (r.resist) {
      r.dmgT += dt;
      if (r.dmgT >= 1) { r.dmgT -= 1; CLERK.pos.set(s.x, 0, s.z); h.damage(p, 8, CLERK, { name: '店员' }, false); }
    }
    if (rb) rb.style.setProperty('--p', Math.min(100, r.t / r.need * 100).toFixed(1) + '%');
    if (r.t >= r.need) { if (r.jewel) { r.phase = 'jewelMenu'; r.t = 0; showJewel(); } else finishConvenience(G, h, r); }
  } else if (r.phase === 'jewelMenu') {
    if (rb) rb.style.setProperty('--p', '100%');
  } else if (r.phase === 'blast' || r.phase === 'code') {
    if (r.phase === 'code' && !r.holding) { if (rb) rb.style.setProperty('--p', Math.min(100, r.t / r.need * 100).toFixed(1) + '%'); return; }
    r.t += dt;
    if (rb) rb.style.setProperty('--p', Math.min(100, r.t / r.need * 100).toFixed(1) + '%');
    if (r.t >= r.need) finishJewel(G, h, r, r.phase);
  }
}

// ---------------- mask + per-frame ----------------
export function toggleMask(G) {
  if (!G.free) return;
  G.freeMask = !G.freeMask;
  const b = $('bMask'); if (b) b.classList.toggle('on', G.freeMask);
  if (G.wanted) { G.wanted.hollow = !!G.freeMask && G.wanted.stars > 0; refreshWantedHud(G); }
  centerMsg(G.freeMask ? '戴上面具：警察认不出你的脸' : '摘下面具', 1000);
}
function updateLocations(G, dt, h) {
  const F = G.freeState, p = G.player, W = G.wanted; if (!F || !p?.alive || !W) return;
  const near = (o, r) => Math.hypot(o.x - p.pos.x, o.z - p.pos.z) < r;
  if (F.safe && near(F.safe, 2.6) && W.cash > 0) {
    const n = W.cash; W.cash = 0; W.bank = (W.bank || 0) + n; refreshWantedHud(G);
    h.sfx?.reload?.(); h.HUD.centerMsg('存入安全屋 $' + n, 1300);
  }
  if (F.clothes && near(F.clothes, 2.8) && !h.inCar?.() && W.traits.clothes && G.now > F.clothCd) {
    if (W.cash >= 100) { W.cash -= 100; W.traits.clothes = false; F.clothCd = G.now + 2; refreshWantedHud(G); h.sfx?.reload?.(); h.HUD.centerMsg('换了一身衣服 · 衣服特征清除', 1400); }
    else { F.clothCd = G.now + 2; h.HUD.centerMsg('换衣服需要 $100', 1000); }
  }
  for (const k of F.kiosks || []) {
    if (k.kind === 'food' && near(k, 2.6) && !h.inCar?.() && p.hp < 100 && G.now > F.foodCd) {
      F.foodCd = G.now + 2;
      if (W.cash >= 50) { W.cash -= 50; p.hp = 100; refreshWantedHud(G); h.sfx?.reload?.(); h.HUD.centerMsg('吃了份古巴三明治 · 回满血 -$50', 1300); }
      else h.HUD.centerMsg('快餐要 $50', 900);
    }
    if (k.kind === 'gun') {
      const n = near(k, 2.6) && !h.inCar?.();
      if (n && !F.gunOpen && G.now > F.gunCd) showGunDlg(G, h);
      else if (!n && F.gunOpen) hideGunDlg(G);
    }
  }
  if (F.spray && near(F.spray, 3.0) && h.inCar?.() && W.traits.car && G.now > F.sprayCd) {
    if (W.cash >= 200) { W.cash -= 200; W.traits.car = false; W.carRef = null; F.sprayCd = G.now + 2; refreshWantedHud(G); h.sfx?.reload?.(); h.HUD.centerMsg('重新喷漆 · 车辆特征清除', 1400); }
    else { F.sprayCd = G.now + 2; h.HUD.centerMsg('喷漆需要 $200', 1000); }
  }
}
export function freeKilled(G, t, h) {
  const W = G.wanted, p = G.player;
  if (!p || !t || t !== p) return;
  if (W) {
    W.cash = 0;
    W.stars = 0; W.decayT = 0; W.traits.face = W.traits.clothes = W.traits.car = false; W.carRef = null; W.hollow = false;
    W.hasSeen = false; W.searchPt = null; W.rob = null;
    refreshWantedHud(G);
  }
  p.respawnAt = G.now + 3; hideGunDlg(G);
  const ri = $('respawnIn'); if (ri) ri.textContent = '3 秒后在医院复活（身上现金已丢失）';
  h.HUD.centerMsg('你倒下了 · 身上现金全部丢失', 1800);
}
function respawnFree(G, h) {
  const F = G.freeState, p = G.player; if (!p) return;
  const sp = F?.hospital || { x: 0, z: 0 };
  p.pos.set(sp.x, 0, sp.z); p.vel.set(0, 0, 0); p.hp = 100; p.alive = true; p.air = null; p.onGround = true;
  p.crouch = false; p.protectUntil = G.now + 2; p.respawnAt = 0;
  $('deathScr')?.classList.add('hidden');
  hideJewel();
  if (F) F.rob = null;
  h.HUD.centerMsg('在医院醒来 · 存款还在', 1600);
}

export function updateFree(G, dt, h) {
  const F = G.freeState; if (!F) return;
  const p = G.player;
  if (!p) return;
  if (!p.alive) {
    if (G.now >= (p.respawnAt || 0)) respawnFree(G, h);
    else { const ri = $('respawnIn'); if (ri) ri.textContent = Math.max(0, p.respawnAt - G.now).toFixed(1) + ' 秒后在医院复活'; }
    return;
  }
  updatePeds(G, dt, h);
  updateRob(G, dt, h);
  updateArmored(G, dt, h);
  updateTraffic(G, dt, h);
  updateLocations(G, dt, h);
  // pedestrians run over by the player's car
  if (h.inCar?.() && Math.abs(h.inCar().speed) > 4 && G.now > (F.runT || 0)) {
    const v = h.inCar();
    for (const ped of F.peds) {
      if (!ped.alive) continue;
      if (!inFootprint(v, ped.pos.x, ped.pos.z, 0.45)) continue;
      F.runT = G.now + 1.5;
      killPed(G, h, ped, '撞死路人');
      ped.pos.x += -Math.sin(v.yaw) * 1.5; ped.pos.z += -Math.cos(v.yaw) * 1.5;
      break;
    }
  }
  // marker pulse
  F.hudT = (F.hudT || 0) - dt;
  if (F.hudT <= 0) {
    F.hudT = 0.12;
    const k = 1 + 0.06 * Math.sin(G.now * 2.6);
    for (const l of F.locs) l.ring.scale.setScalar(k);
    for (const c of F.cams) if (!c.broken) c.lens.material.color.setHex(((G.now * 2) | 0) % 2 ? 0xff3040 : 0x801020);
  }
}

// ---------------- minimap ----------------
export function freeMinimap(G, ctx, mx, mz, sx, sz) {
  const F = G.freeState; if (!F) return;
  ctx.save();
  const dot = (x, z, col, r = 3.2) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx(x), mz(z), r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); };
  for (const l of F.locs) {
    if (l.kind === 'safe') dot(l.x, l.z, '#4cd17a', 4);
    else if (l.kind === 'hospital') { dot(l.x, l.z, '#ff5a5a', 4); ctx.fillStyle = '#fff'; ctx.fillRect(mx(l.x) - 1, mz(l.z) - 2.4, 2, 4.8); ctx.fillRect(mx(l.x) - 2.4, mz(l.z) - 1, 4.8, 2); }
    else if (l.kind === 'clothes') dot(l.x, l.z, '#ff8fb4', 3.6);
    else if (l.kind === 'spray') dot(l.x, l.z, '#b46bff', 3.6);
    else if (l.kind === 'jewel') dot(l.x, l.z, '#ffd24a', 3.6);
    else if (l.kind === 'gun') dot(l.x, l.z, '#ff5a3a', 3.6);
    else if (l.kind === 'food') dot(l.x, l.z, '#7dff4a', 3.4);
    else if (l.kind === 'gas') dot(l.x, l.z, '#28e8ff', 3.6);
  }
  const v = F.armored;
  if (v && !v.freeArmor?.down) {
    const x = mx(v.pos.x), y = mz(v.pos.z);
    ctx.fillStyle = '#dfe8f2'; ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.strokeStyle = '#2a5bd7'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y - 3, 6, 6);
  }
  for (const ped of F.peds) if (ped.alive) dot(ped.pos.x, ped.pos.z, '#ffffff', 1.3);
  ctx.fillStyle = '#9aa0a8';
  for (const c of F.traffic || []) if (c.civ && !c.dead) ctx.fillRect(mx(c.pos.x) - 2, mz(c.pos.z) - 2, 4, 4);
  if (G.wanted?.stars > 0 && G.wanted.hasSeen) dot(G.wanted.lastSeen.x, G.wanted.lastSeen.y, '#ff2bd6', 2);
  ctx.restore();
}
