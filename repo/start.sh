#!/usr/bin/env bash
# Starts the ClinicOps backend + frontend as Docker containers.
#
# Usage:
#   ./start.sh           # build images if needed, run in foreground
#   ./start.sh -d        # build images if needed, run detached
#   ./start.sh --rebuild # force a rebuild of both images before starting
#   ./start.sh --stop    # stop and remove the containers

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required but not installed" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "error: docker compose plugin or docker-compose binary is required" >&2
  exit 1
fi

DETACH=""
REBUILD=""
STOP=""

for arg in "$@"; do
  case "$arg" in
    -d|--detach) DETACH="-d" ;;
    --rebuild)   REBUILD="1" ;;
    --stop|down) STOP="1" ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$STOP" ]]; then
  "${DC[@]}" down --remove-orphans
  exit 0
fi

BUILD_FLAG=(--build)
if [[ -n "$REBUILD" ]]; then
  "${DC[@]}" build --no-cache
  BUILD_FLAG=()
fi

echo ">> Starting ClinicOps stack (backend :4000, frontend :5173) via Docker..."
if [[ -n "$DETACH" ]]; then
  "${DC[@]}" up "${BUILD_FLAG[@]}" -d
  echo ">> Stack is running in the background."
  echo "   Backend health:  http://localhost:4000/health"
  echo "   Frontend UI:     http://localhost:5173"
  echo "   Tail logs:       ${DC[*]} logs -f"
  echo "   Stop:            ./start.sh --stop"
else
  "${DC[@]}" up "${BUILD_FLAG[@]}"
fi
