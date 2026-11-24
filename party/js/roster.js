// Character roster: the 4 bot characters (original KayKit Adventurers 1.0 looks) and the player's 角色仓库 (wardrobe),
// all KayKit (Kay Lousberg, CC0) on the same rig, all animated with the shared anims2.glb (natural gun hold).
// Only the picked player character + the 4 bot characters are loaded for a match; wardrobe entries load on demand.
export const BOT_CHARS = [
  { id: 'knight', url: './assets/chars/knight.glb', old: true, name: '骑士' },
  { id: 'barbarian', url: './assets/chars/barbarian.glb', old: true, name: '熊帽大胡子' },
  { id: 'mage', url: './assets/chars/mage.glb', old: true, name: '尖帽法师' },
  { id: 'rogue-hood', url: './assets/chars/rogue-hood.glb', old: true, name: '绿兜帽' },
];
const D = './assets/chars2/';
const W = (id, name, ver, drop) => ({ id, url: D + id + '.glb', name, ver, drop, thumb: D + 'thumbs/' + id + '.webp' });
// 8 base looks (男: 橙帽少年 / 老兵 / 冒险者 / 动作英雄 / 农夫, 女: 鸭舌帽女孩 / 眼镜女孩 / 魔法少女). Each has 5 recolor choices
// (原版 + 4 palette skins of its own atlas) and some model skins (other KayKit looks, loaded from their own glb).
const S = (id, name, drop) => ({ ...W(id, name, '', drop), skinOnly: true });
export const SKIN_MODELS = [
  S('Robot_One', '小机器人'), S('Clown', '小丑'),
  S('Marksman', '狙击手', ['Ghillie', 'FaceNet']), S('Hiker', '登山客'), S('Engineer', '护目镜工匠'),
  S('Druid', '鹿角德鲁伊'), S('Ranger', '游侠', ['Quiver']), S('Rogue_Hooded', '兜帽侠'),
  S('Superhero', '超级英雄'), S('Ninja', '忍者'), S('Driver', '墨镜车手'),
  S('Animatronic_Normal', '玩偶熊'), S('MonsterCostume', '恐龙装'),
  S('Helper_A', '小精灵·辫子', ['Hat']), S('Helper_B', '小精灵·短发', ['Hat']),
  S('Mage', '长发法师', ['Mage_Hat']), S('Cleric', '修士', ['HolyWater']),
  S('Tiefling', '恶魔少女', ['Tail']),
];
const B = (id, name, ver, drop, models) => ({ ...W(id, name, ver, drop), models });
export const WARDROBE = [
  B('Protagonist_B', '橙帽少年', '男', undefined, ['Robot_One', 'Helper_B']),
  B('Survivalist', '老兵', '男', undefined, ['Marksman', 'Hiker', 'Engineer']),
  B('Rogue', '冒险者', '男', undefined, ['Druid', 'Ranger', 'Rogue_Hooded']),
  B('ActionFigure', '动作英雄', '男', ['Cigar'], ['Superhero', 'Ninja', 'Driver']),
  B('Farmer_B', '农夫', '男', undefined, ['Animatronic_Normal', 'MonsterCostume']),
  B('Protagonist_A', '鸭舌帽女孩', '女', undefined, ['Helper_A', 'Clown']),
  B('Witch', '眼镜女孩', '女', ['Witch_Hat'], ['Mage', 'Cleric']),
  B('MagicalGirl', '魔法少女', '女', undefined, ['Tiefling']),
];
// recolor skins: our own palette remaps of the base character's KayKit atlas (pre-baked 256px lossless WebP, assets/chars2/skins/)
export const SKINS = [
  { id: '', name: '原版' }, { id: 'camo', name: '迷彩' }, { id: 'blackgold', name: '黑金' }, { id: 'sakura', name: '樱粉' }, { id: 'ice', name: '冰蓝' },
];
export const skinTexUrl = (id, look) => look ? D + 'skins/' + id + '_' + look + '.webp' : '';
export const skinThumb = (id, look) => look ? D + 'thumbs/' + id + '_' + look + '.webp' : D + 'thumbs/' + id + '.webp';
export const REG = Object.fromEntries([...BOT_CHARS, ...WARDROBE, ...SKIN_MODELS].map(e => [e.id, e]));
const K_PICK = 'party.char', K_DEL = 'party.charDel', K_SKIN = 'party.skin';
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
const BASE = new Set(WARDROBE.map(e => e.id)), MODEL_BASE = Object.fromEntries(WARDROBE.flatMap(e => e.models.map(m => [m, e.id])));
export function deletedIds() { try { const a = JSON.parse(ls.get(K_DEL) || '[]'); return Array.isArray(a) ? a.filter(id => BASE.has(id)) : []; } catch (e) { return []; } }
export function visibleWardrobe() { const del = new Set(deletedIds()); const v = WARDROBE.filter(e => !del.has(e.id)); return v.length ? v : [WARDROBE[0]]; }
export function pickedId() { const id = ls.get(K_PICK), v = visibleWardrobe(); return v.some(e => e.id === id) ? id : v[0].id; }
export function setPicked(id) { if (BASE.has(id)) ls.set(K_PICK, id); }
// returns false when it would leave the wardrobe empty
export function deleteChar(id) {
  const v = visibleWardrobe(); if (v.length <= 1 || !v.some(e => e.id === id)) return false;
  const wasPicked = pickedId() === id;
  ls.set(K_DEL, JSON.stringify([...new Set([...deletedIds(), id])]));
  if (wasPicked) setPicked(visibleWardrobe()[0].id);
  return true;
}
export function restoreAll() { ls.set(K_DEL, '[]'); }
// picked skin per base character: {"Rogue":"camo", "Survivalist":"Hiker", ...}; '' = 原版; unknown / stale values fall back to 原版
function skinMap() { try { const o = JSON.parse(ls.get(K_SKIN) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
// all choices for a base: 原版, 4 recolors, then its model skins ({ id: model id, model: true })
export function skinsOf(base) { const e = WARDROBE.find(w => w.id === base); return e ? [...SKINS, ...e.models.map(m => ({ id: m, name: REG[m].name, model: true }))] : [SKINS[0]]; }
export function pickedSkin(base = pickedId()) { const v = skinMap()[base]; return v && skinsOf(base).some(k => k.id === v) ? v : ''; }
export function setSkin(base, skin) { if (!BASE.has(base) || !skinsOf(base).some(k => k.id === skin)) return; const m = skinMap(); if (skin) m[base] = skin; else delete m[base]; ls.set(K_SKIN, JSON.stringify(m)); }
// what actually gets loaded: a model skin swaps the glb, a recolor swaps the atlas of the base glb
export function resolveLook(base, skin) { return REG[skin]?.skinOnly ? { char: skin, look: '' } : { char: base, look: skin || '' }; }
export function pickedLook() { const b = pickedId(); return resolveLook(b, pickedSkin(b)); }
export const skinThumbOf = (base, skin) => REG[skin]?.skinOnly ? REG[skin].thumb : skinThumb(base, skin);
// one-time migration: an older save picked a look that is now a model skin -> pick its base with that skin
{ const old = ls.get(K_PICK); if (old && MODEL_BASE[old]) { ls.set(K_PICK, MODEL_BASE[old]); setSkin(MODEL_BASE[old], old); } }
