export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,yml,yaml,md,html,css}': ['prettier --write'],
  '{custom_components,tests,scripts}/**/*.py': [
    'uv run ruff check --fix',
    'uv run ruff format',
    () => 'uv run mypy custom_components',
  ],
};
