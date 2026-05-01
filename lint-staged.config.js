export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,yml,yaml,md,html,css}': ['prettier --write'],
  'integrations/swiggy/**/*.py': [
    () => 'bash -c "cd integrations/swiggy && uv run ruff check --fix ."',
    () => 'bash -c "cd integrations/swiggy && uv run ruff format ."',
    () => 'bash -c "cd integrations/swiggy && uv run mypy custom_components"',
  ],
};
