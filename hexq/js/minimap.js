// Q版大乱斗 minimap: corner 2D canvas, ARAM lane drawn diagonally (blue base bottom-left, red top-right),
// Howling-Abyss colours, structures / minions / hero portraits / camera view. Redrawn ~10 Hz, no WebGL.
import * as THREE from 'three';
import { LANE, laneHalf } from './world.js';

const TEAM = ['#3d9bff', '#ff4b4b'], TEAM_D = ['#123a75', '#7a1620'], ME = '#eaffaf';
const PORT_N = 9;

export function createMinimap({ canvas, G, camera, heroNames }) {
  const S = 120; // css px (square)
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(S * dpr);
  const ctx = canvas.getContext('2d');
  // world (x along lane, z across) -> minimap px. Lane axis = diagonal bottom-left -> top-right.
  const k = S * Math.SQRT2 * 0.8 / (LANE.maxX - LANE.minX), r2 = Math.SQRT1_2, KZ = 1.75; // across-lane scale exaggerated so the strip reads on a phone
  const P = (x, z) => [S / 2 + (x + z * KZ) * k * r2, S / 2 + (-x + z * KZ) * k * r2];

  // static background (built once)
  const bg = document.createElement('canvas'); bg.width = bg.height = canvas.width;
  {
    const b = bg.getContext('2d'); b.scale(dpr, dpr);
    const g = b.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * .75); g.addColorStop(0, '#1d2847'); g.addColorStop(1, '#0a0f22');
    b.fillStyle = g; b.fillRect(0, 0, S, S);
    // faint "abyss" bridge pillars / rocks outside the lane
    b.fillStyle = 'rgba(60,78,108,.35)';
    for (let i = 0; i < 14; i++) { const x = -48 + i * 7.4, s = i % 2 ? 1 : -1, [px, py] = P(x, s * (laneHalf(x) + 2.4)); b.beginPath(); b.arc(px, py, 1.6 + (i % 3) * .5, 0, 7); b.fill(); }
    const outline = (pad) => { b.beginPath(); for (let x = LANE.minX; x <= LANE.maxX + .01; x += 1) { const [px, py] = P(x, -(laneHalf(x) + pad)); x === LANE.minX ? b.moveTo(px, py) : b.lineTo(px, py); } for (let x = LANE.maxX; x >= LANE.minX - .01; x -= 1) { const [px, py] = P(x, laneHalf(x) + pad); b.lineTo(px, py); } b.closePath(); };
    // snow rim
    outline(1.4); b.fillStyle = '#8399b5'; b.fill();
    // stone lane, blue / red tint toward the bases
    outline(0); const [ax, ay] = P(LANE.minX, 0), [bx, by] = P(LANE.maxX, 0);
    const lg = b.createLinearGradient(ax, ay, bx, by);
    lg.addColorStop(0, '#2f5a86'); lg.addColorStop(.2, '#3f6470'); lg.addColorStop(.5, '#4a6a74'); lg.addColorStop(.8, '#6a4a58'); lg.addColorStop(1, '#863a48');
    b.fillStyle = lg; b.fill();
    // worn centre path
    b.strokeStyle = 'rgba(30,42,50,.55)'; b.lineWidth = 3.2; b.lineCap = 'round'; b.beginPath(); b.moveTo(...P(-44, 0)); b.lineTo(...P(44, 0)); b.stroke();
    // fountains
    for (const t of [0, 1]) { const [fx, fy] = P((t ? 1 : -1) * 52.5, 0); b.beginPath(); b.arc(fx, fy, 6 * k * 1.3, 0, 7); b.fillStyle = t ? 'rgba(255,75,75,.28)' : 'rgba(61,155,255,.3)'; b.fill(); }
  }

  // portraits
  const port = new Image(); port.src = './assets/ui/portraits.webp';
  // ground-plane camera footprint
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  function footprint() {
    const pts = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      ndc.set(x, y); ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) { // ray above horizon: clamp far
        const d = ray.ray.direction; hit.copy(ray.ray.origin).addScaledVector(d, 60); hit.y = 0;
      }
      pts.push(P(Math.max(-62, Math.min(62, hit.x)), Math.max(-12.5, Math.min(12.5, hit.z))));
    }
    return pts;
  }

  function structIcon(s, myTeam) {
    const [x, y] = P(s.x, s.z), team = s.team;
    const col = s.alive ? TEAM[team] : '#5c6270', dark = s.alive ? TEAM_D[team] : '#2a2e38';
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#05070f';
    if (s.kind === 'tower') { // shield-ish tower glyph
      ctx.beginPath(); ctx.moveTo(x, y - 4.2); ctx.lineTo(x + 3.4, y - 1.6); ctx.lineTo(x + 2.4, y + 3.6); ctx.lineTo(x - 2.4, y + 3.6); ctx.lineTo(x - 3.4, y - 1.6); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.stroke(); if (s.alive) { ctx.fillStyle = dark; ctx.fillRect(x - 1, y - 1, 2, 3); }
    } else if (s.kind === 'inhib') {
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fillStyle = dark; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fillStyle = col; ctx.fill();
    } else { // nexus: diamond
      ctx.beginPath(); ctx.moveTo(x, y - 5.2); ctx.lineTo(x + 4.6, y); ctx.lineTo(x, y + 5.2); ctx.lineTo(x - 4.6, y); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 2.6, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 2.6, y); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
  }

  function heroIcon(u) {
    const [x, y] = P(u.x, u.z), me = u.isPlayer, r = me ? 6.6 : 5.4;
    ctx.beginPath(); ctx.arc(x, y, r + 1.4, 0, 7); ctx.fillStyle = '#04111b'; ctx.fill();
    const i = heroNames.indexOf(u.name);
    if (port.complete && port.naturalWidth && i >= 0) {
      const cw = port.naturalWidth / PORT_N, ch = port.naturalHeight;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
      ctx.drawImage(port, i * cw + cw * .14, ch * .04, cw * .72, ch * .72, x - r, y - r, r * 2, r * 2); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = TEAM[u.team]; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.strokeStyle = me ? ME : TEAM[u.team]; ctx.lineWidth = me ? 2 : 1.6; ctx.stroke();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const my = G.player ? G.player.team : 0;
    for (const s of G.structs) structIcon(s, my);
    for (const m of G.minions) {
      if (!m.alive) continue; const [x, y] = P(m.x, m.z);
      ctx.fillStyle = m.team === 0 ? '#7cc4ff' : '#ff8a7a'; const r = m.type === 'siege' ? 1.9 : 1.3;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // camera view
    const fp = footprint(); ctx.beginPath(); fp.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();
    // heroes: enemies, allies, then player on top
    const hs = G.heroes.filter(u => u.alive).sort((a, b) => (a.isPlayer - b.isPlayer) || ((a.team === my) - (b.team === my)));
    for (const u of hs) heroIcon(u);
  }

  let acc = 1;
  return {
    tick(dt) { acc += dt; if (acc >= .1) { acc = 0; draw(); } },
    draw,
  };
}
