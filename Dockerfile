# --- stage 1: frontend build ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# --- stage 2: backend build ---
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS server
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src

# Dependency layer first so source edits do not re-download modules.
COPY server/go.mod server/go.sum ./
RUN go mod download

COPY server/ ./
# Replace the placeholder bundle with the real build.
COPY --from=web /app/web/dist ./internal/webembed/dist
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/nextnav ./cmd/nextnav

# --- stage 3: runtime ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=server /out/nextnav /app/nextnav
RUN mkdir -p /app/data && chown -R app:app /app
USER app

ENV PORT=3000 \
    DATA_DIR=/app/data \
    CHECK_INTERVAL=1d
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/app/nextnav"]
