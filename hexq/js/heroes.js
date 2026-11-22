// Q版大乱斗 heroes: load decimated hx7k2 champion glbs, chibi bone scaling (from work/chibi prototype),
// party toon look (toonRamp + saturation boost), inverted-hull outline with LOD, light animation controller.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkel } from 'three/addons/utils/SkeletonUtils.js';

export const HERO_NAMES = ['Ahri', 'Ashe', 'Ezreal', 'Garen', 'Jinx', 'Lux', 'Sett', 'Teemo', 'Yasuo'];
const HEIGHTS = { Yasuo: 110, Sett: 125, Ashe: 101, Lux: 103, Ahri: 105, Ezreal: 99, Garen: 116, Jinx: 108, Teemo: 75 };
/* chibi table (work/chibi/index.html): head = head-bone scale, spine/leg/arm/neck = chain length, hand/clav/weapon = bone scale */
const DEF = { head: 2.15, spine: .64, leg: .56, arm: .72, hand: 1.25, neck: .45, weapon: 1, clav: .85 };
const CHIBI_P = {
  Ahri: { head: 2.05, extra: [[/^Tail_Master$/, .6]] },
  Ashe: { head: 2.05, weapon: .8 },
  Ezreal: {},
  Garen: { head: 2.2, weapon: .72, clav: .8 },
  Jinx: { head: 2.0 },
  Lux: { head: 2.0 },
  Sett: { head: 2.2, clav: .8 },
  Teemo: { h: .85, head: 1.3, spine: .85, leg: .8, arm: .9, hand: 1.1, neck: .8, clav: 1 },
  Yasuo: { head: 1.9, weapon: .72 },
};
// facing fix in degrees (rigs disagree on native facing; Lux idle faces backwards vs her run)
const FACING = { Ahri: { all: 15 }, Ashe: { all: 40 }, Yasuo: { all: -10 }, Lux: { idle: 180 } };
const WEAPON_RE = /^(weapon|sword|bow_01|rocket_launcher|minigun|weapon_b)$/i;
const HIDE_MATS = { Sett: ['Wolverine', 'Joke'], Teemo: ['Mushroom', 'Harmonica'], Ahri: ['Tail_Large'] };

/* ---------- party look ---------- */
let RAMP;
export function toonRamp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.generateMipmaps = false; RAMP.needsUpdate = true;
  return RAMP;
}
const toonCache = new Map(), olCache = new Map();
function toonOf(src) {
  const key = src.map?.uuid || src.uuid; let m = toonCache.get(key); if (m) return m;
  m = new THREE.MeshToonMaterial({ name: src.name, map: src.map, color: 0xffffff, gradientMap: toonRamp(), side: THREE.DoubleSide, alphaTest: .18 });
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    { float g = dot(diffuseColor.rgb, vec3(.299,.587,.114)); diffuseColor.rgb = max(mix(vec3(g), diffuseColor.rgb, 1.30), 0.0) * 1.18; }`)
      // faint cool moonlight rim so heroes separate from the dark Howling-Abyss ground
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
    { float rim = 1.0 - abs(dot(normal, normalize(vViewPosition))); gl_FragColor.rgb += vec3(.45,.7,1.0) * pow(rim, 3.0) * .28; }`);
  };
  m.customProgramCacheKey = () => 'hqToon';
  toonCache.set(key, m); return m;
}
function outlineOf(src, w) {
  const key = (src.map?.uuid || src.uuid) + w.toFixed(5); let m = olCache.get(key); if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: 0x2a1f2e, side: THREE.BackSide, map: src.map, alphaTest: .18 });
  m.onBeforeCompile = s => {
    s.vertexShader = 'uniform float OUTLINE_W;\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(objectNormal) * OUTLINE_W;');
    s.uniforms.OUTLINE_W = { value: w };
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = diffuse;');
  };
  m.customProgramCacheKey = () => 'hqOutline' + w.toFixed(5);
  olCache.set(key, m); return m;
}

/* ---------- rig ---------- */
const isBone = o => o && o.isBone;
function find(model, re) { let f = null; model.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; }
function findAll(model, re) { const a = []; model.traverse(o => { if (o.isBone && re.test(o.name)) a.push(o); }); return a; }
function ancestors(b) { const a = []; for (let p = b; isBone(p); p = p.parent) a.push(p); return a; }
function commonAncestor(a, b) { const A = new Set(ancestors(a)); for (let p = b; isBone(p); p = p.parent) if (A.has(p)) return p; return null; }
function pathBelow(b, top) { const r = []; for (let p = b; isBone(p) && p !== top; p = p.parent) r.push(p); return r; }

