// shared helpers: toon material, outline material, geometry merger with vertex colors
import * as THREE from 'three';

let RAMP = null;
export function toonRamp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([105, 95, 125, 255, 165, 160, 180, 255, 225, 225, 230, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.needsUpdate = true;
  return RAMP;
}
let VMAT = null;
export function vcMat() { return VMAT || (VMAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })); }
export function toonMat(color, extra = {}) { return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...extra }); }

// inverted-hull outline: vertices pushed along normals, back faces only
const OUT = {};
export function outlineMat(w = 0.05, color = 0x1a1022) {
  const k = w + ':' + color; if (OUT[k]) return OUT[k];
  return (OUT[k] = new THREE.ShaderMaterial({
    uniforms: { w: { value: w }, c: { value: new THREE.Color(color) } },
    vertexShader: `uniform float w;
#include <common>
#ifdef USE_INSTANCING
#endif
void main(){ vec3 p = position + normalize(normal) * w;
#ifdef USE_INSTANCING
 vec4 mv = modelViewMatrix * instanceMatrix * vec4(p,1.0);
#else
 vec4 mv = modelViewMatrix * vec4(p,1.0);
#endif
 gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; void main(){ gl_FragColor = vec4(c,1.0); }`,
    side: THREE.BackSide,
  }));
}

// matrix helper
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
// merge primitive pieces into one non-indexed geometry with per-vertex colors
export class Builder {
  static noOut = false;
  constructor() { this.parts = []; }
  add(geo, m, color, noOut = Builder.noOut) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); this.parts.push({ g, c: new THREE.Color(color), noOut }); return this; }
  // returns the full coloured geometry; geo.userData.outline holds a lighter copy without surface details (no outline needed for those)
  build() {
    const det = this.parts.filter(p => p.noOut);
    let outline = null;
    if (det.length) { let n = 0; const keep = this.parts.filter(p => !p.noOut); for (const p of keep) n += p.g.attributes.position.count; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0; for (const { g } of keep) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; } outline = new THREE.BufferGeometry(); outline.setAttribute('position', new THREE.BufferAttribute(pos, 3)); outline.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); outline.computeBoundingSphere(); }
    let n = 0; for (const p of this.parts) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const { g, c } of this.parts) {
      const cnt = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += cnt; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere(); if (outline) geo.userData.outline = outline; this.parts = []; return geo;
  }
}
// mesh + outline child
export function outlined(geo, mat, w = 0.05) {
  const m = new THREE.Mesh(geo, mat || vcMat());
  const o = new THREE.Mesh(geo.userData.outline || geo, outlineMat(w)); o.renderOrder = -1; m.add(o);
  return m;
}
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
