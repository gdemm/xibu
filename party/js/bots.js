// bot models + AI (patrol / engage / take cover)
import * as THREE from 'three';
import { moveEntity } from './map.js';
import { shootArrow, arrowSpeed, ARROW_G } from './bow.js';
import { createSoldier, animateSoldier, soldierFired, setSoldierLOD } from './critter.js';

export const DIFF = {
  easy:   { react: 0.9,  spread: 0.07,  head: 0.05, dmg: 0.5,  turn: 3.5, burst: [2, 4], pause: [0.7, 1.3], speed: 4.2 },
  normal: { react: 0.5,  spread: 0.04,  head: 0.15, dmg: 0.7,  turn: 6,   burst: [3, 5], pause: [0.45, 0.9], speed: 4.8 },
  hard:   { react: 0.25, spread: 0.022, head: 0.3,  dmg: 0.9,  turn: 10,  burst: [4, 7], pause: [0.3, 0.6], speed: 5.3 },
};

export function createBotMesh(team) { return createSoldier(team); }

const rnd = (a, b) => a + Math.random() * (b - a);
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();

export function eyeOf(e, out = new THREE.Vector3()) { return out.set(e.pos.x, e.pos.y + (e.crouch ? 1.05 : 1.6), e.pos.z); }

function pickPatrolGoal(bot, G) {
  if (G.br) return G.brGoal(bot, G);
  const nodes = G.map.nodes;
  // bias toward the enemy half / middle of ship
  const dir = bot.team === 'blue' ? 1 : -1;
  for (let i = 0; i < 20; i++) {
    const n = nodes[(Math.random() * nodes.length) | 0];
    const x = n.p.x * dir;
    if (x > -30 + Math.random() * 30) return n.p;
  }
  return nodes[(Math.random() * nodes.length) | 0].p;
}

function setPath(bot, G, goal) {
  bot.path = G.map.findPath(bot.pos, goal); bot.pathI = 0; bot.stuckT = 0; bot.lastProgPos.copy(bot.pos);
}

