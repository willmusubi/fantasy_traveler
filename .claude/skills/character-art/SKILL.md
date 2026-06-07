---
name: character-art
description: >-
  Generate the COMPLETE art-asset set for a Fantasy Traveler character in ONE "Image2"
  (OpenAI/ChatGPT image-gen) session, in a style anchored to the 来生 三姐妹 reference art
  (docs/avator-pics/), so the whole roster reads as one universe. Emits a ready-to-paste prompt
  pack — full-body 立绘 master + 10 expression busts + battle sprite — then pixelizes the saved HD
  masters into the app set. Works for roster companions AND brand-new characters (e.g. FF Tifa)
  using the sisters as the style anchor. Triggers: "generate art / 立绘 / portraits / 素材 for X",
  "做X的立绘", "为X生成素材", "finalize/pixelize X".
---

# Character Art — one-shot asset packs for Fantasy Traveler

Assemble a turnkey image-generation pack so the user generates ALL of a character's art in one
Image2 session (paste prompt + attach references, download PNGs), then pixelize the saved masters
into the app. This automates the design spec's §A.5/A.6 batch workflow and anchors every character
to the same reference art.

## Two consistency axes (the whole point)
- **STYLE — across all characters:** every character matches the 来生 三姐妹 art. ALWAYS attach the
  sisters' 立绘 as the STYLE anchor. This is the user's "每次输入相同素材铆钉" rule — same refs every time.
- **IDENTITY — within one character:** all of a character's assets are the same person. Generate the
  full-body master FIRST, then make every expression an EDIT of that master.

