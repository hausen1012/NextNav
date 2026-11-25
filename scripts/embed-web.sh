#!/usr/bin/env bash
# Copies the Vite build into the Go embed directory.
# Called by the Makefile and by the Dockerfile; safe to run repeatedly.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/web/dist"
dst="$root/server/cmd/nextnav/web"

if [ ! -f "$src/index.html" ]; then
  echo "web/dist missing — run 'npm run build' in web/ first" >&2
  exit 1
fi

rm -rf "$dst"
mkdir -p "$dst"
cp -R "$src"/. "$dst"/

echo "embedded $(find "$dst" -type f | wc -l) files into server/cmd/nextnav/web"