function findTarget(bot, G) {
  let best = null, bd = 1e9; const eye = eyeOf(bot, _e);
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  for (const o of G.entities) {
    if (!o.alive || o.team === bot.team || o.air) continue;
    if (G.peace && o.isPlayer) continue;   // 设置 > 机器人攻击我: 关 (testing)
    _t.set(o.pos.x, o.pos.y + 1.3, o.pos.z);
    const dx = _t.x - eye.x, dz = _t.z - eye.z, d = Math.hypot(dx, dz);
    if (d > 75) continue;
    const facing = (dx * fx + dz * fz) / (d || 1);
    const heard = G.now - (o.lastFired || -9) < 0.6 && d < 40;
    const hurtBy = bot.lastAttacker === o && G.now - bot.lastHurt < 2;
    if (facing < 0.45 && !heard && !hurtBy && d > 4) continue;
    if (!G.map.hasLOS(eye, _t)) continue;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function updateBot(bot, dt, G) {
  const D = DIFF[G.diff];
  const ud = bot.mesh.userData;
  if (ud.muzzle.visible && G.now - bot.lastFired > 0.05) ud.muzzle.visible = false;
  if (!bot.alive || bot.air) return;
  bot.thinkT -= dt;
  if (bot.thinkT <= 0) {
    bot.thinkT = 0.2 + Math.random() * 0.1;
    const t = findTarget(bot, G);
    if (G.peace && bot.target && bot.target.isPlayer) { bot.target = null; bot.aiState = 'patrol'; setPath(bot, G, pickPatrolGoal(bot, G)); }
    if (t) {
      if (bot.target !== t) { bot.target = t; bot.reactT = D.react * rnd(0.8, 1.3); }
      bot.lastSeen.copy(t.pos); bot.lostT = 0;
      if (bot.aiState !== 'cover' || G.now > bot.coverUntil) bot.aiState = 'engage';
    } else if (bot.target) {
      bot.lostT += 0.25;
      if (bot.lostT > 1.5 || !bot.target.alive) { bot.target = null; bot.aiState = 'patrol'; setPath(bot, G, bot.lastSeen.clone()); }
    }
    // low HP: go to cover not visible from attacker
    if (bot.hp < 40 && bot.aiState !== 'cover' && G.now > bot.nextCoverOK && bot.target) {
      const threat = eyeOf(bot.target, new THREE.Vector3());
      let best = null, bd = 1e9;
      for (const ci of G.map.covers) {
        const p = G.map.nodes[ci].p; const d = p.distanceTo(bot.pos);
        if (d > 18 || d < 2) continue;
        if (G.map.hasLOS(threat, _d.set(p.x, 1.2, p.z))) continue;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { bot.aiState = 'cover'; bot.coverUntil = G.now + rnd(2.5, 4); bot.nextCoverOK = G.now + 8; setPath(bot, G, best.clone()); }
    }
    // battle royale: get back inside the safe zone unless the fight is point-blank
    if (G.br) {
      const B = G.br, out = Math.hypot(bot.pos.x - B.c.x, bot.pos.z - B.c.y) > B.r - 1.5;
      const close = bot.target && bot.target.pos.distanceTo(bot.pos) < 10;
      if (out && !close) { if (!bot.zoneRun) { bot.zoneRun = true; bot.target = null; bot.aiState = 'patrol'; setPath(bot, G, pickPatrolGoal(bot, G)); } }
      else if (!out) bot.zoneRun = false;
    }
    if (bot.aiState === 'cover' && G.now > bot.coverUntil) { bot.aiState = bot.target ? 'engage' : 'patrol'; if (!bot.target) setPath(bot, G, pickPatrolGoal(bot, G)); }
  }

  let moveX = 0, moveZ = 0, speed = D.speed;
  const engaging = bot.aiState === 'engage' && bot.target && bot.target.alive;
  // follow path (patrol / cover / chase)
  if (!engaging) {
    if (!bot.path || bot.pathI >= bot.path.length) {
      if (bot.aiState === 'cover') { /* hold */ }
      else setPath(bot, G, pickPatrolGoal(bot, G));
    }
    if (bot.path && bot.pathI < bot.path.length) {
      const wp = bot.path[bot.pathI];
      const dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.8) bot.pathI++;
      else { moveX = dx / d; moveZ = dz / d; const want = Math.atan2(-dx, -dz); bot.yaw = turnTo(bot.yaw, want, D.turn * 1.5 * dt); }
    }
    bot.crouch = false;
  } else {
    const t = bot.target; const eye = eyeOf(bot, _e);
    const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z, d = Math.hypot(dx, dz) || 0.001;
    const want = Math.atan2(-dx, -dz);
    bot.yaw = turnTo(bot.yaw, want, D.turn * dt);
    // strafe a little, close distance if far
    bot.strafeT -= dt; if (bot.strafeT <= 0) { bot.strafeT = rnd(0.6, 1.6); bot.strafeDir = Math.random() < 0.5 ? -1 : 1; bot.crouchFire = Math.random() < 0.25; }
    const sx = -dz / d, sz = dx / d;
    moveX = sx * bot.strafeDir * 0.6; moveZ = sz * bot.strafeDir * 0.6;
    if (d > 28) { moveX += dx / d; moveZ += dz / d; }
    speed *= 0.55; bot.crouch = bot.crouchFire;
    bot.reactT -= dt;
    const aimErr = Math.abs(angDiff(bot.yaw, want));
    if (bot.mag == null) bot.mag = 30;
    if (bot.reloadUntil && G.now >= bot.reloadUntil) { bot.reloadUntil = 0; bot.mag = 30; }
    const gunNow = G.br ? (bot.armed ? bot.gun : 'knife') : (bot.gun || 'rifle');
    if (gunNow === 'knife') {   // unarmed in BR: rush in and stab
      moveX = dx / d; moveZ = dz / d; speed /= 0.55; bot.crouch = false;
      if (bot.reactT <= 0 && aimErr < 0.5 && d < 1.9 && G.now >= bot.nextShot) {
        const dir = _d.set(dx, (t.pos.y + 1.0) - eye.y, dz).normalize();
        G.fire(bot, eye.clone(), dir.clone(), 'knife', D.dmg);
        soldierFired(bot.mesh); bot.nextShot = G.now + rnd(0.6, 0.9);
      }
    } else if (gunNow === 'bow') {   // archer: draw 0.8 s, then loose with lead + drop compensation
      if (bot.reactT <= 0 && aimErr < 0.3 && G.now >= bot.nextShot) {
        if (!bot.drawT) bot.drawT = G.now;
        else if (G.now - bot.drawT >= 0.8) {
          const aimY = Math.random() < D.head ? (t.crouch ? 1.14 : 1.32) : (t.crouch ? 0.40 : 0.52);
          _t.set(t.pos.x, t.pos.y + aimY, t.pos.z);
          const v = arrowSpeed(1); let tt = _t.distanceTo(eye) / v;
          if (t.hv) { _t.addScaledVector(t.hv, tt); tt = _t.distanceTo(eye) / v; }
          _t.y += 0.5 * ARROW_G * tt * tt;
          const dir = _d.subVectors(_t, eye).normalize(); const s = D.spread * 0.6;
          dir.x += rnd(-s, s); dir.y += rnd(-s, s) * 0.5; dir.z += rnd(-s, s); dir.normalize();
          G.shootArrow(bot, eye.clone().addScaledVector(dir, 0.5), dir.clone(), 1, D.dmg);
          bot.shotsFired++; soldierFired(bot.mesh); bot.drawT = 0; bot.nextShot = G.now + rnd(0.5, 1.0);
        }
      }
    } else if (!bot.reloadUntil && bot.reactT <= 0 && aimErr < 0.25 && G.now >= bot.nextShot) {
      // fire one round
      const aimY = Math.random() < D.head ? (t.crouch ? 1.14 : 1.32) : (t.crouch ? 0.40 : 0.52);   // head / body centres of the hitboxes
      _t.set(t.pos.x, t.pos.y + aimY, t.pos.z);
      const dir = _d.subVectors(_t, eye).normalize();
      const s = D.spread * (1 + (t.isPlayer && t.moving ? 0.5 : 0));
      dir.x += rnd(-s, s); dir.y += rnd(-s, s) * 0.7; dir.z += rnd(-s, s); dir.normalize();
      const gun = G.br ? (bot.armed ? bot.gun : 'knife') : 'rifle';
      G.fire(bot, eye.clone(), dir.clone(), gun, D.dmg);
      bot.shotsFired++; bot.lastFired = G.now; ud.muzzle.visible = true; ud.muzzle.rotation.z = Math.random() * 3; soldierFired(bot.mesh);
      if (--bot.mag <= 0) { bot.reloadUntil = G.now + 2.2; bot.burstLeft = 0; }
      bot.burstLeft--;
      if (bot.burstLeft <= 0) { bot.burstLeft = (rnd(D.burst[0], D.burst[1]) | 0); bot.nextShot = G.now + rnd(D.pause[0], D.pause[1]); }
      else bot.nextShot = G.now + 0.11;
      if (gun === 'pistol') { bot.burstLeft = 1; bot.nextShot = G.now + rnd(0.35, 0.7); } else if (gun === 'sniper') { bot.burstLeft = 1; bot.nextShot = G.now + rnd(1.3, 2); }
    }
  }
  // separation from friends
  for (const o of G.entities) { if (o === bot || !o.alive) continue; const dx = bot.pos.x - o.pos.x, dz = bot.pos.z - o.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.8 && d2 > 0.0001) { const d = Math.sqrt(d2); moveX += dx / d * 0.6; moveZ += dz / d * 0.6; } }
  const ml = Math.hypot(moveX, moveZ); if (ml > 1) { moveX /= ml; moveZ /= ml; }
  if (bot.crouch) speed *= 0.6;
  const blocked = moveEntity(bot, moveX * speed * dt, moveZ * speed * dt, dt, G.solidsNear ? G.solidsNear(bot.pos) : G.map.solids);
  // stuck detection
  bot.stuckT += dt;
  if (bot.stuckT > 1.5) {
    if (!engaging && bot.pos.distanceTo(bot.lastProgPos) < 0.6) { setPath(bot, G, pickPatrolGoal(bot, G)); if (blocked && bot.onGround) bot.vel.y = 5.5; }
    bot.stuckT = 0; bot.lastProgPos.copy(bot.pos);
  }
  // animate
  const moving = ml > 0.1;
  bot.mesh.position.copy(bot.pos);
  bot.mesh.rotation.set(0, bot.yaw, 0);
  let pitch = 0;
  if (engaging) { const t = bot.target; pitch = Math.atan2(t.pos.y + (t.crouch ? 0.95 : 1.2) - (bot.pos.y + (bot.crouch ? 1.1 : 1.45)), Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z)); }
  if (!engaging) bot.drawT = 0;
  const bowNow = (G.br ? (bot.armed ? bot.gun : 'knife') : (bot.gun || 'rifle')) === 'bow';
  const reload = bot.reloadUntil ? 1 - Math.max(0, bot.reloadUntil - G.now) / 2.2 : -1;
  const lo = G.quality === 'low' || (G.player && bot.pos.distanceTo(G.player.pos) > 24);
  setSoldierLOD(bot.mesh, lo);
  animateSoldier(bot.mesh, dt, { moveX: moving ? moveX : 0, moveZ: moving ? moveZ : 0, speed, yaw: bot.yaw, crouch: bot.crouch, aim: engaging && reload < 0, pitch, reload, ground: bot.onGround, vy: bot.vel.y, bow: bowNow, draw: bot.drawT ? Math.min(1, (G.now - bot.drawT) / 0.8) : 0 });
}

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function turnTo(a, b, max) { const d = angDiff(a, b); return a + Math.max(-max, Math.min(max, d)); }