function buildRig(model, name) {
  const P = { ...DEF, ...CHIBI_P[name] };
  const head = find(model, /^head$/i), neck = find(model, /^neck$/i);
  const feet = findAll(model, /^[LR]_foot$/i), hands = findAll(model, /^[LR]_hand$/i);
  const ops = [];
  if (!head || feet.length < 2) return { ops, ok: false, head, feet, hands };
  const hub = commonAncestor(head, feet[0]);
  for (const b of pathBelow(head, hub)) { if (b === head || b === neck || /^root/i.test(b.name)) continue; ops.push({ b, pos: P.spine }); }
  if (neck) ops.push({ b: head, pos: P.neck });
  ops.push({ b: head, scale: P.head });
  for (const f of feet) {
    const p = pathBelow(f, hub); const hi = p.findIndex(b => /hip|thigh/i.test(b.name));
    for (const b of (hi >= 0 ? p.slice(0, hi) : p.slice(0, -1))) ops.push({ b, pos: P.leg });
  }
  for (const h of hands) { ops.push({ b: h, scale: P.hand }); for (let p = h; isBone(p); p = p.parent) { ops.push({ b: p, pos: P.arm }); if (/elbow|forearm/i.test(p.name)) break; } }
  { let cl = findAll(model, /clavicle/i); if (!cl.length) cl = findAll(model, /^[LR]_shoulder$/i); for (const b of cl) ops.push({ b, scale: P.clav }); }
  for (const w of findAll(model, WEAPON_RE)) ops.push({ b: w, scale: P.weapon });
  for (const [re, k] of P.extra || []) for (const b of findAll(model, re)) ops.push({ b, scale: k });
  // saved state buffers (no per-frame allocation)
  for (const op of ops) { op.p = new THREE.Vector3(); op.s = new THREE.Vector3(); }
  return { ops, ok: true, hub, head, feet, hands };
}
function applyChibi(rig) {
  const ops = rig.ops;
  for (let i = 0; i < ops.length; i++) { const o = ops[i]; o.p.copy(o.b.position); o.s.copy(o.b.scale); }
  for (let i = 0; i < ops.length; i++) { const o = ops[i]; if (o.pos !== undefined) o.b.position.multiplyScalar(o.pos); else o.b.scale.multiplyScalar(o.scale); }
  rig.applied = true;
}
function restoreChibi(rig) {
  if (!rig.applied) return; const ops = rig.ops;
  for (let i = ops.length - 1; i >= 0; i--) { const o = ops[i]; o.b.position.copy(o.p); o.b.scale.copy(o.s); }
  rig.applied = false;
}
function measure(model, rig) {
  const box = new THREE.Box3(), v = new THREE.Vector3(); let lo = Infinity, hi = -Infinity;
  const headSet = new Set(), footSet = new Set();
  if (rig.head) rig.head.traverse(b => b.isBone && headSet.add(b));
  for (const f of rig.feet || []) f.traverse(b => b.isBone && footSet.add(b));
  model.traverse(o => {
    if (!o.isSkinnedMesh || !o.visible) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 2) {
      let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); box.expandByPoint(v);
      const bone = o.skeleton.bones[best]; if (footSet.has(bone)) lo = Math.min(lo, v.y); if (headSet.has(bone)) hi = Math.max(hi, v.y);
    }
  });
  if (isFinite(lo)) box.min.y = lo; if (isFinite(hi)) box.max.y = hi; return box;
}

