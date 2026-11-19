// 货轮突击 - procedural cargo ship map, collision and waypoint graph
import * as THREE from 'three';

export const SHIP = { minX: -62, maxX: 62, minZ: -13.6, maxZ: 13.6 };

function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function noise(g, w, h, a, n = 1200) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}

export function buildMap(scene, quality) {
  const solids = [];   // THREE.Box3 list: collisions + bullet blocking
  const minimapRects = []; // {x0,z0,x1,z1,c}
  const addSolid = (x0, y0, z0, x1, y1, z1, mm) => {
    const b = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    solids.push(b); if (mm) minimapRects.push({ x0, z0, x1, z1, c: mm }); return b;
  };
  const boxMesh = (x0, y0, z0, x1, y1, z1, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); scene.add(m); return m;
  };
  const solidBox = (x0, y0, z0, x1, y1, z1, mat, mm) => { addSolid(x0, y0, z0, x1, y1, z1, mm); return boxMesh(x0, y0, z0, x1, y1, z1, mat); };

  // ---------- textures ----------
  const deckTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6f6a5f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#686357' : '#736e62'; g.fillRect(0, i * 32, w, 31); }
    g.strokeStyle = 'rgba(30,25,20,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); const o = (i * 97) % w; g.beginPath(); g.moveTo(o, i * 32); g.lineTo(o, i * 32 + 32); g.stroke(); }
    noise(g, w, h, 0.18, 2500);
    g.fillStyle = 'rgba(120,60,20,.25)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 0, 7); g.fill(); }
  }, 24, 6);
  const contTex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 4, 0, 2, h); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    noise(g, w, h, 0.15, 500);
  }, 1, 1);
  const metalTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#cfd3d6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.strokeRect(1, 1, w - 2, h - 2);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(8 + i * 22, 6, 1.6, 0, 7); g.fill(); g.beginPath(); g.arc(8 + i * 22, h - 6, 1.6, 0, 7); g.fill(); }
    noise(g, w, h, 0.08, 600);
    g.fillStyle = 'rgba(110,60,20,.2)'; g.fillRect(0, h - 20, w, 20);
  }, 1, 1);
  const crateTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#9a7443'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#8d6a3c' : '#a07a48'; g.fillRect(0, i * 16, w, 15); }
    g.strokeStyle = '#5b4224'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4);
    g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.stroke();
    noise(g, w, h, 0.2, 200);
  });
  const windowTex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#e8e8e2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#2b3d4d'; g.fillRect(8 + i * 30, 18, 22, 18); g.fillStyle = 'rgba(160,200,230,.5)'; g.fillRect(10 + i * 30, 20, 8, 6); }
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 6, w, 6);
  }, 3, 1);

  const M = {
    deck: new THREE.MeshLambertMaterial({ map: deckTex }),
    hull: new THREE.MeshLambertMaterial({ color: 0x3a2b2b }),
    hullRed: new THREE.MeshLambertMaterial({ color: 0x8c2a22 }),
    rail: new THREE.MeshLambertMaterial({ color: 0xd9b23a }),
    cabin: new THREE.MeshLambertMaterial({ map: metalTex }),
    cabinBlue: new THREE.MeshLambertMaterial({ map: metalTex, color: 0x9cc0ff }),
    cabinRed: new THREE.MeshLambertMaterial({ map: metalTex, color: 0xffa79c }),
    window: new THREE.MeshLambertMaterial({ map: windowTex }),
    crate: new THREE.MeshLambertMaterial({ map: crateTex }),
    walk: new THREE.MeshLambertMaterial({ color: 0x55606a }),
    pipe: new THREE.MeshLambertMaterial({ color: 0x5e8c6a }),
    pipe2: new THREE.MeshLambertMaterial({ color: 0xb8762e }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  };

  // ---------- sea & sky ----------
  scene.background = new THREE.Color(0x9cc6de);
  const seg = quality === 'high' ? 60 : quality === 'low' ? 1 : 24;
  const seaGeo = new THREE.PlaneGeometry(900, 900, seg, seg); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: 0x1f5f86 }));
  sea.position.y = -3.2; scene.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();
  // distant cranes / horizon silhouettes (decor)
  const silMat = new THREE.MeshBasicMaterial({ color: 0x7ea3b8 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3; const r = 260; const h = 20 + (i * 13) % 25; const m = new THREE.Mesh(new THREE.BoxGeometry(14, h, 14), silMat); m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r); scene.add(m); }

  // ---------- hull & deck ----------
  boxMesh(-62, -6, -14, 62, -0.01, 14, M.hull);
  boxMesh(-62, -6.5, -14.05, 62, -4.2, 14.05, M.hullRed);
  // bow taper (decor) beyond x=62
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 6, 3, 1, false, 0, Math.PI * 2), M.hull);
  bow.rotation.y = Math.PI / 2; bow.scale.set(0.9, 1, 1); bow.position.set(66, -3, 0); scene.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(124, 0.2, 28), M.deck); deck.position.set(0, -0.1, 0); scene.add(deck);

  // railings (solid for movement, low so bullets pass over)
  const railH = 1.1;
  solidBox(-62, 0, -14, 62, railH, -13.6, M.rail);
  solidBox(-62, 0, 13.6, 62, railH, 14, M.rail);
  solidBox(-62.4, 0, -14, -62, railH, 14, M.rail);
  solidBox(62, 0, -14, 62.4, railH, 14, M.rail);

  // ---------- cabins ----------
  const spawns = { blue: [], red: [] };
  function cabin(side) { // side -1 stern(blue) +1 bow(red)
    const s = side;
    const xBack = 60 * s, xFront = 46 * s;
    const x0 = Math.min(xBack, xFront), x1 = Math.max(xBack, xFront);
    const mat = s < 0 ? M.cabinBlue : M.cabinRed;
    const mm = s < 0 ? '#5a7fb8' : '#b85a5a';
    const H = 4, T = 0.4;
    // back wall
    solidBox(s < 0 ? x0 : x1 - T, 0, -8, s < 0 ? x0 + T : x1, H, 8, mat, mm);
    // side walls
    solidBox(x0, 0, -8, x1, H, -7.6, mat, mm);
    solidBox(x0, 0, 7.6, x1, H, 8, mat, mm);
    // front wall with door gap z -2..2 and window band
    const fx0 = s < 0 ? x1 - T : x0, fx1 = s < 0 ? x1 : x0 + T;
    solidBox(fx0, 0, -8, fx1, H, -2, mat, mm);
    solidBox(fx0, 0, 2, fx1, H, 8, mat, mm);
    solidBox(fx0, 2.8, -2, fx1, H, 2, mat);
    // roof
    solidBox(x0, H, -8, x1, H + 0.3, 8, M.cabin);
    // bridge tower on stern only, mast on bow
    if (s < 0) {
      solidBox(x0, H + 0.3, -6, x0 + 9, H + 6.5, 6, M.window);
      boxMesh(x0 + 2, H + 6.5, -7, x0 + 7, H + 6.8, 7, M.cabin);
      const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 4, 10), M.cabinBlue); fun.position.set(x0 + 4, H + 8.8, 0); scene.add(fun);
    } else {
      solidBox(x1 - 6, H + 0.3, -3, x1 - 1, H + 3.8, 3, M.window);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 12, 6), M.rail); mast.position.set(x1 - 3.5, H + 9, 0); scene.add(mast);
    }
    // team stripe over the door
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 4.4), new THREE.MeshBasicMaterial({ color: s < 0 ? 0x2f7bff : 0xff3b30 }));
    stripe.position.set(s < 0 ? x1 + 0.03 : x0 - 0.03, 3.35, 0); scene.add(stripe);
    // interior lockers / cover
    solidBox(s < 0 ? x0 + 6 : x1 - 7.4, 0, -7.6, s < 0 ? x0 + 7.4 : x1 - 6, 1.2, -6.4, M.crate);
    solidBox(s < 0 ? x0 + 6 : x1 - 7.4, 0, 6.4, s < 0 ? x0 + 7.4 : x1 - 6, 1.2, 7.6, M.crate);
    const team = s < 0 ? 'blue' : 'red';
    for (const z of [-5.5, -3.5, 0, 3.5, 5.5]) for (const dx of [2, 8.5]) spawns[team].push(new THREE.Vector3(s < 0 ? x0 + dx + 1 : x1 - dx - 1, 0, z));
    for (const z of [-11, 11]) spawns[team].push(new THREE.Vector3(s < 0 ? x0 + 6 : x1 - 6, 0, z));
  }
  cabin(-1); cabin(1);

  // ---------- containers (instanced) ----------
  const CL = 6, CH = 2.6, CW = 2.4;
  const stacks = [
    // [x, z, levels, alongZ]
    [-26, -11.2, 2], [-14, -11.2, 1], [4, -11.2, 2], [20, -11.2, 1], [31, -11.2, 2],
    [-31, -4.2, 1], [-18, -4.2, 2], [-6, -4.2, 1], [10, -4.2, 2], [25, -4.2, 1],
    [-24, 4.2, 1], [-10, 4.2, 2], [5, 4.2, 1], [18, 4.2, 2], [30, 4.2, 1],
    [-17, 8.6, 1], [12, 8.6, 1], [-36, 7.5, 1, 1], [37, -7.5, 1, 1], [-2, 8.6, 2],
  ];
  const palette = [0xb5432f, 0x2d6ca8, 0x3f8a4f, 0xd98a2b, 0x8a8f96, 0x7a3fa0, 0x2a9d9a];
  let count = 0; for (const s of stacks) count += s[2];
  const contGeo = new THREE.BoxGeometry(CL, CH, CW);
  const inst = new THREE.InstancedMesh(contGeo, new THREE.MeshLambertMaterial({ map: contTex }), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let k = 0;
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  stacks.forEach((s, i) => {
    const [x, z, lv, rot] = s;
    const hx = rot ? CW / 2 : CL / 2, hz = rot ? CL / 2 : CW / 2;
    for (let l = 0; l < lv; l++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot ? Math.PI / 2 : 0);
      m4.compose(new THREE.Vector3(x, CH / 2 + l * CH, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setHex(palette[(i * 3 + l * 5) % palette.length])); k++;
    }
    addSolid(x - hx, 0, z - hz, x + hx, CH * lv, z + hz, lv > 1 ? '#7b8794' : '#a2acb6');
    const sh = new THREE.Mesh(shadowGeo, M.dark); sh.scale.set(hx * 2 + 1.4, 1, hz * 2 + 1.4); sh.position.set(x + 0.4, 0.02, z + 0.3); scene.add(sh);
  });
  inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true; scene.add(inst);

  // crates in the center lane (low cover)
  for (const [x, z, h] of [[-12, 0.2, 1.2], [12, 0.6, 1.2], [0, -1, 1.2], [-40, -10, 1.2], [40, 10, 1.2], [-40, 3.5, 1.2], [40, -3.5, 1.2], [-31, 0.5, 1.2], [31, -0.5, 1.2], [-21, -0.6, 1.2], [21, 0.4, 1.2], [-5, 1.4, 1.2], [6, -1.6, 1.2]]) {
    solidBox(x - 0.7, 0, z - 0.7, x + 0.7, h, z + 0.7, M.crate, '#9a7443');
    const sh = new THREE.Mesh(shadowGeo, M.dark); sh.scale.set(2.1, 1, 2.1); sh.position.set(x + 0.3, 0.02, z + 0.2); scene.add(sh);
  }

  // ---------- raised walkway with pipes (flank route) ----------
  const WY = 3.5, wz0 = 10.6, wz1 = 13.4, wx = 36;
  addSolid(-wx, 0, wz0, wx, WY, wz1, '#4d5862');
  boxMesh(-wx, WY - 0.3, wz0, wx, WY, wz1, M.walk);
  // grating lines texture-free: thin dark strips
  for (let x = -wx; x < wx; x += 2) boxMesh(x, WY + 0.001, wz0, x + 0.08, WY + 0.01, wz1, M.hull);
  // pipes under walkway (visual) + support pillars
  for (const [y, r, m] of [[0.5, 0.45, M.pipe], [1.5, 0.35, M.pipe2], [2.4, 0.3, M.pipe]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wx * 2, 10), m); p.rotation.z = Math.PI / 2; p.position.set(0, y, wz0 + 0.5 + r * 0.3); scene.add(p);
  }
  boxMesh(-wx, 0, wz0 + 1.2, wx, WY - 0.3, wz1, new THREE.MeshLambertMaterial({ color: 0x2f3338 }));
  for (let x = -wx; x <= wx; x += 9) boxMesh(x - 0.2, 0, wz0, x + 0.2, WY - 0.3, wz0 + 0.4, M.walk);
  // walkway railing (low, blocks movement only)
  solidBox(-wx, WY, wz0 - 0.08, wx, WY + 1.0, wz0 + 0.04, M.rail);
  // stairs at both ends descending outward
  const stepN = 9, stepD = 0.62, stepH = WY / (stepN + 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < stepN; i++) {
      const xa = side * (wx + i * stepD), xb = side * (wx + (i + 1) * stepD);
      solidBox(Math.min(xa, xb), 0, wz0, Math.max(xa, xb), WY - stepH * (i + 1), wz1, M.walk);
    }
    minimapRects.push({ x0: side < 0 ? -wx - stepN * stepD : wx, z0: wz0, x1: side < 0 ? -wx : wx + stepN * stepD, z1: wz1, c: '#3c454d' });
  }

  // ---------- waypoint graph ----------
  const nodes = []; // {p:Vector3, n:[idx]}
  const grid = new Map();
  const free = (x, y, z, r = 0.7) => {
    for (const b of solids) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + 1.2 > b.min.y && y + 0.3 < b.max.y) return false;
    return true;
  };
  for (let x = -56; x <= 56; x += 4) for (let z = -12; z <= 12; z += 3) {
    if (free(x, 0, z)) { grid.set(x + ',' + z, nodes.length); nodes.push({ p: new THREE.Vector3(x, 0, z), n: [], deck: true }); }
  }
  const segClear = (a, b) => {
    const d = a.distanceTo(b), steps = Math.ceil(d / 0.5);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (!free(a.x + (b.x - a.x) * t, a.y, a.z + (b.z - a.z) * t, 0.45)) return false; }
    return true;
  };
  const link = (i, j) => { if (!nodes[i].n.includes(j)) { nodes[i].n.push(j); nodes[j].n.push(i); } };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].p, b = nodes[j].p;
    if (Math.abs(a.x - b.x) <= 4.1 && Math.abs(a.z - b.z) <= 3.1 && segClear(a, b)) link(i, j);
  }
  // walkway nodes
  const walkIdx = [];
  for (let x = -34; x <= 34; x += 4) { walkIdx.push(nodes.length); nodes.push({ p: new THREE.Vector3(x, WY, 12), n: [], walk: true }); }
  for (let i = 1; i < walkIdx.length; i++) link(walkIdx[i - 1], walkIdx[i]);
  for (const side of [-1, 1]) {
    const mid = nodes.length; nodes.push({ p: new THREE.Vector3(side * 39, WY / 2, 12), n: [] });
    link(side < 0 ? walkIdx[0] : walkIdx[walkIdx.length - 1], mid);
    let best = -1, bd = 1e9; nodes.forEach((nd, i) => { if (nd.deck) { const d = Math.hypot(nd.p.x - side * 44, nd.p.z - 12); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0) link(mid, best);
  }
  // cover points: deck nodes close to a container/crate
  const covers = [];
  nodes.forEach((nd, i) => { if (nd.deck && !free(nd.p.x, 0, nd.p.z, 1.9) && Math.abs(nd.p.x) < 44) covers.push(i); });

  function nearestNode(p) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i].p; const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2 + ((n.y - p.y) * 3) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function findPath(from, to) { // A*
    const s = nearestNode(from), g = typeof to === 'number' ? to : nearestNode(to);
    const open = [s], came = new Map(), gS = new Map([[s, 0]]), fS = new Map([[s, nodes[s].p.distanceTo(nodes[g].p)]]);
    const closed = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (fS.get(open[i]) < fS.get(open[bi])) bi = i;
      const c = open.splice(bi, 1)[0];
      if (c === g) { const path = [c]; let x = c; while (came.has(x)) { x = came.get(x); path.unshift(x); } return path.map(i => nodes[i].p); }
      closed.add(c);
      for (const nb of nodes[c].n) {
        if (closed.has(nb)) continue;
        const t = gS.get(c) + nodes[c].p.distanceTo(nodes[nb].p);
        if (t < (gS.get(nb) ?? 1e9)) { came.set(nb, c); gS.set(nb, t); fS.set(nb, t + nodes[nb].p.distanceTo(nodes[g].p)); if (!open.includes(nb)) open.push(nb); }
      }
    }
    return [nodes[g].p];
  }

  // ---------- ray tests ----------
  const _ray = new THREE.Ray(), _v = new THREE.Vector3();
  function rayWorld(origin, dir, maxD) { // returns distance to first solid or maxD
    _ray.set(origin, dir); let best = maxD;
    for (const b of solids) { const hit = _ray.intersectBox(b, _v); if (hit) { const d = hit.distanceTo(origin); if (d < best) best = d; } }
    // deck plane
    if (dir.y < 0 && origin.y > 0) { const d = -origin.y / dir.y; if (d < best) best = d; }
    return best;
  }
  function hasLOS(a, b) { const d = a.distanceTo(b); const dir = _v.clone().subVectors(b, a).normalize(); return rayWorld(a, dir, d) >= d - 0.05; }

  function update(t) {
    if (quality !== 'high') return;
    const p = seaGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) p[i + 1] = seaBase[i + 1] + Math.sin(seaBase[i] * 0.05 + t * 1.2) * 0.35 + Math.cos(seaBase[i + 2] * 0.07 + t) * 0.3;
    seaGeo.attributes.position.needsUpdate = true;
  }

  return { solids, nodes, covers, spawns, minimapRects, findPath, nearestNode, rayWorld, hasLOS, update, walkY: WY };
}

