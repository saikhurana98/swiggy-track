#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pnpm typecheck
pnpm lint
pnpm test
pnpm format:check

cd "$ROOT/integrations/swiggy"
uv run ruff check .
uv run ruff format --check .
uv run mypy custom_components
uv run pytest
