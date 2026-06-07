# Character portraits (立绘)

Drop generated portrait PNGs here. The app loads them at runtime from
`/portraits/{portraitSet}_{expression}.png` and falls back to an emoji if a file is missing —
so you can add them one at a time. **No art is committed to this repo** — bring your own.

## Spec
- **Format:** PNG, **transparent background**, bust framing (head + upper chest), facing viewer.
- **Aspect:** portrait ~2:3 (e.g. 1024×1536). The app crops to fill a 112×150 frame.
- **Naming:** `{portraitSet}_{expression}.png` (all lowercase).

## Files
`portraitSet` is whatever you set on a character in `src/companion/roster.ts` — the bundled
sample cast uses `mira`, `vela`, `nova` (plus `player_default`).
`expression` ∈ `neutral · smile · happy · blush · sad · worried · angry · determined`.

Examples:
```
mira_neutral.png   mira_smile.png   mira_happy.png   ...
vela_neutral.png   vela_smile.png   ...
nova_neutral.png   ...
```

Start with `*_neutral.png` for each character (most-used); the rest fall back to emoji until
added. Extended expressions (surprised/thinking/heartthrob/tired) are **not needed** — they
auto-map to a core file.
