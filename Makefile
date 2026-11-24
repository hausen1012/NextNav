.PHONY: dev build embed test docker

# Prefer ./dev.ps1 or ./dev.sh — they handle dependency installation and
# process supervision. These targets remain for CI or manual use.

# Backend only; the frontend runs separately with `npm run dev` in web/.
dev:
	cd server && go run ./cmd/nextnav

# Full build: frontend bundle -> embed -> single binary.
build: embed
	cd server && go build -trimpath -ldflags="-s -w" -o ../bin/nextnav ./cmd/nextnav

embed:
	cd web && npm run build
	bash scripts/embed-web.sh

test:
	cd server && go test ./...
	cd web && npm run test

docker:
	docker compose up --build