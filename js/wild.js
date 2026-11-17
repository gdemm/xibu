// 镇外野生动物：鹿、狐狸（可狩猎）、狼（会攻击）。模型：Quaternius Animated Animal Pack（CC0）
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';
import { fit } from './assets.js';
import { floorAt, TOWN } from './scene.js';

const KINDS = {
  deer: { file: 'deer', h: 1.45, walk: 1.3, run: 9, hp: 30, r: .55, pelt: '鹿皮', price: 15, scare: 20, n: 6 },
  fox: { file: 'fox', h: .5, walk: 1.1, run: 7, hp: 20, r: .3, pelt: '狐皮', price: 10, scare: 14, n: 4 },
  wolf: { file: 'wolf', h: .85, walk: 1.4, run: 7.5, hp: 60, r: .45, pelt: '狼皮', price: 20, scare: 0, n: 3, hostile: true },
};
export const PELTS = Object.fromEntries(Object.values(KINDS).map(k => [k.pelt, k.price]));

const raySphere = (o, d, c, r) => {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t > 0 ? t : Infinity;
};

export function createWild(scene, { onBite } = {}) {
  const G = {}, animals = [];
  const R = (a, b) => a + Math.random() * (b - a);
  let t = 0, ready = false;
  const respawnQ = [];

  function spot(kind) {
    for (;;) {
      const far = kind === 'wolf', a = Math.random() * 6.283, r = far ? R(120, 210) : R(45, 170);
      const x = TOWN.x + Math.cos(a) * r, z = TOWN.z + Math.sin(a) * r;
      if (Math.abs(x) < 42 && Math.abs(z - TOWN.z) < 26) continue;
      return new THREE.Vector3(x, floorAt(x, z), z);
    }
  }
  function spawn(kind, at) {
    const K = KINDS[kind], g = G[kind]; if (!g) return;
    const model = SkeletonUtils.clone(g.scene);
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const root = fit(model, K.h); scene.add(root);
    const mixer = new THREE.AnimationMixer(model), acts = {};
    for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
    if (acts.Death) { acts.Death.setLoop(THREE.LoopOnce); acts.Death.clampWhenFinished = true; }
    const pos = at || spot(kind);
    const a = { kind, K, root, mixer, acts, cur: null, pos, yaw: R(0, 6.28), hp: K.hp, dead: false, skinned: false, deadT: 0,
      state: 'idle', st: R(1, 4), dir: new THREE.Vector3(), home: pos.clone(), biteT: 0, frame: Math.random() * 3 | 0, acc: 0 };
    play(a, 'Idle'); animals.push(a); return a;
  }
  function play(a, name, fade = .25) {
    const n = a.acts[name] ? name : (name === 'Attack' && a.acts.Attack_Headbutt ? 'Attack_Headbutt' : 'Idle');
    if (a.cur === n) return; const nx = a.acts[n]; if (!nx) return;
    nx.reset().fadeIn(fade).play(); if (a.cur) a.acts[a.cur].fadeOut(fade); a.cur = n;
  }

  // 后台加载，不拖慢进游戏
  const loader = new GLTFLoader();
  Promise.all(Object.entries(KINDS).map(([k, K]) => new Promise(res => loader.load('assets/' + K.file + '.glb', g => { G[k] = g; res(); }, undefined, () => res()))))
    .then(() => { for (const k in KINDS) for (let i = 0; i < KINDS[k].n; i++) spawn(k); ready = true; });

  const center = (a, out) => out.set(a.pos.x, a.pos.y + a.K.h * .6, a.pos.z);
  const _c = new THREE.Vector3();
  return {
    animals, get ready() { return ready; },
    hitTest(o, d) {
      let best = { t: Infinity, a: null };
      for (const a of animals) { if (a.dead) continue; const tt = raySphere(o, d, center(a, _c), a.K.r * (a.kind === 'deer' ? 1.3 : 1.6)); if (tt < best.t) best = { t: tt, a }; }
      return best;
    },
    damage(a, n, dir) {
      a.hp -= n;
      if (a.hp <= 0) { a.dead = true; a.deadT = 0; play(a, 'Death', .1); respawnQ.push({ k: a.kind, at: t + 60 }); return true; }
      a.state = a.K.hostile ? 'chase' : 'flee'; a.st = 8; a.dir.set(dir.x, 0, dir.z).normalize();
      if (a.acts.Idle_HitReact1 && !a.K.hostile) { /* 受惊直接跑 */ }
      return false;
    },
    onGunshot(p) {
      for (const a of animals) {
        if (a.dead || a.K.hostile) continue;
        const dx = a.pos.x - p.x, dz = a.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < 45) { a.state = 'flee'; a.st = 7; a.dir.set(dx / (d || 1), 0, dz / (d || 1)); }
      }
    },
    nearCarcass(p) { for (const a of animals) if (a.dead && !a.skinned && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 2.2) return a; return null; },
    skin(a) { a.skinned = true; a.deadT = Math.max(a.deadT, 55); return a.K.pelt; },
    update(dt, playerPos, camPos, riding) {
      t += dt;
      for (let i = animals.length - 1; i >= 0; i--) {
        const a = animals[i], K = a.K;
        const dCam = a.pos.distanceTo(camPos);
        a.frame++; a.acc += dt;
        if (dCam < 60 || a.frame % 3 === 0) { a.mixer.update(a.acc); a.acc = 0; }
        if (a.dead) { a.deadT += dt; if (a.deadT > 60) { scene.remove(a.root); animals.splice(i, 1); } continue; }
        a.root.visible = dCam < 260;
        const dx = playerPos.x - a.pos.x, dz = playerPos.z - a.pos.z, dp = Math.hypot(dx, dz);
        a.st -= dt;
        // 感知
        if (K.hostile) {
          if (dp < 28 && a.state !== 'chase') { a.state = 'chase'; a.st = 12; }
          if (a.state === 'chase' && (dp > 45 || a.st <= 0)) { a.state = 'idle'; a.st = R(2, 4); }
        } else if (dp < K.scare * (riding ? .7 : 1) && a.state !== 'flee') {
          a.state = 'flee'; a.st = 6; a.dir.set(-dx / (dp || 1), 0, -dz / (dp || 1));
        }
        let spd = 0;
        if (a.state === 'flee') {
          spd = K.run; play(a, 'Gallop', .15);
          if (a.st <= 0) { a.state = 'idle'; a.st = R(2, 5); }
        } else if (a.state === 'chase') {
          if (dp > 1.5) { spd = K.run; a.dir.set(dx / dp, 0, dz / dp); play(a, 'Gallop', .15); }
          else {
            play(a, 'Attack', .1); a.dir.set(dx / dp, 0, dz / dp);
            a.biteT -= dt; if (a.biteT <= 0) { a.biteT = 1.2; onBite?.(12); }
          }
        } else if (a.state === 'walk') {
          spd = K.walk; play(a, 'Walk');
          if (a.st <= 0) { a.state = Math.random() < .5 ? 'eat' : 'idle'; a.st = R(3, 7); }
        } else {
          play(a, a.state === 'eat' ? 'Eating' : 'Idle');
          if (a.st <= 0) {
            a.state = 'walk'; a.st = R(3, 8);
            const toHome = Math.hypot(a.home.x - a.pos.x, a.home.z - a.pos.z) > 25;
            const ang = toHome ? Math.atan2(a.home.x - a.pos.x, a.home.z - a.pos.z) : R(0, 6.28);
            a.dir.set(Math.sin(ang), 0, Math.cos(ang));
          }
        }
        if (spd > 0) {
          a.pos.addScaledVector(a.dir, spd * dt);
          // 不进镇子
          if (Math.abs(a.pos.x) < 40 && Math.abs(a.pos.z - TOWN.z) < 24 && !K.hostile) { a.dir.z = a.pos.z > TOWN.z ? 1 : -1; a.dir.x *= .3; a.dir.normalize(); }
          const lim = 280; a.pos.x = THREE.MathUtils.clamp(a.pos.x, -lim, lim); a.pos.z = THREE.MathUtils.clamp(a.pos.z, -lim, lim);
          const ty = Math.atan2(a.dir.x, a.dir.z), dd = Math.atan2(Math.sin(ty - a.yaw), Math.cos(ty - a.yaw));
          a.yaw += dd * Math.min(1, dt * 8);
          a.pos.y = floorAt(a.pos.x, a.pos.z);
        }
        a.root.position.copy(a.pos); a.root.rotation.y = a.yaw;
      }
      while (respawnQ.length && respawnQ[0].at <= t) { const q = respawnQ.shift(); spawn(q.k); }
    },
  };
}
