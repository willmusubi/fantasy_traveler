# 幻想旅人 · Fantasy Traveler

An **AI-companion productivity RPG**. Your real-life Todos, Journal, and Calendar power a
16-bit Final-Fantasy-style RPG: completing real tasks attacks a 拖延心魔 (procrastination
demon), levels *you* up, earns gold, and deepens your bond (好感度) with AI companions you can
chat with. Fully browser-local (IndexedDB), Chinese-first, no backend.

> **Characters are yours to create.** This repo ships an **original placeholder cast** — the
> 观星会 trio (米拉 / 薇拉 / 诺娃) — so the engine runs out of the box. Swap in your own
> characters and worlds (`src/companion/roster.ts`, `src/world/worlds.ts`), or generate them with
> your own AI workflow. **No character art is committed**: the app shows emoji portraits until you
> drop your own PNGs into `public/portraits/` (see its README), so it always runs.

## What's working

- **Onboarding** — create your character (name + one of 6 classes).
- **Todos · Calendar · Journal** — add / complete / reorder todos (priority, due dates, overdue
  cues); a month calendar; a mood journal that bonds the party.
- **Active turn-based combat** — completing a todo resolves **one CTB round**: your party acts in
  speed order (fast units lap, 套圈, for bonus hits), the 心魔 strikes on its own turn, skills cost
  MP, and gold drops. **FF-style live step-through** — pick each ally's action in the battle HUD as
  the round plays out; the calendar zone auto-resolves with your saved defaults.
- **Per-task countdown timer** — set a focus timer on a todo; if it runs out before you finish, the
  心魔 lands a free hit.
- **Skills · MP/HP · gold · shop · equipment** — characters unlock active skills by level; spend
  gold on potions/gear; equipment applies as effective combat stats.
- **Habits** — Habitica-style dailies: completing one drafts a party buff; missing one applies a
  debuff (both last until your next victory).
- **Companions & affinity** — a data-driven roster with Fire-Emblem-style C/B/A/S 好感度, in-character
  canned reactions (no LLM cost), party synergies, and a worldview / quest arc.
- **AI chat** — talk to your companions via the real Claude API; they read your recent todo context.
  Your API key lives only in your browser.
- **16-bit JRPG UI** — royal-blue FF command windows, a gold ▸ cursor, pixel font, and a starfield.

## Run

```bash
npm install
npm run dev      # → http://localhost:5173
```

To chat, open **⚙ 设置**, paste an Anthropic API key (`sk-ant-…`), and hit **测试连接**. The key
lives only in your browser (IndexedDB); calls go directly from your browser to Anthropic — fine for
personal use.

## Scripts

```bash
npm run dev        # dev server (HMR)
npm run build      # typecheck + production build
npm test           # run the test suite (Vitest)
npm run typecheck  # tsc project build, no emit
```

## Architecture

```
src/
  domain/      types + tunable config (xp curve, damage, affinity, class stats) + date helpers
  data/        IndexedDB schema (idb) + typed repositories
  game/        event bus · pure gameReducer · pipeline (atomic IDB apply) · combat / leveling math
  companion/   roster (data-driven) · affinity math · skills · canned reaction lines
  world/       worlds / quests · antagonists · equipment · party synergies
  ai/          single Anthropic client wrapper · context builder · storyline generation
  state/       Zustand stores (game · todo · habit · journal · chat · settings)
  ui/          retro-pixel React components
  app/         shell · dashboard · bootstrap
  i18n/        react-i18next (zh-CN; EN deferred)
```

**Key invariants:** the reducer is **pure** (clock + ids are injected → deterministic, fully
tested); IndexedDB is the source of truth and Zustand is a derived read-model; every Claude call
routes through `ai/client.ts`; affinity and combat are rules-computed, never LLM-computed.

## Tests

**188 tests** (Vitest + fake-indexeddb): pure economy / combat logic (reducer, CTB turn order,
leveling, affinity, skills, dates), integration tests that drive the whole loop through a real
(faked) IndexedDB, and jsdom component tests.

## Make it yours

The bundled 观星会 trio is an **original placeholder** so the project runs IP-free out of the box.
To reskin it into your own game:

- **Characters** — `src/companion/roster.ts` (companions + personas), `src/companion/skills.ts`,
  `src/companion/cannedLines.ts`.
- **World & story** — `src/world/worlds.ts` (world, antagonists, quest arc), `src/world/equipment.ts`.
- **Art** — drop portrait PNGs into `public/portraits/` (naming convention in its README). Missing
  art falls back to emoji, so the game always runs.

Bring your own cast — the engine doesn't care who fights the 心魔.
