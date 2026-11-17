// 红石镇自由漫游：镇民 + 互动点（原创）
import * as THREE from 'three';
import { character } from './assets.js';
import { makeAnimator } from './anim.js';
import { floorAt, collide } from './scene.js';

export const SPOTS = [
  { id: 'board', name: '悬赏告示', x: -12, z: 2.6 },
  { id: 'store', name: '杂货铺', x: 2, z: 2.6 },
  { id: 'saloon', name: '酒馆', x: 14, z: 11.4 },
];

function label(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(40,22,10,.75)'; g.beginPath(); g.roundRect?.(8, 6, 240, 52, 12); g.fill?.();
  if (!g.roundRect) g.fillRect(8, 6, 240, 52);
  g.fillStyle = '#ffe2a8'; g.font = 'bold 34px "Songti SC","STSong","Noto Sans SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(1.6, .4, 1); return s;
}

const raySphere = (o, d, c, r) => {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t > 0 ? t : Infinity;
};

export function createTown(scene) {
  const npcs = [];
  const R = (a, b) => a + Math.random() * (b - a);
  const walkPoint = () => new THREE.Vector3(R(-30, 30), 0, Math.random() < .5 ? R(1.8, 3.2) : R(10.8, 12.2));

  function spawn(atEdge) {
    const ch = character('townsfolk'); const an = makeAnimator(ch);
    if (ch.gun) ch.gun.visible = false;
    const pos = atEdge ? new THREE.Vector3(Math.random() < .5 ? -34 : 34, 0, R(2, 12)) : walkPoint();
    pos.y = floorAt(pos.x, pos.z);
    ch.root.position.copy(pos); scene.add(ch.root);
    const n = { ch, an, pos, yaw: R(0, 6.28), target: walkPoint(), wait: R(0, 3), flee: 0, fleeDir: new THREE.Vector3(), dead: false, deadT: 0, frame: Math.random() * 2 | 0 };
    npcs.push(n); return n;
  }
  for (let i = 0; i < 6; i++) spawn(false);

  // 互动点：发光圆环 + 文字牌
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: .6, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const s of SPOTS) {
    const y = floorAt(s.x, s.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .9, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, y + .05, s.z);
    const lb = label(s.name); lb.position.set(s.x, y + 2.2, s.z);
    scene.add(ring, lb); s.ring = ring; s.label = lb;
  }

  let respawnQ = [], t = 0;
  function parts(n) {
    const head = new THREE.Vector3(), body = new THREE.Vector3();
    n.ch.bones.head.getWorldPosition(head); head.y += .08;
    n.ch.bones.spine.getWorldPosition(body); body.y -= .12;
    return { head, body };
  }
  return {
    npcs,
    nearSpot(p) { for (const s of SPOTS) if (Math.hypot(p.x - s.x, p.z - s.z) < 1.6) return s; return null; },
    onGunshot(p) {
      for (const n of npcs) {
        if (n.dead) continue;
        const dx = n.pos.x - p.x, dz = n.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < 25) { n.flee = 8; n.fleeDir.set(dx / (d || 1), 0, dz / (d || 1)); n.wait = 0; }
      }
    },
    hitTest(o, d) {
      let best = { t: Infinity, n: null };
      for (const n of npcs) {
        if (n.dead) continue; const p = parts(n);
        const tt = Math.min(raySphere(o, d, p.head, .17), raySphere(o, d, p.body, .42));
        if (tt < best.t) best = { t: tt, n };
      }
      return best;
    },
    kill(n, dir) { n.dead = true; n.deadT = 0; n.an.die(); respawnQ.push(t + 30); },
    update(dt, camPos, frozen, scaryPos) {
      t += dt;
      for (let i = npcs.length - 1; i >= 0; i--) {
        const n = npcs[i];
        n.frame++; n.acc = (n.acc || 0) + dt;
        if (n.pos.distanceTo(camPos) < 45 || n.frame % 2 === 0) { n.an.update(n.acc); n.acc = 0; }
        if (n.dead) {
          n.deadT += dt;
          if (n.deadT > 20) { scene.remove(n.ch.root); npcs.splice(i, 1); }
          continue;
        }
        let spd = 0;
        if (scaryPos && n.flee <= 0) { const dx = n.pos.x - scaryPos.x, dz = n.pos.z - scaryPos.z, d = Math.hypot(dx, dz); if (d < 6) { n.flee = 4; n.fleeDir.set(dx / (d || 1), 0, dz / (d || 1)); } }
        if (!frozen) {
          if (n.flee > 0) {
            n.flee -= dt; spd = 4;
            n.pos.addScaledVector(n.fleeDir, spd * dt);
            n.yaw = Math.atan2(n.fleeDir.x, n.fleeDir.z);
            if (Math.abs(n.pos.x) > 38 || n.pos.z < -6 || n.pos.z > 20) { n.fleeDir.negate(); }
            if (n.flee <= 0) n.target = walkPoint();
          } else if (n.wait > 0) n.wait -= dt;
          else {
            const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z, d = Math.hypot(dx, dz);
            if (d < .4) { n.wait = R(2, 5); n.target = walkPoint(); }
            else {
              spd = 1.2;
              n.pos.x += dx / d * spd * dt; n.pos.z += dz / d * spd * dt;
              let ty = Math.atan2(dx, dz), dd = Math.atan2(Math.sin(ty - n.yaw), Math.cos(ty - n.yaw));
              n.yaw += dd * Math.min(1, dt * 6);
            }
          }
          const before = n.pos.clone();
          collide(n.pos, .35, n.pos.y);
          if (spd > 0 && before.distanceToSquared(n.pos) > 1e-4 && n.flee <= 0) { n.stuck = (n.stuck || 0) + dt; if (n.stuck > 1.5) { n.target = walkPoint(); n.stuck = 0; } }
          n.pos.y = floorAt(n.pos.x, n.pos.z);
        }
        n.an.setLocomotion(spd);
        n.ch.root.position.copy(n.pos); n.ch.root.rotation.y = n.yaw;
      }
      while (respawnQ.length && respawnQ[0] <= t) { respawnQ.shift(); spawn(true); }
      for (const s of SPOTS) s.ring.material.opacity = .4 + .25 * Math.sin(t * 3);
    },
    setVisible(v) { for (const n of npcs) n.ch.root.visible = v; for (const s of SPOTS) { s.ring.visible = v; s.label.visible = v; } },
  };
}
