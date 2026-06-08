// Optional LOCAL content override — keeps personal / licensed content OUT of the public repo.
//
// The shipped, tracked content is an ORIGINAL, IP-free sample (观星会 trio). If a gitignored pack
// exists under `src/content/local/*.ts` (see src/content/README.md), the app loads it INSTEAD,
// so you can run your own cast / world / story locally without ever committing it. Tracked source
// stays IP-free; the override is never tracked or pushed.
//
// Disabled under test (MODE === 'test') so the suite always asserts the shipped sample content.

import type { CompanionLines } from '../companion/cannedLines'
import type { CompanionDef } from '../companion/roster'
import type { SkillDef } from '../companion/skills'
import type { EquipmentDef } from '../world/equipment'
import type { RelationshipEdge, SynergyDef } from '../world/relationships'
import type { WorldDef } from '../world/worlds'

/** A complete content swap. Every field is optional; a present field REPLACES the shipped default
 *  for that slice. A pack should be internally consistent (its world references its companion ids,
 *  its companions reference its skill ids, etc.). */
export interface ContentPack {
  companions?: Record<string, CompanionDef>
  primaryCompanionId?: string
  worlds?: Record<string, WorldDef>
  firstWorldId?: string
  skills?: Record<string, SkillDef>
  equipment?: Record<string, EquipmentDef>
  synergyDefs?: SynergyDef[]
  relationshipEdges?: RelationshipEdge[]
  /** Per-companion canned reaction pools, keyed by companion id. */
  cannedLines?: Record<string, CompanionLines>
  /** i18n overrides merged over the base zh-CN dict (skill / world / equip / rel / synergy names). */
  i18n?: Record<string, string>
}

// Eagerly collect any gitignored local pack(s). With no local dir, Vite returns {} → no override.
const modules = import.meta.glob<{ pack?: ContentPack; default?: ContentPack }>('./local/*.ts', { eager: true })

function resolveLocalPack(): ContentPack | undefined {
  if (import.meta.env.MODE === 'test') return undefined // tests assert the shipped IP-free content
  for (const m of Object.values(modules)) {
    const p = m.pack ?? m.default
    if (p) return p
  }
  return undefined
}

/** The active local content override, or undefined when none is present (the public default). */
export const LOCAL_PACK: ContentPack | undefined = resolveLocalPack()
