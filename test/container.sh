#!/usr/bin/env bash
# Single quotes below hold literal $ on purpose (bash -c scripts, passwords with $ in them).
# shellcheck disable=SC2016
# Checks a built Lort image the way an owner runs it: the exact run line, capabilities
# dropped, a fresh volume and a root-owned one, bad settings, a wrong key, a graceful stop,
# a crashed Next, reset-admin and the setup wizard.
#
#   bash test/container.sh [image]      (LORT_EXPECT_VERSION=1.2.3 to check the version)
#
# Everything it creates is named lort-check-<pid> and removed at the end. It never touches a
# container or volume named lort, and refuses to run next to a real .env.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite /data and /work

image=${1:-lort}
if [ -e .env ]; then
	echo "There's a .env in this folder. Run the check from somewhere else so it can't touch a real board." >&2
	exit 1
fi

id=lort-check-$$
tmp=$(mktemp -d)
pass=0
fail=0
containers=()
volumes=()

cleanup() {
	for c in "${containers[@]+"${containers[@]}"}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
	for v in "${volumes[@]+"${volumes[@]}"}"; do docker volume rm -f "$v" >/dev/null 2>&1 || true; done
	rm -rf "$tmp"
}
trap cleanup EXIT

ok() { pass=$((pass + 1)); echo "ok   $*"; }
bad() { fail=$((fail + 1)); echo "FAIL $*"; }
check() { # check "description" command...
	local what=$1
	shift
	if "$@"; then ok "$what"; else bad "$what"; fi
}

# A path Docker can mount, on Linux, macOS and Git Bash alike.
hostpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

key() { (
	set +o pipefail # tr gets SIGPIPE once head has its 32 characters
	LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
); }
free_port() { echo $((20000 + RANDOM % 20000)); }

# envfile NAME LINES... writes an env file and prints its path.
envfile() {
	local f=$tmp/$1.env
	shift
	printf '%s\n' "$@" >"$f"
	hostpath "$f"
}

# The owner's run line, from the image itself, pointed at throwaway names.
run_line() { # run_line MODE NAME VOLUME ENVFILE PORTS
	local line
	line=$(docker run --rm --entrypoint lort "$image" run-line "$1")
	line=${line/--name lort/--name $2}
	line=${line/lort_data:/$3:}
	line=${line/--env-file .env/--env-file $4}
	if [ "$1" = proxy ]; then
		line=${line/-p 127.0.0.1:4052:4052/$5}
	else
		line=${line/-p 80:80 -p 443:443/$5}
	fi
	printf '%s\n' "${line% lort} $image"
}

start() { # start MODE NAME VOLUME ENVFILE PORTS
	containers+=("$2")
	# shellcheck disable=SC2046,SC2091 # the run line is meant to split into words and run
	$(run_line "$@") >/dev/null
}

wait_healthy() { # wait_healthy PORT [seconds]
	local i
	for ((i = 0; i < ${2:-90}; i++)); do
		if curl -fsS "http://127.0.0.1:$1/api/lort/health" >/dev/null 2>&1 &&
			curl -fsS "http://127.0.0.1:$1/feedback" >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	return 1
}

uid_of() { docker exec -u lort "$1" stat -c %u "$2"; }

sign_in() { # sign_in PORT EMAIL PASSWORD -> HTTP status
	curl -s -o - -w '%{http_code}' -H 'Content-Type: application/json' \
		--data "{\"identity\":\"$2\",\"password\":\"$3\"}" \
		"http://127.0.0.1:$1/api/collections/_superusers/auth-with-password" | tail -c 3
}

echo "Checking $image"

# 1. A fresh volume with the proxy run line and every capability the line drops dropped.
k1=$(key)
port=$(free_port)
env1=$(envfile one LORT_URL=http://localhost:4052 LORT_TLS=off "LORT_ENCRYPTION_KEY=$k1" \
	LORT_ADMIN_EMAIL=check@lort.test LORT_ADMIN_PASSWORD=correcthorse-check)
start proxy "$id-one" "$id-one" "$env1" "-p 127.0.0.1:$port:4052"
volumes+=("$id-one")
if wait_healthy "$port"; then ok "starts with the run line on a fresh volume"; else
	bad "starts with the run line on a fresh volume"
	docker logs "$id-one" 2>&1 | tail -30
	exit 1
fi
config=$(curl -fsS "http://127.0.0.1:$port/api/lort/config")
check "serves the default app name" grep -q '"appName":"My app"' <<<"$config"
if [ -n "${LORT_EXPECT_VERSION:-}" ]; then
	check "reports version $LORT_EXPECT_VERSION" grep -q "\"version\":\"$LORT_EXPECT_VERSION\"" <<<"$config"
