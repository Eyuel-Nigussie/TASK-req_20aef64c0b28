#!/usr/bin/env bash
# Runs the full backend + frontend test suites inside Docker containers.
#
# Usage:
#   ./run_tests.sh              # run every backend + frontend test
#   ./run_tests.sh --backend    # only run the backend tests
#   ./run_tests.sh --frontend   # only run the frontend tests
#   ./run_tests.sh --no-build   # skip image rebuild step

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

RUN_BACKEND=1
RUN_FRONTEND=1
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --backend)   RUN_FRONTEND=0 ;;
    --frontend)  RUN_BACKEND=0 ;;
    --no-build)  BUILD=0 ;;
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

if [[ "$BUILD" == "1" ]]; then
  echo ">> Building Docker images..."
  "${DC[@]}" build backend frontend
fi

FAILED=0

if [[ "$RUN_BACKEND" == "1" ]]; then
  echo ""
  echo "=========================================="
  echo " Running backend tests (Jest + supertest)"
  echo "=========================================="
  echo ">> Starting MongoDB for adapter integration tests..."
  "${DC[@]}" up -d --wait db
  backend_exit=0
  "${DC[@]}" run --rm --no-deps \
      -e MONGO_ADAPTER_TEST_URI=mongodb://db:27017/clinicops_test \
      --entrypoint "" backend npm test || backend_exit=$?
  "${DC[@]}" stop db || true
  "${DC[@]}" rm -f db || true
  if [[ $backend_exit -ne 0 ]]; then
    FAILED=1
  fi
fi

if [[ "$RUN_FRONTEND" == "1" ]]; then
  echo ""
  echo "=========================================="
  echo " Running frontend tests (Vitest + RTL)"
  echo "=========================================="
  if ! "${DC[@]}" run --rm --no-deps --entrypoint "" frontend npm test; then
    FAILED=1
  fi
fi

echo ""
if [[ "$FAILED" == "0" ]]; then
  echo ">> ALL TESTS PASSED"
  exit 0
else
  echo ">> SOME TESTS FAILED"
  exit 1
fi
