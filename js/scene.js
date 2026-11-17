// 场景：渲染器、天空/环境光、太阳、地形、红石镇、碰撞
import * as THREE from 'three';
import { A, T, fit, instanced, merged } from './assets.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export const TOWN = new THREE.Vector3(0, 0, 7);
// 天空图里太阳在方位 (0.83, *, 0.55)；灯光抬高到 ~17° 让阴影长而不夸张
export const SUN_DIR = new THREE.Vector3(0.80, 0.31, 0.53).normalize();

function noise(x, z) {
  return Math.sin(x * .021 + 1.3) * Math.cos(z * .017) * 2.2 + Math.sin(x * .053 + z * .041) * 1.1 + Math.sin(z * .09 - x * .03) * .5;
}
export function terrainH(x, z) {
  const d = Math.hypot(x - TOWN.x, (z - TOWN.z) * 1.3);
  const k = THREE.MathUtils.smoothstep(d, 48, 110);
  // 远处起伏更大，形成沙丘与小山
  const far = THREE.MathUtils.smoothstep(d, 140, 280);
  return (noise(x, z) + 2.5) * k + far * (Math.sin(x * .011) * Math.cos(z * .013) * 6 + 5);
}

export const boxes = [];        // {minX,maxX,minZ,maxZ,minY,maxY,b}
export const floors = [];
export const solidMeshes = [];
export const tumbleweeds = [];

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd8a676, 0.0032);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);

  const hemi = new THREE.HemisphereLight(0xd8d6e6, 0xa0704a, 0.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc68a, 3.4);
  sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  return { renderer, scene, camera, sun, hemi };
}

// 天空背景 + 由天空图生成的环境光照；太阳光晕 sprite（触发泛光）
export function setupSky(renderer, scene) {
  if (T.sky) {
    T.sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = T.sky; scene.backgroundIntensity = 0.95;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(T.sky).texture; pm.dispose();
    scene.environmentIntensity = 0.6;
  } else scene.background = new THREE.Color(0xe9b98a);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.12, 'rgba(255,240,210,.9)'); r.addColorStop(.35, 'rgba(255,190,120,.25)'); r.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(4, 3, 2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  glow.scale.setScalar(160); glow.renderOrder = -1;
  scene.add(glow);
  return glow;
}

export function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(1200, 1200, 180, 180); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const a = new THREE.Color(1.0, 0.93, 0.84), b = new THREE.Color(0.86, 0.72, 0.58), red = new THREE.Color(0.95, 0.7, 0.55);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrainH(x, z);
    pos.setY(i, y);
    const n = (Math.sin(x * .031) * Math.sin(z * .027) + Math.sin(x * .007 + z * .011)) * .25 + .5;
    c.copy(a).lerp(b, n);
    c.lerp(red, THREE.MathUtils.smoothstep(y, 4, 12) * .6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const rep = 1200 / 7;
  // 沙地：不用粗糙度贴图（掠射角会反出天空的青色），环境反射压低
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: T.sand || null, normalMap: T.sandN || null, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.45 });
  for (const t of [T.sand, T.sandN]) if (t) t.repeat.set(rep, rep);
  // 远处去掉贴图重复感：按距离混合一层低频颜色
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float d = distance(vWp, cameraPosition);
          vec4 far = texture2D(map, vMapUv * 0.09);
          diffuseColor.rgb = mix(diffuseColor.rgb, far.rgb * vColor.rgb * 1.05, smoothstep(25.0, 90.0, d) * 0.7); }`);
  };
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true; scene.add(ground);
  // 主街：压实的土路，边缘柔和过渡
  if (T.dirt) {
    const sg = new THREE.PlaneGeometry(76, 15, 1, 1); sg.rotateX(-Math.PI / 2);
    const td = T.dirt.clone(), tn = T.dirtN.clone(); td.needsUpdate = tn.needsUpdate = true;
    td.repeat.set(9, 1.8); tn.repeat.set(9, 1.8);
    const sm = new THREE.MeshStandardMaterial({ map: td, normalMap: tn, roughness: 1, envMapIntensity: .45, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0xe8d6c0 });
    sm.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv;')
        .replace('#include <alphatest_fragment>', `float ex = smoothstep(0.0, 0.06, vSUv.x) * smoothstep(1.0, 0.94, vSUv.x);
          float ez = smoothstep(0.0, 0.22, vSUv.y) * smoothstep(1.0, 0.78, vSUv.y);
          diffuseColor.a *= ex * ez * (0.75 + 0.25 * texture2D(map, vSUv * 3.1).r);
          #include <alphatest_fragment>`);
    };
    const street = new THREE.Mesh(sg, sm); street.position.set(1, 0.03, TOWN.z); street.receiveShadow = true; street.renderOrder = 1;
    scene.add(street);
  }
}

