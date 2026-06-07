# Image2 generation pack — 来生爱 (`raisei_ai`)

> **Personal, non-commercial fan art.** 来生爱 is the Cat's Eye youngest sister Ai — render as personal
> fan art by appearance + archetype; never imply commercial use (also avoids tool refusals).
> Expressions are tailored to her persona (spunky, tomboyish, fun-loving genius gadgeteer).

Run the prompts **in order, in ONE Image2 chat**. Save each output to
`docs/asset-pipeline/staging/raisei_ai/` with the exact filename, then run finalize (bottom).

## 1) Attach these reference images
**STYLE anchor (attach every time):**
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

**IDENTITY:** the `来生爱/来生爱立绘.png` above (in the style list) IS her identity — don't attach it
twice, so it's just **3 images**. (Optional: also add `来生爱/1500px-来生爱升阶.png` for extra detail.)

## 2) Style Bible (baked into each prompt below)
> Rendered in the EXACT art style of the attached reference images — same line weight, cel-shading,
> palette, and finish (modern anime gacha splash): clean crisp lineart, bold silhouette, cel shading
> with limited soft shadows, vivid disciplined colors, soft key light from front-left. FULLY
> TRANSPARENT background, single character, no text/logo/watermark/border/props.

## 3) Identity block — 来生爱
> raisei_ai (来生爱) — youngest sister, the cheerful gadgeteer. Spunky, tomboyish, witty. Short bob
> with a bright accent color, big lively eyes; practical thief outfit with small gadgets.

---

## 4) Prompts (run top to bottom)

**[0] FULL-BODY MASTER** → `raisei_ai_fullbody.png`
> Match the attached reference art EXACTLY (line weight, cel-shading, palette, finish). Full-body
> standing portrait of 来生爱 — youngest sister, cheerful gadgeteer; spunky, tomboyish, witty; short
> bob with a bright accent color, big lively eyes; practical thief outfit with small gadgets/pouches;
> energetic posture. Facing viewer, slight 3/4 angle. FULLY TRANSPARENT background, single character,
> no props/text. This is the identity reference below.

**[1] neutral** → `raisei_ai_neutral.png`
> Same character as `raisei_ai_fullbody.png` — keep hairstyle, face, outfit, colors and lighting
> EXACTLY identical; BUST crop (head + upper chest), ~2:3, transparent bg; expression: calm, relaxed,
> mouth closed, soft gaze.

**[2] smile** → `raisei_ai_smile.png` — Same character, identical everything; change ONLY the expression to: warm gentle closed-mouth smile, friendly.
**[3] happy** → `raisei_ai_happy.png` — …change ONLY the expression to: a big, fun-loving open grin, eyes bright with excitement.
**[4] blush** → `raisei_ai_blush.png` — …change ONLY the expression to: shy, pink cheeks, eyes glancing away, small smile.
**[5] sad** → `raisei_ai_sad.png` — …change ONLY the expression to: downcast, lowered brows, slight frown, glistening eyes.
**[6] worried** → `raisei_ai_worried.png` — …change ONLY the expression to: concerned, furrowed brows, slightly parted lips, uneasy eyes.
**[7] angry** → `raisei_ai_angry.png` — …change ONLY the expression to: a cheeky huff — puffed-cheek pout, quick to flare (a jumps-to-conclusions tantrum, playful not scary).
**[8] determined** → `raisei_ai_determined.png` — …change ONLY the expression to: cocky, eager confidence — a bright can-do grin-smirk, ready to dive in.
**[9] disdain (嫌弃)** → `raisei_ai_disdain.png` — …change ONLY the expression to: an exaggerated "ewww" face — scrunched nose, kiddish grimace, playful disgust.
**[10] sly (坏坏的)** → `raisei_ai_sly.png` — …change ONLY the expression to: a gremlin-ish mischievous grin — wide cheeky smirk, eyes sparkling with a prank idea.

**[11] BATTLE SPRITE** → `raisei_ai_battle.png`
> ATTACH for THIS prompt: the Octopath reference `docs/asset-pipeline/refs/octopath-sprite.png` (STYLE)
> + the full-body master (IDENTITY). In the EXACT style of that Octopath Traveler II sprite — a small,
> highly-detailed CHIBI / super-deformed pixel-art sprite (big head, small body), crisp clean pixels,
> bold dark outline, rich shading. Full-body, front-facing idle battle stance; keep
> 来生爱's face, hair, outfit and colours from the master. FULLY TRANSPARENT background, single sprite,
> no ground/shadow/scene/text.

---

## 5) Finalize
Save all 12 PNGs into `docs/asset-pipeline/staging/raisei_ai/`, then run:
```
bash .claude/skills/character-art/bin/pixelize.sh raisei_ai
```
