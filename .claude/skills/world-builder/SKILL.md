---
name: world-builder
description: >-
  Author a canon-grounded WORLD for Fantasy Traveler: research a real story (e.g. Cat's Eye,
  Three Kingdoms, FF7), design its antagonist roster + canon reward items + a faithful
  (player-empowering) chapter arc, and write it into the game's world data. Use when adding a
  new world or reworking an existing one so 副本 use REAL antagonists from the source — not
  generic 心魔 — and teach newcomers the story. Triggers: "add a world", "新世界", "把X世界做进游戏",
  "reground a world in canon".
---

# World Builder — canon-grounded worlds for Fantasy Traveler

A 副本 should immerse: its enemies are the **real antagonists** of the source story, its rewards
are **canon items/characters**, and its narration **faithfully retells the plot** (so a newcomer
learns it) while giving a clear win each time. This skill is the research → 设定 → author pipeline
that produces that, as data the game already consumes.

## Core principles
- **Real antagonists, not 心魔.** Every encounter enemy comes from the world's canon (collectors,
  villains, factions), captured in the world's `antagonists` roster.
- **Faithful but empowering.** Reference the canon plot, but let the player heroically change
  tragic outcomes for the better — *without large deviation*. (Worked example below: 三国.)
- **Teach the story.** `narrationIntro`/`narrationVictory` carry the plot so no prior knowledge
  is needed; each victory pays off.
- **Hybrid delivery.** The authored `storyChapters` are the faithful spine (also the offline
  path). With an API key the generator riffs *within* canon (it reads the antagonist roster from
  `renderWorldLore`), but the recruit/unlock stays anchored to the authored chapter.

## Pipeline

### Step 0 — Confirm the world
Get the world/story name + which characters are recruitable + (if known) the unlock order.

### Step 1 — Research the canon (web)
Produce a short story bible: premise & setting; main characters (roles/personalities); the
**antagonists/obstacles** (named figures + factions); key arcs in order; signature items/motifs.
**Cite sources; note canon vs adaptation; be honest about gaps.** (You can dispatch an Explore
agent with web access for this — see how the Cat's Eye bible was built.)

### Step 2 — Design the world data
Map the bible onto the schema (interfaces below):
- **`lore`** — `premise` (who/what/goal, newcomer-friendly), `toneCues` (style + the
  "忠于原作、可英勇改写结局、勿大幅偏离" note), `motifGlossary` (canon motif words).
- **`antagonists: AntagonistDef[]`** — every real foe: `displayName` + `description`(设定) + `role`
  (`boss`/`mook`/`rival`). These become encounter enemies and ground the generator.
- **Canon reward items** — `EquipmentDef`s scoped with `worldId`, added to `EQUIPMENT_DEFS`
  (`src/world/equipment.ts`) + i18n names in `src/i18n/locales/zh-CN.ts`.
- **Recruitable characters** — for a NEW world, add `COMPANION_DEFS` entries
  (`src/companion/roster.ts`) with `worldId`, `persona`, `classId`, `skills`, `portraitSet`,
  `brand`. Generate their 立绘 with the asset kit (design spec Appendix A) using the shared Style
  Bible so the roster reads as one universe.
- **`storyChapters: QuestBlueprint[]`** — the faithful arc, in order. Each chapter:
  - 2–4 `encounters`; the final one faces the chapter's **boss antagonist** (set `antagonistId`).
  - `narrationIntro` / `narrationVictory` retell the canon beat (and the empowering twist).
  - `reward` = canon `equipmentDefIds` + `unlockCompanionIds` (the recruit gained this chapter) +
    `playerXp`. The unlock drives progression; recruiting a character also grants their bond.
  - The **post-completion plot beat** lives in the final encounter's `narrationVictory`.

### Step 3 — Write & register
- Add the `WorldDef` to `WORLD_DEFS` in `src/world/worlds.ts`.
- Add items to `EQUIPMENT_DEFS` + i18n keys; add companions to `COMPANION_DEFS` (new worlds).
- No generator code changes per world: `renderWorldLore` already injects the antagonist roster,
  `coerceQuest` validates rewards against `getWorldEquipment(worldId)` + the world's natives, and
  `storyChapterFor` selects the authored chapter by unlock progress.

### Step 4 — Verify
- `npx tsc -b`, `npm test` (add a `src/world/<world>.test.ts` like `worlds.test.ts`:
  `storyChapterFor` progression + every authored boss `antagonistId` exists +
  `renderWorldLore` lists the real antagonists), `npm run build`.
- Playwright (`scripts/shot_queststage.mjs`-style): the battle stage shows a **canon antagonist**
  (not 拖延心魔), faithful narration, recruit + canon loot, zero console errors.

## Schema (from `src/world/worlds.ts` + `src/domain/types.ts`)
```ts
interface WorldDef {
  id; name; nameKey; tagline
  lore: { premise; toneCues; motifGlossary }
  antagonists: AntagonistDef[]              // canon foes
  nativeCompanionIds: string[]; starterCompanionId
  storyChapters: QuestBlueprint[]           // faithful authored arc (the spine)
}
interface AntagonistDef { id; displayName; description /*设定*/; role: 'boss'|'mook'|'rival' }
interface QuestBlueprint { title; lore; encounters: Omit<EncounterSpec,'index'>[]; reward: QuestReward }
interface EncounterSpec { enemyName; enemyTheme; antagonistId?; hpScale; defScale; narrationIntro; narrationVictory }
interface QuestReward { equipmentDefIds: string[]; unlockCompanionIds: string[]; playerXp? }
```

## Worked example — Three Kingdoms (the empowering-alteration pattern)
Chapter "讨董卓·凤仪亭":
- **Antagonists**: `dong_zhuo`（董卓，霸京师的暴相）、`lu_bu`（吕布，董卓麾下第一猛将）、`xiliang_guard`（西凉铁骑，mook）.
- **Faithful base**: canonically 王允用貂蝉行美人计，离间董吕，最终吕布杀董卓；貂蝉是被牺牲的棋子。
- **Empowering twist** (player heroically changes the outcome, no big deviation): the player's party
  **阻止貂蝉执行美人计**, fights through 西凉铁骑 → 吕布, and **亲手击败董卓**, 救下貂蝉.
- **Rewards**: `unlockCompanionIds: ['diao_chan']`（招募貂蝉 + 解锁羁绊）, `equipmentDefIds: ['qixing_baodao']`（七星宝刀）, `playerXp`.
- `narrationVictory` delivers the beat: 董卓伏诛、貂蝉得救、她愿与旅人同行。

Author Cat's Eye the same way (see `WORLD_DEFS.cats_eye`): real foes (卢卡·罗克萨斯、黑市掮客、
假面「海因兹」), canon items (月下匕首、万能解码器、猫眼名片、海因兹的画作), a hopeful riff on the
bittersweet canon (the sisters recover the collection and find real hope about their father).
