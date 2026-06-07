# Fantasy Traveler — MVP Design Spec

**Date:** 2026-05-29
**Status:** Draft (pre-review)
**Author:** Brainstorming session (user + Claude)

---

## 1. Product Vision (north star)

Fantasy Traveler is an **AI Companion Productivity RPG**. Any input from the user's real
life (Todo, Journal, Calendar, and eventually Notes, Email, Fitness, Reading, etc.) is
absorbed by AI characters who become long-term adventure companions. As the user completes
real-life tasks, a game world reacts: monsters are damaged, XP is gained, story advances,
and the bond (好感度) with companions deepens. The eventual product is an *AI-generated game
engine* that turns real life into a living RPG.

This spec covers **only the first MVP slice** — a runnable, demoable, extensible vertical.

## 2. MVP Scope

### In scope
- **Productivity core**: Todo, Calendar, Journal. Calendar is the hub — Todos surface on
  their due dates; Journal entries are authored from a calendar day; calendar events exist.
- **Player as a character**: first-run onboarding creates *you* as a playable character
  (name + class + optional portrait). You have the same attribute model as companions and
  **level up from real-life productivity**.
- **Companion core**: the three 无期迷途 / Cat's Eye sisters (来生瞳 / 来生泪 / 来生爱) as a
  starting, data-driven roster. New characters can be added later.
- **Affinity / support system**: Fire-Emblem-style 好感度 with C/B/A/S ranks, support
  conversations unlocked at thresholds. Directional (companion → player).
- **Dialogue system**: 1:1 chat **and** group chat, powered by the real Claude API, with
  per-reply facial-expression tagging that swaps the character portrait.
- **Game core**: a Final-Fantasy-style **pixel turn-based battle** (Phaser) where real-life
  actions drive combat against a "心魔 / 拖延" monster. "Simple but real" combat in v1, with an
  architecture ready to deepen (turn order, skills, status effects, enemy variety).
- **Class system**: 6 classes covering the full RPG role wheel; the 3 sisters mapped onto it
  with their real (无期迷途) skill *names*; room for future characters.
- **i18n**: zh-CN as the default and complete locale; English as a stub; switchable in Settings.
- **Persistence**: fully browser-local (IndexedDB + localStorage); no backend.

### Out of scope (future specs)
- Universal input ingestion (email, fitness, notes, reading, chat history).
- AI-generated game-engine / procedural quests, maps, storyline generation.
- Multi-device sync, accounts, social/community features.
- Animated avatars (Kling/loop-clip video), voice.
- Deep combat (dungeons, items economy, multi-enemy parties) — architecture-ready, not built.
- Asset *generation* (handled by an external authoring kit — see Appendix A).

### Success criteria (the demo must show)
1. Create a Todo / Calendar event / Journal entry and see it on the calendar.
2. Completing a Todo visibly damages the monster and grants the player XP; an overdue Todo
   makes the monster grow and a companion express worry.
3. Chatting (1:1 and group) with a companion who references your real recent context, with a
   portrait whose expression matches the reply, and a visible 好感度 increase / rank-up.
4. All in Chinese, in a coherent retro-pixel aesthetic.

## 3. Core loop & personas

**Persona:** a self-improver who wants productivity to feel rewarding and emotionally warm,
not sterile. They live in a calendar/todo, journal sometimes, and want a companion who
"gets" them.

**Core loop:**
`Plan real life (Todo/Calendar/Journal) → act in real life → game world reacts (damage / XP /
story) → companions react & bond (affinity / dialogue) → motivation to plan again.`

## 4. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Build / app | **Vite + React + TypeScript** | SPA, fast HMR |
| Battle rendering | **Phaser 3** | Pixel scene embedded in a React route; `pixelArt: true` |
| App state | **Zustand** | small, hook-based stores |
| Persistence | **IndexedDB** via `idb` + `localStorage` | all domain data in IDB; prefs/API key in localStorage |
| AI | **`@anthropic-ai/sdk`** in-browser (`dangerouslyAllowBrowser`) | key from Settings; prompt caching on the static prefix |
| i18n | **react-i18next** | zh-CN default, en stub |
| Routing | **react-router** | dashboard / battle / chat / settings |
| Styling | CSS modules / Tailwind (TBD in plan) + a CJK pixel font (e.g. **Zpix**) | retro panels |
| Testing | **Vitest** + React Testing Library | pure logic + key flows |

## 5. Architecture

### 5.1 Modules (bounded, single-purpose)
```
src/
  app/            routing, layout shell, providers (i18n, store, theme)
  productivity/   todo, calendar, journal (UI + domain logic)
  game/           event bus, gameReducer (pure), combat (Phaser scenes + React bridge)
  companion/      character & class defs, affinity engine, dialogue UI + orchestration
  ai/             anthropic client, contextBuilder, prompt templates, expression parsing
  data/           idb schema + typed repositories + migrations
  state/          zustand stores (wire data ↔ UI)
  i18n/           locale resources (zh-CN, en)
  ui/             shared retro/pixel components (Panel, Button, Bar, Portrait, Dialog)
  assets/         sprites, portraits, fonts (placeholders until art lands)
```

