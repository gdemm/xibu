// 天气系统: 晴 / 小雨 / 暴风雨 / 大雾 — picked per match. Cheap on phones: rain is ONE LineSegments draw call animated
// entirely in the vertex shader (no per-frame buffer upload); the rest is tinting lights / fog / sky that already exist.
import * as THREE from 'three';
export const WEATHERS = { clear: '晴', rain: '小雨', storm: '暴风雨', fog: '大雾' };
const GREY = new THREE.Color(0x8a94a4), FOGW = new THREE.Color(0xd4dae2);
let W = null;
export function pickWeather(pref) {
  if (WEATHERS[pref]) return pref;
  const r = Math.random(); return r < 0.45 ? 'clear' : r < 0.7 ? 'rain' : r < 0.85 ? 'storm' : 'fog';
}
export function setupWeather(scene, kind, { hemi, sun, sky, quality, isTouch }) {
  W = { kind, hemi, sun, sky, t: 0, flash: 0, next: 4 + Math.random() * 6, thunderAt: -1, rain: null,
        hi: hemi.intensity, si: sun.intensity };
  if (kind === 'clear') return W;
  const wet = kind === 'rain' || kind === 'storm', dark = kind === 'storm' ? 0.5 : kind === 'rain' ? 0.72 : 0.85;
  const mixTo = kind === 'fog' ? FOGW : GREY, amt = kind === 'storm' ? 0.65 : kind === 'rain' ? 0.45 : 0.6;
  hemi.intensity *= dark; sun.intensity *= dark * (kind === 'fog' ? 0.8 : 0.7); W.hi = hemi.intensity; W.si = sun.intensity;
  if (scene.fog) {
    scene.fog.color.lerp(mixTo, amt);
    if (kind === 'fog') { scene.fog.near = 6; scene.fog.far *= 0.42; }
    else { scene.fog.near *= 0.6; scene.fog.far *= kind === 'storm' ? 0.62 : 0.78; }
  }
  if (scene.background?.isColor) scene.background.lerp(mixTo, amt);
  const u = sky?.material?.uniforms;
  if (u) for (const k of ['top', 'mid', 'bot']) u[k].value.lerp(mixTo, k === 'top' ? amt * 0.9 : amt);
  for (const c of sky?.userData?.clouds || []) { c.material.color.lerp(GREY, amt * 0.8); c.material.emissive?.lerp(GREY, amt * 0.8); }
  if (wet) {
    const n = Math.round((kind === 'storm' ? 1.7 : 1) * ({ low: 500, mid: 800, high: 1200 }[quality] || 800) * (isTouch ? 1 : 1.3));
    const pos = new Float32Array(n * 6), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = Math.random() * 50, y = Math.random() * 26, z = Math.random() * 50;
      pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('e', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, cam: { value: new THREE.Vector3() }, len: { value: kind === 'storm' ? 1.5 : 1.0 }, sp: { value: kind === 'storm' ? 34 : 24 },
                  wind: { value: kind === 'storm' ? 0.35 : 0.12 }, col: { value: new THREE.Color(0xc8d6e8) }, a: { value: kind === 'storm' ? 0.42 : 0.34 } },
      vertexShader: `uniform float t,len,sp,wind; uniform vec3 cam; attribute float e; varying float vA;
        void main(){ vec3 p = position; float y = mod(p.y - t*sp, 26.0);
          vec3 w = vec3(mod(p.x - cam.x + t*sp*wind, 50.0) - 25.0, y - 9.0, mod(p.z - cam.z, 50.0) - 25.0) + cam;
          w += e * vec3(-wind*len, len, 0.0); vA = 1.0 - smoothstep(14.0, 25.0, length(w.xz - cam.xz));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform vec3 col; uniform float a; varying float vA; void main(){ gl_FragColor = vec4(col, a * vA); }` });
    const rain = new THREE.LineSegments(g, m); rain.frustumCulled = false; rain.renderOrder = 20; scene.add(rain); W.rain = rain;
  }
  return W;
}
export function updateWeather(dt, camera, sfx) {
  if (!W) return;
  W.t += dt;
  if (W.rain) { const u = W.rain.material.uniforms; u.t.value = W.t; u.cam.value.copy(camera.position); }
  if (W.kind === 'storm') {
    W.next -= dt;
    if (W.next <= 0) { W.next = 6 + Math.random() * 9; W.flash = 0.22; W.thunderAt = W.t + 0.4 + Math.random() * 1.4; }
    if (W.flash > 0) { W.flash -= dt; const k = W.flash > 0.14 || (W.flash > 0.03 && W.flash < 0.08) ? 3.2 : 1; W.hemi.intensity = W.hi * k; W.sun.intensity = W.si * (k > 1 ? 2 : 1); }
    else if (W.hemi.intensity !== W.hi) { W.hemi.intensity = W.hi; W.sun.intensity = W.si; }
    if (W.thunderAt > 0 && W.t >= W.thunderAt) { W.thunderAt = -1; try { sfx?.thunder?.(); } catch (e) {} }
  }
}
export function clearWeather() { W = null; }
export const weatherKind = () => W?.kind || 'clear';
