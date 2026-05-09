#!/usr/bin/env bash
# Floodfill the corners of an image with transparency. Useful when a generator
# returns a "transparent" PNG that is actually opaque with a checkerboard or
# white background baked in.
set -euo pipefail
in="$1"; out="${2:-$in}"
tmp="$(mktemp -t stripbg).png"
W=$(magick identify -format "%w" "$in")
H=$(magick identify -format "%h" "$in")
# Floodfill from each of the four corners. Uses 18% fuzz to catch anti-aliased
# edges of the checkerboard pattern. Operates on a fresh alpha channel.
magick "$in" -alpha set \
  -fill none -fuzz 18% \
  -draw "alpha 0,0 floodfill" \
  -draw "alpha $((W-1)),0 floodfill" \
  -draw "alpha 0,$((H-1)) floodfill" \
  -draw "alpha $((W-1)),$((H-1)) floodfill" \
  "$tmp"
mv "$tmp" "$out"
echo "stripped: $out"
