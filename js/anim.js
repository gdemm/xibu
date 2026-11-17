// 人物动作混合：运动层（Idle/Walk/Jog/Sprint 按速度连续混合、步频同步防滑步）
// + 上半身持枪/瞄准层（按俯仰混合 Up/Neutral/Down）+ 开枪/换弹/受击/死亡 单次动作。
// 所有权重每帧平滑过渡，不会出现动作跳变。
import * as THREE from 'three';
import { CLIPS } from './assets.js';

const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_)/;
const LOWER = /^(root|pelvis|spine_01|thigh_|calf_|foot_|ball_)/;
const cache = new Map();
function part(name, which) {
  const key = name + '|' + which;
  if (cache.has(key)) return cache.get(key);
  const src = CLIPS[name]; if (!src) return null;
  const re = which === 'u' ? UPPER : LOWER;
  const c = new THREE.AnimationClip(name + '_' + which, src.duration, src.tracks.filter(t => re.test(t.name.split('.')[0])));
  cache.set(key, c); return c;
}
// 各步态的自然速度（米/秒）
const LOCO = [['Idle', 0], ['Walk', 1.45], ['Jog_Fwd', 3.7], ['Sprint', 6.4]];

export function makeAnimator(ch) {
  const mx = ch.mixer;
  const act = (clip) => { const a = mx.clipAction(clip); a.play(); a.weight = 0; a.enabled = true; return a; };
  const full = {}, low = {}, up = {};
  for (const [n] of LOCO) { full[n] = act(CLIPS[n]); low[n] = act(part(n, 'l')); full[n].timeScale = low[n].timeScale = 0; }
  full.Driving = act(CLIPS.Driving); low.Driving = act(part('Driving', 'l'));
  for (const n of ['Pistol_Idle', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down']) up[n] = act(part(n, 'u'));
  const once = {};
  for (const [k, n, u] of [['shoot', 'Pistol_Shoot', 1], ['reload', 'Pistol_Reload', 1], ['hitC', 'Hit_Chest', 0], ['hitH', 'Hit_Head', 0], ['death', 'Death01', 0], ['interact', 'Interact', 1]]) {
    const a = mx.clipAction(u ? part(n, 'u') : CLIPS[n]); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.weight = 0; once[k] = { a, w: 0, t: 0, dur: a.getClip().duration };
  }
  const st = { speed: 0, speedS: 0, aim: false, aimW: 0, ready: false, readyW: 0, pitch: 0, pitchS: 0, ride: false, rideW: 0, phase: 0, dead: false, deadW: 0 };
  const W = {};   // 运动层权重
  function locoWeights(v) {
    const a = Math.abs(v);
    for (const [n] of LOCO) W[n] = 0;
    if (a <= 0.05) { W.Idle = 1; return; }
    for (let i = 0; i < LOCO.length - 1; i++) {
      const [n0, s0] = LOCO[i], [n1, s1] = LOCO[i + 1];
      if (a <= s1 || i === LOCO.length - 2) { const k = THREE.MathUtils.clamp((a - s0) / (s1 - s0), 0, 1); W[n0] = 1 - k; W[n1] = k; return; }
    }
  }
  function fire1(o, fadeIn = .06) { o.a.reset().play(); o.a.enabled = true; o.t = o.dur; o.fade = fadeIn; o.w = Math.max(o.w, .001); }
  const lerpK = (k, dt) => 1 - Math.exp(-k * dt);

  return {
    acts: { full, low, up, once },
    setLocomotion(speedMS) { st.speed = speedMS; },        // 有符号：负数=倒退
    setAim(on) { st.aim = !!on; },
    setReady(on) { st.ready = !!on; },                      // 持枪警戒（敌人在掩体后）
    setAimPitch(rad) { st.pitch = rad; },
    setRiding(on) { st.ride = !!on; },
    shoot() { if (!st.dead) fire1(once.shoot, .03); },
    reload() { if (!st.dead) fire1(once.reload, .15); },
    interact() { if (!st.dead) fire1(once.interact, .15); },
    hit(head) { if (!st.dead) fire1(head ? once.hitH : once.hitC, .05); },
    die() { if (st.dead) return; st.dead = true; fire1(once.death, .12); once.death.t = 1e9; },
    get dead() { return st.dead; },
    get aimW() { return st.aimW; },
    update(dt) {
      st.speedS += (st.speed - st.speedS) * lerpK(8, dt);
      st.aimW += ((st.aim ? 1 : 0) - st.aimW) * lerpK(12, dt);
      st.readyW += ((st.ready ? 1 : 0) - st.readyW) * lerpK(6, dt);
      st.rideW += ((st.ride ? 1 : 0) - st.rideW) * lerpK(10, dt);
      st.pitchS += (st.pitch - st.pitchS) * lerpK(12, dt);
      st.deadW += ((st.dead ? 1 : 0) - st.deadW) * lerpK(14, dt);
      locoWeights(st.speedS);
      // 步频同步：所有移动步态共享一个归一化相位
      let L = 0, wm = 0;
      for (const [n, s] of LOCO) if (s > 0 && W[n] > 0) { L += W[n] * s * CLIPS[n].duration; wm += W[n]; }
      if (wm > 0) st.phase += dt * st.speedS / (L / wm);
      st.phase -= Math.floor(st.phase);
      for (const [n, s] of LOCO) {
        const t = s > 0 ? st.phase * CLIPS[n].duration : (full[n].time + dt) % CLIPS[n].duration;
        full[n].time = low[n].time = t;
      }
      // 单次动作权重
      for (const k in once) {
        const o = once[k];
        if (o.t > 0) { o.t -= dt; o.w = Math.min(1, o.w + dt / Math.max(.01, o.fade)); if (o.t < .15 && k !== 'death') o.w = Math.max(0, o.t / .15); }
        else o.w = Math.max(0, o.w - dt * 6);
        if (o.w <= 0 && o.a.isRunning()) o.a.stop();
      }
      const alive = 1 - st.deadW;
      const upperOneShot = Math.max(once.shoot.w, once.reload.w, once.interact.w);
      const upW = Math.max(st.aimW, st.readyW, upperOneShot);           // 上半身由持枪层接管的程度
      const ride = st.rideW;
      for (const [n] of LOCO) {
        full[n].weight = W[n] * (1 - upW) * (1 - ride) * alive;
        low[n].weight = W[n] * upW * (1 - ride) * alive;
      }
      full.Driving.weight = ride * (1 - upW) * alive;
      low.Driving.weight = ride * upW * alive;
      // 瞄准俯仰：pitch 正=抬头。±0.6 rad 到顶
      const p = THREE.MathUtils.clamp(st.pitchS / 0.6, -1, 1);
      const aimShare = st.aimW * (1 - upperOneShot);
      up.Pistol_Aim_Up.weight = aimShare * Math.max(0, p) * alive;
      up.Pistol_Aim_Down.weight = aimShare * Math.max(0, -p) * alive;
      up.Pistol_Aim_Neutral.weight = aimShare * (1 - Math.abs(p)) * alive;
      up.Pistol_Idle.weight = Math.max(0, upW - st.aimW) * (1 - upperOneShot) * alive;
      once.shoot.a.weight = once.shoot.w * alive;
      once.reload.a.weight = once.reload.w * alive;
      once.interact.a.weight = once.interact.w * alive;
      once.hitC.a.weight = once.hitC.w * .7 * alive;
      once.hitH.a.weight = once.hitH.w * .7 * alive;
      once.death.a.weight = Math.max(once.death.w, st.deadW);
      // 权重为 0 的动作不参与计算（省 CPU）
      for (const g of [full, low, up]) for (const k in g) g[k].enabled = g[k].weight > 1e-3;
      mx.update(dt);
    },
  };
}
