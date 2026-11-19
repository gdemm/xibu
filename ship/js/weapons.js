// weapon definitions + first-person viewmodels
import * as THREE from 'three';

export const WEAPONS = {
  rifle:  { id: 'rifle',  name: '步枪',   auto: true,  rate: 0.1,  dmg: 28, mag: 30, reserve: 90, reload: 2.0, spread: 0.012, moveSpread: 0.03, kick: 0.012, range: 120, head: 2.5 },
  sniper: { id: 'sniper', name: '狙击枪', auto: false, rate: 1.1,  dmg: 90, mag: 5,  reserve: 20, reload: 2.8, spread: 0.07,  scopedSpread: 0.0008, moveSpread: 0.08, kick: 0.05, range: 250, head: 2.5, scope: true },
  pistol: { id: 'pistol', name: '手枪',   auto: false, rate: 0.18, dmg: 34, mag: 12, reserve: 48, reload: 1.4, spread: 0.015, moveSpread: 0.025, kick: 0.02, range: 80, head: 2.5 },
  knife:  { id: 'knife',  name: '匕首',   auto: false, rate: 0.45, dmg: 55, mag: 0,  reserve: 0,  reload: 0,   spread: 0, moveSpread: 0, kick: 0, range: 2.2, head: 1.5, melee: true },
};
export const ORDER = ['rifle', 'sniper', 'pistol', 'knife'];

import { Builder, M, addGun, between, teamMaterial, MUZZLE } from './soldier.js';
export { MUZZLE };

// gloved hand + camo sleeve, from wrist point toward elbow point (viewmodel space)
function arm(B, wrist, elbow, grip, left) {
  const glove = 0x1f2124, knuckle = 0x3a3a36, cuff = 0x2a2d31;
  const w = new THREE.Vector3(...wrist), e = new THREE.Vector3(...elbow), h = new THREE.Vector3(...grip);
  let t = between(w, e);
  B.add(new THREE.CapsuleGeometry(0.043, t.len, 3, 12), t.m, 0, { camo: true, sv: 0.6 });                 // sleeve
  const cuffEnd = w.clone().lerp(e, 0.12); t = between(w, cuffEnd);
  B.add(new THREE.CylinderGeometry(0.047, 0.047, t.len, 12), t.m, cuff);                                // glove cuff
  t = between(h, w);
  B.add(new THREE.CapsuleGeometry(0.036, Math.max(0.01, t.len - 0.02), 3, 10), t.m, glove);              // back of hand
  const s = left ? -1 : 1;
  B.add(new THREE.CapsuleGeometry(0.022, 0.05, 2, 8), M(h.x - s * 0.012, h.y - 0.005, h.z, 0, 0, Math.PI / 2, 1, 1, 1.4), glove); // fingers wrap
  B.add(new THREE.BoxGeometry(0.03, 0.012, 0.045), M(h.x + s * 0.028, h.y + 0.012, h.z + 0.01), knuckle);  // knuckle pad
  B.add(new THREE.CapsuleGeometry(0.014, 0.04, 2, 6), M(h.x - s * 0.03, h.y + 0.025, h.z - 0.01, 1.2, 0, 0), glove); // thumb
}

export function buildViewmodels() {
  const models = {};
  const mk = (type, arms) => {
    const B = new Builder();
    addGun(B, type, new THREE.Matrix4());
    for (const a of arms) arm(B, ...a);
    const g = new THREE.Group(); const m = new THREE.Mesh(B.build(false), teamMaterial('blue')); g.add(m);
    g.userData.tris = B.tris; g.userData.mesh = m; g.visible = false; return g;
  };
  const RIGHT = [[0.035, -0.11, 0.1], [0.15, -0.3, 0.36], [0.02, -0.06, 0.03], false];
  models.rifle = mk('rifle', [RIGHT, [[-0.07, -0.08, -0.3], [-0.26, -0.3, -0.02], [-0.015, -0.035, -0.34], true]]);
  models.sniper = mk('sniper', [RIGHT, [[-0.07, -0.08, -0.4], [-0.27, -0.3, -0.1], [-0.015, -0.03, -0.42], true]]);
  models.pistol = mk('pistol', [[[0.03, -0.11, 0.09], [0.12, -0.32, 0.45], [0.015, -0.06, 0.02], false], [[-0.06, -0.12, 0.06], [-0.2, -0.33, 0.4], [-0.02, -0.07, 0.01], true]]);
  models.knife = mk('knife', [[[0.03, -0.06, 0.09], [0.12, -0.3, 0.45], [0.01, -0.005, 0.01], false]]);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flash.visible = false;
  const setTeam = (team) => { for (const k of ORDER) models[k].userData.mesh.material = teamMaterial(team); };
  return { models, flash, setTeam };
}
