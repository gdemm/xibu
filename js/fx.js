// 特效：飘浮尘埃、枪口火光、血雾、落点尘土、曳光。全部对象池，不在战斗中 new 材质。
import * as THREE from 'three';

function canvasTex(draw, n = 64) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const softTex = canvasTex((g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, n, n);
});
const smokeTex = canvasTex((g, n) => {
  for (let i = 0; i < 14; i++) {
    const x = n / 2 + (Math.random() - .5) * n * .35, y = n / 2 + (Math.random() - .5) * n * .35, rr = n * (.18 + Math.random() * .2);
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  }
}, 128);
const flashTex = canvasTex((g, n) => {
  g.translate(n / 2, n / 2);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, n / 2);
  r.addColorStop(0, 'rgba(255,250,230,1)'); r.addColorStop(.25, 'rgba(255,200,110,.9)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r;
  for (let i = 0; i < 7; i++) {           // 不规则的火舌
    g.rotate(Math.PI * 2 / 7 + Math.random() * .3);
    g.beginPath(); g.moveTo(0, -3); g.lineTo(n * (.3 + Math.random() * .2), 0); g.lineTo(0, 3); g.fill();
  }
  g.beginPath(); g.arc(0, 0, n * .16, 0, 7); g.fill();
}, 128);

