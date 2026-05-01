# Swiggy Order Tracker — Home Assistant Custom Integration

See repo root `README.md` for install + usage. This subdir is the Python integration package consumed by HACS.

`custom_components/swiggy/` is the HA-loadable component. The release workflow zips this directory on tag push and attaches `swiggy.zip` to a GitHub Release; HACS pulls that asset.

Dev:

```bash
uv sync --all-extras --dev
uv run pytest
uv run ruff check .
uv run mypy custom_components
```

## Brand assets

This integration does **not** yet have a logo submitted to [home-assistant/brands](https://github.com/home-assistant/brands). The HACS validation workflow is configured with `ignore: brands` to allow the repo to validate without one.

TODO: submit `icon.png` (256x256) and `logo.png` to home-assistant/brands under `custom_integrations/swiggy/`, then drop `ignore: brands` from `.github/workflows/ci.yml`.
