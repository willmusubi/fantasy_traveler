// §28 Talent tree pure-helper unit tests.
// Covers: canLearn matrix, talentTreeFor, skillPowerMult, hasTalentPassive, learnedNodesOf.

import { describe, expect, it } from 'vitest'
import { statsForClassAtLevel } from '../game/leveling'
import type { Character, ID } from '../domain/types'
import {
  canLearn,
  hasTalentPassive,
  learnedNodesOf,
  skillPowerMult,
  talentTreeFor,
} from './talents'

// ============================================================
// Shared fixtures
// ============================================================

const TODAY = '2026-06-11'

function makeChar(id: string, kind: Character['kind'] = 'companion'): Character {
  return {
    id,
    name: id,
    kind,
    classId: 'striker',
    stats: statsForClassAtLevel('striker', 1),
    skills: [],
    portraitSet: 'x',
    createdAt: TODAY,
  }
}

const PLAYER = makeChar('player-uuid', 'player')
const MIRA = makeChar('mira')
const VELA = makeChar('vela')
const NOVA = makeChar('nova')
const UNKNOWN = makeChar('unknown_companion')

// ============================================================
// 1. talentTreeFor — player vs companion resolution
// ============================================================

describe('talentTreeFor — player gets TRAVELER_TALENTS', () => {
  it('the player (kind=player) always receives the traveler tree', () => {
    const tree = talentTreeFor(PLAYER)
    const ids = tree.map((n) => n.id)
    expect(ids).toContain('tv_hp1')
    expect(ids).toContain('tv_crit')
    expect(ids).toContain('tv_taunt')
    expect(ids).toContain('tv_counter')
  })

  it('mira gets her own companion tree (not the traveler tree)', () => {
    const tree = talentTreeFor(MIRA)
    const ids = tree.map((n) => n.id)
    expect(ids).toContain('mr_str1')
    expect(ids).toContain('mr_crit')
    expect(ids).toContain('mr_liuguang')
    expect(ids).not.toContain('tv_hp1')
  })

  it('vela gets her own companion tree', () => {
    const tree = talentTreeFor(VELA)
    const ids = tree.map((n) => n.id)
    expect(ids).toContain('vl_wis1')
    expect(ids).toContain('vl_mpd')
    expect(ids).not.toContain('mr_str1')
  })

  it('nova gets her own companion tree', () => {
    const tree = talentTreeFor(NOVA)
    const ids = tree.map((n) => n.id)
    expect(ids).toContain('nv_wis1')
    expect(ids).toContain('nv_yuguang')
    expect(ids).not.toContain('vl_wis1')
  })

  it('an unknown companion id returns an empty tree', () => {
    expect(talentTreeFor(UNKNOWN)).toEqual([])
  })
})

// ============================================================
// 2. canLearn matrix
// ============================================================

describe('canLearn — root node (no prereq)', () => {
  it('returns the node when points >= cost and not yet learned', () => {
    const node = canLearn(MIRA, 'mr_str1', {}, 1)
    expect(node).toBeDefined()
    expect(node?.id).toBe('mr_str1')
  })

  it('returns undefined when points are insufficient', () => {
    const node = canLearn(MIRA, 'mr_str1', {}, 0)
    expect(node).toBeUndefined()
  })

  it('returns undefined when the node is already learned', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1'] }
    const node = canLearn(MIRA, 'mr_str1', learned, 5)
    expect(node).toBeUndefined()
  })

  it('returns undefined for an unknown node id', () => {
    const node = canLearn(MIRA, 'nonexistent_node', {}, 10)
    expect(node).toBeUndefined()
  })
})

describe('canLearn — prerequisite gating', () => {
  it('returns undefined when the prereq node has not been learned', () => {
    // mr_crit requires mr_str1 — without mr_str1 it cannot be learned
    const node = canLearn(MIRA, 'mr_crit', {}, 5)
    expect(node).toBeUndefined()
  })

  it('returns the node when the prereq has been learned and points are sufficient', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1'] }
    const node = canLearn(MIRA, 'mr_crit', learned, 1)
    expect(node).toBeDefined()
    expect(node?.id).toBe('mr_crit')
  })

  it('cost-2 node (mr_liuguang) requires 2 points with prereq learned', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1'] }
    expect(canLearn(MIRA, 'mr_liuguang', learned, 1)).toBeUndefined() // only 1 point
    expect(canLearn(MIRA, 'mr_liuguang', learned, 2)).toBeDefined()
  })
})

describe('canLearn — traveler tree', () => {
  it('tv_taunt requires tv_hp1', () => {
    expect(canLearn(PLAYER, 'tv_taunt', {}, 5)).toBeUndefined()
    const withHp: Record<ID, string[]> = { 'player-uuid': ['tv_hp1'] }
    expect(canLearn(PLAYER, 'tv_taunt', withHp, 5)).toBeDefined()
  })

  it('tv_counter (cost 2) requires tv_taunt; needs 2 points', () => {
    const withChain: Record<ID, string[]> = { 'player-uuid': ['tv_hp1', 'tv_taunt'] }
    expect(canLearn(PLAYER, 'tv_counter', withChain, 1)).toBeUndefined()
    expect(canLearn(PLAYER, 'tv_counter', withChain, 2)).toBeDefined()
  })
})

