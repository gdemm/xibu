// 派对突击 look: toon materials with boosted colours, gradient sky dome and puffy cartoon clouds.
import * as THREE from 'three';
import { toonRamp } from './critter.js';

const _hsl = {};
function boost(c) { c.getHSL(_hsl); c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.35 + 0.08), Math.min(0.92, _hsl.l * 1.08 + 0.02)); return c; }
const cache = new Map();
function toToon(m) {
  if (!m || !m.isMeshLambertMaterial) return m;
  let t = cache.get(m); if (t) return t;
  t = new THREE.MeshToonMaterial({ color: boost(m.color.clone()), map: m.map, gradientMap: toonRamp(), transparent: m.transparent, opacity: m.opacity, vertexColors: m.vertexColors, side: m.side });
  if (m.emissive) { t.emissive.copy(m.emissive); t.emissiveIntensity = m.emissiveIntensity; }
  if (m.polygonOffset) { t.polygonOffset = true; t.polygonOffsetFactor = m.polygonOffsetFactor; t.polygonOffsetUnits = m.polygonOffsetUnits; }
  cache.set(m, t); return t;
}
export function toonify(root) {
  root.traverse(o => { if (!o.isMesh) return; o.material = Array.isArray(o.material) ? o.material.map(toToon) : toToon(o.material); });
}

let CLOUD = null;
function cloudGeo() {
  if (CLOUD) return CLOUD;
  const parts = [], base = new THREE.IcosahedronGeometry(1, 1);
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 16; c++) {
    const a = r() * Math.PI * 2, d = 120 + r() * 170, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 95 + r() * 35, s = 7 + r() * 6;
    const n = 4 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const g = base.clone(); const k = s * (0.7 + r() * 0.6); g.scale(k * 1.3, k * 0.75, k);
      g.translate(cx + (i - n / 2) * s * 0.9, cy + r() * s * 0.4, cz + (r() - 0.5) * s); parts.push(g);
    }
  }
  const pos = [], nor = [];
  for (const g of parts) { const ng = g.index ? g.toNonIndexed() : g; pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); ng.dispose(); if (ng !== g) g.dispose(); }
  CLOUD = new THREE.BufferGeometry(); CLOUD.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); CLOUD.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  CLOUD.computeBoundingSphere();
  return CLOUD;
}

export function partyLook(scene, quality, kind) {
  toonify(scene);
  scene.background = new THREE.Color(0x8fd3ff);
  // gradient sky dome that follows the camera
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3fa9ff) }, mid: { value: new THREE.Color(0x9fdcff) }, bot: { value: new THREE.Color(0xd9f3ff) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  if (kind === 'island') {
    const clouds = new THREE.Mesh(cloudGeo(), new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xb8d8f0, emissiveIntensity: 0.45, gradientMap: toonRamp(), fog: false }));
    // the camera far plane now ends just past the fog: clamp the far clouds onto it instead of clipping them
    clouds.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99998);'); };
    clouds.frustumCulled = false; scene.add(clouds);
  }
  return sky;
}
