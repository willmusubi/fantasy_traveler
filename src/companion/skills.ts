// Skill definitions. Original sample skills for the 观星会 cast; effects are the engine's own
// design. Skills are ACTIVE: cast from the battle-stage skill bar, gated by MP (and sometimes
// HP), unlocked by character level. (§8, §21)

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
  // 米拉 — Striker (fast physical bursts)
  liuguang: { id: 'liuguang', nameKey: 'skill.liuguang', kind: 'attack', power: 1.2, target: 'enemy', mpCost: 8, unlockLevel: 1, desc: '迅捷的流光一击，对当前敌人造成一次物理伤害。' },
  xingchen: { id: 'xingchen', nameKey: 'skill.xingchen', kind: 'attack', power: 1.5, target: 'enemy', mpCost: 12, unlockLevel: 3, desc: '连环星尘斩，造成更高的物理伤害。' },
  juxing: { id: 'juxing', nameKey: 'skill.juxing', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 10, unlockLevel: 6, desc: '凝聚星力，接下来 3 次完成任务时全队攻击 +20%。' },
  liuxing: { id: 'liuxing', nameKey: 'skill.liuxing', kind: 'attack', power: 2.4, target: 'enemy', mpCost: 22, hpCost: 8, unlockLevel: 10, desc: '专属大招·流星坠：倾尽全力的一击，自损少量 HP，造成巨额伤害。' },
  // 薇拉 — Tactician (control + steady magic damage)
  xingmang: { id: 'xingmang', nameKey: 'skill.xingmang', kind: 'debuff', power: 0.3, target: 'allEnemies', mpCost: 14, unlockLevel: 1, desc: '洒落迷乱星芒，扰乱敌人，使其防御降低 30%。' },
  yexing: { id: 'yexing', nameKey: 'skill.yexing', kind: 'attack', power: 1.4, scaling: 'mag', target: 'allEnemies', mpCost: 18, unlockLevel: 3, desc: '奏响夜星，以法术之力对敌人发动一次强力打击。' },
  xingyue: { id: 'xingyue', nameKey: 'skill.xingyue', kind: 'buff', power: 0.25, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '缔结星之约，接下来 3 次完成任务时全队攻击 +25%。' },
  xinghui: { id: 'xinghui', nameKey: 'skill.xinghui', kind: 'attack', power: 1.9, scaling: 'mag', target: 'enemy', mpCost: 24, unlockLevel: 10, desc: '专属大招·星辉落：以缜密的法术精准夺取要害，造成大量伤害。' },
  // 诺娃 — Medic (sustain)
  yuguang: { id: 'yuguang', nameKey: 'skill.yuguang', kind: 'heal', power: 1.2, target: 'ally', mpCost: 12, unlockLevel: 1, desc: '洒下愈光，恢复伤势最重伙伴的 HP。' },
  xingyu: { id: 'xingyu', nameKey: 'skill.xingyu', kind: 'heal', power: 1.4, target: 'allAllies', mpCost: 22, unlockLevel: 3, desc: '化作星雨，为全队恢复 HP。' },
  shouwang: { id: 'shouwang', nameKey: 'skill.shouwang', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '星空守望，接下来 3 次完成任务时全队攻击 +20%。' },
  mantian: { id: 'mantian', nameKey: 'skill.mantian', kind: 'heal', power: 2.2, target: 'allAllies', mpCost: 30, unlockLevel: 10, desc: '专属大招·满天星：为全队恢复大量 HP。' },
}

/** Every skill the character owns (regardless of level). */
export function allSkillsOf(char: Character): SkillDef[] {
  return char.skills.map((id) => SKILL_DEFS[id]).filter((s): s is SkillDef => Boolean(s))
}

/** Skills the character has actually unlocked at their current level. */
export function unlockedSkills(char: Character): SkillDef[] {
  return allSkillsOf(char).filter((s) => char.stats.level >= s.unlockLevel)
}