// ---------------- 碰撞 ----------------
function addBox(b) {
  const h = b.max.y - b.min.y, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
  if (b.min.y > 1.7) return;
  if (w * d > 160) return;
  if (h < 0.65 && b.max.y < 0.7) { floors.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, y: b.max.y }); return; }
  boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: b.min.y, maxY: b.max.y, b: b.clone() });
}
export function floorAt(x, z) {
  let y = terrainH(x, z);
  for (const f of floors) if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ && f.y > y) y = f.y;
  return y;
}
export function collide(p, r, feetY) {
  for (const b of boxes) {
    if (feetY + 0.35 > b.maxY || feetY + 1.7 < b.minY) continue;
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else {
        const ex = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z], m = Math.min(...ex), i = ex.indexOf(m);
        if (i === 0) p.x = b.minX - r; else if (i === 1) p.x = b.maxX + r; else if (i === 2) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  const lim = 290; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim + TOWN.z, Math.min(lim + TOWN.z, p.z));
}
const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
export function boxRayDist(o, d, maxD) {
  _ray.origin.copy(o); _ray.direction.copy(d); let best = maxD;
  for (const b of boxes) if (_ray.intersectBox(b.b, _hit)) { const t = _hit.distanceTo(o); if (t < best) best = t; }
  return best;
}
const raycaster = new THREE.Raycaster();
export function worldRay(o, d, maxD) {
  raycaster.set(o, d); raycaster.far = maxD;
  const h = raycaster.intersectObjects(solidMeshes, false);
  return h.length ? h[0] : null;
}
export function worldRayDist(o, d, maxD) { const h = worldRay(o, d, maxD); return h ? h.distance : maxD; }
// 地面射线（打到沙地也要扬尘）
export function groundRayDist(o, d, maxD) {
  if (d.y >= -1e-4) return maxD;
  let t = 0, step = 2;
  for (let i = 0; i < 120 && t < maxD; i++) {
    const y = o.y + d.y * t, gy = terrainH(o.x + d.x * t, o.z + d.z * t);
    if (y < gy) { let a = t - step, b = t; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; (o.y + d.y * m < terrainH(o.x + d.x * m, o.z + d.z * m)) ? b = m : a = m; } return b; }
    t += step;
  }
  return maxD;
}

function mergeTown(scene) {
  const groups = new Map();
  for (const o of solidMeshes) {
    if (!o.isMesh || o.isInstancedMesh) continue;
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { mat: o.material, list: [] });
    groups.get(key).list.push(o);
  }
  const merged = [];
  for (const { mat, list } of groups.values()) {
    const geos = [];
    for (const o of list) {
      const g = new THREE.BufferGeometry(), src = o.geometry;
      for (const name of ['position', 'normal', 'uv']) {
        const a = src.attributes[name], n = name === 'uv' ? 2 : 3, cnt = src.attributes.position.count;
        const arr = new Float32Array(cnt * n);
        if (a) for (let i = 0; i < cnt; i++) { arr[i * n] = a.getX(i); arr[i * n + 1] = a.getY(i); if (n === 3) arr[i * n + 2] = a.getZ(i); }
        g.setAttribute(name, new THREE.BufferAttribute(arr, n));
      }
      if (src.index) g.setIndex(Array.from(src.index.array));
      g.applyMatrix4(o.matrixWorld);
      if (!src.attributes.normal) g.computeVertexNormals();
      geos.push(g);
    }
    const allIdx = geos.every(g => g.index), noneIdx = geos.every(g => !g.index);
    if (!allIdx && !noneIdx) geos.forEach((g, i) => { if (g.index) geos[i] = g.toNonIndexed(); });
    const mg = mergeGeometries(geos, false);
    if (!mg) continue;
    // 木头、土坯更粗糙一些，减少塑料感
    const m2 = mat.clone(); m2.roughness = Math.max(m2.roughness ?? 1, /glass|brass|gilt|iron/.test(mat.name) ? .3 : .85); m2.envMapIntensity = .7;
    if (m2.transmission > 0) { m2.transmission = 0; m2.transparent = true; m2.opacity = .45; m2.depthWrite = false; }   // 透射会多渲染一整遍场景，手机吃不消
    const m = new THREE.Mesh(mg, m2); m.castShadow = m.receiveShadow = true; scene.add(m); merged.push(m);
    for (const o of list) o.visible = false;
  }
  solidMeshes.length = 0; solidMeshes.push(...merged);
}

