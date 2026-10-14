#!/bin/sh
# Give the app user the Docker socket's group when the socket is mounted.
# A missing socket is normal for installs that do not enable the Ops Docker check.
set -eu

sock="${OPS_DOCKER_SOCKET:-}"
if [ -z "$sock" ] && [ -n "${DOCKER_HOST:-}" ]; then
  case "$DOCKER_HOST" in
    unix://*)
      sock="${DOCKER_HOST#unix://}"
      ;;
  esac
fi
if [ -z "$sock" ]; then
  sock=/var/run/docker.sock
fi

if [ ! -S "$sock" ]; then
  exit 0
fi

gid="$(stat -c %g "$sock" 2>/dev/null || true)"
if [ -z "$gid" ]; then
  exit 0
fi

if ! getent group "$gid" >/dev/null 2>&1; then
  groupadd -g "$gid" dockerhost || true
fi

group="$(getent group "$gid" | cut -d: -f1)"
if [ -n "$group" ]; then
  usermod -aG "$group" app || true
fi
