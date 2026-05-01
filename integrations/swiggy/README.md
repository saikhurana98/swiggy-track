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
