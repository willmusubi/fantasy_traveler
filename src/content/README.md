# Content packs

The shipped, **tracked** content is an original, IP-free sample cast (观星会: 米拉 / 薇拉 / 诺娃).
It lives in the normal source modules:

- `src/companion/roster.ts` — companions (`COMPANION_DEFS`, `PRIMARY_COMPANION_ID`)
- `src/world/worlds.ts` — world + story chapters (`WORLD_DEFS`, `FIRST_WORLD_ID`)
- `src/companion/skills.ts` — `SKILL_DEFS`
- `src/world/equipment.ts` — `EQUIPMENT_DEFS`
- `src/world/relationships.ts` — `RELATIONSHIP_EDGES`, `SYNERGY_DEFS`
- `src/companion/cannedLines.ts` — per-companion reaction pools
- `src/i18n/locales/zh-CN.ts` — proper-noun strings

## Local override (personal / licensed content — never committed)

To run your **own** cast / world / story locally without putting it in the public repo, drop a
gitignored pack under `src/content/local/`:

```ts
// src/content/local/mypack.ts   (gitignored via .gitignore → src/content/local/)
import type { ContentPack } from '../localPack'

export const pack: ContentPack = {
  companions: { /* ...your CompanionDef map... */ },
  primaryCompanionId: 'your_starter',
  worlds: { /* ...your WorldDef map... */ },
  firstWorldId: 'your_world',
  skills: { /* ...SkillDef map... */ },
  equipment: { /* ...EquipmentDef map... */ },
  synergyDefs: [ /* ...SynergyDef[]... */ ],
  relationshipEdges: [ /* ...RelationshipEdge[]... */ ],
  cannedLines: { /* companionId -> CompanionLines */ },
  i18n: { 'world.your_world': '名称', /* skill./equip./rel./synergy. keys */ },
}
```

`src/content/localPack.ts` loads any `src/content/local/*.ts` via `import.meta.glob` and, when present,
uses it **instead** of the shipped sample. Every `ContentPack` field is optional; a present field
replaces that whole slice (keep a pack internally consistent — its world references its companion
ids, its companions reference its skill ids, etc.).

Portrait art is resolved from `/portraits/{portraitSet}_{expression}.png`; those files are already
gitignored (`public/portraits/*.png`), so drop your pack's portraits there too.

The override is **disabled under test** (`import.meta.env.MODE === 'test'`) so the suite always
asserts the shipped IP-free sample.
