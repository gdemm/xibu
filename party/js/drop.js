// 派对突击 - plane flyover + parachute landing, and airdrop supply crates.
import * as THREE from 'three';
import { Builder, M } from './soldier.js';
import { critterMaterial } from './critter.js';

const ALT = 75, PLANE_SPEED = 26, FALL_V = 22, CHUTE_V = 5.5, FALL_H = 22, CHUTE_H = 14, AUTO_OPEN = 30;
const rnd = (a, b) => a + Math.random() * (b - a);
const HALF = 132;

// ---------------- meshes ----------------
let PLANE_GEO = null, PROP_GEO = null, CHUTE_GEO = null, CRATE_GEO = null, LID_GEO = null;
function planeGeo() {
  if (PLANE_GEO) return PLANE_GEO;
  const B = new Builder();
  B.add(new THREE.CapsuleGeometry(1.5, 8, 6, 14), M(0, 0, 0, Math.PI / 2), 0xfff3d6);            // fuselage
  B.add(new THREE.SphereGeometry(1.3, 12, 8), M(0, 0.25, -4.6, 0, 0, 0, 1, 0.9, 0.9), 0x6fd3ff);    // cockpit glass
  B.add(new THREE.BoxGeometry(17, 0.35, 2.8), M(0, -0.2, -0.6), 0xff4d6d);                       // wing
  for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.6, 0.5, 2.4, 10), M(s * 4.2, -0.5, -1.4, Math.PI / 2), 0x3a86ff); // engines
  B.add(new THREE.BoxGeometry(6, 0.25, 1.6), M(0, 0.4, 5.2), 0xff4d6d);                          // tail plane
  B.add(new THREE.BoxGeometry(0.3, 2.6, 1.8), M(0, 1.7, 5.1, -0.25), 0x3a86ff);                  // fin
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) B.add(new THREE.SphereGeometry(0.28, 8, 6), M(s * 1.42, 0.35, i * 1.4, 0, 0, 0, 0.4, 1, 1), 0x2b3a67); // windows
  B.add(new THREE.BoxGeometry(3.06, 0.35, 9), M(0, -0.35, 0.3), 0xffbe0b);                        // stripe
  return (PLANE_GEO = B.build(false));
}
function propGeo() {
  if (PROP_GEO) return PROP_GEO;
  const B = new Builder();
  B.add(new THREE.BoxGeometry(3, 0.25, 0.08), M(0, 0, 0), 0x2b2b38); B.add(new THREE.BoxGeometry(0.25, 3, 0.08), M(0, 0, 0), 0x2b2b38);
  B.add(new THREE.SphereGeometry(0.3, 8, 6), M(0, 0, -0.1), 0xffbe0b);
  return (PROP_GEO = B.build(false));
}
function chuteGeo() {
  if (CHUTE_GEO) return CHUTE_GEO;
  const B = new Builder(), cols = [0xff4d6d, 0xfff3d6, 0x3a86ff, 0xfff3d6, 0xffbe0b, 0xfff3d6, 0x06d6a0, 0xfff3d6];
  for (let i = 0; i < 8; i++) B.add(new THREE.SphereGeometry(1.7, 3, 6, i / 8 * Math.PI * 2, Math.PI * 2 / 8, 0, Math.PI / 2.3), M(0, 0, 0, 0, 0, 0, 1, 0.6, 1), cols[i]);
  return (CHUTE_GEO = B.build(false));
}
const lineMat = new THREE.LineBasicMaterial({ color: 0x555566 });
function makeChute(scale = 1) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(chuteGeo(), critterMaterial()); dome.position.y = 2.4; g.add(dome);
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pts.push(Math.cos(a) * 1.6, 2.5, Math.sin(a) * 1.6, 0, 1.1, 0); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, lineMat)); g.scale.setScalar(scale); g.visible = false;
  return g;
}
function crateGeo() {
  if (CRATE_GEO) return CRATE_GEO;
  const B = new Builder();
  B.add(new THREE.BoxGeometry(1.3, 1.0, 1.3), M(0, 0.5, 0), 0xff4d6d);
  for (const s of [-1, 1]) { B.add(new THREE.BoxGeometry(1.34, 1.04, 0.22), M(0, 0.5, s * 0.35), 0xfff3d6); B.add(new THREE.BoxGeometry(0.22, 1.04, 1.34), M(s * 0.35, 0.5, 0), 0xfff3d6); }
  B.add(new THREE.BoxGeometry(0.5, 0.06, 0.5), M(0, 1.03, 0), 0xffbe0b);
  return (CRATE_GEO = B.build(false));
}
function lidGeo() { if (LID_GEO) return LID_GEO; const B = new Builder(); B.add(new THREE.BoxGeometry(1.4, 0.16, 1.4), M(0, 0, 0), 0xffbe0b); return (LID_GEO = B.build(false)); }
const smokeGeo = new THREE.IcosahedronGeometry(0.6, 1);