### 5.2 Coupling: **event-sourced** (chosen approach A)
Productivity actions never call game logic directly. They **emit domain events** onto an
in-app event bus. A **pure `gameReducer(state, event) -> {state, effects}`** maps events to
game effects. This keeps the "real life changes the world" rule set in one testable place and
makes new input types (future: email, fitness) additive.

```
UI action ──► repository write (IndexedDB) ──► emit DomainEvent
                                                   │
                                                   ▼
                                            gameReducer (pure)
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         ▼                          ▼                         ▼
                  game state delta           affinity delta            companion mood flag
                  (monster hp, xp,           (per character)           (for next dialogue)
                   level, buffs)
                         │                          │                         │
                         ▼                          ▼                         ▼
                  Phaser battle scene       affinity store/UI         dialogue context
```

### 5.3 Phaser ↔ React bridge
- React owns routing, all DOM UI (todos, calendar, journal, chat, HUD). Phaser owns only the
  battle canvas.
- A thin `BattleBridge` (event emitter) passes commands React→Phaser (`playAttack(actor,
  target, skill)`, `spawnMonster`, `applyDamage`) and notifications Phaser→React
  (`animationComplete`, `battleEnded`). Combat *math* lives in pure TS (`game/combat/`), not
  in the scene, so it's testable; the scene only animates.

## 6. Data model

All persisted in IndexedDB. IDs are `crypto.randomUUID()`. Timestamps are ISO strings.

```ts
type ID = string;

interface Character {
  id: ID;
  name: string;
  kind: 'player' | 'companion';
  classId: ClassId;            // one of the 6 classes
  stats: Stats;
  skills: SkillId[];           // resolved from class + unlocks
  portraitSet: string;         // asset key prefix, e.g. "raisei_hitomi"
  brand?: string;              // 专属烙印 signature name (flavor + signature skill)
  persona?: CompanionPersona;  // companions only — drives the LLM
  createdAt: string;
}

interface Stats { level: number; xp: number; maxHp: number; atk: number;
                  def: number; spd: number; mag: number; }

interface CompanionPersona {
  systemPrompt: string;        // base personality block (zh)
  speechStyle: string;         // tone cues
  defaultExpression: ExpressionKey;
}

type ClassId = 'vanguard' | 'guardian' | 'striker' | 'arcanist' | 'tactician' | 'medic';
interface ClassDef {
  id: ClassId; nameKey: string; role: string;
  statBias: Partial<Stats>;            // applied per level
  baseSkillIds: SkillId[];
  growth: Partial<Stats>;              // per-level growth
}

interface SkillDef {
  id: SkillId; nameKey: string;        // e.g. "skill.jiying" → 疾影
  kind: 'attack' | 'heal' | 'buff' | 'debuff';
  power: number; target: 'enemy' | 'ally' | 'self' | 'allEnemies' | 'allAllies';
  // effects are OUR simple design — names borrowed from 无期迷途, effects are not.
}

interface Todo {
  id: ID; title: string; notes?: string;
  due?: string;                        // ISO date or datetime
  priority: 'low' | 'med' | 'high';
  status: 'open' | 'done';             // 'overdue' is derived (open && due < now)
  tags: string[];
  recurrence?: RecurrenceRule;         // optional; v1 may stub
  createdAt: string; completedAt?: string;
}

interface CalendarEvent {
  id: ID; title: string; start: string; end?: string; allDay: boolean;
  notes?: string; linkedTodoId?: ID;
}

interface JournalEntry {
  id: ID; date: string;                // YYYY-MM-DD (one+ per day)
  mood: Mood; title?: string; body: string; createdAt: string;
}
type Mood = 'great' | 'good' | 'neutral' | 'down' | 'bad';

interface Affinity {
  characterId: ID; points: number; rank: AffinityRank;
  unlockedSupports: string[];          // support-convo ids already seen
  dailyGained: number; dailyGainedOn: string; // daily cap bookkeeping
}
type AffinityRank = 'none' | 'C' | 'B' | 'A' | 'S';

interface GameState {
  partyIds: ID[];                      // player + companions
  monster: Monster;
  storyStage: number;                  // increments on monster defeat
  buffs: Buff[];
  lastResolvedAt: string;
}
interface Monster { id: ID; nameKey: string; level: number; maxHp: number; hp: number;
                    atk: number; growth: number; }
interface Buff { id: ID; kind: string; magnitude: number; expiresAfterBattles: number; }

interface ChatThread { id: ID; type: 'solo' | 'group'; memberIds: ID[];
                       title?: string; createdAt: string; }
interface ChatMessage { id: ID; threadId: ID; sender: 'player' | 'system' | ID;
                        text: string; expression?: ExpressionKey; createdAt: string; }

interface Settings { apiKey?: string; model: string; language: 'zh-CN' | 'en';
                     theme: string; }
```

### IndexedDB stores
`characters · todos · calendarEvents · journalEntries · affinity · gameState (singleton) ·
chatThreads · chatMessages · settings (singleton) · meta (schema version)`

Migrations handled by `idb`'s `upgrade` callback keyed on a version integer.

## 7. Domain events → game reducer (the coupling rules)

