# syntax=docker/dockerfile:1
# Lort in one image: the Go server (PocketBase inside) supervising the Next.js standalone server.
# Build: docker build -t lort --build-arg LORT_VERSION=$(git describe --tags --always --dirty) .
# The two build stages run one after the other (the web stage waits for the Go stage), so their
# memory peaks never overlap on a 1 GB server.
# Every stage is Alpine (musl), and the runtime is built FROM scratch out of the few packages
# Lort runs on, plus a stripped copy of the node binary. ALPINE_VERSION must be the Alpine release
# the node image is built on, since node links against that release's libstdc++.

ARG LORT_VERSION=dev
ARG ALPINE_VERSION=3.24

FROM golang:1.27-alpine${ALPINE_VERSION} AS server
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

FROM node:24-alpine${ALPINE_VERSION} AS node

# The official binary keeps its debug sections (about 18 MB); nothing reads them at run time.
FROM node AS node-bin
RUN apk add --no-cache binutils && strip /usr/local/bin/node -o /out-node

# The app tree stays root-owned and read-only to lort. The one exception is .next/cache, where Next
# writes the optimized images (cache/images) and the fetch cache (cache/fetch-cache) at run time;
# the web stage creates it owned by lort (uid 10001), and the final COPY keeps that.
FROM node AS web
# First, so this stage starts only once the Go build has finished.
COPY --from=server /out/built /tmp/server-built
WORKDIR /src
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
# package.json's packageManager is the one place the pnpm version is set.
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" \
 && npm cache clean --force \
 && pnpm config set store-dir /pnpm-store
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=768 NEXT_BUILD_CPUS=1
RUN pnpm build \
 && mkdir -p /out \
 && cp -a .next/standalone /out/web \
 && cp -a .next/static /out/web/.next/static \
 && if [ -d public ]; then cp -a public /out/web/public; fi \
 && mkdir /out/web/.next/cache \
 && chown 10001:10001 /out/web/.next/cache

# The runtime's whole filesystem: musl, busybox (the entrypoint's sh, find, chown), node's two
# libraries, tini, setpriv and the CA bundle. No apk, OpenSSL or zlib: node and lort bring their own.
FROM alpine:${ALPINE_VERSION} AS rootfs
RUN mkdir -p /rootfs/etc/apk \
 && cp -a /etc/apk/keys /rootfs/etc/apk/ \
 && apk add --no-cache --root /rootfs --initdb --repositories-file /etc/apk/repositories \
      musl busybox libstdc++ libgcc tini setpriv ca-certificates-bundle \
 && rm -rf /rootfs/etc/apk /rootfs/lib/apk /rootfs/var/cache \
 && printf 'root:x:0:0:root:/root:/sbin/nologin\nlort:x:10001:10001:lort:/data:/sbin/nologin\n' > /rootfs/etc/passwd \
 && printf 'root:x:0:\nlort:x:10001:\n' > /rootfs/etc/group \
 && mkdir -p -m 1777 /rootfs/tmp \
 && mkdir -p -m 700 /rootfs/data/pb_data \
 && chown -R 10001:10001 /rootfs/data

FROM scratch
COPY --from=rootfs /rootfs /
COPY --from=node-bin /out-node /usr/local/bin/node
COPY --from=server /out/lort /usr/local/bin/lort
COPY --from=web /out/web /app/web
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ARG LORT_VERSION
LABEL org.opencontainers.image.title="Lort" \
      org.opencontainers.image.version="${LORT_VERSION}" \
      org.opencontainers.image.source="https://github.com/hacker4ofakind/lort" \
      org.opencontainers.image.licenses="GPL-3.0" \
      dev.lort.image="1"
ENV PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
    LORT_DATA=/data/pb_data \
    LORT_WEB_CMD="node /app/web/server.js" \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
VOLUME /data
EXPOSE 80 443 4052
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["lort", "healthcheck"]
ENTRYPOINT ["docker-entrypoint.sh"]
