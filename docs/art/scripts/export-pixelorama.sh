#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$repo_root"

pixelorama_bin="${PIXELORAMA_BIN:-/Applications/Pixelorama.app/Contents/MacOS/Pixelorama}"
if [[ ! -x "$pixelorama_bin" ]]; then
  echo "Pixelorama not found at $pixelorama_bin" >&2
  echo "Install it or set PIXELORAMA_BIN to the executable path." >&2
  exit 1
fi

lua docs/art/scripts/validate-builders.lua --write

node -e 'const m=require("./src/data/visual-art.json"); for (const row of m.bindings) console.log(row.url.replace(/^assets\//, "").replace(/\/[^/]+\.png$/, ""))' |
while IFS= read -r asset; do
  kind="${asset%%/*}"
  id="${asset##*/}"
  source="$repo_root/assets-src/$kind/$id/source/$id.pxo"
  output="$repo_root/public/assets/$kind/$id/$id.png"
  mkdir -p "$(dirname "$output")"
  "$pixelorama_bin" --headless --quit -- \
    --spritesheet --output "$output" --json --export "$source"
  node docs/art/scripts/normalize-pixelorama-metadata.mjs \
    "public/assets/$kind/$id/$id.json"
done

echo "Pixelorama sources and exports are current."