// ---------------- ground probe ----------------
// top of the highest solid under (x,z) that is not above y; narrow tall things (trees, walls, poles) are skipped
// and reported so the faller can be nudged off them.
function groundAt(G, x, z, y, r = 0.38) {
  let top = G.map.walkY || 0, nudge = null;
  for (const b of G.map.near ? G.map.near({ x, z }) : G.map.solids) {
    if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
    if (b.max.y > y + 0.05) { if (b.min.y < y) nudge = b; continue; }
    const narrow = (b.max.x - b.min.x) < 2.5 || (b.max.z - b.min.z) < 2.5;
    if (narrow && b.max.y > 1.6) { nudge = b; continue; }
    if (b.max.y > top) top = b.max.y;
  }
  return { top, nudge };
}
function pushOut(e, b) {
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const dx = e.pos.x < cx ? b.min.x - 0.45 - e.pos.x : b.max.x + 0.45 - e.pos.x;
  const dz = e.pos.z < cz ? b.min.z - 0.45 - e.pos.z : b.max.z + 0.45 - e.pos.z;
  if (Math.abs(dx) < Math.abs(dz)) e.pos.x += dx; else e.pos.z += dz;
}

// ---------------- plane & parachute ----------------
export function setupDrop(G, scene) {
  const ang = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const side = new THREE.Vector3(-dir.z, 0, dir.x), off = rnd(-45, 45);
  const a = dir.clone().multiplyScalar(-195).addScaledVector(side, off).setY(ALT), b = dir.clone().multiplyScalar(195).addScaledVector(side, off).setY(ALT);
  const mesh = new THREE.Group(); mesh.add(new THREE.Mesh(planeGeo(), critterMaterial()));
  const props = [];
  for (const s of [-1, 1]) { const p = new THREE.Mesh(propGeo(), critterMaterial()); p.position.set(s * 4.2, -0.5, -2.75); mesh.add(p); props.push(p); }
  mesh.scale.setScalar(1.3); scene.add(mesh);
  const len = a.distanceTo(b);
  G.drop = { a, b, dir, len, k: 0, pos: a.clone(), mesh, props, yaw: Math.atan2(-dir.x, -dir.z), duration: len / PLANE_SPEED, over: false, chutes: [] };
  mesh.position.copy(a); mesh.rotation.set(0, G.drop.yaw, 0);
  // fraction of the line that lies over the island
  const inside = (k) => { const p = a.clone().lerp(b, k); return Math.abs(p.x) < HALF - 10 && Math.abs(p.z) < HALF - 10; };
  // the jump window ends where the route leaves the island: everyone still aboard is ejected there
  let kEnd = 0.95; for (let t = 0.95; t > 0.5; t -= 0.01) if (inside(t)) { kEnd = t; break; }
  let kStart = 0.05; for (let t = 0.05; t < 0.5; t += 0.01) if (inside(t)) { kStart = t; break; }
  G.drop.kEnd = kEnd; G.drop.kStart = kStart;
  for (const e of G.entities) {
    e.air = 'plane'; e.pos.copy(a); e.vel.set(0, 0, 0); e.protectUntil = 1e9; e.onGround = false;
    if (!e.isPlayer) {
      const k = rnd(kStart, kEnd - 0.02);
      e.jumpK = k; e.mesh.visible = false;
    }
  }
}

