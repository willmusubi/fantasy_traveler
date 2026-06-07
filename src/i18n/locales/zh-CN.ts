// zh-CN locale. EN is deferred to M6 (§21); fallbackLng is zh-CN. Proper nouns
// (class / skill / monster names) are locale-keyed so they localize later.

export const zhCN: Record<string, string> = {
  // Classes
  'class.vanguard': '先锋',
  'class.guardian': '守卫',
  'class.striker': '影刺',
  'class.arcanist': '秘术',
  'class.tactician': '策士',
  'class.medic': '医者',

  // Class one-line benefits (onboarding)
  'class.vanguard.blurb': '攻守均衡的全能战士，新手友好',
  'class.guardian.blurb': '高防高血的前排坦克，守护队友',
  'class.striker.blurb': '敏捷爆发，单体高伤的刺客',
  'class.arcanist.blurb': '范围法术输出，群体清场',
  'class.tactician.blurb': '控制与增益，运筹帷幄',
  'class.medic.blurb': '治疗与护盾，团队后盾',

  // Skills (original sample cast)
  'skill.liuguang': '流光击',
  'skill.xingchen': '星尘斩',
  'skill.juxing': '聚星',
  'skill.liuxing': '流星坠',
  'skill.xingmang': '星芒',
  'skill.yexing': '夜星奏',
  'skill.xingyue': '星之约',
  'skill.xinghui': '星辉落',
  'skill.yuguang': '愈光',
  'skill.xingyu': '星雨',
  'skill.shouwang': '守望',
  'skill.mantian': '满天星',

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

  // Stats
  'stat.atk': '攻击',
  'stat.def': '防御',
  'stat.spd': '速度',
  'stat.mag': '法术',
  'stat.maxHp': '生命',
  'stat.maxMp': '魔力',
}
