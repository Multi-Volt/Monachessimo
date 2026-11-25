#!/usr/bin/env bash
# Puts the coach's wording model into public/models/coach/ for the build.
# The model is a release asset of this repository, pinned with its SHA-256
# in scripts/coach-model.json, so updating it never grows the git history.
# Usage: scripts/fetch-coach-model.sh [CACHE_DIR]
set -euo pipefail
cd "$(dirname "$0")/.."
pin=scripts/coach-model.json
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
rm -rf public/models/coach
mkdir -p public/models/coach
tar -xf "$file" -C public/models/coach
echo "Coach model $tag in public/models/coach"
