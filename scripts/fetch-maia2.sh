#!/usr/bin/env bash
# Puts Maia-2, the download for human-like play at every rating, into
# public/models/maia2/ for the build.
# The model is a release asset of this repository, pinned with its SHA-256
# in scripts/maia2-model.json, so updating it never grows the git history.
# Usage: scripts/fetch-maia2.sh [CACHE_DIR]
set -euo pipefail
cd "$(dirname "$0")/.."
pin=scripts/maia2-model.json
tag=$(node -p "require('./$pin').tag")
asset=$(node -p "require('./$pin').asset")
sha=$(node -p "require('./$pin').sha256")
repo=${GITHUB_REPOSITORY:-Multi-Volt/Monachessimo}
cache=${1:-$HOME/.cache/monachessimo}
mkdir -p "$cache"
file="$cache/$asset"
if ! echo "$sha  $file" | sha256sum -c --quiet 2>/dev/null; then
  curl -sfL -o "$file" "https://github.com/$repo/releases/download/$tag/$asset"
  echo "$sha  $file" | sha256sum -c --quiet
fi
rm -rf public/models/maia2
mkdir -p public/models/maia2
tar -xf "$file" -C public/models/maia2
echo "Maia-2 $tag in public/models/maia2"
