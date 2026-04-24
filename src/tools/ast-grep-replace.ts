/**
 * ast_grep_replace tool definition
 */

import { formatMatches, sgAvailable, sgReplaceApply, sgReplaceDry } from '../sg-runner.ts';
import { LANGUAGES } from './shared.ts';

export const astGrepReplaceTool = {
  name: 'ast_grep_replace' as const,
  label: 'AST Replace',
  description:
    'Replace code using AST-aware pattern matching. IMPORTANT: Use specific AST patterns, not text. Dry-run by default (use apply=true to apply).\n\n' +
    '✅ GOOD patterns (single AST node):\n' +
    "  - pattern='console.log($MSG)' rewrite='logger.info($MSG)'\n" +
    "  - pattern='var $X' rewrite='let $X'\n" +
    "  - pattern='function $NAME() { }' rewrite='' (delete)\n\n" +
    '❌ BAD patterns (will error):\n' +
    '  - Raw text without code structure\n' +
    '  - Missing parentheses: use it($TEST) not it"text"\n' +
    '  - Incomplete code fragments\n\n' +
    "Always use 'paths' to scope to specific files/folders. Dry-run first to preview changes.",
  promptSnippet: 'Use ast_grep_replace for AST-aware structural find-and-replace',
  promptGuidelines: [
    'Use ast_grep_replace for batch structural refactors (e.g. rename a call signature, swap var to let) — not for simple text substitution; use sed or write for that.',
    'ast_grep_replace dry-runs by default — always preview with apply=false first, then re-run with apply=true only after confirming the dry-run output looks correct.',
    'Scope ast_grep_replace with paths to specific files or folders to avoid unintended rewrites across the entire repo.',
  ],
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'AST pattern to match (be specific with context)',
      },
      rewrite: {
        type: 'string',
        description: 'Replacement using meta-variables from pattern',
      },
      lang: {
        type: 'string',
        enum: LANGUAGES,
        description: 'Target language',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific files/folders',
      },
      apply: {
        type: 'boolean',
        description: 'Apply changes (default: false — dry-run)',
      },
    },
    required: ['pattern', 'rewrite', 'lang'],
  },
  async execute(
    _toolCallId: string,
    params: { pattern: string; rewrite: string; lang: string; paths?: string[]; apply?: boolean },
    _signal?: AbortSignal,
    _onUpdate?: unknown,
    ctx?: { cwd?: string },
  ) {
    if (!sgAvailable()) {
      return {
        content: [{ type: 'text' as const, text: 'ast-grep (sg) not found in PATH. Install: npm i -g @ast-grep/cli' }],
        isError: true,
        details: {},
      };
    }

    const { pattern, rewrite, lang, paths, apply } = params;
    const searchPaths = paths?.length ? paths : [ctx?.cwd ?? '.'];

    const result = apply
      ? await sgReplaceApply(pattern, rewrite, lang, searchPaths)
      : await sgReplaceDry(pattern, rewrite, lang, searchPaths);

    if (result.error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
        isError: true,
        details: {},
      };
    }

    const isDryRun = !apply;
    const output = formatMatches(result.matches, isDryRun, true);

    return {
      content: [{ type: 'text' as const, text: output }],
      details: { matchCount: result.matches.length, applied: apply ?? false },
    };
  },
};
