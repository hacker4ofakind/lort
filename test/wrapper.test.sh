#!/usr/bin/env bash
# Smoke tests for setup.sh with a fake docker (and git) on a minimal PATH.
#
#   bash test/wrapper.test.sh
#
# Runs under bash 3.2 (macOS /bin/bash) too. Nothing real is built, run or touched.
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0
fail=0
ok() {
	pass=$((pass + 1))
	echo "ok   $*"
}
bad() {
	fail=$((fail + 1))
	echo "FAIL $*"
}

# Tools setup.sh may use, linked into a bin folder we control (so git and docker can be absent).
tools="bash sh uname awk df cat grep sed id head tr stat wc chmod"
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=yes ;; *) windows=no ;; esac
# Git Bash's tools need their DLLs next to them, and its /usr/bin has no git or docker.
# (setup.sh calls icacls by its full path; System32 stays off PATH because it can hold docker.)
if [ "$windows" = yes ]; then base=/usr/bin; else base=; fi
icacls="$(cygpath -u "${SYSTEMROOT:-C:\Windows}" 2>/dev/null)/System32/icacls.exe"
export icacls
mkbin() { # mkbin DIR [with-git]
	mkdir -p "$1"
	if [ "$windows" = no ]; then
		for t in $tools; do
			p=$(command -v "$t" 2>/dev/null) || continue
			case "$p" in /*) ln -s "$p" "$1/$t" ;; esac
		done
	fi
	if [ "${2:-}" = with-git ]; then
		cat >"$1/git" <<'EOF'
#!/bin/sh
[ "$1" = describe ] && [ -n "${FAKE_GIT_VERSION:-}" ] && { echo "$FAKE_GIT_VERSION"; exit 0; }
exit 128
EOF
		chmod +x "$1/git"
	fi
}

# The fake docker logs each call (one line, args separated by |) and acts on FAKE_* vars.
fake_docker() {
	cat >"$1/docker" <<'EOF'
#!/usr/bin/env bash
log="$FAKE_LOG"
printf '%s' "docker" >>"$log"
for a in "$@"; do printf '|%s' "$a" >>"$log"; done
printf '\n' >>"$log"
case "$1" in
info)
	case "${FAKE_INFO:-ok}" in
	ok) exit 0 ;;
	down) echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2; exit 1 ;;
	denied) echo "permission denied while trying to connect to the Docker daemon socket" >&2; exit 1 ;;
	esac ;;
inspect)
	if [ "${FAKE_RUNNING:-}" = yes ]; then echo true; elif [ "${FAKE_STOPPED:-}" = yes ]; then echo false; else exit 1; fi ;;
port) [ "${FAKE_LORT_PORTS:-}" = yes ] && echo "0.0.0.0:$3"; exit 0 ;;
build) exit "${FAKE_BUILD_CODE:-0}" ;;
run)
	if [ -e .env ]; then
		case "$(uname -s)" in
		MINGW* | MSYS* | CYGWIN*) # owner-only means one ACL entry, not inherited
			acl=$(MSYS_NO_PATHCONV=1 "$icacls" .env | grep -c ':(')
			if [ "$acl" = 1 ] && ! MSYS_NO_PATHCONV=1 "$icacls" .env | grep -q '(I)'; then perms=600; else perms=open; fi ;;
		*) perms=$(stat -c %a .env 2>/dev/null || stat -f %Lp .env) ;;
		esac
		echo "env-at-wizard size=$(wc -c <.env | tr -d ' ') perms=$perms" >>"$log"
	fi
	exit 0 ;;
esac
exit 0
EOF
	chmod +x "$1/docker"
}

n=0
# scenario NAME [with-git] [with-docker] -- runs setup.sh in a fresh folder; sets $out, $code, $log, $dir
scenario() {
	n=$((n + 1))
	dir=$tmp/s$n
	bin=$dir/bin
	mkdir -p "$dir/work"
	mkbin "$bin" "$1"
	[ "$2" = with-docker ] && fake_docker "$bin"
	cp "$root/setup.sh" "$dir/work/setup.sh"
	log=$dir/docker.log
	: >"$log"
	shift 2
	out=$(cd "$dir/work" && FAKE_LOG="$log" PATH="$bin${base:+:$base}" bash ./setup.sh "$@" </dev/null 2>&1)
	code=$?
}
has() { case "$out" in *"$1"*) return 0 ;; esac; return 1; }
called() { grep -qF -- "$1" "$log"; }

export LORT_TEST_LISTENING=""

scenario with-git none
if [ "$code" = 1 ] && has "isn't installed" && has "https://docs.docker.com/engine/install/" && has "Install it with"; then ok "missing Docker: link and install line, exit 1"; else bad "missing Docker ($code): $out"; fi

FAKE_INFO=down scenario with-git with-docker
if [ "$code" = 1 ] && has "isn't running" && has "docs.docker.com"; then ok "Docker not running: says so, exit 1"; else bad "Docker down ($code): $out"; fi

FAKE_INFO=denied scenario with-git with-docker
if [ "$code" = 1 ] && has "permission" && has "usermod -aG docker" && ! has "isn't installed"; then ok "socket permission: its own message"; else bad "denied ($code): $out"; fi

scenario no-git with-docker
if [ "$code" = 1 ] && has "git" && has "https://git-scm.com/downloads" && has "Install it with"; then ok "missing git: link and install line, exit 1"; else bad "missing git ($code): $out"; fi

scenario with-git with-docker
if [ "$code" = 0 ] && called "docker|build|-t|lort|--build-arg|LORT_VERSION=dev|."; then ok "build without a tag uses LORT_VERSION=dev"; else bad "build call ($code): $out $(cat "$log")"; fi
want="docker|run|--rm|-i|--entrypoint|lort|--cap-drop=ALL|--cap-add=CHOWN|--cap-add=SETUID|--cap-add=SETGID|--cap-add=DAC_OVERRIDE|--cap-add=FOWNER|--security-opt|no-new-privileges|-v|"
if grep -F -- "$want" "$log" | grep -qF -- ":/work|-v|lort_data:/data|lort|setup|--workdir|/work|--ports-free=yes|--container-running=no|--container-exists=no|--os="; then ok "wizard call: mounts, entrypoint, flags"; else bad "wizard call: $(cat "$log")"; fi
if grep -q "env-at-wizard size=0 perms=600" "$log"; then ok ".env is empty and owner-only before the wizard"; else bad ".env before wizard: $(cat "$log")"; fi
if called "docker|image|prune|-f|--filter|label=dev.lort.image=1"; then ok "prunes only old Lort images"; else bad "prune: $(cat "$log")"; fi

FAKE_GIT_VERSION=v1.2.0-3-gabc scenario with-git with-docker
if called "LORT_VERSION=v1.2.0-3-gabc"; then ok "build carries git describe"; else bad "git describe: $(cat "$log")"; fi

LORT_TEST_LISTENING="80" scenario with-git with-docker
if called "--ports-free=no"; then ok "a taken port gives --ports-free=no"; else bad "taken: $(cat "$log")"; fi

LORT_TEST_LISTENING="80 443" FAKE_LORT_PORTS=yes FAKE_RUNNING=yes scenario with-git with-docker
if called "--ports-free=yes" && called "--container-running=yes|--container-exists=yes"; then ok "ports held by the lort container count as free"; else bad "held by lort: $(cat "$log")"; fi

# A re-run never empties an existing .env.
n=$((n + 1))
dir=$tmp/s$n
mkdir -p "$dir/work"
mkbin "$dir/bin" with-git
fake_docker "$dir/bin"
cp "$root/setup.sh" "$dir/work/"
printf 'LORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\n' >"$dir/work/.env"
# Wide open, with explicit (not inherited) entries on Windows.
if [ "$windows" = yes ]; then
	MSYS_NO_PATHCONV=1 "$icacls" "$(cygpath -w "$dir/work/.env")" /grant '*S-1-5-18:(F)' '*S-1-1-0:(R)' >/dev/null
else
	chmod 644 "$dir/work/.env"
fi
(cd "$dir/work" && FAKE_LOG="$dir/log" PATH="$dir/bin${base:+:$base}" bash ./setup.sh </dev/null >/dev/null 2>&1)
if grep -q "abcdefghijklmnopqrstuvwxyz012345" "$dir/work/.env"; then ok "an existing .env keeps its key"; else bad "the key was wiped"; fi
if grep -q "env-at-wizard size=[1-9][0-9]* perms=600" "$dir/log"; then ok "an existing .env is made owner-only"; else bad "existing .env permissions: $(cat "$dir/log")"; fi

FAKE_STOPPED=yes scenario with-git with-docker
if called "--container-running=no|--container-exists=yes"; then ok "a stopped lort container is reported as existing"; else bad "stopped: $(cat "$log")"; fi

FAKE_BUILD_CODE=137 scenario with-git with-docker
if [ "$code" = 1 ] && has "ran out of memory" && has "swapfile" && ! called "docker|run"; then ok "exit 137 is explained as out of memory"; else bad "137 ($code): $out"; fi

scenario with-git with-docker --reset-admin
if [ "$code" = 1 ] && has "isn't running" && ! called "docker|exec"; then ok "--reset-admin checks the container is running"; else bad "reset, not running ($code): $out"; fi

FAKE_RUNNING=yes scenario with-git with-docker --reset-admin
if called "docker|exec|-i|-u|lort|lort|lort|reset-admin" && [ "$(grep -c '^docker|exec' "$log")" = 1 ] && ! grep '^docker|exec' "$log" | grep -qi pass; then ok "--reset-admin runs docker exec -u lort lort lort reset-admin, nothing secret in argv"; else bad "reset: $(cat "$log")"; fi

scenario with-git with-docker --help
if [ "$code" = 0 ] && has "--reset-admin" && ! called "docker|build"; then ok "--help"; else bad "help ($code): $out"; fi

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
