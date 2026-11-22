# Q版大乱斗 (hexq) — status 2026-11-22

## Step 1 (playable loop) — done, not committed
- index.html + js/game.js: hero pick (9 portrait buttons), 5v5 on world.js lane, touch joystick (left 45% of screen) + 攻击 button, WASD / click-move / click-enemy-attack / Space on desktop, follow camera, auto-attacks (melee ≤200 units instant hit, ranged = projectile; 1 m = 100 units), HP bars (instanced Bars), bot AI (lane front following, hero-first targeting, tower-dive avoidance, retreat <30% HP to fountain, heal there), towers (7.75 m, hero aggro rule), structure order tower→tower→inhib→nexus, minion waves every 30 s (siege every 3rd), fountain heal / enemy-fountain burn, death + respawn (10 s + up to 10), win/lose screen, ⤢ / red ✕ (party goFull/exitFull/setForceLand), FPS + draw-call counter. QWER are stub buttons ("技能下一步开放").
- Fixed in world.js: outlineMat used `objectNormal` (undefined in MeshBasicMaterial vertex shader) → `normal`. heroes.js ran without errors.
- Debug hooks: window.__hq = { G, step, P, renderer, camera, info, fps, ready, startMatch }.

## Test (Playwright, swiftshader, 915x412 touch)
- 0 page errors / 0 console errors.
- 10 heroes on screen at mid: 62–67 draw calls, ~129k triangles (normal lane view ~52–55 dc, ~99k tris). swiftshader FPS ~20 (CPU raster, not representative).
- Headless 11-min fast-forward: towers/inhib/nexus fall in order, game ended with winner, kills/deaths tracked.
- Scripts: /workspace/work/hexq_test.py, /workspace/work/hexq_sim.py.

## Known issues / next
- Minions can pile up in a stalemate (saw 84 alive); renderer cap raised to 80 per type+team, extras are invisible but still fight. Consider minion despawn/cap or stronger towers vs minions.
- No gold/levels/items; no animation cancel (moving waits for wind-up).
- ~~Skills (QWER) next step.~~ done in step 2.

## Step 2 (camera, tris, QWER + Flash) — done 2026-11-22, not committed
Backup of step-1 files: /workspace/work/hexq_bak_step1/ (index.html, js/, STATUS.md).
- Camera: landscape follow cam was y 15.5 / back 10.5 (~56° pitch, hero ≈ 25 px tall on 412 px); now y 9 / back 8.6, lookAt 0.9 m ahead (~46°, ~12.5 m) → player hero ≈ 49 px (≈1/8 screen height). Portrait: 15 / 11. Hero anim-LOD distance 16 → 11 m.
- Tris (world.js): scenery outlines only on 'high' (touch = mid → none); scenery instanced in 24 m x-chunks so off-screen chunks frustum-cull; pines open-ended 6-seg cones, one snow band less; rocks dodeca+octa; mounds 7x3; ground grid 124→62 x-segments; minion spheres/eyes fewer segments; FX ring 40→32 segs.
- Minion cap: a team with ≥30 alive minions skips spawns (MINION_CAP in game.js). 8-min sims: max 27–30 per team.
- Skills: data table SK in game.js (section "per-hero QWER"), castSlot(u, slot 0-4, aimPoint|null), status effects (stun/air/root/slow/blind/silence/mark/reveal/shield/dr/haste/dots), skillshots (G.shots, pierce/return/accel/wind-wall block), zones/traps (G.zones), dashes (u.dash, carry), timed effects, Yasuo walls (G.walls block enemy shots + auto-attack projectiles). Bots: botSkills() casts when an enemy hero is in a skill's ai range (globals only on low-HP targets, some Q's on minions), flash away when <20% HP.
- Input: touch tap = auto-cast (nearest enemy in range, else facing); drag from a button = aim (drag back onto button = cancel), aim line/ring drawn. Keyboard Q/W/E/R at mouse ground point, D/F = Flash (4 m, 90 s). Because W/D are skills now, keyboard movement is arrows + click-to-move (WASD removed). Skill buttons use assets/ui/icons.webp (5 cols QWER+passive × rows per hero; Flash = row 10 col 0) with conic cooldown overlay + seconds; shown on desktop too (joystick/攻击 hidden there).
- Per hero: Ahri Q orb out-and-back / W 3 fox-fire homing / E charm skillshot (1.2 s stun) / R dash + 3 bolts. Ashe Q attack-speed buff / W 7-arrow slow volley / E hawk reveals 5 m zone (+10% dmg taken) / R global stun arrow (1–3.5 s by distance). Ezreal Q skillshot (−1.5 s CDs on hit) / W mark (next Ezreal hit +90) / E blink + bolt / R 0.6 s-cast global wide beam. Garen Q haste + next hit +60 & silence / W 35% DR + shield / E 3 s spin / R execute (150 + 35% missing HP). Jinx Q minigun↔rockets (+1.8 m range, splash) / W delayed zap slow / E 3 chompers root / R global accelerating rocket (splash + missing-HP). Lux Q root piercing 2 / W shield self+allies 6 m / E slow zone then burst / R 0.9 s-charge laser 34 m. Sett Q 2 empowered punches + haste / W delayed cone (center true-ish 150) / E pull both sides + stun / R grab-carry-slam. Teemo Q blind dart / W haste / E toxic attacks (DoT) / R mushrooms (max 3, slow + DoT). Yasuo Q line, 3rd = tornado knock-up / W wind wall / E dash-through / R blink to airborne (or near) hero, AoE knock-up.
- Animations: plays the hero's q/w/e/r clip; missing clips fall back to attack (Jinx q, Ashe r, Garen w).

