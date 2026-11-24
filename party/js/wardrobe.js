// 角色仓库 (wardrobe): pick the player's character from the 6 base looks, then one of its 5 skins (原版 + 4 recolors), delete ones you don't want (long-press, or 编辑 + ✕),
// restore deleted ones. Choice and deletions live in localStorage (roster.js). The 3D preview loads only the shown model.
import * as THREE from 'three';
import { createSoldier, animateSoldier, ensureChar, charsReady } from './critter.js';
import { WARDROBE, SKINS, visibleWardrobe, pickedId, setPicked, pickedSkin, setSkin, skinsOf, skinThumbOf, resolveLook, deleteChar, deletedIds, restoreAll, REG } from './roster.js';

let longFired = false, dlgAt = 0, el = null, grid, skinRow, prevCv, prevName, btnEdit, btnRestore, dlg, toastEl, editing = false;
let R = null, scene, cam, fig = null, figId = '', shownKey = '', raf = 0, last = 0, spin = 0, toastT = 0;

function build() {
  el = document.createElement('div'); el.id = 'wardrobe'; el.className = 'hidden';
  el.innerHTML = `<div class="wdHead"><button class="wdBack" id="wdBack">‹ 返回</button><h2>角色仓库</h2>
      <button class="wdBtn" id="wdEdit">编辑</button><button class="wdBtn" id="wdRestore">恢复已删除</button></div>
    <div class="wdBody"><div class="wdPrev"><canvas id="wdCanvas"></canvas><img id="wdImg" alt="" draggable="false" style="position:absolute;inset:12% 10% 10%;width:80%;height:78%;object-fit:contain;display:none"><div class="wdName" id="wdName"></div><div class="wdHint">点选角色 · 长按删除</div></div>
      <div class="wdRight"><div class="wdGrid" id="wdGrid"></div>
        <div class="wdSkinBox"><div class="wdSkinT">皮<br>肤</div><div class="wdSkins" id="wdSkins"></div></div></div></div>
    <div class="wdDlg hidden" id="wdDlg"><div class="wdBox"><p id="wdMsg"></p><div class="wdRow"><button id="wdNo">取消</button><button id="wdYes" class="danger">删除</button></div></div></div>
    <div class="wdToast hidden" id="wdToast"></div>`;
  (document.getElementById('lobby') || document.body).appendChild(el);     // inside the lobby: the ⤢ / ✕ buttons stay on top
  grid = el.querySelector('#wdGrid'); skinRow = el.querySelector('#wdSkins'); prevCv = el.querySelector('#wdCanvas'); prevName = el.querySelector('#wdName');
  btnEdit = el.querySelector('#wdEdit'); btnRestore = el.querySelector('#wdRestore'); dlg = el.querySelector('#wdDlg'); toastEl = el.querySelector('#wdToast');
  el.querySelector('#wdBack').onclick = close;
  btnEdit.onclick = () => { editing = !editing; render(); };
  btnRestore.onclick = () => {
    const n = deletedIds().length; if (!n) return;
    ask(`恢复已删除的 ${n} 个角色？`, '恢复', () => { restoreAll(); render(); toast(`已恢复 ${n} 个角色`); });
  };
  skinRow.addEventListener('click', (e) => {
    const c = e.target.closest('.wdSkin'); if (!c) return;
    const id = pickedId(), look = c.dataset.look; if (look === pickedSkin(id)) return;
    setSkin(id, look); render(); dispatchEvent(new Event('party:char'));
  });
  el.querySelector('#wdNo').onclick = () => { if (performance.now() - dlgAt > 450) hideDlg(); };
  // grid: tap = pick, long-press (or ✕ in edit mode) = delete
  let pressT = 0, pressId = '';
  grid.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.wdCard'); if (!c) return; pressId = c.dataset.id; longFired = false;
    clearTimeout(pressT); pressT = setTimeout(() => { longFired = true; askDelete(pressId); }, 550);
  });
  const cancel = () => clearTimeout(pressT);
  grid.addEventListener('pointerup', cancel); grid.addEventListener('pointercancel', cancel); grid.addEventListener('pointerleave', cancel);
  grid.addEventListener('scroll', cancel, { passive: true });
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  grid.addEventListener('click', (e) => {
    const c = e.target.closest('.wdCard'); if (!c || longFired) { longFired = false; return; }
    if (e.target.closest('.wdDel')) { askDelete(c.dataset.id); return; }
    if (editing) return;
    setPicked(c.dataset.id); render(); dispatchEvent(new Event('party:char'));
  });
}
function ask(msg, yes, fn) {
  el.querySelector('#wdMsg').textContent = msg; const y = el.querySelector('#wdYes'); y.textContent = yes;
  // the finger lifting after a long-press must not land on a dialog button: ignore taps in the first 450 ms
  y.onclick = () => { if (performance.now() - dlgAt < 450) return; hideDlg(); fn(); }; dlgAt = performance.now(); dlg.classList.remove('hidden');
}
function hideDlg() { dlg.classList.add('hidden'); el.querySelector('#wdYes').onclick = null; longFired = false; }
function askDelete(id) {
  if (visibleWardrobe().length <= 1) { toast('至少保留 1 个角色'); return; }
  ask(`删除「${REG[id].name}」？\n删除后可点「恢复已删除」找回`, '删除', () => {
    const was = pickedId(); deleteChar(id); render(); toast(`已删除「${REG[id].name}」`);
    if (was !== pickedId()) dispatchEvent(new Event('party:char'));
  });
}
function toast(t) { toastEl.textContent = t; toastEl.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add('hidden'), 1800); }
function render() {
  const vis = visibleWardrobe(), pick = pickedId(), nDel = deletedIds().length;
  el.classList.toggle('editing', editing); btnEdit.textContent = editing ? '完成' : '编辑';
  btnRestore.textContent = nDel ? `恢复已删除(${nDel})` : '恢复已删除'; btnRestore.disabled = !nDel;
  grid.innerHTML = vis.map(e => `<div class="wdCard${e.id === pick ? ' on' : ''}" data-id="${e.id}"><img src="${e.thumb}" alt="" draggable="false" loading="lazy">
    <span class="wdN">${e.name}</span><span class="wdV">${e.ver}</span>${vis.length > 1 ? '<button class="wdDel" aria-label="删除">✕</button>' : ''}</div>`).join('');
  const look = pickedSkin(pick);
  const all = skinsOf(pick);
  skinRow.innerHTML = all.map(k => `<button class="wdSkin${k.id === look ? ' on' : ''}${k.model ? ' model' : ''}" data-look="${k.id}"><img src="${skinThumbOf(pick, k.id)}" alt="" draggable="false" loading="lazy"><span>${k.name}</span></button>`).join('');
  prevName.textContent = REG[pick].name + (look ? ' · ' + all.find(k => k.id === look).name : '');
  const on = skinRow.querySelector('.on'); if (on) { const l = on.offsetLeft - skinRow.offsetLeft; if (l < skinRow.scrollLeft || l + on.offsetWidth > skinRow.scrollLeft + skinRow.clientWidth) skinRow.scrollLeft = l - 8; }
  const L = resolveLook(pick, look);
  // 2D picture of exactly the chosen skin until its 3D model is on screen (and for good if 3D is unavailable)
  const img = el.querySelector('#wdImg'), src = skinThumbOf(pick, look);
  if (!img.src.endsWith(src.slice(1))) img.src = src;
  const showing = shownKey === L.char + '|' + L.look;
  img.style.display = showing ? 'none' : 'block'; prevCv.style.visibility = showing ? '' : 'hidden';
  showFig(L.char, L.look);
}
async function showFig(id, look) {
  const key = id + '|' + look; if (figId === key) return; figId = key;
  if (!R || !charsReady()) return;
  const ok = await ensureChar(id, look); if (!ok || figId !== key) return;
  if (fig) scene.remove(fig);
  shownKey = key; const img = el.querySelector('#wdImg'); img.style.display = 'none'; prevCv.style.visibility = '';
  fig = createSoldier('player', { char: id, look, gun: 'h' }); fig.rotation.y = Math.PI + 0.35; if (fig.userData.blob) fig.userData.blob.visible = true; scene.add(fig);
}
function initGL() {
  try { R = new THREE.WebGLRenderer({ canvas: prevCv, alpha: true, antialias: true }); } catch (e) { R = null; return; }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fcf8f, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 8); scene.add(sun);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.08, 32), new THREE.MeshLambertMaterial({ color: 0x7ccf58 })); pad.position.y = -0.04; scene.add(pad);
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
}
function frame(now) {
  if (!el || el.classList.contains('hidden')) { raf = 0; return; }
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  const w = prevCv.clientWidth, h = prevCv.clientHeight; if (!R || !w || !h) return;
  if (prevCv.width !== Math.round(w * R.getPixelRatio()) || prevCv.height !== Math.round(h * R.getPixelRatio())) { R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const fit = Math.max(1, 0.9 / cam.aspect);   // tall narrow canvas: back off so the whole body fits
  cam.position.set(0, 1.05, 5.6 * fit); cam.lookAt(0, 0.8, 0);
  if (fig) { spin += dt * 0.5; fig.rotation.y = Math.PI + Math.sin(spin) * 0.6; animateSoldier(fig, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: fig.rotation.y, crouch: false, aim: true, pitch: 0, reload: -1, ground: true, wep: 'rifle' }); }
  R.render(scene, cam);
}
export function openWardrobe() {
  if (!el) build();
  if (!R) initGL();
  editing = false; figId = ''; shownKey = ''; el.classList.remove('hidden'); document.body.classList.add('wardrobeOpen');
  render(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeWardrobe() { close(); }
function close() { if (!el) return; el.classList.add('hidden'); hideDlg(); document.body.classList.remove('wardrobeOpen'); }
export { WARDROBE };
