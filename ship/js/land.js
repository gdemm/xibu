// Landscape / fullscreen helper (shared copy in each game's js/ folder — keep identical).
// - Tap ⤢ / 横屏: pseudo-landscape (CSS-rotated body) is applied synchronously in the same gesture,
//   requestFullscreen + screen.orientation.lock are fired in the background and never awaited.
// - Once the real viewport has been landscape for ~300 ms the pseudo-landscape is dropped; if it
//   turns portrait again while landscape is still wanted, it comes back at once.
// - On a touch device in portrait the page is ALWAYS either pseudo-landscape or showing the rotate
//   hint (decided in JS from innerWidth/innerHeight, re-checked on every resize / orientation /
//   fullscreen / visibility change and by a slow safety poll), never the raw unrotated layout.
const STYLE_ID = 'landHelperCss';
export function createLand(o = {}) {
  const cls = o.cls || 'forceLand', hintSel = o.hintSel || '#rotateHint', key = o.key;
  const touch = o.isTouch ?? (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const body = document.body, de = document.documentElement;
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID;
    st.textContent = `body.landJs ${hintSel}{display:none!important}body.landJs.needRot ${hintSel}{display:flex!important}` +
      `.landBtn{touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;transition:transform .06s,filter .06s}` +
      `.landBtn:active,.landBtn.pressing{transform:scale(.9);filter:brightness(.8)}` +
      `.landBtn::after{content:"";position:absolute;inset:-6px -3px}${hintSel} .landBtn{min-height:48px;min-width:140px}`;
    document.head.appendChild(st);
  }
  let want = false; try { want = !!key && localStorage.getItem(key) === '1'; } catch (e) {}
  let on = body.classList.contains(cls), landSince = 0, timer = 0, raf = 0;
  const portrait = () => innerHeight > innerWidth;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const save = () => { if (!key) return; try { want ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch (e) {} };
  function apply(v) {
    if (body.classList.contains(cls) !== v) body.classList.toggle(cls, v); // also repairs a class removed by other code
    if (v === on) return; on = v;
    // game resize runs in the next animation frame: rAF callbacks run right before that frame's
    // style/paint, so the rotation and the resized canvas still land in the same frame, but the tap
    // handler itself returns immediately
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; try { o.onChange?.(on); } catch (e) { console.warn(e); } });
  }
  function guard() {
    clearTimeout(timer);
    const p = touch && portrait();
    if (p && want) { landSince = 0; apply(true); }
    else if (on) {
      if (want && !p) { // real landscape: drop the CSS rotation only once it has held for 300 ms
        const t = performance.now(); if (!landSince) landSince = t;
        if (t - landSince >= 300) apply(false); else timer = setTimeout(guard, 320 - (t - landSince));
      } else apply(false);
    } else landSince = 0;
    let allow = false; try { allow = !!o.allowPortrait?.(); } catch (e) {}
    body.classList.toggle('needRot', p && !on && !allow);
  }
  function fireNative() { // must stay synchronous inside the user gesture; results are never awaited
    try {
      const lock = () => { try { const r = screen.orientation?.lock?.('landscape'); r?.catch?.(() => {}); } catch (e) {} };
      const rf = de.requestFullscreen || de.webkitRequestFullscreen;
      let pr = null;
      if (!isFull() && rf) pr = rf.call(de, { navigationUI: 'hide' });
      if (pr && typeof pr.then === 'function') pr.then(lock, () => {}); else lock();
    } catch (e) {}
  }
  function enter() { want = true; save(); fireNative(); landSince = 0; guard(); o.onEnter?.(); }
  function exit() {
    want = false; save(); landSince = 0; guard();
    try { screen.orientation?.unlock?.(); } catch (e) {}
    try {
      if (document.fullscreenElement) document.exitFullscreen()?.catch?.(() => {});
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
    } catch (e) {}
    o.onExit?.();
  }
  const toggle = () => (on || (want && isFull())) ? exit() : enter();
  let last = 0;
  function bind(el, fn) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.classList.add('landBtn');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const h = (e) => {
      el.classList.remove('pressing'); e.stopPropagation();
      const n = performance.now(); if (n - last < 450) { if (e.cancelable && e.type !== 'pointerup') e.preventDefault(); return; }
      last = n; fn(e);
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.add('pressing'); });
    for (const t of ['pointercancel', 'pointerleave']) el.addEventListener(t, () => el.classList.remove('pressing'));
    el.addEventListener('pointerup', h); el.addEventListener('touchend', h); el.addEventListener('click', h);
  }
  for (const t of ['resize', 'orientationchange', 'pageshow', 'focus']) addEventListener(t, guard);
  for (const t of ['fullscreenchange', 'webkitfullscreenchange', 'visibilitychange']) document.addEventListener(t, guard);
  try { screen.orientation?.addEventListener?.('change', guard); } catch (e) {}
  setInterval(guard, 500);
  body.classList.add('landJs'); guard();
  return { enter, exit, toggle, bind, guard, isFull, isOn: () => on, wants: () => want, rotated: () => on && touch && portrait() };
}
