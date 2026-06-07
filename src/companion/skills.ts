// Skill definitions. Names borrowed from 无期迷途 (来生 sisters); effects are OUR own
// design. Skills are ACTIVE: cast from the battle-stage skill bar, gated by MP (and
// sometimes HP), unlocked by character level. (§8, §21)

import type { Character, SkillId } from '../domain/types'

export interface SkillDef {
  id: SkillId
  nameKey: string
  kind: 'attack' | 'heal' | 'buff' | 'debuff'
  /** Effect coefficient: attack/heal → stat multiplier; buff/debuff → percent (0.3 = 30%). */
  power: number
  /** Which stat scales an ATTACK skill's damage: physical ('atk', default) or magic ('mag').
   *  Heal always scales off mag. Lets casters' offensive skills use their real stat. */
  scaling?: 'atk' | 'mag'
  target: 'enemy' | 'ally' | 'self' | 'allEnemies' | 'allAllies'
  /** MP spent to cast. */
  mpCost: number
  /** Some powerful skills also cost the caster's HP. */
  hpCost?: number
  /** Character level required before this skill can be cast. */
  unlockLevel: number
  /** zh description of what it does (shown in the skill bar + detail sheet). */
  desc: string
}

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  // 来生瞳 — Striker (fast physical bursts)
  jiying: { id: 'jiying', nameKey: 'skill.jiying', kind: 'attack', power: 1.2, target: 'enemy', mpCost: 8, unlockLevel: 1, desc: '迅捷的影袭，对当前敌人造成一次物理伤害。' },
  jixi: { id: 'jixi', nameKey: 'skill.jixi', kind: 'attack', power: 1.5, target: 'enemy', mpCost: 12, unlockLevel: 3, desc: '连环疾袭，造成更高的物理伤害。' },
  yishumibao: { id: 'yishumibao', nameKey: 'skill.yishumibao', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 10, unlockLevel: 6, desc: '亮出艺术秘宝，接下来 3 次完成任务时全队攻击 +20%。' },
  wanmeishouguan: { id: 'wanmeishouguan', nameKey: 'skill.wanmeishouguan', kind: 'attack', power: 2.4, target: 'enemy', mpCost: 22, hpCost: 8, unlockLevel: 10, desc: '专属大招·完美收官：倾尽全力的一击，自损少量 HP，造成巨额伤害。' },
  // 来生泪 — Tactician (control + steady damage)
  wuyeyugao: { id: 'wuyeyugao', nameKey: 'skill.wuyeyugao', kind: 'debuff', power: 0.3, target: 'allEnemies', mpCost: 14, unlockLevel: 1, desc: '寄出午夜预告状，扰乱敌人，使其防御降低 30%。' },
  yemuxiezou: { id: 'yemuxiezou', nameKey: 'skill.yemuxiezou', kind: 'attack', power: 1.4, scaling: 'mag', target: 'allEnemies', mpCost: 18, unlockLevel: 3, desc: '夜幕协奏，以法术之力对敌人发动一次强力打击。' },
  qiyezhiyue: { id: 'qiyezhiyue', nameKey: 'skill.qiyezhiyue', kind: 'buff', power: 0.25, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '缔结绮夜之约，接下来 3 次完成任务时全队攻击 +25%。' },
  maoyancangpin: { id: 'maoyancangpin', nameKey: 'skill.maoyancangpin', kind: 'attack', power: 1.9, scaling: 'mag', target: 'enemy', mpCost: 24, unlockLevel: 10, desc: '专属大招·猫眼藏品：以缜密的法术精准夺取要害，造成大量伤害。' },
  // 来生爱 — Medic (sustain)
  zhiliaowurenji: { id: 'zhiliaowurenji', nameKey: 'skill.zhiliaowurenji', kind: 'heal', power: 1.2, target: 'ally', mpCost: 12, unlockLevel: 1, desc: '放出治疗无人机，恢复伤势最重伙伴的 HP。' },
  yingjiyuanzhu: { id: 'yingjiyuanzhu', nameKey: 'skill.yingjiyuanzhu', kind: 'heal', power: 1.4, target: 'allAllies', mpCost: 22, unlockLevel: 3, desc: '应急援助，为全队恢复 HP。' },
  shentoupzhunbei: { id: 'shentoupzhunbei', nameKey: 'skill.shentoupzhunbei', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '渗透准备，接下来 3 次完成任务时全队攻击 +20%。' },
  wanmeiyuan: { id: 'wanmeiyuan', nameKey: 'skill.wanmeiyuan', kind: 'heal', power: 2.2, target: 'allAllies', mpCost: 30, unlockLevel: 10, desc: '专属大招·完美圆满：为全队恢复大量 HP。' },
}

/** Every skill the character owns (regardless of level). */
export function allSkillsOf(char: Character): SkillDef[] {
  return char.skills.map((id) => SKILL_DEFS[id]).filter((s): s is SkillDef => Boolean(s))
}

/** Skills the character has actually unlocked at their current level. */
export function unlockedSkills(char: Character): SkillDef[] {
  return allSkillsOf(char).filter((s) => char.stats.level >= s.unlockLevel)
}