## Test step 2 (/workspace/work/hexq_test2.py, swiftshader 915x412 touch)
- 0 page errors / 0 console errors. All 9 heroes (10 slots) cast Q/W/E/R via __hq.castSlot → 40/40 true. Touch tap on Q button (Jinx rocket toggle) and drag on W both cast. (One earlier run the tap did not toggle; next runs it did — probably the player was CC'd at that moment, not re-checked further.)
- Numbers: before (step 1) 10-hero fight 62–67 dc / ~129k tris, lane ~52–55 dc / ~99k. After: 10-hero fight 52–61 dc / 56–80k tris; peak with ~8 skills' effects 64 dc / 85k; lane 53–65 dc / 50–76k (depends on how many heroes/minions in view).
- Screenshots: /workspace/work/hexq_lane2.png, /workspace/work/hexq_fight2.png.

## Known issues / next
- ~~Additive skill discs/rings wash out to white on snow~~ fixed in step 2b.
- 8-min headless sims didn't end (bots trade kills, minion cap holds structures); check balance / tower damage vs minions.
- No mana; no per-target Yasuo E cooldown; Ashe E "reveal" is a +10% damage mark (no fog of war); Sett W/E simplified.
- Debug hooks added: __hq.castSlot, __hq.SK; startMatch(name, {blue:[4], red:[5]}) for fixed lineups.

## Step 2b (fix "白花花一片" — washed-out teamfights) — done 2026-11-22, not committed
Backup of pre-fix files: /workspace/work/hexq_bak_step2/ (index.html, js/, STATUS.md).
- FX (world.js): additive blending removed. All four FX instanced sets (orb/ring/disc/beam) now normal alpha, depthWrite false, with a per-instance alpha attribute `aA` (onBeforeCompile patch); alpha caps orbs .85 / rings .9 / area discs .4 / beams .7. `vivid()` pushes every FX colour to saturation ≥.85, lightness ≤.58 (whites are dimmed 8%) so stacked effects stay tinted. Rings thinner (0.92–1). Area discs use a radial alpha texture (faint centre ~.35, bright rim) and map the old additive strength to .2–.4 alpha.
- Colours (game.js `C`): saturated per hero — Lux gold 0xffc21a + pink 0xff5fc8, Garen yellow + steel-blue spin disc, Ahri 0xff3fae, Ashe 0x2fb6ff, Jinx 0xff2fa8, Ezreal 0xffb21a, Teemo green, Sett 0xff7a1a, Yasuo cyan 0x1fd8e8. Pastel literals (0xfff3a0, 0xcfe8ff, 0xfff6c0, 0xffd080) replaced.
- Beams thinner: Lux R outer beam 1.6×1.2 → .75×.45 (pink), Sett E 1.8 → .7 wide, Sett W cone rays .35 → .2, Yasuo wall .25 → .18 @ .45 alpha.
- Status markers: shield = gold waist ring + pink ankle ring (was white sphere over the hero); slow = blue ring (was disc); Garen spin = yellow rim + steel-blue disc.
- Ground: snow vertex colours 0xf3f8ff/0xdbe9f7 → 0xc4d1e0/0xb3c2d4, and the lane ground gets its own toon material with colour 0xc4ccd8 (2 lights at 1.9/2.0 clipped the old snow to pure white). Scenery snow caps/mounds 0xf4f9ff → SNOW 0xc9d5e3, back wall/far snowfield/fog toned to blue-grey. Lights and hero materials unchanged (heroes now brighter than ground). No tone mapping in use (NoToneMapping, sRGB output) — not the cause.
- HP bars unchanged (depthTest off, renderOrder 50/51 — always on top).

## Test step 2b (/workspace/work/hexq_test3.py [out.png], swiftshader 915x412 touch)
- Staged teamfight, Jinx player, blue Lux/Garen/Ezreal/Ahri vs red Sett/Teemo/Yasuo/Ashe/Ahri; casts Lux W+E, Garen E, Ezreal R, Ahri W, Jinx W, Sett W, Teemo R, Ashe W, Yasuo W (10/10 true). 0 page / console errors.
- Same staging, old code: /workspace/work/hexq_fight3_before.png, peak 68 dc / 87k tris. New code: /workspace/work/hexq_fight3.png, peak 63 dc / 83k tris.

## Step 3 (Howling Abyss / 嚎哭深渊 palette — "参考原版大乱斗那种配色") — done 2026-11-22, not committed
Backup of pre-step-3 files: /workspace/work/hexq_bak_step2b/ (index.html, js/, STATUS.md). Geometry/layout unchanged.
- **Bug found & fixed:** in step 2b the lane ground's `scene.add(ground)` had been swallowed into a `//` comment, so the whole lane plateau was not rendered (the "snow" in step-2b shots was the background/far planes). Ground is back (+1 draw call, +~3.7k tris).
- world.js `PAL` table at the top of the map section holds all scene colours. Background 0x161c33, fog 0x1d2541 (32→100 m, so heroes ~12 m away are never fogged), sky dome navy→purple (0x080c1e / 0x252a4e / 0x1c2442).
- Lights: same 2 lights, recoloured — hemisphere sky 0xb4c8ff / ground 0x3a4266 @1.75, moon key 0xe4ecff @2.05. Heroes stay bright because the darkness comes from scenery colours, not from dimming lights.
- Ground: teal-slate stone (0x4a6a74/0x405d68), darker worn centre path (0x2f4048/0x2a3941), blue/red base tint near each end, snow only as pale-blue drifts along the edges + random patches (0x9db2cb/0x8399b5), dark north wall 0x36424f with snow patches, dark south cliff. Warm orange light pools (0xe08a40) painted into vertex colours around the 4 braziers (snow melted there). Cheap 256² canvas flagstone texture multiplied only on stone (per-vertex `aS` weight, onBeforeCompile; 60% strength), 4 m tile.
- Scenery: rocks 0x3b4759 with pale-blue snow caps (SNOW 0x93a9c4), pines dark teal (not party green), ice crystals 0x5fd8ff with emissive 0x1fa8e0 @0.95, bridge posts dark stone 0x4a5568 + iron rails 0x2a2f3a, braziers stone/iron with 2-tone unlit flame (orange outer + yellow core, fog off). Instanced rocks/pines/mounds near braziers get a warm per-instance colour (fake point light, same draw call).
- Structures: dark stone (0x435068 / 0x66758c / 0x55637a), team trim unchanged, crystals TEAM_CRY blue-cyan 0x46d2ff / crimson 0xff3a52; fountain platforms dark stone. Rubble 0x2e3542. Blob shadows darker (rgba 4,6,16,.55).
- Heroes (heroes.js toonOf): materials unchanged + faint cool rim (fresnel^3 × .28, colour .45/.7/1.0) so they separate from the dark ground. Skill FX colours/blending from step 2b unchanged.
- index.html: hero-pick screen night gradient (navy→teal) with a warm glow at the bottom, cyan-bordered portraits; theme-color #161c33.

## Test step 3 (swiftshader 915x412 touch)
- /workspace/work/hexq_test3.py (staged 10-skill fight, 10/10 casts true): peak 64–66 dc / 86.4–86.8k tris (step 2b: 63 / 83k, but without the ground mesh). /workspace/work/hexq_aram.py (select/lane/base/brazier shots): lane 62 dc / 72.7k. hexq_test2.py: all casts, touch Q/W ok, fight 68 dc / 87.5k, 500 s sim fine. 0 page errors / 0 console errors in all runs.
- Tris peak is ~1.5–2.5k over the 85k target purely from restoring the ground (62x30 grid = 3.7k tris); dropping its z-segments 30→20 would save 1.2k if needed.
- Screenshots: /workspace/work/hexq_aram_fight.png, hexq_aram_lane.png, hexq_aram_select.png (+ hexq_aram_base.png, hexq_aram_brazier.png).
