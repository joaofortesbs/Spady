#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f package-lock.json ]]; then
  echo "package-lock.json is required for post-merge dependency setup." >&2
  exit 1
fi

# Keep the merged workspace reproducible without running package lifecycle
# scripts during the dependency install.
npm ci --ignore-scripts --no-audit --no-fund

# Validate the merged application without running a production build. A build
# removes .next in this project and must not race with the dev workflow.
npm run typecheck
npm run lint