// HUD helpers: scores, timer, ammo, hp, kill feed, hit marker, minimap, scoreboard
import { SHIP } from './map.js';
import { brHud, brMinimap } from './br.js';
const $ = (id) => document.getElementById(id);
const TEAMNAME = { blue: '海鹰队', red: '赤鲨队' };

export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

let lastHud = '';
export function updateHud(G) {
  const p = G.player, w = G.weapon;
  const key = [G.scores.blue, G.scores.red, Math.ceil(G.timeLeft), p.hp | 0, w.id, G.ammo[w.id].mag, G.ammo[w.id].reserve, G.reloading ? 1 : 0].join('|');
  if (G.br) { const b = brHud(G); const k2 = key + b.left + b.right + b.mid; if (k2 === lastHud) return; lastHud = k2; $('sBlue').textContent = b.left; $('sRed').textContent = b.right; $('timer').textContent = ''; $('target').textContent = b.mid; }
  else { if (key === lastHud) return; lastHud = key;
  $('sBlue').textContent = G.scores.blue; $('sRed').textContent = G.scores.red;
  $('timer').textContent = fmtTime(G.timeLeft); }
  $('hpNum').textContent = Math.max(0, p.hp | 0);
  $('hpFill').style.width = Math.max(0, p.hp) + '%';
  $('hpFill').style.background = p.hp > 50 ? '#4cd17a' : p.hp > 25 ? '#f2b33d' : '#ff4b3e';
  $('wName').textContent = w.name + (G.reloading ? ' · 换弹中' : '');
  const a = G.ammo[w.id];
  $('ammo').innerHTML = w.melee ? '∞' : `<b>${a.mag}</b><span> / ${a.reserve}</span>`;
  $('ammo').classList.toggle('low', !w.melee && a.mag <= Math.ceil(w.mag * 0.25));
}

export function killFeed(killer, victim, weaponName, head) {
  const el = document.createElement('div'); el.className = 'kf';
  const c = (e) => `<span class="${e.skin || e.team}${e.isPlayer ? ' me' : ''}">${e.name}</span>`;
  el.innerHTML = `${c(killer)} <i>[${weaponName}]</i>${head ? ' <em>爆头</em>' : ''} ${c(victim)}`;
  const box = $('killfeed'); box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 4500); setTimeout(() => el.remove(), 5200);
}

let hmT = 0;
export function hitMarker(kind) { // 'hit' | 'head' | 'kill'
  const h = $('hitmark'); h.className = 'show ' + kind; clearTimeout(hmT); hmT = setTimeout(() => h.className = '', kind === 'kill' ? 350 : 160);
}
export function centerMsg(text, ms = 1200) { const c = $('centerMsg'); c.textContent = text; c.classList.add('show'); clearTimeout(c._t); if (ms) c._t = setTimeout(() => c.classList.remove('show'), ms); }

export function drawMinimap(G, ctx, w, h) {
  const BD = G.map.bounds || SHIP, isl = G.map.kind === 'island';
  const sx = w / (BD.maxX - BD.minX + 2), sz = h / (BD.maxZ - BD.minZ + 1);
  const mx = (x) => (x - BD.minX + 1) * sx, mz = (z) => (z - BD.minZ + 0.5) * sz;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20,30,40,.6)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = isl ? 'rgba(80,110,60,.85)' : 'rgba(120,110,95,.75)'; ctx.fillRect(mx(BD.minX), mz(BD.minZ), (BD.maxX - BD.minX) * sx, (BD.maxZ - BD.minZ) * sz);
  for (const r of G.map.minimapRects) { ctx.fillStyle = r.c; ctx.fillRect(mx(r.x0), mz(r.z0), Math.max(1, (r.x1 - r.x0) * sx), Math.max(1, (r.z1 - r.z0) * sz)); }
  if (G.vehicles) { ctx.fillStyle = '#e8eef5'; for (const v of G.vehicles) { const k = v.type === 'bus' || v.type === 'truck' ? 3 : 2; ctx.fillRect(mx(v.pos.x) - k, mz(v.pos.z) - k, k * 2, k * 2); } }
  if (G.br) brMinimap(G, ctx, mx, mz, sx, sz);
  const me = G.player;
  for (const e of G.entities) {
    if (!e.alive || e === me) continue;
    const ally = e.team === me.team;
    if (!ally && G.now - (e.lastFired || -9) > 1.5) continue;
    ctx.fillStyle = (e.skin || e.team) === 'blue' ? '#4da3ff' : '#ff5a4d';
    ctx.beginPath(); ctx.arc(mx(e.pos.x), mz(e.pos.z), ally ? 2.6 : 3.2, 0, 7); ctx.fill();
  }
  if (me.alive) {
    const x = mx(me.pos.x), y = mz(me.pos.z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-me.yaw);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

export function scoreboardHTML(G, title) {
  const rows = (team) => G.entities.filter(e => e.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .map(e => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.name}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`).join('');
  const tbl = (team) => `<div class="sbTeam ${team}"><h3>${TEAMNAME[team]} <b>${G.scores[team]}</b></h3><table><tr><th>队员</th><th>击杀</th><th>阵亡</th></tr>${rows(team)}</table></div>`;
  return `${title ? `<h2>${title}</h2>` : ''}<div class="sbWrap">${tbl('blue')}${tbl('red')}</div>`;
}
export { TEAMNAME };