// --------- shared character physics ---------
const STEP = 0.5;
export function moveEntity(e, dx, dz, dt, solids) {
  const r = 0.38, h = e.crouch ? 1.15 : 1.75;
  const overlaps = (b, x, y, z) => x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + h > b.min.y && y < b.max.y - 0.001;
  const tryAxis = (nx, nz) => {
    let stepTo = e.pos.y;
    for (const b of solids) {
      if (!overlaps(b, nx, e.pos.y, nz)) continue;
      if (b.max.y - e.pos.y <= STEP && e.onGround) { stepTo = Math.max(stepTo, b.max.y); continue; }
      return false;
    }
    if (stepTo > e.pos.y) { for (const b of solids) if (overlaps(b, nx, stepTo, nz)) return false; e.pos.y = stepTo; }
    e.pos.x = nx; e.pos.z = nz; return true;
  };
  const blockedX = !tryAxis(e.pos.x + dx, e.pos.z);
  const blockedZ = !tryAxis(e.pos.x, e.pos.z + dz);
  // vertical
  e.vel.y -= 18 * dt;
  const oldY = e.pos.y; let ny = oldY + e.vel.y * dt; e.onGround = false;
  if (ny <= 0) { ny = 0; e.vel.y = 0; e.onGround = true; }
  for (const b of solids) {
    if (!(e.pos.x + r > b.min.x && e.pos.x - r < b.max.x && e.pos.z + r > b.min.z && e.pos.z - r < b.max.z)) continue;
    if (e.vel.y <= 0 && oldY >= b.max.y - 0.05 && ny < b.max.y) { ny = b.max.y; e.vel.y = 0; e.onGround = true; }
    else if (e.vel.y > 0 && oldY + h <= b.min.y + 0.05 && ny + h > b.min.y) { ny = b.min.y - h; e.vel.y = 0; }
  }
  e.pos.y = ny;
  return blockedX || blockedZ;
}