export function buildWorld(scene) {
  const mk = (rot, dz, dx, hide) => {
    const s = A.main_street.scene.clone(true);
    s.rotation.y = rot; s.position.set(dx, 0, dz);
    s.traverse(o => { if (hide && hide.some(h => o.name.startsWith(h))) o.visible = false; });
    scene.add(s); s.updateMatrixWorld(true);
    s.traverse(o => {
      if (!o.isMesh) return;
      let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      o.castShadow = true; o.receiveShadow = true;
      if (/batwing|swing-doors/.test(o.name) || /batwing|swing-doors/.test(o.parent?.name || '')) return;
      solidMeshes.push(o);
      addBox(new THREE.Box3().setFromObject(o));
    });
  };
  mk(0, 0, 0, []);
  mk(Math.PI, 14, 2, ['056-', '060-', '061-']);
  mergeTown(scene);

  const R = (a, b) => a + Math.random() * (b - a);
  const scatter = (n, rMin, rMax, avoidTown = 40) => {
    const out = [];
    while (out.length < n) {
      const a = Math.random() * Math.PI * 2, r = R(rMin, rMax), x = TOWN.x + Math.cos(a) * r, z = TOWN.z + Math.sin(a) * r;
      if (Math.abs(x) < avoidTown && Math.abs(z - TOWN.z) < 24) continue;
      out.push({ x, z, y: terrainH(x, z) - 0.05, r: Math.random() * 6.28 });
    }
    return out;
  };
  const cac = scatter(90, 30, 270);
  // 野外散布的道具不投影（实例包围球覆盖全图，投影会每帧全画一遍）
  const ns = { shadow: false };
  instanced('cactus1', cac.slice(0, 30).map(t => ({ ...t, s: R(.8, 1.4) })), 4, scene, ns);
  instanced('cactus3', cac.slice(30, 60).map(t => ({ ...t, s: R(1.1, 1.8) })), 2.4, scene, ns);
  instanced('cactus2', cac.slice(60).map(t => ({ ...t, s: R(.9, 1.5) })), 0.9, scene, ns);
  instanced('rock1', scatter(60, 25, 270).map(t => ({ ...t, s: R(.7, 2.8) })), 1.2, scene, ns);
  const mesas = [];
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + R(-.08, .08), r = R(300, 360);
    const x = TOWN.x + Math.cos(a) * r, z = TOWN.z + Math.sin(a) * r;
    mesas.push({ x, z, y: terrainH(x, z) - 1, r: R(0, 6.28), s: R(5, 9) });
  }
  instanced('mesa', mesas, 7, scene, { shadow: false });
  const cover = [
    ['barrel', -14, 4], ['barrel', -13.2, 4.6], ['barrel', 15, 9], ['barrel', -3, 9.6], ['barrel', 20, 5],
    ['crate', -6, 10.5], ['crate', -5.2, 10.8], ['crate', 4, 5.5], ['crate', 24, 10], ['crate', -20, 9],
    ['hay', -9, 7.4], ['hay', 13, 3.5], ['wagon', -22, 4], ['wagon', 27, 12], ['wheel', -24, 7],
  ];
  const byKey = {};
  for (const [k, x, z] of cover) (byKey[k] ||= []).push({ x, z, r: Math.random() * 6.28 });
  const H = { barrel: .9, crate: .62, hay: .6, wagon: 2.3, wheel: 1.4 };
  for (const k in byKey) {
    const ims = instanced(k, byKey[k], H[k], scene);
    const proto = fit(A[k].scene.clone(true), H[k]); const pb = new THREE.Box3().setFromObject(proto);
    for (const t of byKey[k]) {
      const hx = Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2 * 0.8;
      const b = new THREE.Box3(new THREE.Vector3(t.x - hx, 0, t.z - hx), new THREE.Vector3(t.x + hx, H[k], t.z + hx));
      boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: 0, maxY: H[k], b });
    }
    solidMeshes.push(...ims);
  }
  if (A.tumble) for (let i = 0; i < 5; i++) {
    const t = fit(merged(A.tumble.scene), 0.9);
    t.traverse(o => { if (o.isMesh) o.castShadow = true; });
    t.position.set(R(-60, 60), 0, TOWN.z + R(-40, 40)); t.userData.v = R(2, 4.5);
    scene.add(t); tumbleweeds.push(t);
  }
}
