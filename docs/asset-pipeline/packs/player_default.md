# Image2 generation pack — 旅人 / the Player (`player_default`)

The player's avatar. This is a **placeholder 旅人** so the player stops showing as a bare class icon —
swap in your own likeness later (just regenerate `[0]` with your face attached, then re-run the
expressions). `player_default` is class-agnostic (the player picks a class at onboarding). Run in
ONE Image2 chat; save to `docs/asset-pipeline/staging/player_default/`, then finalize (bottom).

## 1) Attach these reference images
**STYLE anchor (attach every time):**
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

**IDENTITY:** description-only for now → **attach your own likeness ref when you have it** and re-run `[0]`.

## 2) Style Bible (baked into each prompt below)
> Rendered in the EXACT art style of the attached reference images — same line weight, cel-shading,
> palette, and finish (modern anime gacha splash): clean crisp lineart, bold silhouette, cel shading
> with limited soft shadows, vivid disciplined colors, soft key light from front-left. FULLY
> TRANSPARENT background, single character, no text/logo/watermark/border/props.

## 3) Identity block — 旅人 (placeholder)
> player_default (旅人 / the Traveler) — the player's own avatar, an earnest young adventurer at the
> start of their journey. Heroic-neutral, friendly and approachable: simple traveler's tunic with a
> short cloak and a shoulder satchel, warm determined eyes, tidy short-to-medium hair. Gender-neutral
> leaning so it reads for any player. Placeholder — to be replaced by the player's own likeness.

---

## 4) Prompts (run top to bottom)

**[0] FULL-BODY MASTER** → `player_default_fullbody.png`
> Match the attached reference art EXACTLY (line weight, cel-shading, palette, finish). Full-body
> standing portrait of 旅人 per the identity above, an open ready-for-adventure posture. Facing viewer,
> slight 3/4 angle. FULLY TRANSPARENT background, single character, no props/text. This is the identity
> reference below. (To personalize: attach your own face/photo and ask it to keep the outfit + style.)

**[1] neutral** → `player_default_neutral.png`
> Same character as `player_default_fullbody.png` — keep hairstyle, face, outfit, colors and lighting
> EXACTLY identical; BUST crop (head + upper chest), ~2:3, transparent bg; expression: calm, relaxed,
> mouth closed, soft gaze.

**[2] smile** → `player_default_smile.png` — Same character, identical everything; change ONLY the expression to: warm gentle closed-mouth smile, friendly.
**[3] happy** → `player_default_happy.png` — …change ONLY the expression to: bright open cheerful smile, eyes slightly narrowed with joy.
**[4] blush** → `player_default_blush.png` — …change ONLY the expression to: shy, pink cheeks, eyes glancing away, small smile.
**[5] sad** → `player_default_sad.png` — …change ONLY the expression to: downcast, lowered brows, slight frown, glistening eyes.
**[6] worried** → `player_default_worried.png` — …change ONLY the expression to: concerned, furrowed brows, slightly parted lips, uneasy eyes.
**[7] angry** → `player_default_angry.png` — …change ONLY the expression to: playful pout / displeased frown, puffed cheeks (cute-mad, not scary).
**[8] determined** → `player_default_determined.png` — …change ONLY the expression to: focused confident serious gaze, brave and resolute.
**[9] disdain (嫌弃)** → `player_default_disdain.png` — …change ONLY the expression to: an unimpressed frown — one brow raised, clearly put-off.
**[10] sly (坏坏的)** → `player_default_sly.png` — …change ONLY the expression to: a mischievous half-smile — a knowing, playful smirk.

**[11] BATTLE SPRITE** → `player_default_battle.png`
> ATTACH for THIS prompt: the Octopath reference `docs/asset-pipeline/refs/octopath-sprite.png` (STYLE)
> + the full-body master (IDENTITY). In the EXACT style of that Octopath Traveler II sprite — a small,
> highly-detailed CHIBI / super-deformed pixel-art sprite (big head, small body), crisp clean pixels,
> bold dark outline, rich shading. Full-body, front-facing idle battle stance; keep
> 旅人's face, hair, outfit and colours from the master. FULLY TRANSPARENT background, single sprite,
> no ground/shadow/scene/text.

---

## 5) Finalize
Save all 12 PNGs into `docs/asset-pipeline/staging/player_default/`, then run:
```
bash .claude/skills/character-art/bin/pixelize.sh player_default
```
The player's emoji class-icon is replaced by this portrait once the busts land.
