// 后期处理：ACES 胶片色调 + 暖高光/冷阴影分离 + 暗角 + 胶片颗粒 + 泛光 + AO + 死神之眼滤镜
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { GTAOPass } from '../vendor/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uDeadeye: { value: 0 }, uHurt: { value: 0 },
    uVignette: { value: 0.38 }, uGrain: { value: 0.035 }, uSlowmo: { value: 0 }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uDeadeye, uHurt, uVignette, uGrain, uSlowmo, uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv, c = uv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / max(uAspect * uAspect * 0.25 + 0.25, 1e-3);
      vec3 col = texture2D(tDiffuse, uv).rgb;
      // 死神之眼 / 慢动作：边缘色差 + 轻微径向模糊
      float edge = smoothstep(0.25, 1.0, r2) * max(uDeadeye, uSlowmo * 0.6);
      if (edge > 0.001) {
        vec2 off = c * 0.012 * edge;
        col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.8);
        col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.8);
        col = mix(col, (col + texture2D(tDiffuse, uv - off * 2.0).rgb + texture2D(tDiffuse, uv - off * 4.0).rgb) / 3.0, edge);
      }
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // 暖高光 / 青蓝阴影（线性空间，亮度按对数感知）
      float t = smoothstep(0.02, 0.6, lum);
      col *= mix(vec3(0.95, 1.0, 1.035), vec3(1.07, 1.0, 0.87), t);
      col = mix(vec3(lum), col, 0.9);                     // 轻微去饱和
      col = col * 1.03 - 0.004;                           // 一点点黑位抬升的反向：更有对比
      // 死神之眼：去饱和 + 棕褐暗红
      if (uDeadeye > 0.001) {
        float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 de = vec3(l2) * vec3(1.25, 0.72, 0.5);
        col = mix(col, de, uDeadeye * 0.88);
      }
      // 暗角
      float vig = mix(uVignette, 0.85, uDeadeye);
      col *= 1.0 - vig * smoothstep(0.15, 1.15, r2);
      // 受伤：边缘泛红
      col = mix(col, vec3(0.35, 0.01, 0.0) * (0.6 + lum), uHurt * smoothstep(0.3, 1.0, r2) * 0.85);
      // 胶片颗粒（暗部更明显）
      float g = hash(uv * vec2(1931.0, 1173.0) + fract(uTime * 7.31)) - 0.5;
      col += g * uGrain * (0.25 + 0.75 * (1.0 - smoothstep(0.0, 0.5, lum))) * max(lum, 0.05) * 2.0;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, quality) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  let composer = null, gtao = null, bloom = null, grade = null, q = -1;
  const U = GradeShader.uniforms;           // 保持同一个对象，换档位不丢状态
  const size = new THREE.Vector2();

  function build(nq) {
    if (composer) { composer.passes.forEach(p => p.dispose?.()); composer.dispose(); }
    composer = gtao = bloom = null;
    q = nq;
    if (q <= 0) return;                     // 低档：直接 renderer.render
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType }));
    composer.addPass(new RenderPass(scene, camera));
    if (q >= 2 && !/noao/.test(location.search)) {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.75;
      gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // AO 的法线/深度预渲染里排除 Sprite、粒子、线和透明物体（否则烟团会变成黑方块）
      gtao._overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse(o => {
          if (o.visible && (o.isPoints || o.isLine || o.isSprite || (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent))) { o.visible = false; cache.push(o); }
        });
      };
      composer.addPass(gtao);
    }
    const div = q >= 2 ? 2 : 4;
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / div, size.y / div), q >= 2 ? 0.32 : 0.25, 0.55, 0.9);
    composer.addPass(bloom);
    grade = new ShaderPass({ ...GradeShader, uniforms: U });
    grade.uniforms = U; grade.material.uniforms = U;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  }
  build(quality);

  return {
    get composer() { return composer; },
    U,
    render(dt) {
      U.uTime.value += dt;
      renderer.getSize(size); U.uAspect.value = size.x / Math.max(1, size.y);
      if (composer) composer.render(dt);
      else {
        // 低档也要死神之眼：用 CSS 滤镜兜底
        renderer.render(scene, camera);
        const de = U.uDeadeye.value;
        const f = de > 0.02 ? `sepia(${(de * .8).toFixed(2)}) saturate(${(1 + de * .5).toFixed(2)}) contrast(1.08)` : '';
        if (renderer.domElement.style.filter !== f) renderer.domElement.style.filter = f;
      }
    },
    setSize(w, h) {
      if (!composer) return;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    setQuality(nq) { if (nq !== q) { renderer.domElement.style.filter = ''; build(nq); } },
    get quality() { return q; },
  };
}
