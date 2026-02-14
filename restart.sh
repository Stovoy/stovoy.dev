#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

docker compose -f docker-compose.prod.yml up -d --force-recreate --scale backend=2
