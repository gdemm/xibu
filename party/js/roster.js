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
// versions A..D of the look study, de-duplicated (E 科幻 dropped by the user's call)
export const WARDROBE = [
  W('ActionFigure', '动作英雄', 'A', ['Cigar']), W('Superhero', '超级英雄', 'A'), W('Protagonist_A', '鸭舌帽女孩', 'A'), W('Protagonist_B', '橙帽少年', 'A'),
  W('Driver', '墨镜车手', 'A'), W('Ninja', '忍者', 'A'), W('Engineer', '护目镜工匠', 'A'), W('Ranger', '游侠', 'A', ['Quiver']), W('Rogue_Hooded', '兜帽侠', 'A'),
  W('Survivalist', '老兵', 'B'), W('Marksman', '狙击手', 'B', ['Ghillie', 'FaceNet']), W('Hiker', '登山客', 'B'),
  W('Animatronic_Normal', '玩偶熊', 'C'), W('MonsterCostume', '恐龙装', 'C'), W('Helper_A', '小精灵·辫子', 'C', ['Hat']), W('Helper_B', '小精灵·短发', 'C', ['Hat']),
  W('Clown', '小丑', 'C'), W('Witch', '眼镜女孩', 'C', ['Witch_Hat']), W('Farmer_B', '农夫', 'C'), W('Robot_One', '小机器人', 'C'), W('Druid', '鹿角德鲁伊', 'C'),
  W('MagicalGirl', '魔法少女', 'D'), W('Tiefling', '恶魔少女', 'D', ['Tail']), W('Rogue', '冒险者', 'D'), W('Mage', '长发法师', 'D', ['Mage_Hat']), W('Cleric', '修士', 'D', ['HolyWater']),
];
export const REG = Object.fromEntries([...BOT_CHARS, ...WARDROBE].map(e => [e.id, e]));
const K_PICK = 'party.char', K_DEL = 'party.charDel';
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
export function deletedIds() { try { const a = JSON.parse(ls.get(K_DEL) || '[]'); return Array.isArray(a) ? a.filter(id => REG[id] && !REG[id].old) : []; } catch (e) { return []; } }
export function visibleWardrobe() { const del = new Set(deletedIds()); const v = WARDROBE.filter(e => !del.has(e.id)); return v.length ? v : [WARDROBE[0]]; }
export function pickedId() { const id = ls.get(K_PICK), v = visibleWardrobe(); return v.some(e => e.id === id) ? id : v[0].id; }
export function setPicked(id) { if (REG[id] && !REG[id].old) ls.set(K_PICK, id); }
// returns false when it would leave the wardrobe empty
export function deleteChar(id) {
  const v = visibleWardrobe(); if (v.length <= 1 || !v.some(e => e.id === id)) return false;
  const wasPicked = pickedId() === id;
  ls.set(K_DEL, JSON.stringify([...new Set([...deletedIds(), id])]));
  if (wasPicked) setPicked(visibleWardrobe()[0].id);
  return true;
}
export function restoreAll() { ls.set(K_DEL, '[]'); }
