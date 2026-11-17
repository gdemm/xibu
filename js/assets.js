// 素材加载：全部为 CC0（见 assets/CREDITS.md）
// 角色：Quaternius Universal Base Characters（裸模）+ Universal Animation Library（同一骨架），
// 衣服 / 帽子 / 面巾 都是本文件里程序生成的原创造型。
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export const A = {};   // 模型
export const T = {};   // 贴图
const LIST = ['main_street', 'barrel', 'cactus1', 'cactus2', 'cactus3', 'crate', 'hay', 'mesa', 'rock1',
  'tumble', 'wagon', 'wheel', 'gun_pistol', 'cowboy', 'anims', 'horse'];
const TEX = { sky: 'sky.jpg', sand: 'sand_col.jpg', sandN: 'sand_nor.jpg', dirt: 'dirt_col.jpg', dirtN: 'dirt_nor.jpg' };
export const CLIPS = {};      // 人物动作（UAL1），名字去掉 _Loop 后缀：Idle Walk Jog_Fwd Sprint Pistol_Idle ...

export function loadAll(onProg) {
  const loader = new GLTFLoader(), tl = new THREE.TextureLoader();
  const total = LIST.length + Object.keys(TEX).length; let n = 0;
  const step = () => onProg(++n / total);
  const models = LIST.map(k => new Promise(res => {
    loader.load('assets/' + k + '.glb', g => { A[k] = g; step(); res(); },
      undefined, e => { console.error('load fail', k, e); step(); res(); });
  }));
  const texs = Object.entries(TEX).map(([k, f]) => new Promise(res => {
    tl.load('assets/' + f, t => { T[k] = t; step(); res(); }, undefined, e => { console.error('tex fail', f, e); step(); res(); });
  }));
  return Promise.all([...models, ...texs]).then(() => {
    if (A.anims) for (const c of A.anims.animations) CLIPS[c.name.replace(/_Loop$/, '')] = c;
    for (const k of ['sand', 'dirt', 'sky']) if (T[k]) T[k].colorSpace = THREE.SRGBColorSpace;
    for (const k of ['sand', 'sandN', 'dirt', 'dirtN']) if (T[k]) { T[k].wrapS = T[k].wrapT = THREE.RepeatWrapping; T[k].anisotropy = 4; }
  });
}

const _b = new THREE.Box3(), _v = new THREE.Vector3();
// 把 obj 放进一个 group：底部贴地、xz 居中，缩放到高度 h（h 为 0 不缩放）
export function merged(obj) {
  // 把一个模型的所有网格按材质合并（静态道具用）
  const g = new THREE.Group(); obj.updateMatrixWorld(true);
  const byMat = new Map();
  obj.traverse(o => { if (!o.isMesh) return; const k = o.material.uuid; if (!byMat.has(k)) byMat.set(k, { mat: o.material, geos: [] });
    let ge = o.geometry.clone().applyMatrix4(o.matrixWorld); if (ge.index) ge = ge.toNonIndexed();
    for (const a of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(a)) ge.deleteAttribute(a);
    if (!ge.attributes.uv) ge.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2));
    byMat.get(k).geos.push(ge); });
  for (const { mat, geos } of byMat.values()) g.add(new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos, false) : geos[0], mat));
  return g;
}

export function fit(obj, h) {
  obj.updateMatrixWorld(true);
  _b.setFromObject(obj, true);
  if (h) obj.scale.multiplyScalar(h / Math.max(0.001, _b.max.y - _b.min.y));
  obj.updateMatrixWorld(true);
  _b.setFromObject(obj, true);
  _b.getCenter(_v);
  obj.position.x -= _v.x; obj.position.z -= _v.z; obj.position.y -= _b.min.y;
  const g = new THREE.Group(); g.add(obj); return g;
}

