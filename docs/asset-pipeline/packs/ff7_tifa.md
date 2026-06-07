# Image2 generation pack — 蒂法·洛克哈特 (`ff7_tifa`)

NEW character (FF7). Style-anchored to the 来生 三姐妹 so she reads as the same universe.
Suggested class: **striker** (agile brawler). Run the prompts **in order, in ONE Image2 chat**; save
to `docs/asset-pipeline/staging/ff7_tifa/` with the exact filename, then finalize (bottom).

## 1) Attach these reference images
**STYLE anchor (attach every time — this is what makes her match the roster):**
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

**IDENTITY:** description-only below (optionally also attach your own Tifa likeness ref).

## 2) Style Bible (baked into each prompt below)
> Rendered in the EXACT art style of the attached reference images — same line weight, cel-shading,
> palette, and finish (modern anime gacha splash): clean crisp lineart, bold silhouette, cel shading
> with limited soft shadows, vivid disciplined colors, soft key light from front-left. FULLY
> TRANSPARENT background, single character, no text/logo/watermark/border/props.

## 3) Identity block — 蒂法 (FF7 canon: look + role)
> ff7_tifa (蒂法·洛克哈特 / Tifa Lockhart) — warm-hearted martial-artist and bartender of 7th Heaven,
> a fighter of the AVALANCHE resistance; quietly strong, caring, fiercely loyal, resolute under
> pressure. Very long dark-brown hair tied low at the back with a slim band (tapered "dolphin-tail"
> tip), wine-red eyes; white sleeveless cropped top, black mini-skirt with suspenders, red-and-black
> fingerless gloves with metal-studded knuckles, elbow guards, athletic toned build. Reads as a
> grounded brawler, not a mage.

---

## 4) Prompts (run top to bottom)

**[0] FULL-BODY MASTER** → `ff7_tifa_fullbody.png`
> Match the attached reference art EXACTLY (line weight, cel-shading, palette, finish). Full-body
> standing portrait of Tifa Lockhart per the identity above, in a light confident martial-arts ready
> stance (relaxed fists). Facing viewer, slight 3/4 angle. FULLY TRANSPARENT background, single
> character, no props/text. This is the identity reference for everything below.

**[1] neutral** → `ff7_tifa_neutral.png`
> Same character as `ff7_tifa_fullbody.png` — keep hairstyle, face, outfit, colors and lighting
> EXACTLY identical; BUST crop (head + upper chest), ~2:3, transparent bg; expression: calm, relaxed,
> mouth closed, soft gaze.

**[2] smile** → `ff7_tifa_smile.png` — Same character, identical everything; change ONLY the expression to: warm gentle closed-mouth smile, friendly.
**[3] happy** → `ff7_tifa_happy.png` — …change ONLY the expression to: bright open cheerful smile, eyes slightly narrowed with joy.
**[4] blush** → `ff7_tifa_blush.png` — …change ONLY the expression to: shy, pink cheeks, eyes glancing away, small smile.
**[5] sad** → `ff7_tifa_sad.png` — …change ONLY the expression to: downcast, lowered brows, slight frown, glistening eyes.
**[6] worried** → `ff7_tifa_worried.png` — …change ONLY the expression to: concerned, furrowed brows, slightly parted lips, uneasy eyes.
**[7] angry** → `ff7_tifa_angry.png` — …change ONLY the expression to: fierce determined frown, brows down (battle-serious, not cute).
**[8] determined** → `ff7_tifa_determined.png` — …change ONLY the expression to: focused confident serious gaze, brave and resolute.
**[9] disdain (嫌弃)** → `ff7_tifa_disdain.png` — …change ONLY the expression to: a cold, disapproving frown — unimpressed, a fighter's contempt for a lowlife (serious, not cute).
**[10] sly (坏坏的)** → `ff7_tifa_sly.png` — …change ONLY the expression to: a confident, teasing smirk — playful but grounded, a knowing half-smile.

**[11] BATTLE SPRITE** → `ff7_tifa_battle.png`
> ATTACH for THIS prompt: the Octopath reference `docs/asset-pipeline/refs/octopath-sprite.png` (STYLE)
> + the full-body master (IDENTITY). In the EXACT style of that Octopath Traveler II sprite — a small,
> highly-detailed CHIBI / super-deformed pixel-art sprite (big head, small body), crisp clean pixels,
> bold dark outline, rich shading. Full-body, front-facing idle battle stance (fists
> raised, ready); keep 蒂法's face, hair, outfit and colours from the master. FULLY TRANSPARENT
> background, single sprite, no ground/shadow/scene/text.

---

## 5) Finalize
Save all 12 PNGs into `docs/asset-pipeline/staging/ff7_tifa/`, then run:
```
bash .claude/skills/character-art/bin/pixelize.sh ff7_tifa
```
> To make her playable: add a `COMPANION_DEFS` entry in `src/companion/roster.ts` with
> `portraitSet: 'ff7_tifa'` (and an FF7 world via `/world-builder`). Art alone won't recruit her.