```ts
type DomainEvent =
  | { type: 'TodoCompleted'; todo: Todo }
  | { type: 'TodoOverdue'; todo: Todo }       // emitted by a daily sweep
  | { type: 'JournalWritten'; entry: JournalEntry }
  | { type: 'CalendarEventAttended'; event: CalendarEvent }
  | { type: 'FocusStreak'; days: number }
  | { type: 'DialogueInteraction'; characterId: ID };
```

v1 effect rules (tunable constants in one config file):

| Event | Player XP | Monster | Affinity | Mood flag |
|---|---|---|---|---|
| `TodoCompleted` (low/med/high) | +10 / +20 / +40 | dmg = f(party.atk, priority) | +5 to active companion (capped/day) | — |
| `TodoOverdue` | 0 | monster.hp += grow, monster.atk += 1 | — | companion "worried" |
| `JournalWritten` | +15 | — | +8 split among present companions | mood → companion reaction |
| `CalendarEventAttended` | +25 | dmg small | +5 | — |
| `FocusStreak(n)` | +10·n | — | — | grants ATK buff for next N battles |
| `DialogueInteraction` | 0 | — | +2 (heavily daily-capped) | — |

**XP / level curve:** `xpForLevel(n) = 80 * n + 20 * n^2` (gentle early, steeper later).
On level-up: apply `classDef.growth`, raise `maxHp`, possibly unlock a skill.

**Monster damage formula (overworld passive):**
`dmg = max(1, round((party.totalAtk * priorityMult) - monster.def_like))`, `priorityMult =
{low:1, med:1.5, high:2.5}`. Monster auto-defeats when `hp ≤ 0` → victory burst (XP +
affinity + storyStage++ + spawn stronger monster).

**Daily overdue sweep:** on app load and at local midnight, scan open todos with `due < now`
and emit `TodoOverdue` once per todo per day (idempotent via a `lastSweptDate`).

## 8. Character & class system

Six classes (full role wheel; data-driven so new characters slot in):

| Class | id | 定位 | Stat bias | Role |
|---|---|---|---|---|
| 先锋 Vanguard | `vanguard` | 平衡战士 | ATK/HP | balanced bruiser (default for player) |
| 守卫 Guardian | `guardian` | 重装 | DEF/HP | tank / protect |
| 影刺 Striker | `striker` | 敏捷暴击 | SPD/ATK | single-target burst |
| 秘术 Arcanist | `arcanist` | 法术范围 | MAG | AoE magic |
| 策士 Tactician | `tactician` | 控制·攻辅 | SPD/MAG | debuff + offensive support |
| 医者 Medic | `medic` | 治疗·辅助 | MAG/DEF | heal / shield / cleanse |

**The three sisters** (skill *names* from 无期迷途; effects are our own simple design;
each 专属烙印 becomes a signature passive/ultimate):

| Character | id | Class | Skill names | 专属烙印 |
|---|---|---|---|---|
| 来生瞳 | `raisei_hitomi` | Striker | 疾影 / 疾袭 / 艺术秘宝 / 完美收官 | 月下影 |
| 来生泪 | `raisei_rui` | Tactician | 午夜预告 / 夜幕协奏 / 绮夜之约 / 猫眼藏品 | 耳畔声 |
| 来生爱 | `raisei_ai` | Medic | 治疗无人机 / 应急援助 / 渗透准备 / 完美预案 | 心间爱 |

Open classes for future characters: Vanguard, Guardian, Arcanist.

**Personas (companion `systemPrompt`)** — seeded from canon: Rui (eldest, mature,
strategic, gently teasing, protective), Hitomi (cheerful, energetic, brave, playful),
Ai (youngest, clever, techy, carefree). Full prompt text authored during implementation.

## 9. Affinity / support system

- Points per companion accrue from events (table §7). Daily gain cap (e.g. 30/day) prevents
  grinding; cap tracked via `dailyGained`/`dailyGainedOn`.
- Rank thresholds: `C=0, B=100, A=250, S=500`. Crossing a threshold **unlocks a support
  conversation** — an LLM-generated (persona-aware) special scene, recorded in
  `unlockedSupports` so it fires once.
- Rank visibly gates dialogue warmth and unlocks the `heartthrob` expression at S.
- Directional: affinity is the companion's regard for the player; the player has none.

## 10. Combat system (turn-based, Phaser)

**v1 ("simple but real"):**
- Always an active monster (心魔). Its HP scales with the player's open high-priority load
  (so clearing real tasks clearly ends it).
- **Passive damage:** completing real todos triggers an attack animation (a party member
  strikes) and applies §7 damage. Overdue todos animate a monster counter-grow.
- **Active battle screen** (Phaser route): shows party sprites (player + 3) + monster + HP
  bars + a turn log. v1 auto-resolves a round with juice (tween attacks, damage numbers,
  skill name banners using the real skill names); a manual "use skill" affordance is a
  stretch. Turn order by `spd`.
- **Victory:** XP + affinity burst, storyStage++, stronger monster spawns, optional
  cosmetic drop.

**Architecture-ready (not built in v1):** full manual turn-based control, status effects,
multiple enemies, items, dungeons. Combat math is pure TS so depth is additive.

## 11. Dialogue system (1:1 + group)

- **Threads:** solo (player + 1 companion) or group (player + N companions). Persisted with
  messages.
