#!/bin/sh
# PID 1. Starts as root only to give /data to the lort user (uid 10001), then drops to it and
# becomes tini, which forwards signals to lort. tini must run as lort too: the run line drops
# CAP_KILL, so a root tini couldn't signal a uid-10001 lort and docker stop would fail.
# Volumes some hosts create (Railway, Fly) belong to root, and so does anything an owner
# restored by hand, even one folder deep inside; one recursive chown fixes them, and only
# when something is wrong. Neither find nor chown -h follows a symlink out of the volume.
set -eu

data=/data
if [ "$(id -u)" = 0 ]; then
	mkdir -p "$data/pb_data"
	if [ -n "$(find "$data" \( ! -uid 10001 -o ! -gid 10001 \) -print -quit)" ]; then
		echo "Giving $data to the lort user (uid 10001)."
		chown -R -h 10001:10001 "$data"
	fi
	chmod 700 "$data/pb_data"
	exec setpriv --reuid=10001 --regid=10001 --init-groups tini -- lort "$@"
fi
exec tini -- lort "$@"
