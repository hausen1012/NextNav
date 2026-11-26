#!/usr/bin/env bash
# NextNav dev launcher.
#
#   ./dev.sh            # dev mode: Go backend + Vite dev server (hot reload)
#   ./dev.sh build      # production-ish: build web, embed, single binary, run
#   ./dev.sh test       # run all tests
#
# Env overrides: PORT (backend), DATA_DIR, WEB_PORT (vite), GOTOOLCHAIN,
#   ADMIN_USERNAME, ADMIN_PASSWORD, IMPORT_SAMPLE_DATA.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

PORT="${PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"
DATA_DIR="${DATA_DIR:-$root/data}"
GOTOOLCHAIN="${GOTOOLCHAIN:-local}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
IMPORT_SAMPLE_DATA="${IMPORT_SAMPLE_DATA:-true}"
export PORT DATA_DIR GOTOOLCHAIN WEB_PORT ADMIN_USERNAME ADMIN_PASSWORD IMPORT_SAMPLE_DATA

mode="${1:-dev}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' not found in PATH" >&2
    exit 1
  }
}

banner() {
  printf '\n%s\n' "────────────────────────────────────────────"
  printf '  %s\n' "$1"
  printf '%s\n\n' "────────────────────────────────────────────"
}

case "$mode" in
  dev)
    require go
    require npm

    if [ ! -f web/node_modules/.bin/tsc ]; then
      banner "安装前端依赖"
      if [ -f web/package-lock.json ]; then
        (cd web && npm ci --no-audit --no-fund)
      else
        (cd web && npm install --no-audit --no-fund)
      fi
    fi

    banner "开发模式  backend :$PORT  vite :$WEB_PORT"
    echo "打开 http://localhost:$WEB_PORT"

    # Both processes die together; whichever exits first tears the other down.
    (cd server && exec go run ./cmd/nextnav) &
    backend=$!
    (cd web && exec npm run dev) &
    frontend=$!

    cleanup() {
      trap - INT TERM EXIT
      kill "$backend" "$frontend" 2>/dev/null || true
      wait 2>/dev/null || true
    }
    trap cleanup INT TERM EXIT

    # Wait for whichever finishes first; cleanup stops the sibling.
    wait -n "$backend" "$frontend" 2>/dev/null || wait "$backend" "$frontend"
    ;;

  build)
    require go
    require npm

    if [ ! -d web/node_modules ]; then
      banner "首次运行：安装前端依赖"
      (cd web && npm install --no-audit --no-fund)
    fi

    banner "构建前端"
    (cd web && npm run build)

    banner "内嵌到 Go 二进制"
    bash scripts/embed-web.sh

    banner "编译"
    mkdir -p bin
    (cd server && go build -trimpath -ldflags="-s -w" -o ../bin/nextnav ./cmd/nextnav)

    banner "启动  http://localhost:$PORT"
    exec ./bin/nextnav
    ;;

  test)
    require go
    require npm
    (cd server && go test ./...)
    (cd web && npm run typecheck && npm run test)
    ;;

  *)
    echo "usage: $0 [dev|build|test]" >&2
    exit 1
    ;;
esac