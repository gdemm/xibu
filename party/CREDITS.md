# 素材来源 / Credits

| 文件 | 来源 | 作者 | 许可 |
|---|---|---|---|
| assets/chars/knight, barbarian, mage, rogue-hood .glb（机器人角色） | KayKit「Character Pack: Adventurers 1.0」(https://kaylousberg.itch.io/kaykit-adventurers)，经官方 GitHub https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 下载；去掉武器/盾牌，每个角色的身体与头盔/帽子/披风合并成一个蒙皮网格并量化 | Kay Lousberg (www.kaylousberg.com) | CC0 1.0（assets/chars/LICENSE-KayKit-Adventurers.txt） |
| assets/chars/blaster-b/c/d/h/k.glb | Kenney「Blaster Kit」(https://kenney.nl/assets/blaster-kit)，经 GitHub 镜像 shorepine/kenney (3d/blaster) 下载，量化 | Kenney (www.kenney.nl) | CC0 1.0（assets/chars/LICENSE-Kenney.txt） |

帽子（派对尖帽、螺旋桨、蝴蝶结、小芽、皇冠）、弓箭（弓、弦、箭矢，js/bow.js 程序生成）、倍镜道具、枪口火光、阴影和死亡烟团是本项目程序生成的原创造型。
角色细节（眼睛高光、腮红、鞋底、臂章、背后星形徽章）和港口岛的装饰（草丛、花、石子、灌木、多样树冠、尖桩篱笆、门窗框/百叶窗/花箱、屋檐、油桶、路灯、路面标线、沙滩伞、浪花线，js/islanddeco.js）也是程序生成的原创造型。
没有使用任何香肠派对 / Supercell / Riot 的角色、名字或素材。
Kenney 和 Kay Lousberg 都不要求署名，这里仍然注明以示感谢。
下蹲姿势、持枪姿势（由十字弩瞄准动作改成正面双手持枪）、队伍光圈和队伍色调是本项目在代码里调出来的。

## 角色仓库 / 持枪动作素材
| 文件 | 来源 | 作者 | 许可 |
|---|---|---|---|
| assets/chars2/anims2.glb | KayKit「Character Animations 1.1」(https://kaylousberg.itch.io/kaykit-character-animations) Rig_Medium 动作：Ranged_2H_Aiming / Ranged_2H_Reload / Ranged_1H_Aiming / Ranged_1H_Reload / Ranged_2H_Shoot、Idle_A、Death_A、Walking_A、Running_A、Jump_Idle、Running_HoldingRifle、Crouching、Sit_Chair_Idle、Cheering；合并成一个无网格动作文件并改名 | Kay Lousberg (www.kaylousberg.com) | CC0 1.0（assets/chars2/LICENSE-KayKit-CC0.txt） |
| assets/chars2/*.glb（角色仓库 26 个造型：8 个基础角色 + 18 个作为模型皮肤挂在基础角色下；原 A 卡通英雄 / B 士兵 / C 软萌公仔 / D 动漫 四版去重，不含 E 科幻） | KayKit「Adventurers 2.0」(https://kaylousberg.itch.io/kaykit-adventurers) 与 KayKit Mystery Monthly 系列角色（收录于 The Complete KayKit Collection v6），经 GitHub 镜像 GeorgeQLe/assets-kaykit-3d-characters 下载；贴图缩到 256px WebP，去掉动画，运行时把各部件合并成一个蒙皮网格；部分去掉了尖帽/雪茄/箭袋等配件 | Kay Lousberg | CC0 1.0 |
| assets/chars2/thumbs/*.webp | 本项目用上面的模型渲染的缩略图 | — | 同上 |
| assets/chars2/skins/*.webp（换色皮肤：迷彩 / 黑金 / 樱粉 / 冰蓝） | 本项目对上面 8 个基础角色各自的 KayKit 贴图做的调色（只改衣服/帽子/配饰色块，保留皮肤、脸、眼睛、头发和贴纸），预烘焙为 256px 无损 WebP | 本项目（基于 Kay Lousberg 的 CC0 贴图） | CC0 1.0 |

动作：所有角色（含 4 个机器人角色）共用 anims2.glb 的自然持枪动作（双手步枪/单手手枪/持枪奔跑/空手），不再使用旧的 anims.glb；红色圣诞帽女孩（旧 rogue.glb）和骷髅角色已移除。
所有角色均为 KayKit 通用原创造型，没有任何 Supercell / Riot / 香肠派对 角色。

## 港口岛扩图 / 载具 / 场景道具素材（2026-11）
| 文件 | 来源 | 作者 | 许可 |
|---|---|---|---|
| assets/props/props.bin + props.json（吉普=SUV、卡车=皮卡，路边车辆残骸、轮胎、路锥、油桶、木箱、栅栏、岩石、帐篷、路牌、篝火、木头、工作台、宝箱、室内家具等） | Kenney「Car Kit」「Survival Kit」「Furniture Kit」「Weapon Pack」(https://kenney.nl/assets)；离线烘焙成一个顶点着色的压缩文件（量化坐标、int8 法线、rgb8 颜色）；车辆另存一份约 15% 面数的简化版（*_lo，远处显示，同样来自 Kenney Car Kit） | Kenney (www.kenney.nl) | CC0 1.0（assets/chars/LICENSE-Kenney.txt） |

摩托、自行车、大巴、直升机仍是本项目程序生成的原创造型；物资地面光圈也是代码生成的。