## Copyright & personal use (always)
These assets are for the user's PERSONAL, non-commercial fan project. Every pack must:
- Open with a one-line personal-use disclaimer.
- For IP characters (the Cat's Eye / 来生 sisters, Final Fantasy, etc.), frame the prompt as a fan /
  personal rendition described BY APPEARANCE + archetype rather than leaning on the trademarked name,
  and never imply commercial use. This respects rights AND avoids image-tool refusals; keep the look
  recognizable through concrete visual anchors, not the brand.

## Reference images — the STYLE anchor (attach these EVERY time)
- `docs/avator-pics/来生瞳/960px-来生瞳立绘.png`
- `docs/avator-pics/来生爱/来生爱立绘.png`
- `docs/avator-pics/来生泪/960px-来生泪立绘.png`

For a roster sister, her own 立绘 is already in the style set above — it doubles as her IDENTITY
anchor, so DON'T list it twice (optionally add her `…升阶.png` for an extra angle). For a NEW
character, the identity is genuinely separate: a likeness ref the user attaches, or description-only.

## Asset set per character (the pack covers all of these)
Core expressions (the app needs these 10; extended `surprised/thinking/heartthrob/tired` auto-map — skip):
`neutral, smile, happy, blush, sad, worried, angry, determined, disdain (嫌弃), sly (坏坏的)`.

| order | asset | HD master saved to |
|---|---|---|
| 0 | full-body 立绘 (the identity master) | `docs/asset-pipeline/staging/{id}/{id}_fullbody.png` |
| 1–10 | 10 expression busts (edits of the master) | `docs/asset-pipeline/staging/{id}/{id}_{expr}.png` |
| 9 | battle pose (front-facing idle) | `docs/asset-pipeline/staging/{id}/{id}_battle.png` |

## Step 1 — resolve the character + identity
- **Roster id** (`raisei_hitomi` / `raisei_rui` / `raisei_ai`): take the identity block straight from
  `docs/asset-pipeline/portrait-prompts.md` (or the persona in `src/companion/roster.ts`).
- **New character** (e.g. Tifa): ask the user for `displayName`, `class`, and a 1–2 line look (hair,
  eyes, outfit, vibe). DRAFT an identity block in the sisters' idiom — one tight sentence: archetype +
  concrete visual anchors. Pick a `portraitSet` id (lowercase, ascii, e.g. `ff7_tifa`).

## Step 1.5 — tailor the expressions to the PERSONA (avoid OOC) — do NOT skip
The 8 expression lines in `portrait-prompts.md` are a GENERIC baseline. Do not paste them blindly — a
composed, elegant character does not do a cute puffed-cheek "angry"; a stoic one does not beam.
1. **RESEARCH** the character's canon personality (web search / source material). e.g. 来生泪 = Cat's
   Eye eldest sister Rui: calm, mature, elegant, maternal, razor-sharp strategist → her "angry" is a
   cold, controlled, sharp displeasure, never a childish pout.
2. **Rewrite** each line to fit — especially the persona-sensitive ones: `happy`, `blush`, `angry`,
   `determined` (these vary most by personality).
3. **CONFIRM** the tailored set with the user (AskUserQuestion) BEFORE generating whenever an
   interpretation is uncertain. An OOC interpretation wastes an entire Image2 session.

## Step 2 — write the pack → `docs/asset-pipeline/packs/{id}.md`
Emit, verbatim and paste-ready:
1. **Attach** list: the 3 STYLE refs above (+ identity ref if any), each labeled by role.
2. **Style Bible** from `portrait-prompts.md` (the "match the attached reference art EXACTLY" version).
3. The character's **identity block**.
4. **Prompts, one per Image2 turn**, each ending with its output filename — run them in order in ONE chat:
   - `[0] FULL-BODY MASTER` = StyleBible + identity + "Full-body, standing, FULLY TRANSPARENT
     background. Save as `{id}_fullbody.png`. This is the identity reference for everything below."
   - `[1..8]` one per core expression = "Same character as `{id}_fullbody.png` — keep hairstyle, face,
     outfit, colors and lighting EXACTLY identical; BUST crop (head + upper chest), transparent bg;
     change ONLY the expression to: «expression line». Save as `{id}_{expr}.png`." Use the 8 expression
     lines from `portrait-prompts.md`.
   - `[9] BATTLE SPRITE` (chibi/SD pixel sprite). THE CRITICAL STEP: attach the pixel reference
     `docs/asset-pipeline/refs/octopath-sprite.png` and **force-bind it** (lock the style to that
     image) — binding a REAL pixel sprite is what makes Image2 output true pixel art instead of a
     high-res faux-pixel render. Also attach the full-body master (IDENTITY). Prompt: "In the EXACT
     pixel style of the attached battle sprite — a CHIBI / super-deformed pixel-art sprite (big head,
     small body), crisp clean pixels, bold dark outline, rich shading. Full-body, front-facing idle
     battle stance; keep the master's face/hair/outfit/colours. FULLY TRANSPARENT background, single
     sprite, no ground/shadow/scene/text. Save as `{id}_battle.png`." (Confirmed working.)
5. **Save all HD masters into** `docs/asset-pipeline/staging/{id}/`, then run finalize.

## Step 3 — finalize (pixelize + install)
When the user says "finalize {id}" / "pixelize {id}" (HD masters are in `staging/{id}/`):
```
bash .claude/skills/character-art/bin/pixelize.sh {id}
```
It removes the baked background with `bin/bgremove.py` (Python Pillow+numpy — EDGE FLOOD-FILL, not a
colour-key, so pale skin/face never holes) and makes pixel versions with ffmpeg (nearest-neighbor +
16-color palette, alpha-safe). Installs:
- HD busts → `public/portraits/{id}_{expr}.png`  (in-game; the app crops 112×150, anchored top)
- pixel busts → `public/portraits-px/{id}_{expr}.png`
- full-body → `public/art/{id}_fullbody.png`
- battle sprite (pixel, `--hard` crisp edges) → `public/sprites/{id}_battle.png`

**ALWAYS verify a cutout over a NON-white background** (the app bg is blue `0x2c3a86`), never the
Read-tool checkerboard — transparent holes in pale skin are invisible on a light check but obvious on
blue. Quick check: `ffmpeg -f lavfi -i color=c=0x2c3a86:s=WxH -i out.png -filter_complex "[0][1]overlay" -frames:v 1 chk.png`.
Report which files landed. The emoji fallback for `{id}` disappears once the busts exist.

## Notes
- One image per Image2 turn; keep them in ONE chat so identity carries from the master.
- The app currently only READS the 10 busts; full-body + battle sprite are banked ahead of their UI
  (recruit hero, real battle sprites) — fine to generate now.
- Every new world (FF7, Three Kingdoms…) flows through this skill so the roster stays one universe.
- For a new roster character, after the art lands, add a `COMPANION_DEFS` entry in
  `src/companion/roster.ts` with the new `portraitSet`.