fi
check "the healthcheck passes" docker exec "$id-one" lort healthcheck
procs=$(docker top "$id-one" -o pid,uid,args | tail -n +2)
check "tini, lort and Next all run as uid 10001" bash -c '[ "$(grep -cE "tini|lort|next-server" <<<"$1")" -ge 3 ] && [ -z "$(awk "\$2 != 10001" <<<"$1")" ]' _ "$procs"
check "the database belongs to uid 10001" test "$(uid_of "$id-one" /data/pb_data/data.db)" = 10001
check "sends security headers" bash -c "curl -sI 'http://127.0.0.1:$port/feedback' | grep -qi '^referrer-policy: strict-origin-when-cross-origin'"

# reset-admin, password from stdin, starting with a dash.
check "reset-admin sets a new password" bash -c "printf 'check@lort.test\n-new-password\n-new-password\n' | docker exec -i -u lort '$id-one' lort reset-admin >/dev/null"
check "the new password signs in" test "$(sign_in "$port" check@lort.test -new-password)" = 200
check "the old password doesn't" test "$(sign_in "$port" check@lort.test correcthorse-check)" = 400
check "reset-admin refuses an unknown admin" bash -c "! printf 'nobody@lort.test\n' | docker exec -i -u lort '$id-one' lort reset-admin >/dev/null 2>&1"

# A crashed Next comes back.
docker exec -u lort "$id-one" sh -c 'for p in /proc/[0-9]*; do tr "\0" " " <"$p/cmdline" 2>/dev/null | grep -q "^next-server" && kill "${p#/proc/}"; done' || true
sleep 2
check "restarts Next after it dies" wait_healthy "$port" 30
check "says so in the log" bash -c "docker logs '$id-one' 2>&1 | grep -q 'Restarting it in'"

# A graceful stop inside Docker's 10 seconds.
started=$(date +%s)
docker stop "$id-one" >/dev/null
took=$(($(date +%s) - started))
check "docker stop takes under 10 s (took ${took}s)" test "$took" -lt 10
check "logs 'The web server has stopped.'" bash -c "docker logs '$id-one' 2>&1 | grep -q 'The web server has stopped.'"
check "exits 0" test "$(docker inspect -f '{{.State.ExitCode}}' "$id-one")" = 0

# 2. The same data, owned by root (as some hosts and hand restores leave it).
docker run --rm --entrypoint sh -u 0 -v "$id-one:/data" "$image" -c 'chown -R 0:0 /data'
docker start "$id-one" >/dev/null
check "starts on a root-owned volume" wait_healthy "$port"
check "gives the volume back to uid 10001" test "$(uid_of "$id-one" /data/pb_data/data.db)" = 10001
check "the top of the volume too" test "$(uid_of "$id-one" /data)" = 10001
docker stop "$id-one" >/dev/null

# 2b. Only one restored subtree belongs to root; everything the entrypoint used to probe is fine.
docker run --rm --entrypoint sh -u 0 -v "$id-one:/data" "$image" -c 	'mkdir -p /data/pb_data/storage/restored && echo x >/data/pb_data/storage/restored/pic.png && ln -sf /etc/hostname /data/pb_data/storage/link && chown -R 0:0 /data/pb_data/storage'
docker start "$id-one" >/dev/null
check "starts with a root-owned subtree inside" wait_healthy "$port"
check "gives the nested files back to uid 10001" test "$(uid_of "$id-one" /data/pb_data/storage/restored/pic.png)" = 10001
check "without following a symlink out of the volume" test "$(docker exec "$id-one" stat -c %u /etc/hostname)" = 0
docker stop "$id-one" >/dev/null