function jump(G, e, scene) {
  e.air = 'fall'; e.pos.copy(G.drop.pos); e.pos.y -= 2.5; e.vel.set(0, 0, 0);
  if (!e.isPlayer) {
    e.mesh.visible = true;
    // aim for a reachable ground node near the jump point
    const nodes = G.map.nodes; let tgt = null;
    for (let i = 0; i < 40; i++) { const n = nodes[(Math.random() * nodes.length) | 0]; if (!n.n.length) continue; if (Math.hypot(n.p.x - e.pos.x, n.p.z - e.pos.z) < 85) { tgt = n.p; break; } }
    e.landTarget = (tgt || new THREE.Vector3(e.pos.x, 0, e.pos.z)).clone(); e.landTarget.x += rnd(-1.5, 1.5); e.landTarget.z += rnd(-1.5, 1.5);
    e.openAt = rnd(AUTO_OPEN, AUTO_OPEN + 25);
  }
  if (!e.chute) { e.chute = makeChute(); scene.add(e.chute); G.drop.chutes.push(e.chute); }
}
export function playerJump(G, scene) { const p = G.player; if (p.air === 'plane') { jump(G, p, scene); return 'jump'; } if (p.air === 'fall') { openChute(p); return 'open'; } return null; }
function openChute(e) { if (e.air !== 'fall') return; e.air = 'chute'; e.chute.visible = true; e.chute.scale.setScalar(0.2); }

// one step of free-fall / parachute physics; mx,mz = wanted horizontal direction (length 0..1)
export function airStep(G, e, dt, mx, mz) {
  if (e.air === 'plane' || !e.air) return;
  const fall = e.air === 'fall', hs = fall ? FALL_H : CHUTE_H, vs = fall ? FALL_V : CHUTE_V;
  e.vel.x += (mx * hs - e.vel.x) * Math.min(1, dt * 2); e.vel.z += (mz * hs - e.vel.z) * Math.min(1, dt * 2);
  e.vel.y += (-vs - e.vel.y) * Math.min(1, dt * (fall ? 1.5 : 3));
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y += e.vel.y * dt;
  e.pos.x = Math.max(-HALF, Math.min(HALF, e.pos.x)); e.pos.z = Math.max(-HALF, Math.min(HALF, e.pos.z));
  const gr = groundAt(G, e.pos.x, e.pos.z, e.pos.y + 0.5);
  if (gr.nudge && e.pos.y < gr.nudge.max.y + 0.5) pushOut(e, gr.nudge);
  if (fall && e.pos.y - gr.top < (e.isPlayer ? AUTO_OPEN : e.openAt)) openChute(e);
  if (e.chute) {
    e.chute.position.set(e.pos.x, e.pos.y, e.pos.z); e.chute.rotation.set(-e.vel.z * 0.02, 0, e.vel.x * 0.02);
    if (e.chute.visible && e.chute.scale.x < 1) e.chute.scale.setScalar(Math.min(1, e.chute.scale.x + dt * 3));
  }
  if (e.pos.y <= gr.top) { // landed
    e.pos.y = gr.top; e.vel.set(0, 0, 0); e.air = null; e.onGround = true; e.protectUntil = G.now + 1;
    if (e.chute) e.chute.visible = false;
    return 'landed';
  }
}

export function updateDrop(G, dt, scene, h) {
  const D = G.drop; if (!D) return;
  if (!D.over) {
    D.k += dt * PLANE_SPEED / D.len;
    D.pos.lerpVectors(D.a, D.b, Math.min(D.k, 1.15));
    if (D.k >= D.kEnd) {
      D.over = true;
      for (const e of G.entities) if (e.air === 'plane') { jump(G, e, scene); if (e.isPlayer) h.HUD.centerMsg('航线结束，自动跳伞！', 1600); }
    }
  } else if (D.k < 1.6) { D.k += dt * PLANE_SPEED / D.len; D.pos.lerpVectors(D.a, D.b, D.k); }
  D.mesh.position.copy(D.pos); D.mesh.visible = D.k < 1.55;
  for (const p of D.props) p.rotation.z += dt * 30;
  for (const e of G.entities) {
    if (e.air === 'plane') { e.pos.copy(D.pos); if (!e.isPlayer && D.k >= e.jumpK) jump(G, e, scene); continue; }
    if (e.isPlayer || !e.air) continue;
    let dx = e.landTarget.x - e.pos.x, dz = e.landTarget.z - e.pos.z; const d = Math.hypot(dx, dz);
    if (d > 0.5) { dx /= d; dz /= d; } else dx = dz = 0;
    const k = Math.min(1, d / 6);
    const res = airStep(G, e, dt, dx * k, dz * k);
    if (d > 0.5) e.yaw = Math.atan2(-dx, -dz);
    e.mesh.position.copy(e.pos); e.mesh.rotation.set(0, e.yaw, 0);
    h.animate(e.mesh, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: e.yaw, crouch: false, aim: false, pitch: 0, reload: -1, air: e.air });
    if (res === 'landed') { e.path = null; e.lastSeen.copy(e.pos); e.lastProgPos.copy(e.pos); }
  }
}
export function airborne(G) { return G.entities.some(e => e.air); }

