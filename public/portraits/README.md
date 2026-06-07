# Character portraits (立绘)

Drop generated portrait PNGs here. The app loads them at runtime from
`/portraits/{portraitSet}_{expression}.png` and falls back to an emoji if a file is missing —
so you can add them one at a time.

## Spec
- **Format:** PNG, **transparent background**, bust framing (head + upper chest), facing viewer.
- **Aspect:** portrait ~2:3 (e.g. 1024×1536). The app crops to fill a 112×150 frame.
- **Naming:** `{portraitSet}_{expression}.png` (all lowercase).

## Files needed (8 core expressions × 3 sisters)
`portraitSet` ∈ `raisei_hitomi` (来生瞳), `raisei_rui` (来生泪), `raisei_ai` (来生爱).
`expression` ∈ `neutral · smile · happy · blush · sad · worried · angry · determined`.

Examples:
```
raisei_hitomi_neutral.png   raisei_hitomi_smile.png   raisei_hitomi_happy.png   ...
raisei_rui_neutral.png      raisei_rui_smile.png      ...
raisei_ai_neutral.png       ...
```

Start with `*_neutral.png` for each sister (most-used); the rest fall back to emoji until added.
Extended expressions (surprised/thinking/heartthrob/tired) are **not needed** — they auto-map to
a core file. The prompts to generate these are in `docs/asset-pipeline/portrait-prompts.md`.
