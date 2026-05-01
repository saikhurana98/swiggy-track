# Contributing

Thanks for considering a contribution. This is a small monorepo; the rules are short.

## Repo layout

- `apps/cookie-extractor/` — local TS + HTML mini-app for OTP login and Swiggy cookie capture.
- `integrations/swiggy/` — Home Assistant custom integration (Python, packaged for HACS).
  - `custom_components/swiggy/` — the HA-loadable component (this is what ships in `swiggy.zip`).
- `packages/shared-types/` — zod schemas shared between the extractor and the integration.
- `.github/workflows/` — CI and release pipelines.
- `scripts/` — local helper scripts.

## Dev setup

```bash
pnpm install                         # JS workspaces (Node >= 22, pnpm >= 9)
cd integrations/swiggy && uv sync    # Python integration (uv handles its own venv)
```

## Run tests

```bash
pnpm test                                     # all TS workspaces
cd integrations/swiggy && uv run pytest       # Python integration
```

Lint + format checks:

```bash
pnpm lint && pnpm format:check && pnpm typecheck
cd integrations/swiggy && uv run ruff check . && uv run ruff format --check . && uv run mypy custom_components
```

Or run all of the above via `./scripts/preflight.sh`.

## Commit format

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint via husky. Allowed scopes are listed in `commitlint.config.js`. Common ones:

- `feat(integration): add ETA sensor`
- `fix(extractor): handle OTP retry`
- `chore(deps): bump pydantic`
- `ci: cache uv venv`
- `docs: ...`

## Releasing

1. Bump anything that needs bumping. The integration's `manifest.json` `version` field is **stamped automatically** by the release workflow from the git tag — don't bump it manually.
2. Run `./scripts/preflight.sh`.
3. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`
4. The `release.yml` workflow stamps the manifest, builds `swiggy.zip`, and creates a GitHub Release. HACS picks it up automatically.
