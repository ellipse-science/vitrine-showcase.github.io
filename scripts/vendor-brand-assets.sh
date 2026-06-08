#!/usr/bin/env bash
# Vendor brand & partner logos INTO the repo so the site stops hotlinking the
# internal dev server (dev.vitrinedemocratique.com), unreachable off-network.
# RUN ONCE from a machine on the CAPP/CLESSN network, then commit the files.
set -euo pipefail
BASE="https://dev.vitrinedemocratique.com/assets/images"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEF="$ROOT/public/assets/images/default"; PART="$ROOT/public/assets/images/partners"
mkdir -p "$DEF" "$PART"
def=( logo_vitrinedemocratique_bg-none_theme-black.png logo_capp_1row_bg-none_theme-black.png )
part=( CLESSN-nobg.png ULaval.png cegepgarneau-nobg.png CECD-nobg.png GRCP-nobg.png Unicorne.png Infoscope-nobg.png )
for f in "${def[@]}";  do echo "  → $f"; curl -fsSL "$BASE/default/$f"  -o "$DEF/$f";  done
for f in "${part[@]}"; do echo "  → $f"; curl -fsSL "$BASE/partners/$f" -o "$PART/$f"; done
echo "Done. Next: git add public/assets/images && git commit -m 'fix: vendor logos'"
