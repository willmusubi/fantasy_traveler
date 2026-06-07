# 幻想旅人 · Fantasy Traveler

An **AI Companion Productivity RPG**. Your real-life Todos, Journal, and Calendar power a
Final-Fantasy-style pixel RPG: completing real tasks damages a 拖延心魔 (procrastination
demon), levels *you* up, and deepens your bond (好感度) with AI companions you can chat with.

Full design: [`docs/specs/2026-05-29-fantasy-traveler-design.md`](docs/specs/2026-05-29-fantasy-traveler-design.md).

## Status — M0 (thin vertical) ✅

The first end-to-end slice is built and tested:

- **Onboarding** — create your character (name + 1 of 6 classes).
- **Todos** — add / complete / delete, with priority pips, due dates, and overdue cues.
- **The loop** — completing a todo damages the monster, grants you XP, raises affinity, and
  triggers an **in-character companion reaction** (portrait + line + `好感度 +N`, no LLM cost).
  Procrastinating (overdue) grows the monster and makes your companion worried.
- **Companion** — 来生瞳 (from the 无期迷途 / Cat's Eye sisters), with a Fire-Emblem-style
  C/B/A/S affinity bar and rank-up toasts.
- **AI chat** — talk to your companion via the real Claude API; she reads your actual recent
  todo context. Paste your Anthropic key in Settings (stored locally only).
- **Chinese-first UI**, retro-pixel theme, fully browser-local (IndexedDB) — no backend.

> Combat is intentionally "passive" in M0 (real-life events drive it). The Phaser battle
> screen, full combat depth, Journal/Calendar, group chat, and the other two sisters arrive in
> later milestones — see §20 of the spec.

## Run

```bash
npm install
npm run dev      # → http://localhost:5173
```

To chat with your companion, open **⚙ 设置**, paste an Anthropic API key (`sk-ant-…`), and
hit **测试连接**. The key lives only in your browser (IndexedDB) and calls go directly from
your browser to Anthropic — fine for personal use.

## Try the demo loop

1. Create your character (name + class).
2. Add a couple of **high-priority** todos and check them off → watch the monster's HP drop,
   the `好感度 +5` float, your companion's reaction, and a **B-rank-up** after the second.
3. Open Settings, add your API key, then chat — she'll reference what you've done today.

## Scripts

```bash
npm run dev        # dev server (HMR)
npm run build      # typecheck + production build
npm test           # run the test suite (Vitest)
npm run typecheck  # tsc project build, no emit
```

## Architecture (M0)

```
src/
  domain/      types + tunable config (xp curve, damage, affinity, class stat blocks) + date helpers
  data/        IndexedDB schema (idb) + typed repositories
  game/        event bus · pure gameReducer · pipeline (atomic IDB apply) · combat/leveling math
  companion/   roster (data-driven) · affinity math · canned reaction lines · expression contract
  ai/          single Anthropic client wrapper · contextBuilder · prompt assembly
  state/       Zustand stores (game · todo · chat · settings)
  ui/          retro-pixel React components
  app/         shell, dashboard, bootstrap
  i18n/        react-i18next (zh-CN; EN deferred to a later milestone)
```

**Key invariants:** the reducer is pure (clock + ids injected → deterministic, tested);
IndexedDB is the source of truth and Zustand is a derived read-model; every Claude call routes
through `ai/client.ts`; affinity is rules-computed, never LLM-computed.

## Tests

38 tests: pure economy logic (combat, leveling, affinity, dates, reducer, context builder,
expressions, canned lines) plus 3 end-to-end integration tests that drive the whole loop
through a real (faked) IndexedDB.

## Character art

Art is a separate, swappable workstream. M0 ships emoji-placeholder portraits; the
AI-generation kit (style bible + expression schema + batch config for OpenAI's image model) is
in Appendix A of the design spec. Output files drop into the portrait set with no code changes.
