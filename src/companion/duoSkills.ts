// §28 羁绊连携技 — paired ultimates unlocked by affinity rank. Both members must be
// on-field and alive, and each pays mpCostEach; the move consumes only the CASTER's
// turn (the partner lends stats + MP but keeps their own action — no cross-dispatch
// consumed-turn state, parity-safe). Shipped 观星会 pairs; local pack overrides.

import { LOCAL_PACK } from '../content/localPack'
import { rankIndex } from './affinity'
import type { Affinity, DuoSkillDef, ID } from '../domain/types'

export type { DuoSkillDef }

const DEFAULT_DUO_SKILL_DEFS: Record<string, DuoSkillDef> = {
  xinghuo_yeyu: {
    id: 'xinghuo_yeyu',
    nameKey: 'duo.xinghuo_yeyu',
    desc: '米拉的流光与薇拉的夜星交织成一道贯穿的星暴，对全体敌人造成大量法术伤害。',
    pair: ['mira', 'vela'],
    requiredRank: 'A',
    kind: 'attack',
    power: 2.2,
    target: 'allEnemies',
    mpCostEach: 18,
    physKind: 'arcane',
    element: 'fire',
  },
  yeyu_yuguang: {
    id: 'yeyu_yuguang',
    nameKey: 'duo.yeyu_yuguang',
    desc: '薇拉布下星之结界，诺娃的愈光随雨而落：全队恢复大量 HP 并解除全部异常状态。',
    pair: ['vela', 'nova'],
    requiredRank: 'A',
    kind: 'heal',
    power: 1.8,
    target: 'allAllies',
    mpCostEach: 16,
  },
}

export const DUO_SKILL_DEFS: Record<string, DuoSkillDef> =
  LOCAL_PACK?.duoSkills ?? DEFAULT_DUO_SKILL_DEFS

/** The duo techs castable RIGHT NOW by `casterId`: partner on-field+alive, both ranks met.
 *  (MP/acted checks happen at execution in the reducer — the UI greys those separately.) */
export function availableDuoSkills(
  casterId: ID,
  onFieldAliveIds: ID[],
  affinities: Record<ID, Affinity>,
  requiredOnly = true,
): DuoSkillDef[] {
  return Object.values(DUO_SKILL_DEFS).filter((d) => {
    if (!d.pair.includes(casterId)) return false
    const partner = d.pair[0] === casterId ? d.pair[1] : d.pair[0]
    if (!onFieldAliveIds.includes(partner)) return false
    if (!requiredOnly) return true
    // BOTH members' bond with you must meet the rank gate.
    return d.pair.every((id) => {
      const a = affinities[id]
      return a && rankIndex(a.rank) >= rankIndex(d.requiredRank)
    })
  })
}

/** The partner id of `casterId` in a duo def. */
export function duoPartnerOf(def: DuoSkillDef, casterId: ID): ID {
  return def.pair[0] === casterId ? def.pair[1] : def.pair[0]
}

export function duoSkillFor(id: string): DuoSkillDef | undefined {
  return DUO_SKILL_DEFS[id]
}

/** All party members referenced by duo defs are companions (content ids). The traveler
 *  (UUID id) never appears in `pair` — duos are COMPANION bonds by design. */
export const isCompanionDuoId = (id: ID): boolean => Object.values(DUO_SKILL_DEFS).some((d) => d.pair.includes(id))