// 一种道具的多个摆放 → 每个子网格一个 InstancedMesh，省 draw call
export function instanced(key, list, h, scene, opts = {}) {
  const src = A[key]; if (!src) return [];
  const proto = fit(src.scene.clone(true), h);
  proto.updateMatrixWorld(true);
  const out = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  // 同材质的子网格先合并，再做实例化：一种道具只占 材质数 个 draw call
  const byMat = new Map();
  proto.traverse(o => {
    if (!o.isMesh) return;
    const k = o.material.uuid; if (!byMat.has(k)) byMat.set(k, { mat: o.material, geos: [] });
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    byMat.get(k).geos.push(g);
  });
  for (const { mat, geos } of byMat.values()) {
    const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(_up, t.r || 0); s.setScalar(t.s || 1); p.set(t.x, t.y || 0, t.z);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    });
    im.castShadow = opts.shadow !== false; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im); out.push(im);
  }
  return out;
}
const _up = new THREE.Vector3(0, 1, 0);

export function propHeight(key) {
  const src = A[key]; if (!src) return 1;
  _b.setFromObject(src.scene, true); return _b.max.y - _b.min.y;
}

// ======================================================================
// 原创牛仔服装：在裸模的静止姿态坐标（米，Y 向上，脸朝 +Z，T 字姿势）里按区域上色，
// 布料区域稍微“鼓”出来一点，弱化肌肉法线，看起来是穿着衣服而不是涂色。
// ======================================================================
const OUTFITS = {
  player: { shirt: 0xb59a74, vest: 0x4a3423, pants: 0x4b5263, boots: 0x3a2618, belt: 0x2b1a10, scarf: 0x7a2418, hat: 0x6e5236,
    band: 0x2a1a10, sleeves: 0.62, vest_on: 1, mask: 0, neckerchief: 1, gloves: 0, hair: 1, beard: 0 },
  bandit: { shirt: 0x5e4a3a, vest: 0x2d2622, pants: 0x3e3a33, boots: 0x231910, belt: 0x1d130c, scarf: 0x8c1d14, hat: 0x2a221c,
    band: 0x111111, sleeves: 0.70, vest_on: 1, mask: 1, neckerchief: 0, gloves: 0, hair: 0, beard: 1 },
  boss: { shirt: 0x1c1a1a, vest: 0x4a1612, pants: 0x262321, boots: 0x140e0a, belt: 0x0e0a08, scarf: 0x101010, hat: 0x0f0d0c,
    band: 0x5a1a10, sleeves: 0.70, vest_on: 1, mask: 0, neckerchief: 1, gloves: 1, hair: 0, beard: 1 },
  townsfolk: { shirt: 0x9a8a7a, vest: 0x5a4a3a, pants: 0x6a7a8a, boots: 0x4a3a2a, belt: 0x3a2a1a, scarf: 0x8a9a7a, hat: 0x7a6a5a,
    band: 0x4a3a2a, sleeves: 0.65, vest_on: 1, mask: 0, neckerchief: 0, gloves: 0, hair: 1, beard: 0 },
};
const BANDIT_SHIRTS = [0x5e4a3a, 0x6b5a45, 0x4a3b32, 0x7a6a55, 0x3f3a36, 0x6e3f2c];
const BANDIT_SCARF = [0x8c1d14, 0x1c1c1c, 0x6a2a18, 0x2b3550];
const BANDIT_HATS = [0x2a221c, 0x3b2c20, 0x1a1714, 0x5a4632, 0x4a4038];
const BANDIT_PANTS = [0x3e3a33, 0x4b4434, 0x2e3440, 0x55493a];
const TOWNSFOLK_SHIRTS = [0xc4a882, 0xa8c4a8, 0xd4c4b0, 0xb8a0a0, 0xd0c0a0, 0x90a8c0];
const TOWNSFOLK_HATS = [0x8b7355, 0xa09070, 0x7a6550, 0x9a8565, 0x6a5a4a];
const TOWNSFOLK_PANTS = [0x5a6a5a, 0x8a7a6a, 0x4a5a4a, 0x7a6a5a, 0x6a706a];

