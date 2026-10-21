# syntax=docker/dockerfile:1
# Lort in one image: the Go server (PocketBase inside) supervising the Next.js standalone server.
# Build: docker build -t lort --build-arg LORT_VERSION=$(git describe --tags --always --dirty) .
# The two build stages run one after the other (the web stage waits for the Go stage), so their
# memory peaks never overlap on a 1 GB server.

ARG LORT_VERSION=dev

FROM golang:1.27-trixie AS server
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY server/ ./
ARG LORT_VERSION
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOFLAGS="-p=1 -buildvcs=false" go build -trimpath \
      -ldflags "-s -w -X github.com/hacker4ofakind/lort/server/internal/site.Version=${LORT_VERSION}" \
      -o /out/lort . \
 && echo "${LORT_VERSION}" > /out/built

FROM node:24-trixie-slim AS web
# First, so this stage starts only once the Go build has finished.
COPY --from=server /out/built /tmp/server-built
WORKDIR /src
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
# package.json's packageManager is the one place the pnpm version is set.
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" \
 && pnpm config set store-dir /pnpm-store
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=768 NEXT_BUILD_CPUS=1
RUN pnpm build \
 && mkdir -p /out \
 && cp -a .next/standalone /out/web \
 && cp -a .next/static /out/web/.next/static \
 && if [ -d public ]; then cp -a public /out/web/public; fi

FROM node:24-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 lort \
 && useradd --uid 10001 --gid lort --home-dir /data --no-create-home --shell /usr/sbin/nologin lort \
 && mkdir -p /data/pb_data \
 && chown -R lort:lort /data \
 && chmod 700 /data/pb_data
COPY --from=server /out/lort /usr/local/bin/lort
COPY --from=web /out/web /app/web
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ARG LORT_VERSION
LABEL org.opencontainers.image.title="Lort" \
      org.opencontainers.image.version="${LORT_VERSION}" \
      org.opencontainers.image.source="https://github.com/hacker4ofakind/lort" \
      org.opencontainers.image.licenses="GPL-3.0" \
      dev.lort.image="1"
ENV LORT_DATA=/data/pb_data \
    LORT_WEB_CMD="node /app/web/server.js" \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
VOLUME /data
EXPOSE 80 443 4052
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["lort", "healthcheck"]
ENTRYPOINT ["docker-entrypoint.sh"]
