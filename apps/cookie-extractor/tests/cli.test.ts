import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs } from '../src/login.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'src', 'login.ts');
const tsxBin = resolve(here, '..', 'node_modules', '.bin', 'tsx');

describe('parseArgs', () => {
  it('returns defaults for empty argv', () => {
    const opts = parseArgs([]);
    expect(opts.timeoutSeconds).toBe(600);
    expect(opts.output).toBeUndefined();
    expect(opts.showHelp).toBe(false);
    expect(opts.showVersion).toBe(false);
  });

  it('parses --output <file>', () => {
    const opts = parseArgs(['--output', '/tmp/cookies.json']);
    expect(opts.output).toBe('/tmp/cookies.json');
  });

  it('parses --timeout <seconds>', () => {
    const opts = parseArgs(['--timeout', '30']);
    expect(opts.timeoutSeconds).toBe(30);
  });

  it('parses --help and --version flags', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true);
    expect(parseArgs(['-h']).showHelp).toBe(true);
    expect(parseArgs(['--version']).showVersion).toBe(true);
    expect(parseArgs(['-V']).showVersion).toBe(true);
  });

  it('throws on unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow();
  });

  it('throws when --output has no value', () => {
    expect(() => parseArgs(['--output'])).toThrow();
  });

  it('throws when --timeout is not a positive integer', () => {
    expect(() => parseArgs(['--timeout', 'abc'])).toThrow();
    expect(() => parseArgs(['--timeout', '0'])).toThrow();
    expect(() => parseArgs(['--timeout', '-5'])).toThrow();
  });
});

describe('CLI smoke', () => {
  it('--help exits 0 and prints usage', () => {
    const result = spawnSync(tsxBin, [entry, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Usage:/i);
  });

  it('--version exits 0 and prints a version', () => {
    const result = spawnSync(tsxBin, [entry, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+|0\.0\.0/);
  });
});