- **Per reply** the model returns structured output `{ reply: string, expression:
  ExpressionKey, internalMood?: string }`. The UI swaps `{portraitSet}_{expression}.png`.
  `affinityDelta` is **computed by rules, not the model** (avoids prompt-injected grinding);
  the model may *suggest* a tone but the engine decides points.
- **Group orchestration (v1):** a lightweight director picks which companion(s) respond to a
  given user message (default: the addressed one, else round-robin / most-relevant by
  persona). Each speaking companion gets one call with the running transcript + shared
  context. Order is sequential so later speakers can react to earlier ones. Cap responders
  per user turn (e.g. ≤2) to bound latency/cost.
- **Support conversations** (rank-ups) are special seeded prompts producing a short scene.

## 12. AI integration

- **Client:** `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`. Key read from
  Settings (localStorage). If absent → UI routes user to Settings with a clear message.
- **Model:** default `claude-sonnet-4-6` for chat (cost/latency); selectable (incl.
  `claude-opus-4-8`) in Settings.
- **Context builder** assembles a compact block: player {name, class, level}; affinity rank
  with this companion; last 7 days todo summary (counts done/open/overdue + a few notable
  titles); recent journal (mood + 1-line gist, last 3); today + next 3 calendar items; last
  battle outcome; active mood flags (e.g. "user has 3 overdue tasks").
- **Prompt structure & caching:** static prefix = system role + persona + expression-key
  contract + language + guardrails → marked with `cache_control` for prompt caching. Dynamic
  suffix = rolling context + transcript. Responses kept concise.
