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
  { members: ['mira', 'vela'], worldId: 'stargazers', kind: 'ally', labelKey: 'rel.allies' },
  { members: ['mira', 'nova'], worldId: 'stargazers', kind: 'ally', labelKey: 'rel.allies' },
  { members: ['vela', 'nova'], worldId: 'stargazers', kind: 'ally', labelKey: 'rel.allies' },
]

export const SYNERGY_DEFS: SynergyDef[] = [
  // Full trio — the headline synergy.
  {
    id: 'stargazers_trio', worldId: 'stargazers',
    requires: ['mira', 'vela', 'nova'],
    bonus: { atkPct: 0.2, defPct: 0.1 }, labelKey: 'synergy.trio',
  },
  // 2-of-3 partial pairs.
  {
    id: 'pair_mira_vela', worldId: 'stargazers',
    requires: ['mira', 'vela'],
    bonus: { atkPct: 0.08 }, labelKey: 'synergy.pair',
  },
  {
    id: 'pair_mira_nova', worldId: 'stargazers',
    requires: ['mira', 'nova'],
    bonus: { spdPct: 0.1 }, labelKey: 'synergy.pair',
  },
  {
    id: 'pair_vela_nova', worldId: 'stargazers',
    requires: ['vela', 'nova'],
    bonus: { defPct: 0.1 }, labelKey: 'synergy.pair',
  },
]

/** Synergies active for a given set of party companion ids. */
export function activeSynergiesFor(partyCompanionIds: string[]): SynergyDef[] {
  const set = new Set(partyCompanionIds)
  return SYNERGY_DEFS.filter((s) => s.requires.every((id) => set.has(id)))
}