export function createFx(scene, camera, quality) {
  // ---------------- 尘埃 ----------------
  const DUST_MAX = 1500;
  const dPos = new Float32Array(DUST_MAX * 3), dSeed = new Float32Array(DUST_MAX);
  const R = 16, H = 7;
  for (let i = 0; i < DUST_MAX; i++) {
    dPos[i * 3] = (Math.random() - .5) * 2 * R; dPos[i * 3 + 1] = Math.random() * H; dPos[i * 3 + 2] = (Math.random() - .5) * 2 * R;
    dSeed[i] = Math.random();
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uMap: { value: softTex }, uPx: { value: 1 }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uPx; uniform vec3 uCam, uSun; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        p.x += uTime * (0.6 + seed * 0.5) + sin(uTime * 0.7 + seed * 40.0) * 0.6;
        p.z += uTime * 0.25 + cos(uTime * 0.5 + seed * 17.0) * 0.6;
        p.y += sin(uTime * 0.9 + seed * 23.0) * 0.35;
        // 以相机为中心循环
        vec3 rel = p - uCam; rel.xz = mod(rel.xz + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)};
        rel.y = mod(p.y - uCam.y + 2.5, ${H.toFixed(1)}) - 2.5;
        vec3 w = uCam + rel;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(rel);
        vA = smoothstep(${R.toFixed(1)}, 4.0, d) * smoothstep(0.3, 1.5, d);
        // 逆光的尘埃更亮
        vec3 vd = normalize(w - cameraPosition);
        vS = 0.5 + 1.5 * pow(max(dot(vd, uSun), 0.0), 4.0);
        gl_PointSize = (0.9 + seed * 1.6) * uPx * 26.0 / max(-mv.z, 0.1);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA; varying float vS;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.33 * vS; gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }`,
  });
  const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; dust.renderOrder = 5; scene.add(dust);
  function setQuality(q) { dGeo.setDrawRange(0, q >= 2 ? 1500 : q >= 1 ? 500 : 200); }
  setQuality(quality);

  // ---------------- 枪口火光 ----------------
  const mLight = new THREE.PointLight(0xffa050, 0, 10, 2); scene.add(mLight);
  const mSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(6, 4.2, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  mSpr.renderOrder = 10; scene.add(mSpr);
  let mT = 0;

  // ---------------- 烟团 / 血雾（Sprite 池）----------------
  const puffs = [];
  for (let i = 0; i < 28; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s); puffs.push({ s, t: 0, life: 1, v: new THREE.Vector3(), grow: 1, a0: 1 });
  }
  let pi = 0;
  function puff(pos, color, size, life, vel, alpha = .7, grow = 2) {
    const p = puffs[pi = (pi + 1) % puffs.length];
    p.s.position.copy(pos); p.s.scale.setScalar(size); p.s.material.color.set(color); p.s.material.opacity = alpha;
    p.s.material.rotation = Math.random() * 6.28; p.s.visible = true;
    p.t = p.life = life; p.v.copy(vel || _zero); p.grow = grow; p.a0 = alpha;
  }

  // ---------------- 碎屑 / 血滴（InstancedMesh 池）----------------
  const BITS = 160;
  const bitGeo = new THREE.IcosahedronGeometry(1, 0);
  const bitMat = new THREE.MeshStandardMaterial({ roughness: .6, metalness: 0 });
  const bits = new THREE.InstancedMesh(bitGeo, bitMat, BITS);
  bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bits.setColorAt(0, new THREE.Color()); bits.frustumCulled = false; bits.castShadow = false;
  scene.add(bits);
  const bitData = Array.from({ length: BITS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, s: .02 }));
  let bi = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function bit(pos, vel, color, size, life) {
    const b = bitData[bi]; b.p.copy(pos); b.v.copy(vel); b.t = life; b.s = size;
    bits.setColorAt(bi, _c.set(color)); bits.instanceColor.needsUpdate = true;
    bi = (bi + 1) % BITS;
  }

  // ---------------- 曳光（线段池）----------------
  const tracers = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; l.visible = false; scene.add(l); tracers.push({ l, t: 0 });
  }
  let ti = 0;

  const _zero = new THREE.Vector3(), _v = new THREE.Vector3();
  const api = {
    dust, setQuality,
    update(dt, rdt) {
      dMat.uniforms.uTime.value += rdt;
      dMat.uniforms.uCam.value.copy(camera.position);
      dMat.uniforms.uPx.value = Math.min(2, (window.devicePixelRatio || 1)) * (Math.min(innerWidth, innerHeight) / 420);
      // 火光
      if (mT > 0) { mT -= rdt; const k = Math.max(0, mT / .06); mSpr.material.opacity = k; mLight.intensity = 40 * k; if (mT <= 0) { mSpr.material.opacity = 0; mLight.intensity = 0; } }
      // 烟团
      for (const p of puffs) {
        if (p.t <= 0) continue;
        p.t -= dt; const k = Math.max(0, p.t / p.life);
        p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 2.5);
        p.s.scale.multiplyScalar(1 + dt * p.grow); p.s.material.opacity = p.a0 * k * k;
        if (p.t <= 0) p.s.visible = false;
      }
      // 碎屑
      for (let i = 0; i < BITS; i++) {
        const b = bitData[i];
        if (b.t > 0) {
          b.t -= dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt);
          if (b.p.y < 0.01 && b.v.y < 0) { b.p.y = 0.01; b.v.set(0, 0, 0); }
          _s.setScalar(b.t > 0 ? b.s : 0);
        } else _s.setScalar(0);
        _m.compose(b.p, _q, _s); bits.setMatrixAt(i, _m);
      }
      bits.instanceMatrix.needsUpdate = true;
      for (const t of tracers) if (t.t > 0) { t.t -= rdt; t.l.material.opacity = Math.max(0, t.t / .06); if (t.t <= 0) t.l.visible = false; }
    },
    setSun(dir) { dMat.uniforms.uSun.value.copy(dir).negate(); },
    muzzle(pos, dir) {
      mSpr.position.copy(pos).addScaledVector(dir, .06);
      mSpr.scale.setScalar(.35 + Math.random() * .2); mSpr.material.rotation = Math.random() * 6.28; mSpr.material.opacity = 1;
      mLight.position.copy(pos).addScaledVector(dir, .2); mLight.intensity = 40; mT = .06;
      puff(_v.copy(pos).addScaledVector(dir, .25), 0xcfc4b4, .25, .9, _v.clone().copy(dir).multiplyScalar(1.5).setY(.3), .35, 1.6);
    },
    blood(pos, dir) {
      const n = quality >= 2 ? 12 : 7;
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(dir.x + (Math.random() - .5) * .9, dir.y + Math.random() * .6, dir.z + (Math.random() - .5) * .9).multiplyScalar(2 + Math.random() * 2.5);
        bit(pos, v, Math.random() < .5 ? 0x5a0606 : 0x7a0c08, .012 + Math.random() * .018, .6 + Math.random() * .3);
      }
      puff(pos, 0x6e0a06, .28, .45, _v.copy(dir).multiplyScalar(1.2), .85, 2.5);
      puff(_v.copy(pos).addScaledVector(dir, .15), 0x8a1a10, .18, .35, _v.clone().copy(dir).multiplyScalar(2), .6, 3);
    },
    impact(pos, normal) {
      const nrm = normal || _v.set(0, 1, 0);
      for (let i = 0; i < (quality >= 2 ? 8 : 4); i++) {
        const v = new THREE.Vector3(nrm.x + (Math.random() - .5) * 1.4, nrm.y + Math.random() * 1.2, nrm.z + (Math.random() - .5) * 1.4).multiplyScalar(1.5 + Math.random() * 2);
        bit(pos, v, Math.random() < .5 ? 0x9a7a52 : 0x6e5a40, .015 + Math.random() * .02, .5 + Math.random() * .4);
      }
      puff(pos, 0xc9a77a, .35, 1.1, nrm.clone().multiplyScalar(.9).setY(.5), .75, 1.8);
      puff(pos, 0xb89468, .22, .7, nrm.clone().multiplyScalar(2), .6, 2.4);
    },
    dustKick(pos, size = .6) { puff(pos, 0xc9a77a, size, 1.4, _v.set((Math.random() - .5) * .6, .35, (Math.random() - .5) * .6), .35, 1.2); },
    tracer(a, b, color) {
      const t = tracers[ti = (ti + 1) % tracers.length], arr = t.l.geometry.attributes.position.array;
      // 只画靠近目标的一段，看起来像飞行中的子弹
      _v.subVectors(b, a); const L = _v.length(); const s = Math.max(0, L - Math.min(L, 6 + L * .5));
      arr[0] = a.x + _v.x * s / L; arr[1] = a.y + _v.y * s / L; arr[2] = a.z + _v.z * s / L; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
      t.l.geometry.attributes.position.needsUpdate = true;
      t.l.material.color.set(color || 0xffd8a0).multiplyScalar(3);
      t.l.material.opacity = 1; t.l.visible = true; t.t = .06;
    },
  };
  return api;
}
