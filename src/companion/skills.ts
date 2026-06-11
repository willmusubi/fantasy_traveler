// Skill definitions. Original sample skills for the 观星会 cast; effects are the engine's own
// design. Skills are ACTIVE: cast from the battle-stage skill bar, gated by MP (and sometimes
// HP), unlocked by character level. (§8, §21)

import { LOCAL_PACK } from '../content/localPack'
import type { Character, Element, PhysKind, SkillId, StatusEffectSpec, StatusKind } from '../domain/types'

export type { DuoSkillDef } from '../domain/types'

export interface SkillDef {
  id: SkillId
  nameKey: string
  kind: 'attack' | 'heal' | 'buff' | 'debuff'
  /** Effect coefficient: attack/heal → stat multiplier; buff/debuff → percent (0.3 = 30%). */
  power: number
  /** Which stat scales an ATTACK skill's damage: physical ('atk' → str/物攻, default) or
   *  magic ('mag' → wis/魔攻). Heals always scale off wis. The serialized literals predate
   *  the §25 rename and are kept so content packs never break. */
  scaling?: 'atk' | 'mag'
  /** §25 — optional attack identity: physical category override (default: physical skills
   *  inherit the equipped weapon's kind; magic skills are arcane). */
  physKind?: PhysKind
  /** §25 — optional 五行 (default: caster's weapon element, else innate element). */
  element?: Element
  target: 'enemy' | 'ally' | 'self' | 'allEnemies' | 'allAllies'
  /** §26 — status this skill tries to inflict on struck enemies (attack: on hit; debuff:
   *  on cast). A power-0 debuff is a PURE status move (no def shred). */
  inflictsStatus?: StatusEffectSpec
  /** §26 — status kinds a heal skill cleanses from its target(s). Cleanse-heals prefer
   *  an afflicted ally over the most-injured one. */
  clearsStatus?: StatusKind[]
  /** MP spent to cast. */
  mpCost: number
  /** Some powerful skills also cost the caster's HP. */
  hpCost?: number
  /** Character level required before this skill can be cast. */
  unlockLevel: number
  /** zh description of what it does (shown in the skill bar + detail sheet). */
  desc: string
}

const DEFAULT_SKILL_DEFS: Record<SkillId, SkillDef> = {
  // 米拉 — Striker (fast physical bursts)
  liuguang: { id: 'liuguang', nameKey: 'skill.liuguang', kind: 'attack', power: 1.2, target: 'enemy', mpCost: 8, unlockLevel: 1, desc: '迅捷的流光一击，对当前敌人造成一次物理伤害。' },
  xingchen: { id: 'xingchen', nameKey: 'skill.xingchen', kind: 'attack', power: 1.5, target: 'enemy', mpCost: 12, unlockLevel: 3, desc: '连环星尘斩，造成更高的物理伤害。' },
  juxing: { id: 'juxing', nameKey: 'skill.juxing', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 10, unlockLevel: 6, desc: '凝聚星力，接下来 3 次完成任务时全队攻击 +20%。' },
  liuxing: { id: 'liuxing', nameKey: 'skill.liuxing', kind: 'attack', power: 2.4, target: 'enemy', mpCost: 22, hpCost: 8, unlockLevel: 10, desc: '专属大招·流星坠：倾尽全力的一击，自损少量 HP，造成巨额伤害。' },
  // §26 status kit — 米拉的灼烧附加
  fenxing: { id: 'fenxing', nameKey: 'skill.fenxing', kind: 'attack', power: 1.3, element: 'fire', target: 'enemy', mpCost: 14, unlockLevel: 8, inflictsStatus: { kind: 'burn', rounds: 2, chance: 0.7 }, desc: '焚星之刃：灼热的一击，命中后大概率使敌人「灼烧」2 回合（每回合掉血）。' },
  // 薇拉 — Tactician (control + steady magic damage)
  xingmang: { id: 'xingmang', nameKey: 'skill.xingmang', kind: 'debuff', power: 0.3, target: 'allEnemies', mpCost: 14, unlockLevel: 1, desc: '洒落迷乱星芒，扰乱敌人，使其防御降低 30%。' },
  yexing: { id: 'yexing', nameKey: 'skill.yexing', kind: 'attack', power: 1.4, scaling: 'mag', target: 'allEnemies', mpCost: 18, unlockLevel: 3, desc: '奏响夜星，以法术之力对敌人发动一次强力打击。' },
  xingyue: { id: 'xingyue', nameKey: 'skill.xingyue', kind: 'buff', power: 0.25, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '缔结星之约，接下来 3 次完成任务时全队攻击 +25%。' },
  xinghui: { id: 'xinghui', nameKey: 'skill.xinghui', kind: 'attack', power: 1.9, scaling: 'mag', target: 'enemy', mpCost: 24, unlockLevel: 10, desc: '专属大招·星辉落：以缜密的法术精准夺取要害，造成大量伤害。' },
  // §26 status kit — 薇拉的控场（power 0 = 纯状态技，不削防）
  mianxing: { id: 'mianxing', nameKey: 'skill.mianxing', kind: 'debuff', power: 0, target: 'enemy', mpCost: 16, unlockLevel: 8, inflictsStatus: { kind: 'sleep', rounds: 1, chance: 0.85 }, desc: '眠星之雾：大概率使一名敌人「睡眠」1 回合——出招表被冻结，蓄力中的强敌也会被拖住。' },
  // 诺娃 — Medic (sustain)
  yuguang: { id: 'yuguang', nameKey: 'skill.yuguang', kind: 'heal', power: 1.2, target: 'ally', mpCost: 12, unlockLevel: 1, desc: '洒下愈光，恢复伤势最重伙伴的 HP。' },
  xingyu: { id: 'xingyu', nameKey: 'skill.xingyu', kind: 'heal', power: 1.4, target: 'allAllies', mpCost: 22, unlockLevel: 3, desc: '化作星雨，为全队恢复 HP。' },
  shouwang: { id: 'shouwang', nameKey: 'skill.shouwang', kind: 'buff', power: 0.2, target: 'allAllies', mpCost: 16, unlockLevel: 6, desc: '星空守望，接下来 3 次完成任务时全队攻击 +20%。' },
  mantian: { id: 'mantian', nameKey: 'skill.mantian', kind: 'heal', power: 2.2, target: 'allAllies', mpCost: 30, unlockLevel: 10, desc: '专属大招·满天星：为全队恢复大量 HP。' },
  // §26 status kit — 诺娃的净化（优先治疗带异常状态的伙伴）
  jingxing: { id: 'jingxing', nameKey: 'skill.jingxing', kind: 'heal', power: 0.9, target: 'ally', mpCost: 14, unlockLevel: 5, clearsStatus: ['poison', 'burn', 'sleep', 'paralysis', 'silence', 'slow'], desc: '净星之露：治疗一名伙伴并洗净其全部异常状态（优先驰援中状态的伙伴）。' },
}

/** The active skill catalog — a local content pack (gitignored) overrides the shipped sample. */
export const SKILL_DEFS: Record<SkillId, SkillDef> = LOCAL_PACK?.skills ?? DEFAULT_SKILL_DEFS

/** Every skill the character owns (regardless of level). */
export function allSkillsOf(char: Character): SkillDef[] {
  return char.skills.map((id) => SKILL_DEFS[id]).filter((s): s is SkillDef => Boolean(s))
}

/** Skills the character has actually unlocked at their current level. */
export function unlockedSkills(char: Character): SkillDef[] {
  return allSkillsOf(char).filter((s) => char.stats.level >= s.unlockLevel)
}
