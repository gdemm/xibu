// 自动驾驶 (2026-11): the player's car follows the road network (center lines of the axis-aligned road strips: 环岛路,
// coast roads, spurs) toward a destination (the next safe zone's centre), then leaves the road for the last stretch.
// Pure pursuit on the route + three look-ahead rays for obstacles + a stuck/reverse fallback. Output = the same
// throttle / steer a thumb would give, so driveVehicle() and collisions are unchanged. Any manual input cancels it (main.js).

let GRAPH = null, GRAPH_ROADS = null;
function buildGraph(roads) {
  const lines = roads.map(([x0, z0, x1, z1]) => (x1 - x0 >= z1 - z0) ? { h: true, c: (z0 + z1) / 2, a: x0, b: x1, w: z1 - z0 } : { h: false, c: (x0 + x1) / 2, a: z0, b: z1, w: x1 - x0 });
  const nodes = [], key = new Map();
  const node = (x, z) => { const k = Math.round(x) + ',' + Math.round(z); let i = key.get(k); if (i == null) { i = nodes.length; key.set(k, i); nodes.push({ x, z, n: [] }); } return i; };
  const onLine = lines.map(() => []);
  lines.forEach((L, i) => { onLine[i].push([L.a + 2, node(...(L.h ? [L.a + 2, L.c] : [L.c, L.a + 2]))], [L.b - 2, node(...(L.h ? [L.b - 2, L.c] : [L.c, L.b - 2]))]); });
  for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
    const A = lines[i], B = lines[j]; if (!A.h || B.h) continue;            // horizontal x vertical crossings
    const pad = Math.max(A.w, B.w) / 2 + 1;
    if (B.c >= A.a - pad && B.c <= A.b + pad && A.c >= B.a - pad && A.c <= B.b + pad) { const k = node(B.c, A.c); onLine[i].push([B.c, k]); onLine[j].push([A.c, k]); }
  }
  // parallel strips that overlap (the short joiner pieces): link their nearest end nodes
  lines.forEach((L, i) => {
    const pts = onLine[i].sort((p, q) => p[0] - q[0]);
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1][1], b = pts[k][1]; if (a !== b) { const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); nodes[a].n.push([b, d]); nodes[b].n.push([a, d]); } }
  });
  return { nodes, lines };
}
function nearestOnRoads(G, x, z) {
  let best = null, bd = 1e9;
  G.lines.forEach((L, i) => {
    const t = Math.max(L.a + 2, Math.min(L.b - 2, L.h ? x : z)), px = L.h ? t : L.c, pz = L.h ? L.c : t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = { i, x: px, z: pz, d }; }
  });
  return best;
}
// node ids on line i (sorted along it)
function lineNodes(G, i) { const L = G.lines[i]; return G.nodes.map((n, k) => [k, n]).filter(([, n]) => L.h ? Math.abs(n.z - L.c) < 0.6 && n.x >= L.a - 4 && n.x <= L.b + 4 : Math.abs(n.x - L.c) < 0.6 && n.z >= L.a - 4 && n.z <= L.b + 4).map(([k]) => k); }
function route(G, sx, sz, tx, tz) {
  const s = nearestOnRoads(G, sx, sz), t = nearestOnRoads(G, tx, tz);
  if (!s || !t) return [{ x: tx, z: tz }];
  const pts = [];
  if (s.d > 3) pts.push({ x: s.x, z: s.z, road: 1 });
  if (s.i === t.i) { pts.push({ x: t.x, z: t.z, road: 1 }); }
  else {
    // Dijkstra from the start projection (virtual node) over the graph to the target projection
    const N = G.nodes, dist = new Float64Array(N.length).fill(1e9), prev = new Int32Array(N.length).fill(-1), done = new Uint8Array(N.length);
    for (const k of lineNodes(G, s.i)) dist[k] = Math.hypot(N[k].x - s.x, N[k].z - s.z);
    const goal = new Set(lineNodes(G, t.i)); let end = -1, endD = 1e9;
    for (;;) {
      let c = -1, cd = 1e9; for (let k = 0; k < N.length; k++) if (!done[k] && dist[k] < cd) { cd = dist[k]; c = k; }
      if (c < 0) break; done[c] = 1;
      if (goal.has(c)) { const tot = cd + Math.hypot(N[c].x - t.x, N[c].z - t.z); if (tot < endD) { endD = tot; end = c; } }
      for (const [nb, w] of N[c].n) if (cd + w < dist[nb]) { dist[nb] = cd + w; prev[nb] = c; }
    }
    const chain = []; for (let k = end; k >= 0; k = prev[k]) chain.unshift({ x: N[k].x, z: N[k].z, road: 1 });
    pts.push(...chain, { x: t.x, z: t.z, road: 1 });
  }
  pts.push({ x: tx, z: tz });
  return pts;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// returns { thr, st, done, msg } for this frame. A = per-car autopilot state (v.auto)
export function autoDrive(v, dt, map, vehicles, dest, opt = {}) {
  if (!map.roads?.length) return { thr: 0, st: 0, done: true, msg: '这张地图没有道路' };
  if (GRAPH_ROADS !== map.roads) { GRAPH = buildGraph(map.roads); GRAPH_ROADS = map.roads; }
  if (!Number.isFinite(v.pos.x) || !Number.isFinite(v.pos.z)) return { thr: 0, st: 0, done: false };
  const A = v.auto || (v.auto = {});
  if (!A.path || Math.hypot(A.dest.x - dest.x, A.dest.z - dest.z) > 15 || (A.repath -= dt) < 0) {
    A.path = route(GRAPH, v.pos.x, v.pos.z, dest.x, dest.z); A.dest = { x: dest.x, z: dest.z }; A.repath = 6; A.wp = 0;
  }
  const P = A.path;
  // advance past waypoints we've reached (or that are behind us on the way to the next one)
  while (A.wp < P.length - 1) { const w = P[A.wp]; if (Math.hypot(w.x - v.pos.x, w.z - v.pos.z) < 5 + Math.abs(v.speed) * 0.25) A.wp++; else break; }
  const last = P[P.length - 1], toEnd = Math.hypot(last.x - v.pos.x, last.z - v.pos.z);
  if (toEnd < (opt.arrive || 6)) return { thr: v.speed > 0.5 ? -1 : 0, st: 0, done: Math.abs(v.speed) < 0.6, msg: opt.arriveMsg || '已到达安全区，自动驾驶结束' };
  const w = P[A.wp], fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  // keep to the right-hand lane on road legs (target shifted 1.7 m right of the leg's direction)
  // pure pursuit: aim at a point ~9 m (+ speed) ahead along the current leg, shifted into the lane
  let wx = w.x, wz = w.z; const pw = A.wp > 0 ? P[A.wp - 1] : null;
  if (w.road && pw && pw.road) {
    const lx = w.x - pw.x, lz = w.z - pw.z, ll = Math.hypot(lx, lz) || 1, ux = lx / ll, uz = lz / ll;
    const along = Math.min(ll, Math.max(0, (v.pos.x - pw.x) * ux + (v.pos.z - pw.z) * uz) + 9 + Math.abs(v.speed) * 0.4);
    wx = pw.x + ux * along - uz * 1.7; wz = pw.z + uz * along + ux * 1.7;
  }
  // bypass: a stopped / slow car sits in our way -> drive to a point beside and past it, then rejoin the lane
  const Lx = -Math.cos(v.yaw), Lz = Math.sin(v.yaw);                    // left of our heading
  A.bypT = (A.bypT || 0) - dt; A.badT = (A.badT || 0) - dt;
  if (!(A.bypT > 0)) {
    A.byp = null; let blk = null, bd = 6 + Math.abs(v.speed) * 0.9;
    for (const o of vehicles) { if (o === v || Math.abs(o.speed || 0) > 2.5 || !o.T) continue;
      const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z, al = ox * fx + oz * fz, lat = ox * Lx + oz * Lz;
      if (al > 0 && al < bd && Math.abs(lat) < o.T.wid + v.T.wid + 0.7) { bd = al; blk = { o, lat }; } }
    if (blk) {
      const o = blk.o, clear = o.T.wid + v.T.wid + 1.3, eye = { x: v.pos.x, y: 0.9, z: v.pos.z };
      const cand = [1, -1].map(sd => { const bx = o.pos.x + Lx * sd * clear + fx * (o.T.len + 3), bz = o.pos.z + Lz * sd * clear + fz * (o.T.len + 3), dx = bx - v.pos.x, dz = bz - v.pos.z, dl = Math.hypot(dx, dz) || 1;
        const free = map.rayWorld(eye, { x: dx / dl, y: 0, z: dz / dl }, dl) >= dl - 0.5; return { sd, bx, bz, free, pref: (sd > 0 ? 0.5 : 0) - sd * blk.lat - (A.badT > 0 && A.bad === sd ? 6 : 0) }; });
      const pick = cand.filter(c => c.free).sort((a, b) => b.pref - a.pref)[0] || cand.sort((a, b) => b.pref - a.pref)[0];
      A.byp = { x: pick.bx, z: pick.bz, sd: pick.sd }; A.bypT = 4.5;
    }
  }
  if (A.byp) { const ax = A.byp.x - v.pos.x, az = A.byp.z - v.pos.z; if (Math.hypot(ax, az) < 3 || ax * fx + az * fz < 0) { A.byp = null; A.bypT = 0.4; } else { wx = A.byp.x; wz = A.byp.z; } }
  let want = Math.atan2(-(wx - v.pos.x), -(wz - v.pos.z));
  // next corner: slow down for it
  const nx = P[Math.min(P.length - 1, A.wp + 1)], turnAhead = Math.abs(wrap(Math.atan2(-(nx.x - w.x), -(nx.z - w.z)) - want));
  const dW = Math.hypot(w.x - v.pos.x, w.z - v.pos.z);
  // obstacles: three probes ahead (walls / props via the ray grid, other cars via the footprint test)
  const look = 7 + Math.abs(v.speed) * 0.7, eye = { x: v.pos.x, y: 0.9, z: v.pos.z };
  const probe = (a) => { const d = { x: -Math.sin(v.yaw + a), y: 0, z: -Math.cos(v.yaw + a) }; let r = map.rayWorld(eye, d, look);
    for (const o of vehicles) { if (o === v) continue; const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z, al = ox * d.x + oz * d.z; if (al > 0 && al < r && Math.abs(ox * -d.z + oz * d.x) < o.T.wid + v.T.wid + 0.4) r = Math.max(0, al - o.T.len); }
    return r; };
  A.pT = (A.pT || 0) - dt;
  if (A.pT <= 0) { A.pT = 0.1; A.pc = probe(0); A.pl = probe(0.2); A.pr = probe(-0.2); }   // 10 Hz is plenty at these speeds
  let avoid = 0; if (A.pc < look * 0.95 || A.pl < look * 0.4 || A.pr < look * 0.4) avoid = (A.pl > A.pr ? 1 : -1) * (1 - Math.min(A.pc, A.pl, A.pr) / look);
  want += avoid * (A.byp ? 0.4 : 0.9);
  const err = wrap(want - v.yaw);
  const cruise = opt.cruise ? Math.min(v.T.max * 0.85, opt.cruise) : Math.min(v.T.max * 0.6, 14);
  let tgt = cruise * (1 - Math.min(0.6, Math.abs(err) * 0.6));
  if (dW < 18 && turnAhead > 0.6) tgt = Math.min(tgt, 7);
  if (A.pc < look * 0.6) tgt = Math.min(tgt, A.byp ? Math.max(4, 3 + A.pc * 0.5) : 3 + A.pc * 0.5);
  if (A.byp) tgt = Math.min(tgt, 7);
  tgt = Math.min(tgt, 3 + toEnd * 0.6);
  // stuck: barely moving while we want to go -> back up with the wheel turned for a second
  if (A.rev > 0) { A.rev -= dt; return { thr: -0.8, st: A.revSd || (err > 0 ? 1 : -1), done: false }; }
  if (Math.abs(v.speed) < 0.8 && tgt > 2) { A.stuck = (A.stuck || 0) + dt; if (A.stuck > 1.0) { A.stuck = 0; A.rev = 1.1; A.path = null; if (A.byp) { A.bad = A.byp.sd; A.badT = 6; A.revSd = -A.byp.sd; } else A.revSd = 0; A.byp = null; A.bypT = 0; } } else A.stuck = 0;
  const st = Math.max(-1, Math.min(1, -err * 2.2));
  const thr = Math.max(-1, Math.min(1, (tgt - v.speed) / 3));
  return { thr, st, done: false };
}
// GPS route (road waypoints then the target) for the minimap / on-foot auto-path
export function routePath(map, sx, sz, tx, tz) {
  if (!map.roads?.length) return [{ x: tx, z: tz }];
  if (GRAPH_ROADS !== map.roads) { GRAPH = buildGraph(map.roads); GRAPH_ROADS = map.roads; }
  return route(GRAPH, sx, sz, tx, tz);
}
export function resetAuto(v) { if (v) v.auto = null; }