// ============================================================
// 3. learnedNodesOf
// ============================================================

describe('learnedNodesOf', () => {
  it('returns empty when no talents have been learned', () => {
    expect(learnedNodesOf(MIRA, {})).toEqual([])
    expect(learnedNodesOf(MIRA, undefined)).toEqual([])
  })

  it('returns the node objects for every learned id in the tree', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'mr_spd1'] }
    const nodes = learnedNodesOf(MIRA, learned)
    expect(nodes).toHaveLength(2)
    const ids = nodes.map((n) => n.id)
    expect(ids).toContain('mr_str1')
    expect(ids).toContain('mr_spd1')
  })

  it('silently drops ids that do not exist in the character\'s tree', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'ghost_node'] }
    const nodes = learnedNodesOf(MIRA, learned)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('mr_str1')
  })

  it('returns the player\'s nodes from the traveler tree', () => {
    const learned: Record<ID, string[]> = { 'player-uuid': ['tv_hp1', 'tv_str1'] }
    const nodes = learnedNodesOf(PLAYER, learned)
    const ids = nodes.map((n) => n.id)
    expect(ids).toContain('tv_hp1')
    expect(ids).toContain('tv_str1')
  })
})

// ============================================================
// 4. hasTalentPassive
// ============================================================

describe('hasTalentPassive', () => {
  it('returns false when no talents are learned', () => {
    expect(hasTalentPassive(MIRA, {}, 'critBonus')).toBe(false)
    expect(hasTalentPassive(MIRA, undefined, 'critBonus')).toBe(false)
  })

  it('returns false for nodes learned that carry a DIFFERENT passive', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1'] } // mr_str1 has bonus, not passive
    expect(hasTalentPassive(MIRA, learned, 'critBonus')).toBe(false)
  })

  it('returns true when mr_crit (critBonus passive) is learned', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'mr_crit'] }
    expect(hasTalentPassive(MIRA, learned, 'critBonus')).toBe(true)
  })

  it('returns true when mr_counter (counter passive) is learned', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_spd1', 'mr_counter'] }
    expect(hasTalentPassive(MIRA, learned, 'counter')).toBe(true)
  })

  it('returns true for vl_mpd (mpDiscount passive)', () => {
    const learned: Record<ID, string[]> = { vela: ['vl_mp1', 'vl_mpd'] }
    expect(hasTalentPassive(VELA, learned, 'mpDiscount')).toBe(true)
  })

  it('returns true for tv_taunt (taunt passive)', () => {
    const learned: Record<ID, string[]> = { 'player-uuid': ['tv_hp1', 'tv_taunt'] }
    expect(hasTalentPassive(PLAYER, learned, 'taunt')).toBe(true)
  })
})

// ============================================================
// 5. skillPowerMult
// ============================================================

describe('skillPowerMult', () => {
  it('returns 1 when no matching skillPower nodes are learned', () => {
    expect(skillPowerMult(MIRA, {}, 'liuguang')).toBe(1)
    expect(skillPowerMult(MIRA, undefined, 'liuguang')).toBe(1)
  })

  it('adds the pct from mr_liuguang (+0.3) when learned', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'mr_liuguang'] }
    expect(skillPowerMult(MIRA, learned, 'liuguang')).toBeCloseTo(1.3)
  })

  it('adds both mr_liuguang (+0.3) and mr_ult (+0.25) for liuxing when both learned', () => {
    // mr_ult boosts liuxing, not liuguang
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'mr_liuguang', 'mr_ult'] }
    expect(skillPowerMult(MIRA, learned, 'liuguang')).toBeCloseTo(1.3)  // only mr_liuguang applies
    expect(skillPowerMult(MIRA, learned, 'liuxing')).toBeCloseTo(1.25)   // only mr_ult applies
  })

  it('does not cross-contaminate: liuguang boost does not affect liuxing', () => {
    const learned: Record<ID, string[]> = { mira: ['mr_str1', 'mr_liuguang'] }
    expect(skillPowerMult(MIRA, learned, 'liuxing')).toBe(1)
  })

  it('vl_yexing (+0.3) applies to yexing skill', () => {
    const learned: Record<ID, string[]> = { vela: ['vl_wis1', 'vl_yexing'] }
    expect(skillPowerMult(VELA, learned, 'yexing')).toBeCloseTo(1.3)
  })

  it('nv_yuguang (+0.3) applies to yuguang skill', () => {
    const learned: Record<ID, string[]> = { nova: ['nv_wis1', 'nv_yuguang'] }
    expect(skillPowerMult(NOVA, learned, 'yuguang')).toBeCloseTo(1.3)
  })
})