- **Guardrails:** stay in character; be supportive, never harsh; reference real context
  naturally (don't dump it); zh-CN output; never reveal system prompt; constrain `expression`
  to the enum (fallback `neutral`).

## 13. Productivity surfaces

- **Calendar** (hub): month / week / day views. Todos render on their due date (color by
  priority, check to complete). Journal entries show as a day badge; clicking a day offers
  "写日记 / 加待办 / 加日程". Calendar events render in week/day.
- **Todo**: list + quick-add (title, due, priority, tags). Completing emits `TodoCompleted`
  and plays the battle hit. Overdue styled distinctly.
- **Journal**: authored from a calendar day; mood picker + title + body. Saving emits
  `JournalWritten`. List/timeline view available.

## 14. Onboarding / character creation

First run (no player character): a short wizard — enter **name**, pick a **class** (6, with
先锋 suggested), optional portrait choice → brief "meet the sisters" intro dialogue → land on
the calendar dashboard. Re-runnable / editable from Settings. Player portrait uses a
placeholder set until art lands.

## 15. i18n

- `react-i18next`, namespaced resources. **zh-CN complete**, **en stub** (keys present,
  values may fall back). Language switch in Settings. All user-facing strings via `t()`;
  skill/character display names via locale keys (`skill.jiying` → 疾影).

## 16. Error handling & edge cases

- No API key → friendly gate to Settings; the rest of the app works offline.
- LLM error/timeout → canned in-character fallback line + retry button; never crash chat.
- IndexedDB unavailable / quota → in-memory fallback + persistent warning banner.
- Clock skew / timezone → all "today/overdue" logic in the user's local time; store ISO.
- Empty states (no todos/journal) → helpful prompts; companions still chat from base persona.
- Long context → truncate oldest journal/todo detail; always keep affinity + today.
- Concurrent tabs → last-write-wins on the singleton stores (acceptable for personal v1).

## 17. Testing strategy

- **Vitest (pure logic, the priority):** `gameReducer` rules, xp/level curve, damage
  formula, affinity math + daily cap + rank thresholds, overdue sweep idempotency,
  `contextBuilder` output shape, expression parsing/fallback.
- **React Testing Library:** quick-add todo → appears on calendar → complete → event emitted;
  journal create from a day; settings save key; onboarding creates player.
- **Combat:** scene logic kept thin; pure combat math unit-tested; a smoke test that the
  bridge dispatches expected commands.
- LLM calls mocked in tests (no network).

## 18. Non-goals / explicit cuts for v1

Universal ingestion; AI-generated quests/maps/story; accounts/sync; animated avatars/voice;
deep combat economy; asset *generation* in-app; mobile-native. All deferred.

## 19. Open questions / risks (to resolve in review)

- LLM-in-browser cost/latency for group chat (mitigation: responder cap, sonnet default,
  caching). Acceptable for personal v1?
- Group-chat director complexity — is round-robin enough for v1?
- Combat "passive damage vs active battle" duality — is it coherent, or should v1 pick one?
- Scope size for a single MVP build — sequencing/milestones needed.
- Pixel-art portrait swap vs. expression set richness — start with core 8?

---

## Appendix A — Character asset-authoring kit (external, not part of the app)

> The **expression *keys*** are a system contract (`ExpressionKey` enum). The **generation
> *prompts*** below are an external authoring tool — fully customizable by the user/future
> users for any art style, as long as output filenames match the keys.

### A.1 Expression schema (system contract)
12 expressions, 8 core + 4 extended, each mapped to in-game triggers:

| key | zh | tier | trigger |
|---|---|---|---|
| `neutral` | 平静 | core | default idle |
| `smile` | 微笑 | core | greeting, normal chat |
| `happy` | 开心 | core | task done, praise, level-up |
| `blush` | 害羞 | core | affinity gain, rank-up |
| `sad` | 难过 | core | comfort, low-mood journal |
| `worried` | 担心 | core | procrastination/stress |
| `angry` | 不满 | core | overdue (playful pout) |
| `determined` | 认真 | core | combat, encouragement |
| `surprised` | 惊讶 | ext | crit, unexpected event |
| `thinking` | 思考 | ext | advice/planning |
| `heartthrob` | 心动 | ext | S-rank / special support |
| `tired` | 疲惫 | ext | late-night/overwork |

```ts
export const EXPRESSION_KEYS = ['neutral','smile','happy','blush','sad','worried',
  'angry','determined','surprised','thinking','heartthrob','tired'] as const;
export type ExpressionKey = typeof EXPRESSION_KEYS[number];
export const CORE_EXPRESSIONS: ExpressionKey[] = ['neutral','smile','happy','blush',
  'sad','worried','angry','determined'];
```
The LLM returns a constrained `expression`; UI loads `{portraitSet}_{key}.png`; missing
extended keys fall back to the nearest core key.

### A.2 Style Bible (paste verbatim for EVERY character — the cross-character anchor)
```
STYLE BIBLE (do not alter between characters):
Character portrait for a pixel-art fantasy RPG companion game. Modern anime gacha
splash-art style: clean crisp lineart, bold readable silhouette, cel shading with
limited high-contrast soft shadows, vivid but disciplined colors — deliberately
designed to downscale cleanly into pixel art. Lighting: soft key from front-left,
gentle ambient fill, no harsh rim light. Framing: BUST shot — head and upper chest,
centered, facing the viewer at a slight 3/4 angle, eyes toward the viewer. Head fills
~60% of frame height; eye-line at vertical center. Consistent scale and crop across
all images. Vertical 2:3 portrait. Fully TRANSPARENT background. Single character only.
No text, no logo, no watermark, no border, no frame, no background props.
```

### A.3 Per-character identity block (the ONLY thing that changes between characters)
```
CHARACTER IDENTITY (lock across all of this character's expressions):
来生瞳 (Hitomi) — woman early 20s, agile lively phantom-thief vibe. Long flowing
chestnut-brown hair with side bangs; large expressive amber eyes; fair skin; slim
athletic build. Outfit: sleek black cat-burglar bodysuit with crimson accents and a
short cape collar; fingerless gloves. Confident playful energy. Class: 影刺 striker.
```
> To add **Tifa** later: keep the Style Bible identical; swap only this block. Same universe.

### A.4 Expression line (one variable per image)
```
EXPRESSION: {expression_prompt}. Keep hairstyle, facial features, outfit, colors,
framing, scale, and lighting EXACTLY identical to the reference image; change ONLY the
facial expression and a subtle natural head tilt.
```
Per-key `{expression_prompt}`: neutral=calm relaxed, mouth closed · smile=warm closed-mouth ·
happy=bright open cheerful · blush=shy, pink cheeks, glancing away · sad=downcast, glistening
eyes · worried=furrowed brows, uneasy · angry=playful pout, puffed cheeks (cute-mad) ·
determined=focused confident · surprised=wide eyes, open mouth · thinking=pensive, eyes up ·
heartthrob=flustered, strong blush, soft loving eyes · tired=sleepy, half-lidded.

### A.5 Recommended batch workflow (OpenAI gpt-image / "image2")
1. Generate the **neutral master** (1024×1536, `background: transparent`, png) → save as
   `{id}_neutral.png` — the identity reference.
2. For each other expression: **edit/reference** call with the neutral master + Style Bible +
   Identity + that expression line → `{id}_{key}.png`.
3. Loop all 12 keys.
4. Pixelize (nearest-neighbor downscale to ~128px portrait + shared 16-color palette `-remap`)
   into the app portrait set. (Alternative: one 3×4 labeled grid sheet per character, sliced.)

### A.6 Machine-readable batch config (the schema)
```json
{
  "styleBible": "<<§A.2 verbatim>>",
  "output": { "size": "1024x1536", "background": "transparent", "format": "png",
              "naming": "{id}_{key}.png" },
  "expressionTemplate": "EXPRESSION: {prompt}. Keep hairstyle, features, outfit, colors, framing, scale, and lighting EXACTLY identical to the reference; change only the expression and a subtle head tilt.",
  "character": { "id": "raisei_hitomi", "displayName": "来生瞳", "class": "striker",
                 "identity": "<<§A.3 verbatim>>" },
  "expressions": [
    { "key": "neutral", "isReference": true, "prompt": "calm relaxed neutral, mouth closed, soft gaze" },
    { "key": "smile", "prompt": "warm gentle closed-mouth smile, friendly" },
    { "key": "happy", "prompt": "bright open cheerful smile, eyes narrowed with joy" },
    { "key": "blush", "prompt": "shy bashful, pink cheeks, glancing away, small smile" },
    { "key": "sad", "prompt": "downcast sorrowful, lowered brows, glistening eyes" },
    { "key": "worried", "prompt": "concerned anxious, furrowed brows, uneasy eyes" },
    { "key": "angry", "prompt": "playful displeased pout, puffed cheeks, cute-mad" },
    { "key": "determined", "prompt": "focused confident serious gaze, resolute" },
    { "key": "surprised", "prompt": "wide eyes, raised brows, open mouth, startled" },
    { "key": "thinking", "prompt": "pensive thoughtful, eyes glancing up" },
    { "key": "heartthrob", "prompt": "flustered tender, strong blush, soft loving eyes" },
    { "key": "tired", "prompt": "sleepy weary, half-lidded eyes, faint smile" }
  ]
}
```
Final prompt per image = `styleBible` + `character.identity` + filled `expressionTemplate`.
Swap `character` per roster member; everything else stays fixed → consistent universe.

---

## 20. Build sequence (LOCKED — from plan review 2026-05-29)

**Invariant: no milestone starts until the prior one is demoable end-to-end.**

- **M0 — Thin vertical (prove the whole loop, zero breadth).** Bare Todo list (add +
  complete) → IndexedDB + typed repositories → event bus + pure `gameReducer` with **only
  `TodoCompleted` + `TodoOverdue`** → **DOM/React monster HUD** (HP bar, damage float,
  monster grows on overdue — *no Phaser*, math is pure TS) → one companion (来生瞳) static
  neutral portrait + **completion companion reaction** (canned line + expression + `好感度 +N`
  float) → 1:1 Claude chat reading real todo context via `contextBuilder` → affinity as a
  number + one rank-up toast. **← current target.**
- **M1 — Productivity breadth.** Calendar month view (todos on due dates, journal day-badges,
  click-a-day authoring) + Journal + `JournalWritten` on the same bus. (Criterion #1.)
- **M2 — Companion depth.** Full affinity C/B/A/S + support conversations + rank-gated warmth
  + S-rank `heartthrob`; all three sisters; per-companion expression set; `DialogueInteraction`.
- **M3 — Combat depth.** Class/skill numbers, player-leveling consequences, `FocusStreak` +
  `Buff` (still passive/DOM).
- **M4 — Phaser battle screen.** Replace DOM HUD via `BattleBridge` as a **view/replay** of
  reducer effects (pure state always authoritative; explicit subscribe/unsubscribe on scene
  create/shutdown; commands with no live scene are queued/dropped).
- **M5 — Group chat + deterministic director** (addressed-name-substring → round-robin, cap 2,
  never an LLM call for routing).
- **M6 — EN i18n + extended expressions + polish.**

## 21. Locked resolutions (from plan review — supersede earlier sections where they conflict)

**Combat / game state**
- v1 combat is **passive-only**: real-life events via the reducer are the **sole authority** on
  `monster.hp`. The Phaser screen (M4) is a non-authoritative view/replay; it never rolls combat.
- `Monster` gains `def: number`. **Canonical damage:** `dmg = max(1, round(partyAtk *
  priorityMult − monster.def))`, `partyAtk = Σ stats.atk over partyIds`,
  `priorityMult = { low: 1, med: 1.5, high: 2.5 }`. (Used verbatim in §7 + tests.)
- **Monster HP set at spawn:** `maxHp = MONSTER_BASE_HP + HP_PER_OPEN_HIGH * countOpenHigh() +
  storyStage * HP_PER_STAGE`; thereafter changes only via events. Defaults:
  `MONSTER_BASE_HP=400, HP_PER_OPEN_HIGH=80, HP_PER_STAGE=120, monster.def=10 (+2/stage)`.
- **Defeat = single idempotent transition** gated on `defeatedMonsterId` (no double-fire).
  Victory burst: player XP +120, +20 affinity to active companion, `storyStage++`, spawn next.
  v1 has **no lose condition** (monster never KOs the party).

**Events**
- v1 wires only `TodoCompleted` + `TodoOverdue` (M0), then `JournalWritten` (M1). Keep the full
  `DomainEvent` union for extensibility but **don't wire** `CalendarEventAttended` (M1+, trigger =
  manual "mark attended"), `FocusStreak`/`Buff` (M3), `DialogueInteraction` (M2).
- **Companion mood flags** (finite set): `idle | worried | proud | concerned`. `TodoOverdue` →
  `worried`; `JournalWritten` mood `down|bad` → `concerned`, `great|good` → `proud`. Flag biases
  the next greeting/canned line + expression; cleared on acknowledgement.

**Affinity**
- "Active companion" = `partyIds` first companion (default 来生瞳 until a selector exists).
  "Present companions" = all companions in `partyIds`. `JournalWritten` +8 split `floor(8/N)`.
- Fresh companion rank = `'none'`; **first** affinity gain (0→>0) sets `'C'` and unlocks C
  support (never fires at game start). Monotonic in v1 (no decay). Daily cap 30 (`dailyGained`).
- Thresholds `C=0,B=100,A=250,S=500`. Onboarding "meeting" grants +20 to each sister so first
  rank-up is reachable; **demo seed** sets 来生瞳 to 90.

**The loop fix (highest-value): completion routes through the companion**
- On `TodoCompleted`, the primary felt reward is a **companion reaction on the productivity
  surface**: active companion portrait → positive expression + a short in-character line from a
  **per-persona × per-priority canned pool (3–5 lines, NO LLM call)** + animated `好感度 +N`
  float. The monster hit is secondary garnish. (Unit test: canned-line selector; RTL: completion
  renders portrait + line + affinity float.)

**Data model concretions**
- `type SkillId = string` (skill ids = `nameKey` suffix, e.g. `jiying`). `RecurrenceRule` =
  typed stub `{ kind: 'none' }` for v1 (schema compiles; logic deferred).
- **Per-class L1 base stats + per-level growth** `{maxHp,atk,def,spd,mag}`:
  - vanguard base `{120,18,12,10,6}` grow `{14,3,2,1,1}` · guardian `{150,12,18,7,5}`
    grow `{18,2,3,1,1}` · striker `{95,20,8,16,6}` grow `{10,3,1,2,1}` (来生瞳) ·
    arcanist `{85,7,7,11,20}` grow `{9,1,1,1,3}` · tactician `{90,10,9,14,16}`
    grow `{10,2,1,2,2}` (来生泪) · medic `{100,8,12,10,17}` grow `{12,1,2,1,2}` (来生爱).
- **XP curve:** `xpForLevel(n) = 80n + 20n²` (xp to go n→n+1). On level-up apply `growth`.
  In v1 each sister simply *has* her 4 named skills as banner flavor (no unlock-by-level).
- `专属烙印` is display-only flavor in v1. `ChatMessage.expression` applies to companion
  senders only. Default `portraitSet='player_default'`; global missing-asset placeholder.
- **IndexedDB v1 schema (declare up front):** stores with keyPath `id` except singletons
  (`gameState`, `settings`, `meta` keyed `'singleton'`). Indexes: todos `by_status`,`by_due`;
  calendarEvents `by_start`; journalEntries `by_date`; chatMessages compound `[threadId,
  createdAt]`; affinity keyed `characterId`. Repos expose intent-named methods (impl
  `getAll()+filter` now). `blocked`/`versionchange` handlers so a second tab can't hang upgrade.

**Reducer / state contract**
- `gameReducer({ gameState, affinity, party, now }, event) → { gameStatePatch, affinityPatch,
  moodFlags, effects }`. **Never reads the clock — `now` is injected** (deterministic tests). A
  thin impure applier commits patches. No rng in v1 (deterministic; no crit mechanic).
  Rename concept "event-sourced" → **"event-mediated"** (events transient, no persisted log).
- **IndexedDB is source of truth; Zustand is a derived read-model** hydrated on load, updated
  only after a successful repo write via one `apply effects → persist → update store` pipeline.
  `gameState` mutations are **read-modify-write inside a single IDB `readwrite` transaction**.

**AI integration**
- All Anthropic calls route through one `ai/client.ts` wrapper (model selection, `cache_control`
  prefix, timeout/retry, parse, fallback). Structured output via **tool-use with a strict
  input_schema** for `{ reply, expression, internalMood? }`; zod-guard the `ExpressionKey` enum;
  **extended→core fallback map**: `heartthrob→blush, tired→neutral, surprised→happy,
  thinking→neutral`; bound `max_tokens≈150–200`; on parse failure → canned line + `neutral`.
- Default `model='claude-sonnet-4-6'`, `language='zh-CN'`, `fallbackLng:'zh-CN'`. Settings: masked
  key field + clear-key + "test key" (401→invalid, 429→billing, network→connectivity) + honest
  BYO-key storage disclosure + a session token/cost counter. Caching is a within-session win
  (~5-min ephemeral TTL), not cross-session; responder cap is the real cost lever.
- `contextBuilder` has a **typed output shape + token budget + deterministic drop order**
  (keep affinity + today; drop oldest journal/todo detail first). Chat UX: optimistic user echo +
  per-companion "thinking" indicator; ~8–10s time-to-first-token budget → fallback.

**Overdue date correctness (the one real bug)**
- Normalize a date-only `due` to **local end-of-day** before comparing to `now`. Add per-todo
  `lastOverdueOn` (YYYY-MM-DD local) so re-sweeps don't double-fire and add-after-sweep isn't
  skipped. One `localDateKey()` helper everywhere. Sweep on **app-load + `visibilitychange`**
  (drop the precise midnight timer); high-water-mark guards clock rollback;
  completing/rescheduling clears the overdue stamp. Derived-overdue (display) vs emitted-overdue
  (economy) stay distinct.

**UX / aesthetic**
- **Two zones:** full retro-pixel on game/companion surfaces; productivity surfaces (calendar,
  todo) get pixel *accents* + standard spacing + readable type. Zpix for chrome/short text at
  12px (integer multiples); hinted CJK UI font (PingFang SC / Noto Sans SC ≥14px) for dense body
  (chat, journal, calendar). Non-color priority cues (1/2/3 pips) + non-color overdue (dashed
  border + glyph). Journal mood = labeled icon+word (optional). Portrait swap: cross-fade/blink,
  expression leads the text. Reward moments: `+N 好感度` float, rank-up banner + unlocked-support
  entry, level-up flourish, daily-cap indicator. Once-per-local-day on-open companion greeting
  (gated `lastGreetedDate`, dismissible, canned fallback if no key).
- **Onboarding:** lead with one **primary** companion (来生瞳) to concentrate the bond; group
  chat deferred to M5. Class pick defaults 先锋, shown as illustrated one-line benefits ("可随时更改").

**Deferred / stubbed (low):** RecurrenceRule logic, in-memory IDB fallback banner, multi-tab
handling beyond the gameState RMW guard, EN stub. Write schema v1 directly; add the upgrade
ladder only when the schema first changes.

---

## 22. Worldview + AI Storyline arc (added 2026-05-29 — supersedes the §20 ordering)

After M0 + the FF-16bit visual pass shipped, the next arc pulls the long-term "AI-generated game
engine" (previously deferred in §18) **forward**: a worldview/lore layer + AI-generated story 副本
become the **main loop**, replacing the endless-monster placeholder. The old M2 ("all three
sisters") is absorbed into this arc as quest-unlock rewards.

### 22.1 Concept
- The player is a cross-world **traveler**. They pick a **world** (first: **猫眼 / Cat's Eye**, the
  无期迷途 来生 sisters) and an **AI-generated storyline 副本** begins — a narrated, ordered chain
  of encounters. Completing **real-life todos damages the current encounter's enemy** (reusing the
  passive reducer); clearing it advances the narrative; finishing the 副本 grants rewards.
- **Framing:** the sisters are phantom thieves helping the traveler reclaim focus/time stolen by
  心魔. Each 副本 is an operation against themed 心魔 bosses.
- Start partnered with **来生瞳** only (M0 parity); **来生泪 then 来生爱 are unlocked as quest
  rewards**. Future worlds (FF7: Tifa/Aerith; 三国: 赵云/诸葛亮/貂蝉) are data/lore packs.
- **Party up to 6** (may mix worlds later). Same-world characters form a **relationship network**
  granting party **stat synergies** when partied together. **Equipment** grants stat bonuses as
  **effective stats computed at combat time** (no denormalization).

### 22.2 Key mechanics & invariants
- **Reducer stays pure.** AI storyline generation is async/impure → lives in `storylineService` +
  the pipeline; the reducer only consumes an already-materialized `Quest` (injected via
  `ReducerInput.quest`). No `await` ever enters `gameReducer`.
- **Quest-driven victory** extends the existing idempotent defeat: clearing an encounter advances
  `encounterIndex` (new) and spawns the next encounter's enemy; the final encounter emits
  `questCompleted` + `recruited` + `equipmentGranted` **effects**, applied atomically by the
  pipeline (which now also writes the new `quests` store). `storyStage` remains the monotonic
  difficulty dial; `encounterIndex` is the narrative pointer.
- **LLM trust boundary:** `generateStoryline` mirrors `chat()` (tool-use + `cache_control` world-lore
  prefix + `classify`). `coerceQuest` clamps `hp/defScale`, and **filters rewards to known
  `EQUIPMENT_DEFS` and intersects unlocks with the world's `nativeCompanionIds`** — the model can
  never grant an invented/out-of-world/duplicate character or item. Failure / no-API-key → a
  hand-authored per-world `fallbackQuest`, so the main loop stays fully playable offline.
- **Affinity** on completion/victory: ~~lead-companion-only~~ **UPDATED 2026-05-31 (user-directed):**
  goes to **every on-field companion** (`gainAffinity`→`applyAffinityToEach`, each capped per-day);
  `JournalWritten` splits its pool via `gainAffinitySplit`. The felt-reward reaction is voiced by a
  **random** on-field companion in a global portrait popup (`ui/ReactionPopup.tsx`); the party-lead
  「主控」 selector was removed as redundant.

### 22.3 Data (new)
- Static def modules (code, not persisted): `src/world/worlds.ts` (`WorldDef` + lore pack +
  `fallbackQuest`), `src/world/relationships.ts` (`RelationshipEdge`, `SynergyDef`),
  `src/world/equipment.ts` (`EquipmentDef`).
- Persisted types (`src/domain/types.ts`): `OwnedEquipment`, `EncounterSpec`, `QuestReward`,
  `Quest`; `Character.worldId?`; `GameState += activeWorldId? / activeQuestId? / encounterIndex /
  unlockedCompanionIds[] / ownedEquipment[]`; `Monster.displayName?`.
- IndexedDB **v2**: add `quests` store (indexes `by_world`, `by_status`); version-aware `upgrade`;
  **read-time `withDefaults` backfill** in `gameStateRepo.get` so pre-arc saves migrate cleanly
  (load into the endless loop, then opt into a world). All schema churn in this one bump.

### 22.4 Revised build sequence (this arc replaces §20's M1→M2 ordering; later milestones unchanged)
- **Arc-0** — Docs (this section) + `.impeccable.md` note.
- **Arc-A** — World/party(≤6)/relationship/equipment foundation, effective stats, DB v2. *No AI.*
- **Arc-B** — AI storyline generation (generate + persist + preview).
- **Arc-C** — Quest-driven combat + narrated encounter view (BattleStage).
- **Arc-D** — Rewards / recruit / equipment payout (来生泪 → 来生爱 unlocks).
- **Then (unchanged):** M1 Calendar + Journal → real 立绘 → combat-juice / Phaser BattleBridge (M4)
  → group chat (M5, now naturally multi-companion) → EN i18n (M6).
