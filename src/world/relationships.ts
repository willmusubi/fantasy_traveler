// Relationship network + party synergies (static, data-driven). Edges drive the
// 羁绊网 UI; synergies are the combat-affecting subset, active when ALL `requires`
// members are in the active party. (§22)

import type { WorldId } from '../domain/types'

export interface RelationshipEdge {
  /** Undirected pair, stored sorted for a canonical key. */
  members: [string, string]
  worldId: WorldId
  kind: 'sibling' | 'ally' | 'rival' | 'romance'
  labelKey: string
}

export interface SynergyBonus {
  flatAtk?: number
  atkPct?: number
  defPct?: number
  spdPct?: number
}

export interface SynergyDef {
  id: string
  worldId: WorldId
  /** All of these companion ids must be in the active party to trigger. */
  requires: string[]
  bonus: SynergyBonus
  labelKey: string
}

export const RELATIONSHIP_EDGES: RelationshipEdge[] = [
  { members: ['raisei_hitomi', 'raisei_rui'], worldId: 'cats_eye', kind: 'sibling', labelKey: 'rel.sisters' },
  { members: ['raisei_hitomi', 'raisei_ai'], worldId: 'cats_eye', kind: 'sibling', labelKey: 'rel.sisters' },
  { members: ['raisei_rui', 'raisei_ai'], worldId: 'cats_eye', kind: 'sibling', labelKey: 'rel.sisters' },
]

export const SYNERGY_DEFS: SynergyDef[] = [
  // Full trio — the headline synergy.
  {
    id: 'three_sisters', worldId: 'cats_eye',
    requires: ['raisei_hitomi', 'raisei_rui', 'raisei_ai'],
    bonus: { atkPct: 0.2, defPct: 0.1 }, labelKey: 'synergy.three_sisters',
  },
  // 2-of-3 partial pairs.
  {
    id: 'sisters_hitomi_rui', worldId: 'cats_eye',
    requires: ['raisei_hitomi', 'raisei_rui'],
    bonus: { atkPct: 0.08 }, labelKey: 'synergy.sisters_pair',
  },
  {
    id: 'sisters_hitomi_ai', worldId: 'cats_eye',
    requires: ['raisei_hitomi', 'raisei_ai'],
    bonus: { spdPct: 0.1 }, labelKey: 'synergy.sisters_pair',
  },
  {
    id: 'sisters_rui_ai', worldId: 'cats_eye',
    requires: ['raisei_rui', 'raisei_ai'],
    bonus: { defPct: 0.1 }, labelKey: 'synergy.sisters_pair',
  },
]

/** Synergies active for a given set of party companion ids. */
export function activeSynergiesFor(partyCompanionIds: string[]): SynergyDef[] {
  const set = new Set(partyCompanionIds)
  return SYNERGY_DEFS.filter((s) => s.requires.every((id) => set.has(id)))
}
