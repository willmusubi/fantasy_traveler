// zh-CN locale. EN is deferred to M6 (§21); fallbackLng is zh-CN. Proper nouns
// (class / skill / monster names) are locale-keyed so they localize later.

export const zhCN: Record<string, string> = {
  // Skills (original sample cast)
  'skill.liuguang': '流光击',
  'skill.xingchen': '星尘斩',
  'skill.juxing': '聚星',
  'skill.liuxing': '流星坠',
  'skill.fenxing': '焚星之刃',
  'skill.xingmang': '星芒',
  'skill.yexing': '夜星奏',
  'skill.xingyue': '星之约',
  'skill.xinghui': '星辉落',
  'skill.mianxing': '眠星之雾',
  'skill.yuguang': '愈光',
  'skill.xingyu': '星雨',
  'skill.shouwang': '守望',
  'skill.mantian': '满天星',
  'skill.jingxing': '净星之露',

  // Monster
  'monster.procrastination': '拖延心魔',

  // Affinity ranks
  'affinity.none': '初识',
  'affinity.C': '羁绊 C',
  'affinity.B': '羁绊 B',
  'affinity.A': '羁绊 A',
  'affinity.S': '羁绊 S',

  // Worldview (§22)
  'world.stargazers': '观星会',
  'rel.allies': '同伴',
  'synergy.trio': '观星·合击',
  'synergy.pair': '观星·默契',

  // Equipment
  'slot.weapon': '武器',
  'slot.armor': '防具',
  'slot.trinket': '饰品',
  'equip.practice_dagger': '练习匕首',
  'equip.starlit_blade': '星辉之刃',
  'equip.stargaze_cloak': '观星斗篷',
  'equip.astral_gem': '星瞳宝石',
  'equip.mist_pouch': '迷雾囊',
  'equip.star_compass': '观星罗盘',
  'equip.stargazer_seal': '观星徽记',
  'equip.astral_canvas': '星图残卷',
  'equip.starsight_ring': '星准指环',
  'equip.comet_charm': '彗心坠饰',

  // Stats (§25 ten-stat sheet)
  'stat.str': '力量',
  'stat.vit': '耐久',
  'stat.wis': '智慧',
  'stat.spr': '精神',
  'stat.spd': '速度',
  'stat.skl': '技巧',
  'stat.hit': '命中',
  'stat.eva': '闪避',
  'stat.maxHp': '生命',
  'stat.maxMp': '魔力',

  // Derived combat values (§25)
  'derived.patk': '物攻',
  'derived.pdef': '物防',
  'derived.matk': '魔攻',
  'derived.mdef': '魔防',

  // Physical damage categories + elements (§25)
  'phys.slash': '斩',
  'phys.pierce': '刺',
  'phys.strike': '打',
  'phys.arcane': '法',
  'element.metal': '金',
  'element.wood': '木',
  'element.water': '水',
  'element.fire': '火',
  'element.earth': '土',

  // Weapon kinds (§25)
  'weapon.sword': '剑',
  'weapon.katana': '刀',
  'weapon.axe': '斧',
  'weapon.spear': '枪',
  'weapon.halberd': '戟',
  'weapon.bow': '弓',
  'weapon.fist': '拳',
  'weapon.hammer': '锤',
  'weapon.club': '棍',
  'weapon.rod': '杖',
  'weapon.fan': '扇',
  'weapon.qin': '琴',
}