function outfitFor(kind) {
  const o = { ...OUTFITS[kind] || OUTFITS.bandit };
  if (kind === 'bandit') {
    const r = a => a[Math.random() * a.length | 0];
    o.shirt = r(BANDIT_SHIRTS); o.scarf = r(BANDIT_SCARF); o.hat = r(BANDIT_HATS); o.pants = r(BANDIT_PANTS);
    o.vest_on = Math.random() < .7 ? 1 : 0; o.beard = Math.random() < .6 ? 1 : 0; o.sleeves = Math.random() < .5 ? .70 : .52;
  } else if (kind === 'townsfolk') {
    const r = a => a[Math.random() * a.length | 0];
    o.shirt = r(TOWNSFOLK_SHIRTS); o.hat = r(TOWNSFOLK_HATS); o.pants = r(TOWNSFOLK_PANTS);
    o.vest_on = Math.random() < .5 ? 1 : 0; o.beard = Math.random() < .4 ? 1 : 0; o.sleeves = Math.random() < .5 ? .70 : .52;
  }
  return o;
}

const GLSL_REGIONS = /* glsl */`
uniform vec3 uShirt, uVest, uPants, uBoots, uBelt, uScarf;
uniform float uSleeve, uVestOn, uMask, uNecker, uGloves;
// 返回: rgb 颜色, a = 布料程度(0 皮肤 1 布)；rough 输出粗糙度
vec4 cowRegion(vec3 p, out float rough, out float inflate) {
  float ax = abs(p.x), y = p.y;
  vec3 col = vec3(-1.0); float cloth = 0.0; rough = 0.9; inflate = 0.0;
  bool arm = ax > 0.215 && y > 1.18;
  if (arm) {
    if (ax < uSleeve) { col = uShirt; cloth = 1.0; inflate = 0.012; }
    else if (uGloves > 0.5 && ax > 0.66) { col = vec3(0.09,0.06,0.045); cloth = 1.0; rough = 0.6; inflate = 0.004; }
  } else if (y > 1.505) {
    // 头和脖子
    bool front = p.z > -0.015;
    if (uMask > 0.5 && y < 1.645 && y > 1.505 && front) { col = uScarf; cloth = 1.0; inflate = 0.014 + 0.01 * smoothstep(1.62, 1.55, y); }
    else if (uNecker > 0.5 && y < 1.565) { col = uScarf; cloth = 1.0; inflate = 0.016; }
    else if (uMask > 0.5 && y < 1.565) { col = uScarf; cloth = 1.0; inflate = 0.016; }
  } else if (y > 1.0) {
    // 上身：衬衫 + 马甲
    col = uShirt; cloth = 1.0; inflate = 0.018;
    bool collar = y > 1.45 && ax < 0.08;
    if (collar) inflate = 0.018;
    float open = (p.z > 0.0) ? smoothstep(1.06, 1.40, y) * 0.05 + 0.012 : -1.0;
    bool armhole = ax > 0.165 && y > 1.30;
    if (uVestOn > 0.5 && y < 1.43 && !armhole && ax > open) { col = uVest; rough = 0.75; inflate = 0.022; }
  } else if (y > 0.925) {
    col = uBelt; cloth = 1.0; rough = 0.5; inflate = 0.02;
    if (p.z > 0.05 && ax < 0.032 && y > 0.94 && y < 0.99) { col = vec3(0.75, 0.55, 0.22); rough = 0.3; }
  } else if (y > 0.40) {
    col = uPants; cloth = 1.0; inflate = 0.013;
    // 裤子膝盖/屁股 磨旧
    if (y < 0.62 && y > 0.46 && p.z > 0.0) col *= 1.12;
  } else {
    col = uBoots; cloth = 1.0; rough = 0.55; inflate = 0.018;
    if (y > 0.34) inflate = 0.026;           // 靴筒口
    if (y < 0.035) col *= 0.55;              // 鞋底
  }
  return vec4(col, cloth);
}
float cowHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cowNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(cowHash(i),cowHash(i+vec2(1,0)),f.x), mix(cowHash(i+vec2(0,1)),cowHash(i+vec2(1,1)),f.x), f.y); }
`;

