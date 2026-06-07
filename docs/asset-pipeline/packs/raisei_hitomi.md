# Image2 generation pack — 来生瞳 (`raisei_hitomi`)

> **Personal, non-commercial fan art.** 来生瞳 is the Cat's Eye middle sister Hitomi — render as
> personal fan art by appearance + archetype; never imply commercial use (also avoids tool refusals).
> Expressions are tailored to her persona (lively, athletic, charming, hot-tempered).

Run the prompts **in order, in ONE Image2 chat**. Save each output to
`docs/asset-pipeline/staging/raisei_hitomi/` with the exact filename, then run finalize (bottom).

## 1) Attach these reference images
**STYLE anchor (attach every time):**
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

**IDENTITY:** the `来生瞳/960px-来生瞳立绘.png` above (in the style list) IS her identity — don't attach
it twice, so it's just **3 images**. (Optional: also add `来生瞳/1500px-来生瞳升阶.png` for extra detail.)

## 2) Style Bible (baked into each prompt below)
> Rendered in the EXACT art style of the attached reference images — same line weight, cel-shading,
> palette, and finish (modern anime gacha splash): clean crisp lineart, bold silhouette, cel shading
> with limited soft shadows, vivid disciplined colors, soft key light from front-left. FULLY
> TRANSPARENT background, single character, no text/logo/watermark/border/props.

## 3) Identity block — 来生瞳
> raisei_hitomi (来生瞳) — middle sister, the agile front-line phantom thief. Lively, confident,
> playful. Medium tousled hair, bright expressive eyes, athletic build; sleek dark cat-burglar
> outfit with a crimson accent and fingerless gloves.

---

## 4) Prompts (run top to bottom)

**[0] FULL-BODY MASTER** → `raisei_hitomi_fullbody.png`
> Match the attached reference art EXACTLY (line weight, cel-shading, palette, finish). Full-body
> standing portrait of 来生瞳 — middle sister, agile phantom thief; lively, confident, playful; medium
> tousled hair, bright expressive eyes, athletic build; sleek dark cat-burglar outfit with a crimson
> accent and fingerless gloves; light ready-to-move posture. Facing viewer, slight 3/4 angle. FULLY
> TRANSPARENT background, single character, no props/text. This is the identity reference below.

**[1] neutral** → `raisei_hitomi_neutral.png`
> Same character as `raisei_hitomi_fullbody.png` — keep hairstyle, face, outfit, colors and lighting
> EXACTLY identical; BUST crop (head + upper chest), ~2:3, transparent bg; expression: calm, relaxed,
> mouth closed, soft gaze.

**[2] smile** → `raisei_hitomi_smile.png` — Same character, identical everything; change ONLY the expression to: warm gentle closed-mouth smile, friendly.
**[3] happy** → `raisei_hitomi_happy.png` — …change ONLY the expression to: a bright, charming open smile, eyes lively with joy.
**[4] blush** → `raisei_hitomi_blush.png` — …change ONLY the expression to: shy, pink cheeks, eyes glancing away, small smile.
**[5] sad** → `raisei_hitomi_sad.png` — …change ONLY the expression to: downcast, lowered brows, slight frown, glistening eyes.
**[6] worried** → `raisei_hitomi_worried.png` — …change ONLY the expression to: concerned, furrowed brows, slightly parted lips, uneasy eyes.
**[7] angry** → `raisei_hitomi_angry.png` — …change ONLY the expression to: a genuine flash of temper — exasperated frown, brows up, cheeks flushed with irritation; spirited and hot-headed (passionate, not cold, not cutesy).
**[8] determined** → `raisei_hitomi_determined.png` — …change ONLY the expression to: fired-up athletic resolve — bright determined eyes, confident and ready to spring into action.
**[9] disdain (嫌弃)** → `raisei_hitomi_disdain.png` — …change ONLY the expression to: a blunt, openly put-off scowl — nose scrunched, brows down, frankly unimpressed (direct, not refined).
**[10] sly (坏坏的)** → `raisei_hitomi_sly.png` — …change ONLY the expression to: a bold, cheeky grin-smirk — one brow up, eyes glinting, clearly up to something daring.

**[11] BATTLE SPRITE** → `raisei_hitomi_battle.png`
> ATTACH for THIS prompt: the Octopath reference `docs/asset-pipeline/refs/octopath-sprite.png` (STYLE)
> + the full-body master (IDENTITY). In the EXACT style of that Octopath Traveler II sprite — a small,
> highly-detailed CHIBI / super-deformed pixel-art sprite (big head, small body), crisp clean pixels,
> bold dark outline, rich shading. Full-body, front-facing idle battle stance (light,
> agile); keep 来生瞳's face, hair, outfit and colours from the master. FULLY TRANSPARENT background,
> single sprite, no ground/shadow/scene/text.

---

## 5) Finalize
Save all 12 PNGs into `docs/asset-pipeline/staging/raisei_hitomi/`, then run:
```
bash .claude/skills/character-art/bin/pixelize.sh raisei_hitomi
```