# 3. A different key on that data says so once and plainly.
env_wrong=$(envfile wrong LORT_URL=http://localhost:4052 LORT_TLS=off "LORT_ENCRYPTION_KEY=$(key)")
out=$(docker run --rm -v "$id-one:/data" --env-file "$env_wrong" "$image" 2>&1) && code=0 || code=$?
check "a different key exits 1" test "$code" = 1
check "and explains the key" grep -q "different LORT_ENCRYPTION_KEY" <<<"$out"
check "without a raw cipher error" bash -c '! grep -q "cipher: message authentication failed" <<<"$1"' _ "$out"

# 4. Settings Lort refuses, each with its fix.
refuses() { # refuses "expected text" ENV-LINES...
	local want=$1 f out code
	shift
	f=$(envfile "refuse-$RANDOM" "$@")
	out=$(docker run --rm --env-file "$f" "$image" 2>&1) && code=0 || code=$?
	[ "$code" = 1 ] && grep -qF "$want" <<<"$out"
}
check "refuses LORT_TLS=on" refuses "LORT_TLS should be auto or off (it's \"on\")" LORT_URL=https://f.example.com LORT_TLS=on "LORT_ENCRYPTION_KEY=$(key)"
check "refuses a bare LORT_URL" refuses "LORT_URL should be the board's full address" LORT_URL=f.example.com LORT_TLS=off
check "refuses a short key" refuses "should be 32 characters (it has 5)" LORT_URL=https://f.example.com LORT_TLS=auto LORT_ENCRYPTION_KEY=short
check "refuses HTTPS on localhost" refuses "LORT_TLS=off to try" LORT_URL=https://localhost LORT_TLS=auto "LORT_ENCRYPTION_KEY=$(key)"
check "refuses HTTPS on an IP" refuses "has no domain" LORT_URL=https://203.0.113.9 LORT_TLS=auto "LORT_ENCRYPTION_KEY=$(key)"

# 5. HTTPS mode binds 80 and 443 as uid 10001 with capabilities dropped.
p80=$(free_port)
p443=$(free_port)
env_auto=$(envfile auto LORT_URL=https://lort-check.example.com LORT_TLS=auto "LORT_ENCRYPTION_KEY=$(key)")
start https "$id-auto" "$id-auto" "$env_auto" "-p 127.0.0.1:$p80:80 -p 127.0.0.1:$p443:443"
volumes+=("$id-auto")
sleep 6
check "HTTPS mode keeps running" test "$(docker inspect -f '{{.State.Running}}' "$id-auto")" = true
check "and binds without permission errors" bash -c "! docker logs '$id-auto' 2>&1 | grep -qi 'permission denied'"
check "port 80 answers (redirects to HTTPS)" bash -c "curl -s -o - -w '%{http_code}' -H 'Host: lort-check.example.com' 'http://127.0.0.1:$p80/feedback' | tail -c 3 | grep -q '^30'"

# 6. The setup wizard against a root-owned, empty volume, with no terminal.
work=$tmp/work
mkdir -p "$work"
: >"$work/.env"
docker volume create "$id-wiz" >/dev/null
volumes+=("$id-wiz")
docker run --rm --entrypoint sh -u 0 -v "$id-wiz:/data" "$image" -c 'chown -R 0:0 /data'
wizard=$(printf 'localhost\nme@example.test\npw one $x\npw one $x\n' | docker run --rm -i --entrypoint lort \
	--cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER \
	--security-opt no-new-privileges -v "$(hostpath "$work"):/work" -v "$id-wiz:/data" "$image" \
	setup --workdir /work --ports-free=no --os=linux 2>&1) && code=0 || code=$?
check "the wizard finishes without a terminal" test "$code" = 0
check "and says it read the password as plain text" grep -q "isn't a terminal" <<<"$wizard"
check "and prints the proxy run line" grep -qF "$(docker run --rm --entrypoint lort "$image" run-line proxy)" <<<"$wizard"
check "the password never shows" bash -c "! grep -qF 'pw one' <<<\"\$1\"" _ "$wizard"
check ".env has exactly the three settings" grep -Eqx 'LORT_URL=http://localhost:4052
LORT_TLS=off
LORT_ENCRYPTION_KEY=[A-Za-z0-9]{32}' <<<"$(cat "$work/.env")"
check ".env holds no password" bash -c "! grep -q 'pw one' '$work/.env'"
check "the wizard left the database to uid 10001" test "$(docker run --rm --entrypoint stat -v "$id-wiz:/data" "$image" -c %u /data/pb_data/data.db)" = 10001
port2=$(free_port)
start proxy "$id-wiz" "$id-wiz" "$(hostpath "$work/.env")" "-p 127.0.0.1:$port2:4052"
check "the board starts with the wizard's .env" wait_healthy "$port2"
check "the wizard's admin signs in" test "$(sign_in "$port2" me@example.test 'pw one $x')" = 200
rerun=$(printf '\n' | docker run --rm -i --entrypoint lort -v "$(hostpath "$work"):/work" -v "$id-wiz:/data" "$image" \
	setup --workdir /work --ports-free=no --container-running=yes --os=linux 2>&1) || true
check "a re-run with Lort running leaves its database alone" grep -q "left its database alone" <<<"$rerun"

# 7. Nothing private in the image.
check "no .env or local data in any layer" bash -c "[ -z \"\$(docker run --rm --entrypoint sh '$image' -c 'find / -xdev \\( -name .env -o -name \".env.*\" -o -name data.db -o -name pb_data -path \"*/server/*\" -o -path /app/web/e2e \\) 2>/dev/null')\" ]"
check "no secret in the build history" bash -c "! docker history --no-trunc '$image' | grep -q 'LORT_ENCRYPTION_KEY='"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
