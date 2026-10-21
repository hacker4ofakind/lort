#!/usr/bin/env bash
# Lort setup. Checks what only this machine can know (Docker, git, free ports, memory),
# builds the image, then hands over to the wizard (`lort setup`) inside it.
#
#   ./setup.sh               set up, or re-run to change your answers
#   ./setup.sh --reset-admin set a new admin password
#   ./setup.sh --help
#
# Works with bash 3.2 (macOS) and up.
set -eu

say() { printf '%s\n' "$*"; }
stop() {
	printf '%s\n' "$@" >&2
	exit 1
}

usage() {
	say "Usage: ./setup.sh [--reset-admin]"
	say ""
	say "  (no option)     set up Lort, or run again to change your answers"
	say "  --reset-admin   set a new password for a dashboard admin"
	say "  --help          show this"
}

mode=setup
case "${1:-}" in
"") ;;
--reset-admin) mode=reset ;;
-h | --help)
	usage
	exit 0
	;;
*)
	usage >&2
	exit 1
	;;
esac

case "$(uname -s)" in
Darwin) os=mac ;;
MINGW* | MSYS* | CYGWIN*) os=windows ;;
*) os=linux ;;
esac

install_hint() { # install_hint docker|git
	case "$1:$os" in
	docker:linux) say "  Install it with: curl -fsSL https://get.docker.com | sh" ;;
	docker:mac) say "  Install it with: brew install --cask docker   (then open Docker once)" ;;
	docker:windows) say "  Install it with: winget install Docker.DockerDesktop" ;;
	git:linux) say "  Install it with: sudo apt-get install -y git   (or your system's package manager)" ;;
	git:mac) say "  Install it with: xcode-select --install" ;;
	git:windows) say "  Install it with: winget install Git.Git" ;;
	esac
}

# 1. Docker and git.
if ! command -v docker >/dev/null 2>&1; then
	say "Lort runs in Docker, and Docker isn't installed yet." >&2
	say "  How to install it: https://docs.docker.com/engine/install/" >&2
	install_hint docker >&2
	say "Then run ./setup.sh again." >&2
	exit 1
fi
if ! info=$(docker info 2>&1); then
	case "$info" in
	*"permission denied"* | *"Permission denied"*)
		stop "Docker is installed, but you don't have permission to use it." \
			"  Add yourself to the docker group: sudo usermod -aG docker \"\$USER\"" \
			"  Then sign out and back in, and run ./setup.sh again." \
			"  (Docker's guide: https://docs.docker.com/engine/install/linux-postinstall/)"
		;;
	*)
		say "Docker is installed but isn't running." >&2
		case "$os" in
		linux) say "  Start it with: sudo systemctl start docker" >&2 ;;
		*) say "  Open Docker Desktop and wait until it says it's running." >&2 ;;
		esac
		say "  Docker's docs: https://docs.docker.com/engine/install/" >&2
		say "Then run ./setup.sh again." >&2
		exit 1
		;;
	esac
fi
if ! command -v git >/dev/null 2>&1; then
	say "Setup needs git, and it isn't installed yet." >&2
	say "  How to install it: https://git-scm.com/downloads" >&2
	install_hint git >&2
	say "Then run ./setup.sh again." >&2
	exit 1
fi

# The lort container's state: true (running), false (stopped) or empty (none).
lort_state() { docker inspect -f '{{.State.Running}}' lort 2>/dev/null || true; }
running() { [ "$(lort_state)" = true ]; }

# Interactive flags: -it with a terminal, -i for piped input (scripts, coding agents).
if [ -t 0 ]; then tty=-it; else tty=-i; fi

if [ "$mode" = reset ]; then
	if ! running; then
		stop "Lort isn't running, so there's no admin to reset yet." \
			"  Start it with the docker run line setup printed, then run ./setup.sh --reset-admin again." \
			"  (docker ps -a shows whether a container named lort exists.)"
	fi
	# lort asks for the email and the new password itself: nothing secret goes through here.
	exec docker exec "$tty" -u lort lort lort reset-admin