function dressMaterial(src, o) {
  const m = src.clone();
  m.roughness = 1; m.metalness = 0;
  m.envMapIntensity = 0.8;
  const U = {
    uShirt: { value: new THREE.Color(o.shirt) }, uVest: { value: new THREE.Color(o.vest) }, uPants: { value: new THREE.Color(o.pants) },
    uBoots: { value: new THREE.Color(o.boots) }, uBelt: { value: new THREE.Color(o.belt) }, uScarf: { value: new THREE.Color(o.scarf) },
    uSleeve: { value: o.sleeves }, uVestOn: { value: o.vest_on }, uMask: { value: o.mask }, uNecker: { value: o.neckerchief }, uGloves: { value: o.gloves },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\n' + GLSL_REGIONS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position;
        { float rr, inf; cowRegion(position, rr, inf); transformed += normal * inf; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nfloat gCloth; float gRough;\n' + GLSL_REGIONS)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float inf; vec4 rc = cowRegion(vRest, gRough, inf); gCloth = rc.a;
          if (rc.a > 0.5) {
            float n = cowNoise(vRest.xy * 180.0) * 0.5 + cowNoise(vRest.xy * 37.0 + 3.1) * 0.5;
            float weave = 0.9 + 0.12 * n;
            // 布料受光 + 磨损：越往下越脏（沙土）
            vec3 dust = vec3(0.62, 0.50, 0.36);
            vec3 c = rc.rgb * weave;
            c = mix(c, dust * 0.8, smoothstep(0.55, 0.0, vRest.y) * 0.35 * n);
            diffuseColor.rgb = c;
          } else {
            // 皮肤：晒黑一点，暖一点
            diffuseColor.rgb *= vec3(1.0, 0.86, 0.74);
          }
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gCloth > 0.5 ? gRough : 0.62;`)
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (gCloth > 0.5 ? 0.06 : 1.0);');
  };
  m.customProgramCacheKey = () => 'cowboy-dress';
  m.userData.U = U;
  return m;
}

// 牛仔帽：车削出帽冠，帽檐两侧上卷
function makeHat(color, bandColor) {
  const felt = new THREE.MeshStandardMaterial({ color, roughness: .95, metalness: 0 });
  const band = new THREE.MeshStandardMaterial({ color: bandColor, roughness: .7 });
  const g = new THREE.Group();
  // 帽檐：环形，外圈两侧上卷，前后略下压
  const brimGeo = new THREE.RingGeometry(0.105, 0.235, 40, 3); brimGeo.rotateX(-Math.PI / 2);
  const p = brimGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), k = THREE.MathUtils.smoothstep(r, .13, .235);
    const side = (x / Math.max(r, 1e-4)) ** 2, fb = (z / Math.max(r, 1e-4)) ** 2;
    p.setY(i, k * (side * 0.075 - fb * 0.018));
    p.setZ(i, z * 1.08);
  }
  brimGeo.computeVertexNormals();
  // 给帽檐一点厚度：上下两层
  felt.side = THREE.DoubleSide;
  // 帽冠：车削，带凹痕
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.112 - 0.02 * t * t, t * 0.13)); }
  pts.push(new THREE.Vector2(0.06, 0.142), new THREE.Vector2(0.0, 0.128));
  const crownGeo = new THREE.LatheGeometry(pts, 32);
  const cp = crownGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    cp.setZ(i, z * 1.12);
    // 顶上中间一道凹（cattleman 折）
    if (y > 0.1) cp.setY(i, y - Math.max(0, 0.03 - Math.abs(x) * 0.4) * THREE.MathUtils.smoothstep(y, .1, .14));
    // 前面两侧捏痕
    if (z > 0.04 && y > 0.08) cp.setX(i, x * (1 - 0.12 * THREE.MathUtils.smoothstep(y, .08, .13)));
  }
  crownGeo.computeVertexNormals();
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.1135, 0.114, 0.026, 32, 1, true), band);
  ribbon.scale.z = 1.12; ribbon.position.y = 0.016;
  const bb = brimGeo.clone(); bb.translate(0, -0.008, 0);
  const feltMesh = new THREE.Mesh(mergeGeometries([brimGeo, bb, crownGeo.index ? crownGeo.toNonIndexed() : crownGeo].map(x => x.index ? x.toNonIndexed() : x)), felt);
  g.add(feltMesh, ribbon);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function findBone(root, name) { let b = null; root.traverse(o => { if (!b && o.isBone && o.name === name) b = o; }); return b; }

// 人物：kind = 'player' | 'bandit' | 'boss'
export function character(kind = 'bandit') {
  const g = A.cowboy;
  const model = SkeletonUtils.clone(g.scene);
  const o = outfitFor(kind);
  const root = new THREE.Group();
  root.add(model);
  // 原始单位：米、站在原点、脸朝 +Z
  model.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = true;
    if (m.isSkinnedMesh) { m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6); }
    if (m.name === 'Hair_SimpleParted') { m.visible = !!o.hair; if (o.hair) m.material = hairMat(0x2b1d12); }
    else if (m.name === 'Hair_Beard') { m.visible = !!o.beard && !o.mask; if (m.visible) m.material = hairMat(kind === 'boss' ? 0x1a1410 : 0x3a2818); }
    else if (m.name === 'Eyebrows') m.material = hairMat(0x2a1c12);
    else if (m.material && m.material.name === 'MI_Superhero_Male') m.material = dressMaterial(m.material, o);
  });
  const mixer = new THREE.AnimationMixer(model);
  const acts = {};
  for (const k in CLIPS) acts[k] = mixer.clipAction(CLIPS[k]);
  const bones = {};
  for (const [k, n] of Object.entries({ head: 'Head', neck: 'neck_01', handR: 'hand_r', handL: 'hand_l', spine: 'spine_03', spine1: 'spine_01', pelvis: 'pelvis', root: 'root', footL: 'foot_l', footR: 'foot_r' }))
    bones[k] = findBone(model, n);
  const ch = { kind, root, model, mixer, acts, bones, head: bones.head, hand: bones.handR, cur: null, outfit: o };
  root.updateMatrixWorld(true);
  // ---- 帽子（在绑定姿势下按世界坐标放好，再挂到头骨上）----
  const hat = makeHat(o.hat, o.band);
  hat.position.set(0, 1.735, -0.012); hat.rotation.x = -0.10;
  if (kind === 'boss') hat.scale.setScalar(1.06);
  root.add(hat); root.updateMatrixWorld(true);
  bones.head.attach(hat); ch.hat = hat;
  // ---- 枪（右手，T 姿势：手心朝下，手指朝 -X）----
  if (A.gun_pistol) {
    const gunWrap = fit(new THREE.Mesh(gunGeometry(), GUN_MAT), 0);
    gunWrap.children[0].castShadow = true;
    const pivot = new THREE.Group(); pivot.add(gunWrap);
    // 模型自身的枪管方向在 main 里不再猜：这里统一成 枪管 = 本地 +Z，握把 = 本地 -Y
    gunWrap.rotation.y = GUN_YAW; gunWrap.position.set(0, -0.11, 0.02);
    // 用瞄准动作来校准：在 Pistol_Aim_Neutral 姿势下，让枪管朝角色正前方(+Z)、握把朝下，再挂到右手
    const aim = CLIPS.Pistol_Aim_Neutral && mixer.clipAction(CLIPS.Pistol_Aim_Neutral);
    if (aim) { aim.play(); mixer.update(0.5); }
    root.updateMatrixWorld(true);
    const hp = new THREE.Vector3(), mp = new THREE.Vector3();
    bones.handR.getWorldPosition(hp);
    (findBone(model, 'middle_01_r') || bones.handR).getWorldPosition(mp);
    root.add(pivot);
    pivot.position.copy(hp).lerp(mp, GUN_GRIP.t).add(new THREE.Vector3(GUN_GRIP.x, GUN_GRIP.y, GUN_GRIP.z));
    pivot.rotation.set(GUN_GRIP.pitch, 0, 0);
    root.updateMatrixWorld(true);
    bones.handR.attach(pivot);
    if (aim) { aim.stop(); mixer.uncacheAction(CLIPS.Pistol_Aim_Neutral); }
    model.traverse(m => { if (m.isSkinnedMesh) m.skeleton.pose(); });
    root.updateMatrixWorld(true);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.17); pivot.add(muzzle);
    ch.gun = pivot; ch.muzzle = muzzle;
  }
  return ch;
}
// 枪：把多个材质烘成顶点色，合成一个网格（每个角色只占 1 个 draw call）
let _gunGeo = null;
const GUN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .55 });
function gunGeometry() {
  if (_gunGeo) return _gunGeo;
  const src = A.gun_pistol.scene; src.updateMatrixWorld(true);
  const geos = [];
  src.traverse(m => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
    const groups = g.groups.length ? g.groups : [{ start: 0, count: n, materialIndex: 0 }];
    for (const gr of groups) { c.copy(mats[gr.materialIndex || 0].color).multiplyScalar(/Wood/.test(mats[gr.materialIndex || 0].name) ? 2.2 : 1.6); for (let i = gr.start; i < gr.start + gr.count; i++) col.set([c.r, c.g, c.b], i * 3); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.clearGroups(); geos.push(g);
  });
  _gunGeo = mergeGeometries(geos, false);
  const box = new THREE.Box3().setFromBufferAttribute(_gunGeo.attributes.position), sz = box.getSize(new THREE.Vector3());
  _gunGeo.scale(0.27 / Math.max(sz.x, sz.y, sz.z), 0.27 / Math.max(sz.x, sz.y, sz.z), 0.27 / Math.max(sz.x, sz.y, sz.z));
  return _gunGeo;
}
// gun_pistol.glb 的枪管朝向：截图校准后的常量（模型枪管沿 +X）
export const GUN_YAW = -Math.PI / 2;
export const GUN_GRIP = { t: 0.55, x: 0, y: -0.01, z: 0, pitch: 0 };

function hairMat(color) { return new THREE.MeshStandardMaterial({ color, roughness: .85, side: THREE.DoubleSide }); }

// 让角色的骨盆落在某个世界坐标上（骑马时用）；每帧在 mixer.update 之后调用
const _pw = new THREE.Vector3();
export function alignPelvis(ch, target) {
  ch.root.updateMatrixWorld(true);
  ch.bones.pelvis.getWorldPosition(_pw);
  ch.root.position.add(_v.subVectors(target, _pw));
}

// ======================================================================
// 马：写实马模型 Lyndon Daniels「Realtime Rancher's」（CC0）绑定到 Quaternius Animated Animal Pack 骨架（CC0），
// 用 Quaternius 的动作（构建脚本见 tools/horse_build.mjs）；马鞍 / 笼头 / 缰绳为程序生成
// 动作：Idle Idle_2 Walk Gallop Death Eating Idle_HitReact1 Gallop_Jump Idle_Headlow
// ======================================================================
export function horse() {
  const g = A.horse;
  const model = SkeletonUtils.clone(g.scene);
  // 尺寸：马肩高约 1.6m（模型单位 × HORSE_SCALE）
  const root = new THREE.Group(); root.add(model);
  model.scale.multiplyScalar(HORSE_SCALE);
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  box.setFromObject(model, true);
  model.position.y -= box.min.y;
  // 让马头朝 +Z（与人物一致）
  const sz2 = box.getSize(new THREE.Vector3());
  if (sz2.x > sz2.z) model.rotation.y = HORSE_YAW;
  model.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    m.material = mats.map(mt => { const c = mt.clone(); c.roughness = /Hair/.test(c.name) ? .85 : /Eye/.test(c.name) ? .12 : .6; c.metalness = 0; c.envMapIntensity = /Eye/.test(c.name) ? 1.2 : .75; return c; });
    if (m.material.length === 1) m.material = m.material[0];
  });
  const mixer = new THREE.AnimationMixer(model);
  const acts = {};
  for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
  const bones = {};
  for (const n of ['Body', 'Torso', 'Torso2', 'Torso3', 'Back', 'Neck1', 'Head']) bones[n] = findBone(model, n);
  root.updateMatrixWorld(true);
  // ---- 马鞍：放在背最高点稍后 ----
  const bb = new THREE.Box3().setFromObject(model, true);
  const back = findBackTop(model, bb);
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: .55 });
  const blanket = new THREE.MeshStandardMaterial({ color: 0x8a3a22, roughness: .95 });
  const saddle = new THREE.Group();
  // 鞍毯 / 鞍裙：沿马背的弧形壳（圆柱面一段），贴合背部
  const shell = (r, len, half, mat, y = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true, Math.PI - half, half * 2), mat);
    m.material.side = THREE.DoubleSide; m.rotation.x = Math.PI / 2; m.position.y = y - r; return m;
  };
  const pad = shell(.3, .8, 1.12, blanket, .012);
  const skirt = shell(.312, .6, .92, leather, .03);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), leather);
  seat.scale.set(.6, .26, .95); seat.position.y = .02;
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(.022, .03, .13, 10), leather); horn.position.set(0, .1, .27);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.04, .035, .02, 12), leather); cap.position.set(0, .17, .27);
  const cantle = new THREE.Mesh(new THREE.TorusGeometry(.13, .03, 8, 16, Math.PI), leather); cantle.position.set(0, .04, -.24); cantle.scale.set(1, .8, 1);
  const flapL = new THREE.Mesh(new THREE.BoxGeometry(.016, .34, .17), leather); flapL.position.set(.3, -.3, .03); flapL.rotation.z = .22;
  const flapR = flapL.clone(); flapR.position.x = -.3; flapR.rotation.z = -.22;
  const stirL = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: .2, roughness: .6 }));
  stirL.position.set(.34, -.55, .05); stirL.rotation.y = Math.PI / 2;
  const stirR = stirL.clone(); stirR.position.x = -.34;
  saddle.add(pad, skirt, seat, horn, cap, cantle, flapL, flapR, stirL, stirR);
  saddle.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  saddle.position.copy(back.pos); saddle.position.y += .01;
  saddle.rotation.y = back.yaw;
  root.add(saddle); root.updateMatrixWorld(true);
  const carrier = bones.Torso2 || bones.Torso || bones.Body;
  if (carrier) carrier.attach(saddle);
  // 骑手骨盆的目标点（马鞍上方）
  const seatAnchor = new THREE.Object3D(); seatAnchor.position.set(0, .14, -.05); saddle.add(seatAnchor);
  const hornTip = new THREE.Object3D(); hornTip.position.set(0, .16, .3); saddle.add(hornTip);
  // ---- 笼头（挂头骨）+ 衔铁两侧挂点（缰绳端点）----
  const bridle = makeBridle(leather);
  const bits = bridle.bits;
  root.add(bridle.g); root.updateMatrixWorld(true);
  if (bones.Head) bones.Head.attach(bridle.g);
  return { root, model, mixer, acts, bones, saddle, seat: seatAnchor, horn: hornTip, bits, cur: null, height: bb.max.y };
}
export const HORSE_YAW = 0;
export const HORSE_SCALE = 0.468;
// 模型（Quaternius 骨架空间）坐标：写实马 OBJ 坐标 × 0.43、y+5 → 这里直接给出马头附近的点（绑定前静止姿态）
const HQ = (x, y, z) => new THREE.Vector3(x * .43, (y + 5) * .43, z * .43).multiplyScalar(HORSE_SCALE);
function makeBridle(leather) {
  const g = new THREE.Group();
  const strap = (a, b, w = .018) => {     // 两点之间的皮带（扁盒）
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.BoxGeometry(w, .006, d.length()), leather);
    m.position.copy(a).addScaledVector(d, .5); m.lookAt(b); g.add(m); return m;
  };
  const ring = (c, rx, rz, tilt) => {      // 鼻革：椭圆环
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 5, 20), leather);
    m.scale.set(rx, rz, 1); m.position.copy(c); m.rotation.x = Math.PI / 2 + tilt; g.add(m);
  };
  for (const s of [1, -1]) {
    const bit = HQ(s * .47, 1.25, 7.65), crown = HQ(s * .62, 4.0, 6.75), nose = HQ(s * .5, 2.0, 7.55), brow = HQ(s * .55, 3.85, 7.15), throat = HQ(s * .55, 2.6, 6.2);
    strap(bit, nose); strap(nose, crown); strap(brow, crown, .014); strap(crown, throat, .012);
  }
  strap(HQ(.62, 4.0, 6.75), HQ(-.62, 4.0, 6.75)); strap(HQ(.55, 3.85, 7.15), HQ(-.55, 3.85, 7.15), .014);
  strap(HQ(.55, 2.6, 6.2), HQ(-.55, 2.6, 6.2), .012);
  ring(HQ(0, 1.95, 7.62), .5 * .43 * HORSE_SCALE, .5 * .43 * HORSE_SCALE, -.25);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: .8, roughness: .35 });
  const bits = [];
  for (const s of [1, -1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.028, .005, 5, 12), metal); r.position.copy(HQ(s * .49, 1.25, 7.65)); r.rotation.y = Math.PI / 2; g.add(r);
    const o = new THREE.Object3D(); o.position.copy(r.position); g.add(o); bits.push(o);
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { g, bits };
}

const SADDLE_T = -0.045;   // 0 = 身体包围盒中点，正数朝马头
// 沿身体中线找背部最高点（马鞍位置），身体中段
function findBackTop(model, bb) {
  const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  const alongZ = size.z >= size.x;
  let best = null;
  const v = new THREE.Vector3();
  model.traverse(m => {
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      const t = alongZ ? (v.z - c.z) / size.z : (v.x - c.x) / size.x;   // -0.5..0.5
      const lat = alongZ ? Math.abs(v.x - c.x) : Math.abs(v.z - c.z);
      if (t > SADDLE_T - 0.03 && t < SADDLE_T + 0.03 && lat < 0.06 && (!best || v.y > best.y)) best = v.clone();
    }
  });
  if (!best) best = new THREE.Vector3(c.x, bb.max.y * .7, c.z);
  return { pos: best, yaw: alongZ ? 0 : Math.PI / 2 };
}

// 骑马时把两腿分开跨在马背上（Driving 动作原本是双腿并拢）；每帧在 mixer.update 之后调用
const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ax = new THREE.Vector3();
export function straddle(ch, amount = 0.5) {
  if (!ch.bones.thighL) { ch.bones.thighL = findBone(ch.model, 'thigh_l'); ch.bones.thighR = findBone(ch.model, 'thigh_r'); ch.bones.calfL = findBone(ch.model, 'calf_l'); ch.bones.calfR = findBone(ch.model, 'calf_r'); }
  ch.root.updateMatrixWorld(true);
  _ax.set(0, 0, 1).transformDirection(ch.root.matrixWorld);     // 人物前方
  for (const [b, s] of [[ch.bones.thighL, 1], [ch.bones.thighR, -1]]) {
    if (!b) continue;
    b.parent.getWorldQuaternion(_qp);
    _qa.setFromAxisAngle(_ax, s * amount);
    // local = parent^-1 * world_rot * parent * local
    const inv = _qp.clone().invert();
    b.quaternion.premultiply(inv.multiply(_qa).multiply(_qp));
  }
}
