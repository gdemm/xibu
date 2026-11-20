// pooled visuals: projectiles, particles, blob shadows, items, plane, parachutes, zone
import * as THREE from 'three';
import { Builder, M, vcMat, outlined, outlineMat, toonMat } from './util.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// generic instanced pool: set(i, pos, scale, color, yaw)
export class Pool {
  constructor(scene, geo, mat, n, order = 0) {
    this.m = new THREE.InstancedMesh(geo, mat, n); this.m.frustumCulled = false; this.m.renderOrder = order; this.n = n; this.used = 0;
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.setColorAt(0, new THREE.Color()); scene.add(this.m);
  }
  begin() { this.used = 0; }
  push(x, y, z, sx, sy, sz, color, yaw = 0, pitch = 0) {
    if (this.used >= this.n) return; const i = this.used++;
    tmpQ.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); this.m.setMatrixAt(i, tmpM);
    if (color !== undefined) this.m.setColorAt(i, tmpC.set(color));
  }
  end() { this.m.count = this.used; this.m.instanceMatrix.needsUpdate = true; if (this.m.instanceColor) this.m.instanceColor.needsUpdate = true; }
}

export function makeFX(scene) {
  const FX = {};
  // projectiles: glowing toon balls with outline
  const ball = new THREE.SphereGeometry(1, 14, 10);
  FX.proj = new Pool(scene, ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), 500, 3);
  FX.projO = new Pool(scene, ball, outlineMat(0.18), 500, 2);
  // particles
  FX.part = new Pool(scene, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 600, 3);
  FX.parts = [];
  // blob shadows
  const sg = new THREE.CircleGeometry(1, 20); sg.rotateX(-Math.PI / 2);
  FX.shadow = new Pool(scene, sg, new THREE.MeshBasicMaterial({ color: 0x0a0a30, transparent: true, opacity: 0.28, depthWrite: false }), 120, 1);
  // team rings under brawlers
  const rg = new THREE.RingGeometry(0.62, 0.8, 28); rg.rotateX(-Math.PI / 2);
  FX.ring = new Pool(scene, rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), 80, 1);
  // aim indicator (built per shape on demand)
  FX.aim = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  FX.aim.renderOrder = 4; FX.aim.visible = false; scene.add(FX.aim);
  FX.aimShapes = {
    rect: (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.5); return g; })(),
    cone: (a) => { const g = new THREE.CircleGeometry(1, 24, Math.PI / 2 - a / 2, a); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); return g; },
    circle: (() => { const g = new THREE.RingGeometry(0.85, 1, 32); g.rotateX(-Math.PI / 2); return g; })(),
  };
  FX.coneCache = {};
  // zone: shader plane tinting everything outside the circle + cloud puffs on the edge
  const zg = new THREE.PlaneGeometry(400, 400); zg.rotateX(-Math.PI / 2);
  FX.zoneU = { c: { value: new THREE.Vector2() }, r: { value: 200 }, t: { value: 0 }, nc: { value: new THREE.Vector2() }, nr: { value: -1 }, sq: { value: 0 }, lim: { value: 72.5 } };
  const zm = new THREE.ShaderMaterial({
    uniforms: FX.zoneU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vw; void main(){ vec4 w = modelMatrix*vec4(position,1.); vw = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec2 c; uniform float r; uniform float t; uniform vec2 nc; uniform float nr; uniform float sq; uniform float lim; varying vec2 vw;
void main(){ if (abs(vw.x) > lim || abs(vw.y) > lim) discard; vec2 dd = abs(vw - c); float d = sq > 0.5 ? max(dd.x, dd.y) : distance(vw, c); float a = 0.;
 if (d > r) { float s = 0.5 + 0.5*sin((vw.x+vw.y)*0.6 + t*2.0); a = 0.5 + 0.1*s; gl_FragColor = sq > 0.5 ? vec4(mix(vec3(0.42,0.22,0.62), vec3(0.62,0.38,0.85), s), a + 0.08) : vec4(mix(vec3(0.18,0.75,0.2), vec3(0.45,0.95,0.3), s), a); return; }
 if (nr > 0.) { float e = abs(distance(vw, nc) - nr); if (e < 0.12 && mod(atan(vw.y-nc.y, vw.x-nc.x)*nr*0.8, 2.0) < 1.0) { gl_FragColor = vec4(1.,1.,1.,0.8); return; } }
 discard; }`,
  });
  FX.zone = new THREE.Mesh(zg, zm); FX.zone.position.y = 0.07; FX.zone.renderOrder = 1; FX.zone.frustumCulled = false; scene.add(FX.zone);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  FX.cloud = new Pool(scene, puff, toonMat(0xc9ff7a, { transparent: true, opacity: 0.72, emissive: 0x335500 }), 220, 2);
  FX.cloudO = new Pool(scene, puff, outlineMat(0.06, 0x4f9a1a), 220, 1);
  // items
  FX.itemGeo = {
    cube: new Builder().add(new THREE.OctahedronGeometry(0.42, 0), M(0, 0, 0, 0, 0, 0, 1, 1.35, 1), 0xff9f1c).add(new THREE.OctahedronGeometry(0.22, 0), M(0, 0, 0.18, 0, 0, 0, 1, 1.3, 1), 0xffe27a).build(),
    armor: new Builder().add(new THREE.CapsuleGeometry(0.32, 0.3, 6, 16), M(0, 0, 0, 0, 0, 0, 1, 1, 0.55), 0xffffff).add(new THREE.BoxGeometry(0.18, 0.5, 0.36), M(0, 0.05, 0), 0xdddddd).build(),
    helmet: new Builder().add(new THREE.SphereGeometry(0.38, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), null, 0xffffff).add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), null, 0xcccccc).build(),
    med: new Builder().add(new THREE.BoxGeometry(0.62, 0.42, 0.45), null, 0xffffff).add(new THREE.BoxGeometry(0.4, 0.13, 0.47), M(0, 0.05, 0), 0xff3b4d).add(new THREE.BoxGeometry(0.13, 0.4, 0.47), M(0, 0.05, 0), 0xff3b4d).build(),
  };
  FX.lvCol = [0xffffff, 0xe8eef2, 0x4d9bff, 0xc77dff];
  // plane (original cartoon cargo plane)
  const B = new Builder();
  B.add(new THREE.CapsuleGeometry(1.6, 7, 8, 20), M(0, 0, 0, Math.PI / 2), 0xff8a3d).add(new THREE.SphereGeometry(1.25, 16, 12), M(0, 0.6, 3.6, 0, 0, 0, 1, 0.8, 0.9), 0x7fdcff)
    .add(new THREE.BoxGeometry(17, 0.45, 2.6), M(0, 0.3, 0.6), 0xffd23f).add(new THREE.BoxGeometry(6, 0.3, 1.6), M(0, 0.6, -4.8), 0xffd23f).add(new THREE.BoxGeometry(0.4, 2.6, 1.8), M(0, 1.8, -4.8, 0.25), 0x2b6cff)
    .add(new THREE.CylinderGeometry(0.7, 0.6, 2.4, 14), M(-4.5, 0, 1.2, Math.PI / 2), 0x2b6cff).add(new THREE.CylinderGeometry(0.7, 0.6, 2.4, 14), M(4.5, 0, 1.2, Math.PI / 2), 0x2b6cff)
    .add(new THREE.BoxGeometry(3.3, 0.5, 7), M(0, -0.6, 0), 0xfff3e0);
  FX.plane = new THREE.Group(); FX.plane.add(outlined(B.build(), vcMat(), 0.12)); FX.props = [];
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.1), toonMat(0x333344)); p.position.set(s * 4.5, 0, 2.5); FX.plane.add(p); FX.props.push(p); }
  FX.plane.visible = false; scene.add(FX.plane);
  // parachute canopy
  const cb = new Builder(), cols = [0xff4d6d, 0xffffff, 0x2b6cff, 0xffffff, 0xffd23f, 0xffffff, 0x2ec46b, 0xffffff];
  for (let i = 0; i < 8; i++) cb.add(new THREE.SphereGeometry(1.6, 4, 8, i / 8 * Math.PI * 2, Math.PI * 2 / 8, 0, Math.PI / 2.3), M(0, 0, 0, 0, 0, 0, 1, 0.55, 1), cols[i]);
  FX.chuteGeo = cb.build();
  FX.makeChute = () => { const g = new THREE.Group(); const d = outlined(FX.chuteGeo, vcMat(), 0.06); d.position.y = 3.2; g.add(d); const pts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pts.push(Math.cos(a) * 1.5, 3.2, Math.sin(a) * 1.5, 0, 1.4, 0); } const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x333344 }))); g.visible = false; scene.add(g); return g; };
  // airdrop crate
  FX.dropGeo = new Builder().add(new THREE.BoxGeometry(1.5, 1.3, 1.5), M(0, 0.65, 0), 0x2b6cff).add(new THREE.BoxGeometry(1.56, 0.25, 1.56), M(0, 1.2, 0), 0xffd23f).add(new THREE.BoxGeometry(1.56, 0.25, 1.56), M(0, 0.15, 0), 0xffd23f)
    .add(new THREE.BoxGeometry(0.3, 1.36, 1.56), M(0, 0.65, 0), 0xffd23f).add(new THREE.OctahedronGeometry(0.35), M(0, 1.6, 0), 0xff9f1c).build();
  FX.beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true);
  FX.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false });
  // storm (ice) area
  const sgeo = new THREE.CircleGeometry(1, 32); sgeo.rotateX(-Math.PI / 2);
  FX.stormMat = new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.35, depthWrite: false });
  FX.stormGeo = sgeo;

  FX.burst = (x, y, z, color, n = 8, sp = 5, size = 0.18, life = 0.45) => { for (let i = 0; i < n; i++) { if (FX.parts.length > 560) FX.parts.shift(); const a = Math.random() * Math.PI * 2, u = Math.random(); FX.parts.push({ x, y, z, vx: Math.cos(a) * sp * u, vy: 2 + Math.random() * sp * 0.8, vz: Math.sin(a) * sp * u, c: color, s: size * (0.6 + Math.random() * 0.8), t: life, life }); } };
  FX.updateParts = (dt) => {
    FX.part.begin();
    for (let i = FX.parts.length - 1; i >= 0; i--) { const p = FX.parts[i]; p.t -= dt; if (p.t <= 0) { FX.parts.splice(i, 1); continue; } p.vy -= 14 * dt; p.x += p.vx * dt; p.y = Math.max(0.1, p.y + p.vy * dt); p.z += p.vz * dt; const k = p.t / p.life; FX.part.push(p.x, p.y, p.z, p.s * k, p.s * k, p.s * k, p.c, p.t * 6); }
    FX.part.end();
  };
  FX.setAim = (shape, x, z, dirx, dirz, len, width, col) => {
    const a = FX.aim; a.visible = true;
    let g = shape === 'rect' ? FX.aimShapes.rect : shape === 'circle' ? FX.aimShapes.circle : (FX.coneCache[width] || (FX.coneCache[width] = FX.aimShapes.cone(width)));
    if (a.geometry !== g) a.geometry = g;
    a.position.set(x, 0.1, z); a.rotation.set(0, Math.atan2(dirx, dirz), 0);
    if (shape === 'rect') a.scale.set(width, 1, len); else if (shape === 'circle') { a.scale.set(width, 1, width); a.rotation.y = 0; } else a.scale.set(len, 1, len);
    a.material.color.set(col || 0xffffff);
  };
  return FX;
}
