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

  // Skills (names borrowed; effects are our own)
  'skill.jiying': '疾影',
  'skill.jixi': '疾袭',
  'skill.yishumibao': '艺术秘宝',
  'skill.wanmeishouguan': '完美收官',
  'skill.wuyeyugao': '午夜预告',
  'skill.yemuxiezou': '夜幕协奏',
  'skill.qiyezhiyue': '绮夜之约',
  'skill.maoyancangpin': '猫眼藏品',
  'skill.zhiliaowurenji': '治疗无人机',
  'skill.yingjiyuanzhu': '应急援助',
  'skill.shentoupzhunbei': '渗透准备',
  'skill.wanmeiyuan': '完美预案',

  // Monster
  'monster.procrastination': '拖延心魔',

  // Affinity ranks
  'affinity.none': '初识',
  'affinity.C': '羁绊 C',
  'affinity.B': '羁绊 B',
  'affinity.A': '羁绊 A',
  'affinity.S': '羁绊 S',

  // Worldview (§22)
  'world.cats_eye': '猫眼',
  'rel.sisters': '姐妹',
  'synergy.three_sisters': '三姐妹·合击',
  'synergy.sisters_pair': '姐妹·默契',

  // Equipment
  'slot.weapon': '武器',
  'slot.armor': '防具',
  'slot.trinket': '饰品',
  'equip.practice_dagger': '练习匕首',
  'equip.moonlit_dagger': '月下匕首',
  'equip.thief_cloak': '怪盗披风',
  'equip.cats_eye_gem': '猫眼宝石',
  'equip.smoke_bomb_pouch': '烟雾弹囊',
  'equip.wanneng_decoder': '万能解码器',
  'equip.cats_eye_card': '猫眼名片',
  'equip.heinz_canvas': '海因兹的画作',

  // Stats
  'stat.atk': '攻击',
  'stat.def': '防御',
  'stat.spd': '速度',
  'stat.mag': '法术',
  'stat.maxHp': '生命',
  'stat.maxMp': '魔力',
}
