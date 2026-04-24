/**
 * sg-runner.ts
 *
 * Thin wrapper around the `sg` CLI (ast-grep).
 * No class — just functions. Async spawn, JSON parse, format.
 */

import { spawn, spawnSync } from 'node:child_process';

export interface SgMatch {
  file: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  text: string;
  replacement?: string;
}

interface SgResult {
  matches: SgMatch[];
  error?: string;
}

/** Check if sg binary is available in PATH */
export function sgAvailable(): boolean {
  try {
    const result = spawnSync('sg', ['--version'], { timeout: 5000, encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Spawn sg with args, collect stdout/stderr, parse JSON matches */
function runSg(args: string[]): Promise<SgResult> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn('sg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ matches: [], error: `Failed to spawn sg: ${(err as Error).message}` });
      return;
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

    proc.on('error', (err: Error) => {
      if (err.message.includes('ENOENT')) {
        resolve({ matches: [], error: 'ast-grep (sg) not found in PATH. Install: npm i -g @ast-grep/cli' });
      } else {
        resolve({ matches: [], error: err.message });
      }
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0 && !stdout.trim()) {
        let errorMsg = stderr.trim() || `sg exited with code ${code}`;
        if (stderr.includes('Multiple AST nodes are detected')) {
          errorMsg =
            `Invalid AST pattern: multiple AST nodes or malformed pattern.\n` +
            `Common causes:\n` +
            `  1. Missing parentheses: use it($TEST) not it"test"\n` +
            `  2. Raw text without structure\n` +
            `  3. Unclosed quotes or brackets\n\nOriginal: ${errorMsg}`;
        } else if (stderr.includes('Cannot parse query')) {
          errorMsg =
            `Pattern syntax error: could not parse as valid code.\n` +
            `Tips:\n` +
            `  - Patterns must be valid code syntax\n` +
            `  - Use metavariables like $NAME, $ARGS for variable parts\n\nOriginal: ${errorMsg}`;
        }
        resolve({ matches: [], error: stderr.includes('No files found') ? undefined : errorMsg });
        return;
      }
      if (!stdout.trim()) {
        resolve({ matches: [] });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({ matches: Array.isArray(parsed) ? parsed : [parsed] });
      } catch {
        resolve({ matches: [], error: 'Failed to parse sg JSON output' });
      }
    });
  });
}

/** Search for AST pattern matches */
export async function sgSearch(
  pattern: string,
  lang: string,
  paths: string[],
  opts?: { selector?: string; context?: number },
): Promise<SgResult> {
  const args = ['run', '-p', pattern, '--lang', lang, '--json=compact'];
  if (opts?.selector) args.push('--selector', opts.selector);
  if (opts?.context !== undefined) args.push('--context', String(opts.context));
  args.push(...paths);
  return runSg(args);
}

/** Dry-run replacement: shows what would change */
export async function sgReplaceDry(
  pattern: string,
  rewrite: string,
  lang: string,
  paths: string[],
): Promise<SgResult> {
  return runSg(['run', '-p', pattern, '-r', rewrite, '--lang', lang, '--json=compact', ...paths]);
}

/**
 * Apply replacement: writes files, then searches for rewrite pattern to show results.
 * sg --update-all and --json are mutually exclusive, so we run twice.
 */
export async function sgReplaceApply(
  pattern: string,
  rewrite: string,
  lang: string,
  paths: string[],
): Promise<SgResult> {
  const applyResult = await runSg(['run', '-p', pattern, '-r', rewrite, '--lang', lang, '--update-all', ...paths]);
  if (applyResult.error) return applyResult;

  // Search for rewrite pattern to show what was applied
  const searchResult = await runSg(['run', '-p', rewrite, '--lang', lang, '--json=compact', ...paths]);
  return { matches: searchResult.matches };
}

const MAX_DISPLAY = 50;

/** Format SgMatch array into readable output string */
export function formatMatches(
  matches: SgMatch[],
  isDryRun = false,
  showModeIndicator = false,
): string {
  if (matches.length === 0) {
    if (showModeIndicator) {
      return isDryRun
        ? '[DRY-RUN] No matches found.'
        : '[APPLIED] No changes made (no matches found).';
    }
    return 'No matches found';
  }

  const shown = matches.slice(0, MAX_DISPLAY);
  const lines = shown.map((m) => {
    const loc = `${m.file}:${m.range.start.line + 1}:${m.range.start.column + 1}`;
    const text = m.text.length > 100 ? `${m.text.slice(0, 100)}...` : m.text;
    return isDryRun && m.replacement
      ? `${loc}\n  - ${text}\n  + ${m.replacement}`
      : `${loc}: ${text}`;
  });

  if (matches.length > MAX_DISPLAY) {
    lines.unshift(`Found ${matches.length} matches (showing first ${MAX_DISPLAY}):`);
  }

  if (showModeIndicator) {
    const prefix = isDryRun ? '[DRY-RUN]' : '[APPLIED]';
    const suffix = isDryRun ? '\n\n(Dry run — use apply=true to apply changes)' : '';
    return `${prefix} ${matches.length} replacement(s):\n\n${lines.join('\n')}${suffix}`;
  }

  return lines.join('\n');
}
