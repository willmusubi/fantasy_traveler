#!/usr/bin/env bash
# Finalize a character's HD masters into the app asset set.
# Inputs (EITHER layout):  docs/asset-pipeline/staging/<id>/<id>_<expr>.png   OR   flat staging/<id>_<expr>.png
#   <expr> ∈ neutral smile happy blush sad worried angry determined fullbody battle
# Outputs: public/portraits (HD bust, bg auto-removed), public/portraits-px (16-color pixel bust),
#          public/art (full-body), public/sprites (battle sprite, kept as-is for the Octopath look).
# ffmpeg only (no ImageMagick / rembg). Background removal = chroma-key the uniform corner colour.
set -euo pipefail

ID="${1:?usage: pixelize.sh <characterId>   (HD masters in docs/asset-pipeline/staging/, named <id>_<expr>.png)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$SCRIPT_DIR/../../../.." && pwd))"
STAGEROOT="$ROOT/docs/asset-pipeline/staging"

command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required" >&2; exit 1; }
python3 -c "import PIL, numpy" 2>/dev/null || { echo "ERROR: python3 with Pillow+numpy required → pip install --break-system-packages pillow numpy" >&2; exit 1; }

# Resolve a staged file for an expression — try the <id>/ subdir first, then flat.
src_for() { # <expr> -> prints a path, or nothing
  if   [ -f "$STAGEROOT/$ID/${ID}_$1.png" ]; then echo "$STAGEROOT/$ID/${ID}_$1.png"
  elif [ -f "$STAGEROOT/${ID}_$1.png" ];     then echo "$STAGEROOT/${ID}_$1.png"
  fi
}

# Write a TRANSPARENT copy of <in> to <out>. If the corner is already transparent, just copy.
# Otherwise remove the baked background by EDGE FLOOD-FILL (bgremove.py): only background connected
# to the image border is cleared, so enclosed skin/face pixels stay solid. (A global colour-key
# matched near-white ANYWHERE and holed the pale anime skin — see bgremove.py header.)
# Pass "hard" as $3 for pixel-art sprites — keeps crisp 1px edges (no erosion/feather).
mktransparent() { # <in> <out> [hard]
  local a
  a=$(ffmpeg -loglevel error -i "$1" -vf "crop=1:1:0:0,extractplanes=a" -f rawvideo -pix_fmt gray - 2>/dev/null | xxd -p | head -c2 || true)
  if [ "$a" = "00" ]; then cp "$1" "$2"; return; fi
  if [ "${3:-}" = "hard" ]; then
    python3 "$SCRIPT_DIR/bgremove.py" "$1" "$2" --hard
  else
    python3 "$SCRIPT_DIR/bgremove.py" "$1" "$2"
  fi
}

# 16-colour pixel version at a target height (alpha preserved).
px() { # <in> <out> <height>
  ffmpeg -y -loglevel error -i "$1" \
    -vf "scale=-1:$3:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=16:reserve_transparent=1[p];[s1][p]paletteuse=dither=none" \
    "$2"
}

mkdir -p "$ROOT/public/portraits" "$ROOT/public/portraits-px" "$ROOT/public/art" "$ROOT/public/sprites"

count=0
for e in neutral smile happy blush sad worried angry determined disdain sly; do
  src="$(src_for "$e")"
  [ -n "$src" ] || { echo "skip ${e}: not staged"; continue; }
  mktransparent "$src" "$ROOT/public/portraits/${ID}_${e}.png"                       # HD bust, bg removed
  px "$ROOT/public/portraits/${ID}_${e}.png" "$ROOT/public/portraits-px/${ID}_${e}.png" 150
  echo "ok   ${e}  → portraits/${ID}_${e}.png (+ pixel)"
  count=$((count + 1))
done

fb="$(src_for fullbody)"; [ -n "$fb" ] && mktransparent "$fb" "$ROOT/public/art/${ID}_fullbody.png"   && echo "ok   fullbody → art/${ID}_fullbody.png"
# Battle sprite: the Octopath/HD-2D look is generated pixel-style in Image2 — keep it as-is (bg removed, NO 16-colour pass).
bt="$(src_for battle)";   [ -n "$bt" ] && mktransparent "$bt" "$ROOT/public/sprites/${ID}_battle.png" hard && echo "ok   battle   → sprites/${ID}_battle.png (kept as-is)"

echo "done: $count expression bust(s) installed for '$ID'."
[ "$count" -gt 0 ] || { echo "WARNING: no expression busts found for '$ID' in $STAGEROOT" >&2; exit 1; }
