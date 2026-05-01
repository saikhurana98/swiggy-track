import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr, argv, exit } from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  attachPhoneSniffer,
  clickSignIn,
  extractAuthCookies,
  gotoSwiggyHome,
  launchChromium,
  pollForAuthCookies,
} from './browser.js';
import { redactCookies, writeJsonOutput } from './output.js';
import type { CliOptions } from './types.js';
import type { LaunchedBrowser } from './browser.js';

const HELP_TEXT = `Usage: cookie-extractor login [options]

Open a real Chromium window so you can log in to Swiggy with phone + OTP.
On success, the captured session cookies are printed as JSON to stdout and
copied to the clipboard. The browser closes automatically.

Options:
  --output <file>        Also write the JSON to <file> (mode 0600)
  --timeout <seconds>    Maximum time to wait for login (default: 600)
  --phone-last4 <digits> Skip the interactive prompt; use these 4 digits as phoneLast4
  -h, --help             Show this help text and exit
  -V, --version          Show version and exit
`;

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(here, '..', 'package.json');
    const raw: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (raw !== null && typeof raw === 'object' && 'version' in raw) {
      const version: unknown = (raw as Record<string, unknown>)['version'];
      if (typeof version === 'string') return version;
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

export function parseArgs(args: readonly string[]): CliOptions {
  const opts: CliOptions = {
    output: undefined,
    timeoutSeconds: 600,
    phoneLast4: undefined,
    showHelp: false,
    showVersion: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        opts.showHelp = true;
        break;
      case '--version':
      case '-V':
        opts.showVersion = true;
        break;
      case '--output': {
        const next = args[i + 1];
        if (next === undefined || next.startsWith('-')) {
          throw new Error('--output requires a file path');
        }
        opts.output = next;
        i += 1;
        break;
      }
      case '--phone-last4': {
        const next = args[i + 1];
        if (next === undefined || !/^\d{4}$/.test(next)) {
          throw new Error('--phone-last4 requires exactly 4 digits');
        }
        opts.phoneLast4 = next;
        i += 1;
        break;
      }
      case '--timeout': {
        const next = args[i + 1];
        if (next === undefined) {
          throw new Error('--timeout requires a positive integer (seconds)');
        }
        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== next) {
          throw new Error(`--timeout must be a positive integer, got: ${next}`);
        }
        opts.timeoutSeconds = parsed;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg ?? '(undefined)'}`);
    }
  }
  return opts;
}

async function copyToClipboardBestEffort(text: string): Promise<boolean> {
  try {
    const mod = (await import('clipboardy')) as {
      default: { write: (s: string) => Promise<void> };
    };
    await mod.default.write(text);
    return true;
  } catch {
    return false;
  }
}

async function promptPhoneLast4(): Promise<string> {
  const rl = createInterface({ input: stdin, output: stderr });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = (await rl.question('Enter last 4 digits of your phone: ')).trim();
      if (/^\d{4}$/.test(answer)) return answer;
      stderr.write('Invalid input — must be exactly 4 digits.\n');
    }
    throw new Error('phoneLast4 prompt failed after 3 attempts');
  } finally {
    rl.close();
  }
}

function lastFour(mobile: string): string | undefined {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 4) return undefined;
  return digits.slice(-4);
}

async function safeClose(launched: LaunchedBrowser | undefined): Promise<void> {
  if (launched === undefined) return;
  try {
    await launched.context.close();
  } catch {
    // already closed
  }
  if (launched.browser !== undefined) {
    try {
      await launched.browser.close();
    } catch {
      // already closed
    }
  }
}

async function runLogin(opts: CliOptions): Promise<void> {
  let launched: LaunchedBrowser | undefined;
  const sigintHandler = (): void => {
    stderr.write('\nReceived SIGINT — closing browser…\n');
    void safeClose(launched).then(() => {
      exit(130);
    });
  };
  process.on('SIGINT', sigintHandler);

  try {
    try {
      launched = await launchChromium();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderr.write(
        `\nFailed to launch Chromium: ${msg}\n\n` +
          `If this is the first run, install the browser binary:\n` +
          `  pnpm --filter @swiggy-track/cookie-extractor exec playwright install chromium\n`,
      );
      exit(1);
    }
    const { context, page } = launched;
    const phoneCapture = attachPhoneSniffer(page);

    stderr.write('Opening Swiggy…\n');
    await gotoSwiggyHome(page);

    try {
      await clickSignIn(page);
      stderr.write('Sign In modal opened. Complete login in the browser.\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderr.write(`Could not auto-click Sign In (${msg}). Click it manually in the window.\n`);
    }

    stderr.write(`Waiting up to ${String(opts.timeoutSeconds)}s for login to complete…\n`);
    const cookies = await pollForAuthCookies(context, {
      timeoutMs: opts.timeoutSeconds * 1000,
    });

    const phoneFromTraffic = phoneCapture.latest;
    let phoneLast4 =
      opts.phoneLast4 ?? (phoneFromTraffic !== undefined ? lastFour(phoneFromTraffic) : undefined);
    if (phoneLast4 === undefined) {
      stderr.write('Phone number not seen on the wire.\n');
      phoneLast4 = await promptPhoneLast4();
    }

    const auth = extractAuthCookies(cookies, { phoneLast4 });
    const json = JSON.stringify(auth, null, 2);

    writeJsonOutput(auth, { file: opts.output });

    const copied = await copyToClipboardBestEffort(json);
    stderr.write('\nCaptured cookies (redacted):\n');
    stderr.write(`${JSON.stringify(redactCookies(auth), null, 2)}\n`);
    if (copied) stderr.write('JSON copied to clipboard.\n');
    else stderr.write('Clipboard write skipped (clipboardy unavailable on this system).\n');
    if (opts.output !== undefined) stderr.write(`JSON written to ${opts.output}\n`);

    stdout.write(`${json}\n`);
  } finally {
    process.off('SIGINT', sigintHandler);
    await safeClose(launched);
  }
}

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`Error: ${msg}\n\n${HELP_TEXT}`);
    exit(2);
  }

  if (opts.showHelp) {
    stdout.write(HELP_TEXT);
    return;
  }
  if (opts.showVersion) {
    stdout.write(`${readPackageVersion()}\n`);
    return;
  }

  await runLogin(opts);
}

const invokedDirectly = ((): boolean => {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`\nError: ${msg}\n`);
    exit(1);
  });
}
