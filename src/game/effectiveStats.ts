// Pure effective-stats computation (§22). Base stats + equipped-item flat bonuses +
// party-wide synergy bonuses. Empty context = identity (so M0 combat is unchanged).

import type { Character, OwnedEquipment, PartyBuff, Stats } from '../domain/types'
import { EQUIPMENT_DEFS } from '../world/equipment'
import type { SynergyDef } from '../world/relationships'

export interface CombatContext {
  ownedEquipment: OwnedEquipment[]
  activeSynergies: SynergyDef[]
  /** Active party-wide buffs/debuffs. def/spd/magPct fold into the returned stats here;
   *  atkPct stays in the attack-damage mult. Optional → omitting it = identity. */
  partyBuffs?: PartyBuff[]
}

export const EMPTY_COMBAT_CONTEXT: CombatContext = { ownedEquipment: [], activeSynergies: [] }

const FLAT_KEYS: (keyof Omit<Stats, 'level' | 'xp'>)[] = [
  'maxHp', 'maxMp', 'str', 'vit', 'wis', 'spr', 'spd', 'skl', 'hit', 'eva',
]

/** Effective stats for one character given equipment + active party synergies.
 *  §25 note: persisted bonus/buff KEY NAMES predate the stat rename and are kept
 *  (saves + content packs carry them) — they map onto the new stats here:
 *  flatAtk/atkPct→str, defPct→vit, magPct→wis, spdPct→spd. */
export function effectiveStats(char: Character, ctx: CombatContext): Stats {
  const s: Stats = { ...char.stats }

  // 1. Flat additive bonuses from items this character has equipped.
  for (const oe of ctx.ownedEquipment) {
    if (oe.equippedBy !== char.id) continue
    const def = EQUIPMENT_DEFS[oe.defId]
    if (!def) continue
    for (const k of FLAT_KEYS) {
      const v = def.bonus[k]
      if (v) s[k] += v
    }
  }

  // 2. Party-wide synergy bonuses (flat then percentage).
  for (const syn of ctx.activeSynergies) {
    const b = syn.bonus
    if (b.flatAtk) s.str += b.flatAtk
    if (b.atkPct) s.str = Math.round(s.str * (1 + b.atkPct))
    if (b.defPct) s.vit = Math.round(s.vit * (1 + b.defPct))
    if (b.spdPct) s.spd = Math.round(s.spd * (1 + b.spdPct))
  }

  // 3. Active party buffs/debuffs (habit/skill). atkPct is handled in the attack mult, so only
  //    def/spd/magPct fold in here. Negative magnitudes (debuffs) reduce the stat; spd floors at
  //    1 so a debuff can never stall the charge-time timeline.
  const buffs = ctx.partyBuffs ?? []
  const sumPct = (kind: PartyBuff['kind']): number =>
    buffs.reduce((m, b) => (b.kind === kind ? m + b.magnitude : m), 0)
  const dp = sumPct('defPct')
  if (dp) s.vit = Math.max(0, Math.round(s.vit * (1 + dp)))
  const sp = sumPct('spdPct')
  if (sp) s.spd = Math.max(1, Math.round(s.spd * (1 + sp)))
  const mp = sumPct('magPct')
  if (mp) s.wis = Math.max(0, Math.round(s.wis * (1 + mp)))

  return s
}
