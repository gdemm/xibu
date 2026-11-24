// lobby: a little line-up of the party characters idling on the grass (own small canvas, only renders while the lobby is open)
import * as THREE from 'three';
import { createSoldier, animateSoldier, ensureChar } from './critter.js';
import { pickedLook } from './roster.js';

export function lobbyChars(lobby) {
  const cv = document.createElement('canvas'); cv.id = 'lobbyChars'; lobby.insertBefore(cv, lobby.children[2] || null);
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); } catch (e) { cv.remove(); return; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fcf8f, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 8); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 2, 0.1, 60);
  const looks = [
    { skin: 'player' },
    { char: 'knight', gun: 'k' },
    { char: 'mage', gun: 'c' },
    { char: 'rogue-hood', gun: 'd' },
    { char: 'barbarian', gun: 'b' },
  ];
  const xs = [0, -1.6, 1.6, -3.2, 3.2, 4.8];
  const chars = looks.map((v, i) => {
    const g = createSoldier(v.skin || 'party', v.skin ? undefined : v);
    g.position.set(xs[i], 0, -Math.abs(xs[i]) * 0.18); g.rotation.y = Math.PI + (xs[i] * -0.09);
    if (g.userData.blob) g.userData.blob.visible = true;
    scene.add(g); return g;
  });
  // the wardrobe changed the player's character: swap the front figure once its model is loaded
  async function refresh() {
    const L = pickedLook(), same = () => { const n = pickedLook(); return n.char === L.char && n.look === L.look; };
    if (!(await ensureChar(L.char, L.look)) || !same()) return;
    const old = chars[0], g = createSoldier('player', { char: L.char, look: L.look });
    g.position.copy(old.position); g.rotation.copy(old.rotation); if (g.userData.blob) g.userData.blob.visible = true;
    scene.remove(old); scene.add(g); chars[0] = g;
  }
  addEventListener('party:char', refresh);
  let last = performance.now(), w = 0, h = 0, t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (lobby.classList.contains('hidden') || document.body.classList.contains('wardrobeOpen')) return;
    const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
    if (cw !== w || ch !== h) { w = cw; h = ch; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    t += dt;
    cam.position.set(0, 1.6, 8.6); cam.lookAt(0, 0.9, 0);
    chars.forEach((g, i) => {
      const cheer = (t * 0.6 + i * 1.7) % 8 < 1.9;   // now and then someone throws a little cheer
      animateSoldier(g, dt, { moveX: 0, moveZ: 0, speed: 0, yaw: g.rotation.y, crouch: false, aim: false, pitch: 0, reload: -1, cheer });
    });
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
}
