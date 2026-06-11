// §28 talent trees — small per-character upgrade paths (5–10 nodes, shallow chains).
// Points: 1 per TALENT_POINT_EVERY_LEVELS levels. Learned node ids live in
// GameState.learnedTalents; spending validates cost + prerequisite in the reducer.
// Shipped 观星会 trees; a local content pack overrides via LOCAL_PACK.talents.

import { LOCAL_PACK } from '../content/localPack'
import type { Character, ID, TalentNode } from '../domain/types'

export type { TalentNode }

const node = (n: TalentNode): TalentNode => n

/** The traveler's tree — generalist: durability + crit + the guard-adjacent stances. */
const TRAVELER_TALENTS: TalentNode[] = [
  node({ id: 'tv_hp1', name: '行者体魄', desc: '最大 HP +20', cost: 1, bonus: { maxHp: 20 } }),
  node({ id: 'tv_str1', name: '挥剑日课', desc: '力量 +3', cost: 1, bonus: { str: 3 } }),
  node({ id: 'tv_crit', name: '看破', desc: '会心率 +5%', cost: 1, requires: 'tv_str1', passive: 'critBonus' }),
  node({ id: 'tv_taunt', name: '掩护姿态', desc: '解锁「嘲讽」指令：一回合内敌人优先攻击你', cost: 1, requires: 'tv_hp1', passive: 'taunt' }),
  node({ id: 'tv_counter', name: '见切反击', desc: '闪避敌人攻击后，以 50% 威力反击', cost: 2, requires: 'tv_taunt', passive: 'counter' }),
  node({ id: 'tv_hp2', name: '不屈意志', desc: '最大 HP +40，耐久 +3', cost: 2, requires: 'tv_hp1', bonus: { maxHp: 40, vit: 3 } }),
]

/** Shipped companion trees (观星会). */
const DEFAULT_TALENT_TREES: Record<string, TalentNode[]> = {
  mira: [
    node({ id: 'mr_str1', name: '流光磨砺', desc: '力量 +4', cost: 1, bonus: { str: 4 } }),
    node({ id: 'mr_spd1', name: '迅星步', desc: '速度 +3', cost: 1, bonus: { spd: 3 } }),
    node({ id: 'mr_crit', name: '星眼', desc: '会心率 +5%', cost: 1, requires: 'mr_str1', passive: 'critBonus' }),
    node({ id: 'mr_liuguang', name: '流光淬炼', desc: '「流光击」威力 +30%', cost: 2, requires: 'mr_str1', skillPower: { skillId: 'liuguang', pct: 0.3 } }),
    node({ id: 'mr_counter', name: '燕返', desc: '闪避敌人攻击后，以 50% 威力反击', cost: 2, requires: 'mr_spd1', passive: 'counter' }),
    node({ id: 'mr_ult', name: '坠星觉醒', desc: '「流星坠」威力 +25%', cost: 3, requires: 'mr_liuguang', skillPower: { skillId: 'liuxing', pct: 0.25 } }),
  ],
  vela: [
    node({ id: 'vl_wis1', name: '夜读星图', desc: '智慧 +4', cost: 1, bonus: { wis: 4 } }),
    node({ id: 'vl_mp1', name: '凝神', desc: '最大 MP +15', cost: 1, bonus: { maxMp: 15 } }),
    node({ id: 'vl_mpd', name: '星力节流', desc: '技能 MP 消耗 −20%', cost: 2, requires: 'vl_mp1', passive: 'mpDiscount' }),
    node({ id: 'vl_yexing', name: '夜星共鸣', desc: '「夜星奏」威力 +30%', cost: 2, requires: 'vl_wis1', skillPower: { skillId: 'yexing', pct: 0.3 } }),
    node({ id: 'vl_spd1', name: '夜行', desc: '速度 +3', cost: 1, bonus: { spd: 3 } }),
    node({ id: 'vl_ult', name: '辉落觉醒', desc: '「星辉落」威力 +25%', cost: 3, requires: 'vl_yexing', skillPower: { skillId: 'xinghui', pct: 0.25 } }),
  ],
  nova: [
    node({ id: 'nv_wis1', name: '愈手', desc: '智慧 +4', cost: 1, bonus: { wis: 4 } }),
    node({ id: 'nv_spr1', name: '静心', desc: '精神 +4', cost: 1, bonus: { spr: 4 } }),
    node({ id: 'nv_mpd', name: '节用之道', desc: '技能 MP 消耗 −20%', cost: 2, requires: 'nv_wis1', passive: 'mpDiscount' }),
    node({ id: 'nv_yuguang', name: '愈光增辉', desc: '「愈光」威力 +30%', cost: 2, requires: 'nv_wis1', skillPower: { skillId: 'yuguang', pct: 0.3 } }),
    node({ id: 'nv_hp1', name: '守护体质', desc: '最大 HP +30', cost: 1, bonus: { maxHp: 30 } }),
    node({ id: 'nv_ult', name: '满天星辉', desc: '「满天星」威力 +25%', cost: 3, requires: 'nv_yuguang', skillPower: { skillId: 'mantian', pct: 0.25 } }),
  ],
}

export const TALENT_TREES: Record<string, TalentNode[]> =
  LOCAL_PACK?.talents ?? DEFAULT_TALENT_TREES

/** The tree for a character: companions by their def id; the player gets the traveler tree
 *  (their id is a UUID, never a content key). Local packs may override 'traveler' too. */
export function talentTreeFor(char: Character): TalentNode[] {
  if (char.kind === 'player') return (LOCAL_PACK?.talents?.traveler as TalentNode[] | undefined) ?? TRAVELER_TALENTS
  return TALENT_TREES[char.id] ?? []
}

/** All learned nodes of one character (resolved against their tree). */
export function learnedNodesOf(char: Character, learned: Record<ID, string[]> | undefined): TalentNode[] {
  const ids = learned?.[char.id]
  if (!ids || ids.length === 0) return []
  const tree = talentTreeFor(char)
  return tree.filter((n) => ids.includes(n.id))
}

/** Does this character have the given passive (via any learned node)? */
export function hasTalentPassive(
  char: Character,
  learned: Record<ID, string[]> | undefined,
  passive: NonNullable<TalentNode['passive']>,
): boolean {
  return learnedNodesOf(char, learned).some((n) => n.passive === passive)
}

/** Power multiplier for one skill from learned skillPower nodes: 1 + Σpct. */
export function skillPowerMult(char: Character, learned: Record<ID, string[]> | undefined, skillId: string): number {
  return learnedNodesOf(char, learned).reduce((m, n) => (n.skillPower?.skillId === skillId ? m + n.skillPower.pct : m), 1)
}

/** Can `char` learn `nodeId` right now? Returns the node when valid. */
export function canLearn(
  char: Character,
  nodeId: string,
  learned: Record<ID, string[]> | undefined,
  points: number,
): TalentNode | undefined {
  const tree = talentTreeFor(char)
  const n = tree.find((x) => x.id === nodeId)
  if (!n) return undefined
  const mine = learned?.[char.id] ?? []
  if (mine.includes(n.id)) return undefined
  if (n.requires && !mine.includes(n.requires)) return undefined
  if (points < n.cost) return undefined
  return n
}
