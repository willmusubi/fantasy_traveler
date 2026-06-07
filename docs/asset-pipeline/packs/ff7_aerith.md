# Image2 generation pack — 爱丽丝·盖恩斯巴勒 (`ff7_aerith`)

NEW character (FF7). Style-anchored to the 来生 三姐妹 so she reads as the same universe.
Suggested class: **medic** (healer / white-mage). Run the prompts **in order, in ONE Image2 chat**;
save to `docs/asset-pipeline/staging/ff7_aerith/` with the exact filename, then finalize (bottom).

## 1) Attach these reference images
**STYLE anchor (attach every time):**
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

**IDENTITY:** description-only below (optionally also attach your own Aerith likeness ref).

## 2) Style Bible (baked into each prompt below)
> Rendered in the EXACT art style of the attached reference images — same line weight, cel-shading,
> palette, and finish (modern anime gacha splash): clean crisp lineart, bold silhouette, cel shading
> with limited soft shadows, vivid disciplined colors, soft key light from front-left. FULLY
> TRANSPARENT background, single character, no text/logo/watermark/border/props.

## 3) Identity block — 爱丽丝 (FF7 canon: look + role)
> ff7_aerith (爱丽丝·盖恩斯巴勒 / Aerith Gainsborough) — gentle flower-seller from the Midgar slums and
> the last of the Ancients (Cetra); kind, playful, quietly brave, hopeful even in hardship. Long
> light-brown hair in a long plaited ponytail tied with a pink ribbon (small green orb at the bow),
> bright green eyes; a rose-pink button dress over a short cropped red bolero jacket, brown calf boots,
> a slim brown belt; soft graceful build. Reads as a hopeful healer, not a brawler.

---

## 4) Prompts (run top to bottom)

**[0] FULL-BODY MASTER** → `ff7_aerith_fullbody.png`
> Match the attached reference art EXACTLY (line weight, cel-shading, palette, finish). Full-body
> standing portrait of Aerith Gainsborough per the identity above, gentle relaxed posture, one hand
> lightly holding a slim wooden guard-staff. Facing viewer, slight 3/4 angle. FULLY TRANSPARENT
> background, single character, no extra props/text. This is the identity reference below.

**[1] neutral** → `ff7_aerith_neutral.png`
> Same character as `ff7_aerith_fullbody.png` — keep hairstyle, face, outfit, colors and lighting
> EXACTLY identical; BUST crop (head + upper chest), ~2:3, transparent bg; expression: calm, relaxed,
> mouth closed, soft gaze.

**[2] smile** → `ff7_aerith_smile.png` — Same character, identical everything; change ONLY the expression to: warm gentle closed-mouth smile, friendly.
**[3] happy** → `ff7_aerith_happy.png` — …change ONLY the expression to: bright open cheerful smile, eyes slightly narrowed with joy.
**[4] blush** → `ff7_aerith_blush.png` — …change ONLY the expression to: shy, pink cheeks, eyes glancing away, small smile.
**[5] sad** → `ff7_aerith_sad.png` — …change ONLY the expression to: downcast, lowered brows, slight frown, glistening eyes.
**[6] worried** → `ff7_aerith_worried.png` — …change ONLY the expression to: concerned, furrowed brows, slightly parted lips, uneasy eyes.
**[7] angry** → `ff7_aerith_angry.png` — …change ONLY the expression to: playful pout / displeased frown, puffed cheeks (cute-mad, not scary).
**[8] determined** → `ff7_aerith_determined.png` — …change ONLY the expression to: focused confident serious gaze, brave and resolute.
**[9] disdain (嫌弃)** → `ff7_aerith_disdain.png` — …change ONLY the expression to: a delicate but pointed unimpressed look — a polite, cool little frown, clearly not amused.
**[10] sly (坏坏的)** → `ff7_aerith_sly.png` — …change ONLY the expression to: an impish, teasing grin — bright eyes, playful flirty mischief.

**[11] BATTLE SPRITE** → `ff7_aerith_battle.png`
> ATTACH for THIS prompt: the Octopath reference `docs/asset-pipeline/refs/octopath-sprite.png` (STYLE)
> + the full-body master (IDENTITY). In the EXACT style of that Octopath Traveler II sprite — a small,
> highly-detailed CHIBI / super-deformed pixel-art sprite (big head, small body), crisp clean pixels,
> bold dark outline, rich shading. Full-body, front-facing idle battle stance (staff
> in hand); keep 爱丽丝's face, hair, outfit and colours from the master. FULLY TRANSPARENT background,
> single sprite, no ground/shadow/scene/text.

---

## 5) Finalize
Save all 12 PNGs into `docs/asset-pipeline/staging/ff7_aerith/`, then run:
```
bash .claude/skills/character-art/bin/pixelize.sh ff7_aerith
```
> To make her playable: add a `COMPANION_DEFS` entry in `src/companion/roster.ts` with
> `portraitSet: 'ff7_aerith'` (and an FF7 world via `/world-builder`).
