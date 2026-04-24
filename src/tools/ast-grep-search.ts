/**
 * ast_grep_search tool definition
 */

import { formatMatches, sgAvailable, sgSearch } from '../sg-runner.ts';
import { LANGUAGES } from './shared.ts';

function looksLikeRuleYamlOrPlainText(pattern: string): boolean {
  const text = pattern.trim();
  if (!text) return true;

  const lower = text.toLowerCase();
  if (/(^|\n)\s*(id|language|rule|rules|kind|pattern|message|severity)\s*:/.test(lower)) {
    return true;
  }
  if (/\b(id|language|rule|rules|kind|pattern|message|severity)\s*:\s*[a-z0-9_-]+/i.test(text)) {
    return true;
  }
  if (/^[-*]\s+/.test(text)) return true;

  const hasAstSignals = /[$(){}\[\].;:'"`]/.test(text);
  const hasWhitespace = /\s/.test(text);
  if (hasWhitespace && !hasAstSignals) return true;

  return false;
}

export const astGrepSearchTool = {
  name: 'ast_grep_search' as const,
  label: 'AST Search',
  description:
    'Search code using AST-aware pattern matching. IMPORTANT: Use specific AST patterns, NOT text search.\n\n' +
    '✅ GOOD patterns (single AST node):\n' +
    '  - function $NAME() { $$$BODY }     (function declaration)\n' +
    '  - fetchMetrics($ARGS)               (function call)\n' +
    '  - import { $NAMES } from "$PATH"   (import statement)\n' +
    '  - console.log($MSG)                 (method call)\n\n' +
    '❌ BAD patterns (multiple nodes / raw text):\n' +
    '  - it"test name"                     (missing parens — use it($TEST))\n' +
    '  - arbitrary text without code structure\n\n' +
    'Always prefer specific patterns with context over bare identifiers. ' +
    "Use 'paths' to scope to specific files/folders. " +
    "Use 'selector' to extract specific nodes (e.g., just the function name). " +
    "Use 'context' to show surrounding lines.",
  promptSnippet: 'Use ast_grep_search for AST-aware structural code search',
  promptGuidelines: [
    'Use ast_grep_search for structural or semantic code patterns (function calls, imports, class shapes) — not for plain text or identifier string search; use grep for that.',
    'ast_grep_search patterns must be valid code syntax with metavariables like $NAME or $$$ARGS, not plain text or rule YAML.',
    'Scope ast_grep_search with paths to specific files or folders to reduce noise and avoid scanning the entire repo.',
    'Prefer ast_grep_search over grep when the match shape requires syntactic context, e.g. finding all callers of a function regardless of whitespace.',
  ],
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'AST pattern (use function/class/call context, not text)',
      },
      lang: {
        type: 'string',
        enum: LANGUAGES,
        description: 'Target language',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific files/folders to search',
      },
      selector: {
        type: 'string',
        description: "Extract specific AST node kind (e.g., 'name', 'body', 'parameter')",
      },
      context: {
        type: 'number',
        description: 'Show N lines before/after each match for context',
      },
    },
    required: ['pattern', 'lang'],
  },
  async execute(
    _toolCallId: string,
    params: { pattern: string; lang: string; paths?: string[]; selector?: string; context?: number },
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

    const { pattern, lang, paths, selector, context } = params;

    if (looksLikeRuleYamlOrPlainText(pattern)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: ast_grep_search expects a valid AST code pattern, not plain text/rule YAML. Use patterns like `function $NAME($$$ARGS) { $$$BODY }` or use grep/read for plain text search.',
          },
        ],
        isError: true,
        details: {},
      };
    }

    const searchPaths = paths?.length ? paths : [ctx?.cwd ?? '.'];
    const result = await sgSearch(pattern, lang, searchPaths, { selector, context });

    if (result.error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
        isError: true,
        details: {},
      };
    }

    return {
      content: [{ type: 'text' as const, text: formatMatches(result.matches) }],
      details: { matchCount: result.matches.length },
    };
  },
};