fi

# 2. Ports 80 and 443: free, or already Lort's (a re-run).
in_use() { # in_use PORT: something on this machine answers on it
	if [ -n "${LORT_TEST_LISTENING+x}" ]; then
		case " $LORT_TEST_LISTENING " in *" $1 "*) return 0 ;; esac
		return 1
	fi
	(exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}
lort_holds() { [ -n "$(docker port lort "$1/tcp" 2>/dev/null || true)" ]; }

ports_free=yes
for p in 80 443; do
	if in_use "$p" && ! lort_holds "$p"; then ports_free=no; fi
done

# 3. Memory: building needs about 2.5 GB of RAM and swap together.
swap_recipe() {
	say "  To add 2 GB of swap on Linux:"
	say "    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
	say "    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
}
if [ "$os" = linux ] && [ -r /proc/meminfo ]; then
	kb=$(awk '/^(MemTotal|SwapTotal):/ { s += $2 } END { print s }' /proc/meminfo)
	if [ "${kb:-0}" -lt 2500000 ]; then
		say "This server has $((kb / 1024)) MB of memory and swap together. Building Lort needs about 2.5 GB."
		swap_recipe
		say "Carrying on; if the build runs out of memory, add swap and run ./setup.sh again."
		say ""
	fi
fi

# 4. .env: created empty if it's missing, never emptied if it exists (it holds the key to your
# board's settings), and made owner-only every run. The wizard fills it in, and refuses a symlink.
if [ ! -e .env ] && [ ! -L .env ]; then
	(
		umask 077
		: >.env
	)
fi
if [ -f .env ] && [ ! -L .env ]; then
	if [ "$os" = windows ]; then
		# NTFS ignores umask. /reset drops explicit entries (some machines add SYSTEM and
		# Administrators), then only this user is granted access.
		icacls="$(cygpath -u "${SYSTEMROOT:-C:\Windows}")/System32/icacls.exe"
		MSYS_NO_PATHCONV=1 "$icacls" .env /reset >/dev/null
		MSYS_NO_PATHCONV=1 "$icacls" .env /inheritance:r /grant:r "${USERNAME:-$(whoami)}:(R,W)" >/dev/null
	else
		chmod 600 .env
	fi
fi

# 5. Build.
version=$(git describe --tags --always --dirty 2>/dev/null || true)
[ -n "$version" ] || version=dev
say "Building Lort $version. The first build takes a few minutes."
code=0
docker build -t lort --build-arg "LORT_VERSION=$version" . || code=$?
if [ "$code" = 137 ]; then
	say "" >&2
	say "The build ran out of memory (exit code 137)." >&2
	swap_recipe >&2
	say "Then run ./setup.sh again." >&2
	exit 1
elif [ "$code" != 0 ]; then
	stop "The build stopped (exit code $code). The lines above say why."
fi
say "Tidying up old Lort images."
docker image prune -f --filter label=dev.lort.image=1 >/dev/null || true
avail=$(df -Pk . 2>/dev/null | awk 'NR == 2 { print $4 }')
if [ -n "${avail:-}" ] && [ "$avail" -lt 4194304 ]; then
	say "Heads up: only $((avail / 1024)) MB of disk is free here. Lort's updates need about 4 GB."
fi
say ""

# 6. The wizard.
workdir=$PWD
if [ "$os" = windows ]; then workdir=$(pwd -W); fi
# Running: setup leaves its database alone. Stopped: it still holds the name lort.
state=$(lort_state)
if [ "$state" = true ]; then container_running=yes; else container_running=no; fi
if [ -n "$state" ]; then container_exists=yes; else container_exists=no; fi
code=0
MSYS_NO_PATHCONV=1 docker run --rm "$tty" --entrypoint lort \
	--cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER \
	--security-opt no-new-privileges \
	-v "$workdir:/work" -v lort_data:/data \
	lort setup --workdir /work --ports-free="$ports_free" --container-running="$container_running" --container-exists="$container_exists" --os="$os" --script=./setup.sh || code=$?
exit "$code"
