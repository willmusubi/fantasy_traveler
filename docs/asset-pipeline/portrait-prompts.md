# Portrait generation kit (for OpenAI / Image2)

> **Personal, non-commercial fan project.** IP characters (Cat's Eye / 来生 sisters, Final Fantasy…)
> are rendered as personal fan art described by appearance + archetype — keep prompts framed that way
> and never imply commercial use (this also dodges image-tool refusals).

Generate each portrait in ChatGPT, then save the PNG into `public/portraits/` with the exact
filename. The app picks it up automatically (emoji fallback until then).

## Output spec
- **Transparent background**, PNG, **bust** (head + upper chest), facing the viewer, portrait ~2:3.
- Save to `public/portraits/{portraitSet}_{expression}.png` (lowercase). See that folder's README.
- **Two reference roles to attach:** (1) STYLE anchor — ALWAYS attach the 来生 三姐妹 立绘
  (`docs/avator-pics/来生{瞳,爱,泪}/…立绘.png`) so every character shares ONE art style; (2) IDENTITY
  anchor — the character's own art if it exists, else describe via the identity block below.
- The **`character-art` skill** turns this file into a ready-to-paste pack per character (full-body
  master → 8 expression busts → battle sprite) and pixelizes the saved masters. This file is its
  source of truth — invoke "generate art for X" instead of hand-assembling prompts.

## Workflow (per sister)
1. Paste the **Style Bible** + that sister's **Identity block**, ask for the `neutral` portrait
   (transparent background, bust, 2:3). Save as `{id}_neutral.png`.
2. Then, in the same chat, for each remaining expression say:
   *"Same character — keep the hairstyle, face, outfit, colors, framing and lighting identical;
   change ONLY the facial expression to: {expression line}. Transparent background."*
   Save as `{id}_{expression}.png`.
3. Repeat for all three sisters. Minimum useful set = `neutral`; full set = the 10 core expressions.

## Style Bible (paste once, keep identical for all characters)
```
Character portrait for a retro JRPG companion app. Rendered in the EXACT art style of the attached
reference images — same line weight, cel-shading, palette, and finish (modern anime gacha splash):
clean crisp lineart, bold readable silhouette, cel shading with limited soft shadows,
vivid but disciplined colors. Soft key light from front-left. BUST framing — head and upper
chest, centered, facing the viewer at a slight 3/4 angle, eyes toward the viewer; head fills
~60% of frame height. Vertical 2:3 portrait. FULLY TRANSPARENT background. Single character
only. No text, no logo, no watermark, no border, no background props.
```

## Identity blocks (adjustable archetypes — attach a reference for exact likeness)
```
raisei_hitomi (来生瞳) — middle sister, the agile front-line phantom thief. Lively, confident,
playful. Medium tousled hair, bright expressive eyes, athletic build; sleek dark cat-burglar
outfit with a crimson accent and fingerless gloves.
```
```
raisei_rui (来生泪) — eldest sister, the elegant strategist. Composed, mature, gently teasing.
Long wavy hair, calm eyes; refined dark thief attire with a scarf/short-cape accent.
```
```
raisei_ai (来生爱) — youngest sister, the cheerful gadgeteer. Spunky, tomboyish, witty. Short
bob with a bright accent color, big lively eyes; practical thief outfit with small gadgets.
```

## Expression lines (the 10 core — file suffix in parentheses)
> These are a GENERIC baseline — ADAPT each to the character's persona before use (a composed, elegant
> character's "angry" is cold and sharp, not a cute pout). Research the canon, confirm uncertain ones
> with the user. The `character-art` skill does this per character (see its Step 1.5).
```
neutral      calm, relaxed, mouth closed, soft gaze                                  (_neutral)
smile        warm gentle closed-mouth smile, friendly                                (_smile)
happy        bright open cheerful smile, eyes slightly narrowed with joy             (_happy)
blush        shy, pink cheeks, eyes glancing away, small smile                       (_blush)
sad          downcast, lowered brows, slight frown, glistening eyes                  (_sad)
worried      concerned, furrowed brows, slightly parted lips, uneasy eyes            (_worried)
angry        playful pout / displeased frown, puffed cheeks (cute-mad, not scary)    (_angry)
determined   focused confident serious gaze, brave and resolute                      (_determined)
disdain      cool refined contempt — chin up, faint lip curl, unimpressed             (_disdain)
sly          scheming half-smile, narrowed playful eyes, teasing mischief             (_sly)
```

Extended expressions are optional and auto-map to a core file, so you don't need them:
`surprised→happy, thinking→neutral, heartthrob→blush, tired→neutral`.

## Filename checklist
For each of `raisei_hitomi`, `raisei_rui`, `raisei_ai`:
`{id}_neutral.png · {id}_smile.png · {id}_happy.png · {id}_blush.png · {id}_sad.png ·
{id}_worried.png · {id}_angry.png · {id}_determined.png · {id}_disdain.png · {id}_sly.png`

(Player portrait is optional for now — the player shows as a class icon; add `player_default_*.png`
later if you want.)

## Beyond busts (the `character-art` skill generates these in the same session)
- Full-body 立绘 → `public/art/{id}_fullbody.png` (recruit/detail hero, generated FIRST as the identity master).
- Pixel busts (16-color) → `public/portraits-px/{id}_{expr}.png` (SNES-consistent compact frame).
- Battle sprite (pixel) → `public/sprites/{id}_battle.png`.
See `.claude/skills/character-art/`. Pixelization uses ffmpeg (nearest-neighbor + 16-color palette).