export function dropMinimap(G, ctx, mx, mz) {
  const D = G.drop; if (!D || D.k > 1.05) return;
  ctx.strokeStyle = 'rgba(255,230,120,.9)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx(D.a.x), mz(D.a.z)); ctx.lineTo(mx(D.b.x), mz(D.b.z)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ffd45c'; ctx.beginPath(); ctx.arc(mx(D.pos.x), mz(D.pos.z), 4, 0, 7); ctx.fill();
}

// ---------------- airdrops ----------------
export function setupAirdrops(G, startDelay) {
  G.airdrops = []; G.airdropPlan = [startDelay + 40, startDelay + 100, startDelay + 165].map(t => G.now + t);
}
function spawnAirdrop(G, scene, h) {
  const B = G.br, z = B.next || { c: B.c, r: B.r };
  const nodes = G.map.nodes; let spot = null;
  for (let i = 0; i < 200; i++) {
    const n = nodes[(Math.random() * nodes.length) | 0]; if (!n.n.length || n.inside) continue;
    if (Math.hypot(n.p.x - z.c.x, n.p.z - z.c.y) > Math.max(4, z.r * 0.75)) continue;
    if (groundAt(G, n.p.x, n.p.z, 200, 1.0).top > 0.1) continue;
    spot = n.p; break;
  }
  if (!spot) return;
  const g = new THREE.Group();
  const crate = new THREE.Mesh(crateGeo(), critterMaterial()); g.add(crate);
  const lid = new THREE.Mesh(lidGeo(), critterMaterial()); lid.position.y = 1.08; g.add(lid);
  const chute = makeChute(1.6); chute.visible = true; chute.position.y = 0.4; g.add(chute);
  scene.add(g);
  const smoke = new THREE.Group(); smoke.visible = false; scene.add(smoke);
  const smat = new THREE.MeshBasicMaterial({ color: 0xff5ca8, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(smokeGeo, smat); s.userData.t = i / 12; s.userData.ox = rnd(-0.4, 0.4); s.userData.oz = rnd(-0.4, 0.4); smoke.add(s); }
  const d = { pos: new THREE.Vector3(spot.x, 70, spot.z), g, crate, lid, chute, smoke, smat, landed: false, opened: false, t: 0, id: G.airdrops.length + 1 };
  g.position.copy(d.pos); G.airdrops.push(d);
  h.HUD.centerMsg('📦 空投补给正在降落！看小地图', 2600);
  h.sfx.reload?.();
  return d;
}
export function updateAirdrops(G, dt, scene, h) {
  if (!G.airdropPlan) return;
  while (G.airdropPlan.length && G.now >= G.airdropPlan[0]) { G.airdropPlan.shift(); spawnAirdrop(G, scene, h); }
  for (const d of G.airdrops) {
    d.t += dt;
    if (!d.landed) {
      d.pos.y -= 6 * dt; d.g.rotation.y += dt * 0.5; d.chute.rotation.z = Math.sin(d.t * 1.5) * 0.08;
      if (d.pos.y <= 0) { d.pos.y = 0; d.landed = true; d.landT = d.t; d.smoke.visible = true; }
      d.g.position.copy(d.pos);
    } else if (d.chute.visible) { // canopy deflates
      const k = Math.min(1, (d.t - d.landT) / 1.2); d.chute.scale.set(1.6 * (1 + k * 0.4), 1.6 * (1 - k), 1.6 * (1 + k * 0.4)); d.chute.position.set(k * 2, 0.4 - k * 0.3, 0); if (k >= 1) d.chute.visible = false;
    }
    if (d.smoke.visible) {
      const fade = d.opened ? Math.max(0, 1 - (d.t - d.openT) / 6) : 1;
      d.smat.opacity = 0.55 * fade; if (fade <= 0) d.smoke.visible = false;
      for (const s of d.smoke.children) { const u = s.userData; u.t = (u.t + dt * 0.12) % 1; s.position.set(d.pos.x + u.ox + Math.sin(u.t * 9 + u.ox * 7) * u.t * 1.5, 0.8 + u.t * 16, d.pos.z + u.oz + u.t * 2); s.scale.setScalar(0.6 + u.t * 3); }
    }
    if (d.landed && !d.opened) for (const e of G.entities) {
      if (!e.alive || e.air) continue;
      if (Math.hypot(e.pos.x - d.pos.x, e.pos.z - d.pos.z) > 1.9 || e.pos.y > 1.6) continue;
      openAirdrop(G, d, e, h); break;
    }
  }
}
function openAirdrop(G, d, e, h) {
  d.opened = true; d.openT = d.t; d.lid.position.set(0.9, 0.2, 0.3); d.lid.rotation.set(0.3, 0.5, 1.2);
  e.armor = 3; e.helmet = 3;
  // extra rolls: high-tier scope (8x 50% / 4x 30%) and the bow with a full quiver (40%); G.forceDrop overrides (tests)
  const f = G.forceDrop || {}, r = Math.random();
  const scope = f.scope ?? (r < 0.5 ? 8 : r < 0.8 ? 4 : 0), bow = f.bow ?? Math.random() < 0.4;
  if (!e.isPlayer) { e.armed = true; e.gun = bow && Math.random() < 0.5 ? 'bow' : 'sniper'; e.hp = Math.min(100, e.hp + 50); return; }
  const extra = [];
  if (scope > (G.scope | 0)) { G.scope = scope; extra.push(scope + '倍镜'); }
  if (bow) { G.owned.add('bow'); G.ammo.bow.reserve += 20; if (!G.ammo.bow.mag) G.ammo.bow.mag = 1; extra.push('弓箭+20支箭'); }
  const W = h.WEAPONS, first = !G.owned.has('sniper'); G.owned.add('sniper');
  G.ammo.sniper.reserve += W.sniper.reserve; if (first) G.ammo.sniper.mag = W.sniper.mag;
  if (G.owned.has('rifle')) G.ammo.rifle.reserve += W.rifle.mag * 3;
  e.hp = Math.min(100, e.hp + 50); h.setWeapon('sniper');
  h.HUD.centerMsg('空投到手！狙击枪 · 三级甲 · 三级头 · 医疗包' + extra.map(x => ' · ' + x).join(''), 2600); h.sfx.kill?.();
}
export function airdropGoal(bot, G) {
  if (!G.airdrops) return null;
  let best = null, bd = 70;
  for (const d of G.airdrops) { if (!d.landed || d.opened) continue; const dd = Math.hypot(d.pos.x - bot.pos.x, d.pos.z - bot.pos.z); if (dd < bd) { bd = dd; best = d; } }
  return best ? new THREE.Vector3(best.pos.x + 1.2, 0, best.pos.z) : null;
}
export function airdropMinimap(G, ctx, mx, mz) {
  for (const d of G.airdrops || []) {
    if (d.opened) continue;
    const x = mx(d.pos.x), y = mz(d.pos.z), pulse = 1 + 0.3 * Math.sin(G.now * 6);
    ctx.fillStyle = '#ff4d6d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.fillRect(x - 4 * pulse, y - 4 * pulse, 8 * pulse, 8 * pulse); ctx.strokeRect(x - 4 * pulse, y - 4 * pulse, 8 * pulse, 8 * pulse);
  }
}
export function cleanupDrop(G, scene) {
  if (G.drop) { scene.remove(G.drop.mesh); for (const c of G.drop.chutes) scene.remove(c); }
  for (const d of G.airdrops || []) { scene.remove(d.g); scene.remove(d.smoke); d.smat.dispose(); }
  for (const e of G.entities || []) { e.air = null; e.chute = null; }
  G.drop = null; G.airdrops = []; G.airdropPlan = null;
}