/* ---------- templates ---------- */
const T = {};
export const heroTemplates = T;
const loader = new GLTFLoader();
export async function loadHeroes(base, onOne) {
  let done = 0;
  await Promise.all(HERO_NAMES.map(async n => {
    const g = await loader.loadAsync(`${base}/${n}.glb`);
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const hide = (HIDE_MATS[n] || []).includes(o.material.name);
      o.visible = !hide; o.frustumCulled = false;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    });
    T[n] = { scene: g.scene, clips: Object.fromEntries(g.animations.map(c => [c.name, c])) };
    calibrate(n);
    onOne?.(++done, HERO_NAMES.length);
  }));
}
// one-off per template: chibi height normalisation, ground offset, outline width in geometry units
function calibrate(name) {
  const t = T[name], model = cloneSkel(t.scene), holder = new THREE.Group(); holder.add(model);
  const mixer = new THREE.AnimationMixer(model); const idle = t.clips.idle || Object.values(t.clips)[0];
  mixer.clipAction(idle).play(); mixer.update(.3);
  const rig = buildRig(model, name); applyChibi(rig); holder.updateMatrixWorld(true);
  const box = measure(model, rig); restoreChibi(rig);
  const target = (HEIGHTS[name] / 110) ** .5 * 1.45 * (CHIBI_P[name]?.h ?? 1);
  t.scale = target / (box.max.y - box.min.y); t.ground = -box.min.y * t.scale; t.height = target;
  // geometry-space -> world scale (quantized meshes live in a normalised space)
  let gd = 0; model.traverse(o => { if (o.isSkinnedMesh && o.visible) { o.geometry.computeBoundingBox(); gd = Math.max(gd, o.geometry.boundingBox.getSize(new THREE.Vector3()).length()); } });
  const wd = box.getSize(new THREE.Vector3()).length();
  t.geoToWorld = (wd * t.scale) / Math.max(gd, 1e-6) / t.scale; // world units (pre holder scale) per geometry unit
  let tris = 0; model.traverse(o => { if (o.isMesh && o.visible) tris += o.geometry.index.count / 3; }); t.tris = tris;
  mixer.stopAllAction();
}

/* ---------- instances ---------- */
const ONE_SHOT = new Set(['attack', 'attack2', 'q', 'w', 'e', 'r', 'q2', 'q3', 'crit']);
export function makeHero(name) {
  const t = T[name], model = cloneSkel(t.scene), holder = new THREE.Group(), root = new THREE.Group();
  holder.add(model); root.add(holder);
  holder.scale.setScalar(t.scale); holder.position.y = t.ground;
  const outlines = [], meshes = [];
  const w = 0.016 / t.scale / t.geoToWorld;
  model.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const src = o.material; o.material = toonOf(src); meshes.push(o);
    if (o.isSkinnedMesh) {
      const ol = new THREE.SkinnedMesh(o.geometry, outlineOf(src, w)); ol.bind(o.skeleton, o.bindMatrix); ol.frustumCulled = false; ol.visible = false;
      o.parent.add(ol); outlines.push(ol);
    }
  });
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const k in t.clips) actions[k] = mixer.clipAction(t.clips[k]);
  const rig = buildRig(model, name);
  const h = {
    name, root, holder, model, mixer, actions, rig, outlines, meshes, height: t.height, tris: t.tris,
    base: 'idle', cur: null, oneShotT: 0, animAcc: 0, outlineOn: false,
  };
  h.play = (a, speed = 1) => playAnim(h, a, speed);
  h.update = (dt, slow) => updateHero(h, dt, slow);
  h.setOutline = on => { if (h.outlineOn === on) return; h.outlineOn = on; for (const o of outlines) o.visible = on; };
  playAnim(h, 'idle');
  return h;
}
function faceFix(h, a) { const F = FACING[h.name] || {}; h.holder.rotation.y = ((F.all || 0) + (F[a] || 0)) * Math.PI / 180; }
function playAnim(h, a, speed = 1) {
  if (!h.actions[a]) { if (a === 'attack2' || a === 'q2' || a === 'q3') a = a.replace(/\d$/, ''); if (!h.actions[a]) a = ONE_SHOT.has(a) ? 'attack' : 'idle'; }
  if (ONE_SHOT.has(a)) {
    const act = h.actions[a]; if (h.cur && h.cur !== act) h.cur.stop();
    act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.timeScale = speed; act.play();
    h.cur = act; h.oneShotT = act.getClip().duration / speed; faceFix(h, a); return;
  }
  h.base = a;
  if (h.oneShotT > 0) return; // finish the one-shot first
  const act = h.actions[a]; if (h.cur === act) { act.timeScale = speed; return; }
  if (h.cur) h.cur.stop(); act.reset().setLoop(THREE.LoopRepeat, Infinity).play(); act.timeScale = speed; h.cur = act; faceFix(h, a);
}
function updateHero(h, dt, slow) {
  if (h.oneShotT > 0) { h.oneShotT -= dt; if (h.oneShotT <= 0) { h.oneShotT = 0; const b = h.base; h.base = null; h.cur?.stop(); h.cur = null; playAnim(h, b || 'idle'); } }
  // far / off-screen heroes animate at ~15 Hz
  h.animAcc += dt; if (slow && h.animAcc < 1 / 15) return; const step = h.animAcc; h.animAcc = 0;
  restoreChibi(h.rig); h.mixer.update(step); if (h.rig.ok) applyChibi(h.rig);
}
