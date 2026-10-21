#!/usr/bin/env bash
# Starts a built Lort image on 127.0.0.1:4052 for Playwright, the way an owner runs it (the
# proxy run line from the image), with a fresh volume and the e2e admin from test/e2e.env.
# The one place tests start the container; CI and the README use it.
#
#   bash test/e2e-container.sh [image]   start (replacing an earlier e2e container)
#   bash test/e2e-container.sh --stop    remove the container and its volume
#
# Then: cd web && LORT_E2E_CONTAINER=1 pnpm e2e
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite /data

name=lort-check-e2e
here=$(cd "$(dirname "$0")" && pwd)

stop() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	docker volume rm -f "$name" >/dev/null 2>&1 || true
}
if [ "${1:-}" = --stop ]; then
	stop
	echo "Removed $name."
	exit 0
fi

image=${1:-lort}
if [ -e .env ]; then
	echo "There's a .env in this folder. Run this from somewhere else so it can't touch a real board." >&2
	exit 1
fi
hostpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

stop
envfile=$(mktemp)
trap 'rm -f "$envfile"' EXIT
key=$(
	set +o pipefail
	LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
)
{
	echo LORT_URL=http://localhost:4052
	echo LORT_TLS=off
	echo "LORT_ENCRYPTION_KEY=$key"
	cat "$here/e2e.env"
} >"$envfile"

line=$(docker run --rm --entrypoint lort "$image" run-line proxy)
line=${line/--name lort/--name $name}
line=${line/lort_data:/$name:}
line=${line/--env-file .env/--env-file $(hostpath "$envfile")}
line="${line% lort} $image"
echo "Starting $image as $name on http://127.0.0.1:4052"
# shellcheck disable=SC2086 # the run line is meant to split into words
$line >/dev/null

for _ in $(seq 1 120); do
	if curl -fsS http://127.0.0.1:4052/api/lort/health >/dev/null 2>&1 &&
		curl -fsS http://127.0.0.1:4052/feedback >/dev/null 2>&1; then
		echo "Ready. Run: cd web && LORT_E2E_CONTAINER=1 pnpm e2e"
		exit 0
	fi
	sleep 1
done
echo "Lort didn't come up within 2 minutes. Its log:" >&2
docker logs "$name" 2>&1 | tail -40 >&2
exit 1
