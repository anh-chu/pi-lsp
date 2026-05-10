import { readFileSync } from 'node:fs';
import { formatCompactSection } from './format.ts';
import { findReferences, getSymbolSlice } from './symbols.ts';
import { rememberReadFile, rememberQueriedSymbol } from './state.ts';
import type { CompareImplementation, CompareQuery, CompareResult } from './types.ts';
import type { ToolInvoker } from './symbol-backends.ts';
import type { ReferenceFileGroup } from './types.ts';
import { resolveWorkspaceFile } from './workspace-path.ts';
import { extractCallsFromPreview, inferFunctionRole } from './code-context.ts';

interface CompareOptions {
  invokeTool?: ToolInvoker;
}

function extractSnippet(filePath: string, line: number, contextLines: number = 5): string {
  try {
    const safePath = resolveWorkspaceFile(filePath);
    if (!safePath) return '';
    const content = readFileSync(safePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, line - 1 - contextLines);
    const end = Math.min(lines.length, line - 1 + contextLines + 1);
    return lines.slice(start, end).join('\n');
  } catch {
    return '';
  }
}

function findCommonCalls(implementations: CompareImplementation[]): string[] {
  if (implementations.length === 0) return [];
  const callCounts = new Map<string, number>();
  for (const impl of implementations) {
    for (const call of impl.calls) {
      callCounts.set(call, (callCounts.get(call) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(implementations.length * 0.6);
  return [...callCounts.entries()]
    .filter(([_, count]) => count >= threshold)
    .map(([name]) => name);
}

function findOutliers(implementations: CompareImplementation[], commonCalls: string[]): Array<{ file: string; reason: string }> {
  const outliers: Array<{ file: string; reason: string }> = [];
  for (const impl of implementations) {
    const missingCommon = commonCalls.filter((call) => !impl.calls.includes(call));
    if (missingCommon.length > 0) {
      outliers.push({
        file: `${impl.file}:${impl.line}`,
        reason: `Does not call: ${missingCommon.join(', ')}`,
      });
    }
    if (impl.calls.length === 0) {
      outliers.push({
        file: `${impl.file}:${impl.line}`,
        reason: 'No function calls detected in snippet',
      });
    }
  }
  return outliers;
}

export async function compareImplementations(params: CompareQuery, options: CompareOptions = {}): Promise<CompareResult> {
  const limit = Math.max(2, Math.min(15, params.limit ?? 8));

  if (!params.symbol && !params.pattern) {
    return {
      implementations: [],
      commonPattern: { calls: [], role: 'unknown' },
      outliers: [],
      content: formatCompactSection('Compare failed', [
        '- reason: need either symbol or pattern to compare',
        '- next: pass a symbol name or pattern to find similar implementations',
      ]),
      details: { ok: false, reason: 'missing-symbol-or-pattern' },
    };
  }

  let filesToInspect: Array<{ file: string; line: number; preview?: string; isDeclaration?: boolean }> = [];

  if (params.symbol) {
    rememberQueriedSymbol(params.symbol);

    // First, find the actual definition(s) of the symbol
    const symbolResult = await getSymbolSlice(
      { symbol: params.symbol, file: params.scope, includeBody: true, contextLines: 0 },
      { invokeTool: options.invokeTool },
    );

    if (symbolResult.location?.file) {
      filesToInspect.push({
        file: symbolResult.location.file,
        line: symbolResult.location.line,
        preview: symbolResult.content.slice(0, 200),
        isDeclaration: true,
      });
      rememberReadFile(symbolResult.location.file);
    }

    // Then find references to see where it's used
    const refResult = await findReferences(
      { symbol: params.symbol, file: params.scope, limit },
      { invokeTool: options.invokeTool },
    );
    const groupedHits = refResult.details.groupedHits as ReferenceFileGroup[] | undefined;
    if (groupedHits) {
      for (const group of groupedHits) {
        for (const lineInfo of group.lines.slice(0, 1)) {
          // Skip if this is the declaration file (already added)
          if (symbolResult.location?.file && group.file === symbolResult.location.file) continue;
          filesToInspect.push({
            file: group.file,
            line: lineInfo.line,
            preview: lineInfo.preview,
            isDeclaration: false,
          });
          rememberReadFile(group.file);
        }
      }
    }
  } else if (params.pattern && options.invokeTool) {
    // Use ast-grep to find pattern matches
    const scope = params.scope || process.cwd();
    const response = await options.invokeTool('ast_grep_search', {
      pattern: params.pattern,
      lang: 'typescript',
      paths: [scope],
    });

    const matches = Array.isArray(response?.matches) ? response.matches : [];
    for (const match of matches.slice(0, limit)) {
      const file = match?.file ?? match?.path ?? match?.uri;
      const line = match?.line ?? match?.range?.start?.line ?? match?.start?.line;
      if (file && typeof line === 'number') {
        filesToInspect.push({
          file,
          line: line + 1,
          preview: match?.text ?? match?.match ?? '',
          isDeclaration: true,
        });
        rememberReadFile(file);
      }
    }
  }

  const implementations: CompareImplementation[] = [];
  for (const entry of filesToInspect.slice(0, limit)) {
    const snippet = extractSnippet(entry.file, entry.line);
    const calls = extractCallsFromPreview(entry.preview ?? snippet, params.symbol ?? '');
    implementations.push({
      symbol: params.symbol ?? params.pattern ?? '',
      file: entry.file,
      line: entry.line,
      snippet: snippet.slice(0, 300),
      calls,
      functionRole: inferFunctionRole(entry.file),
    });
  }

  const commonCalls = findCommonCalls(implementations);
  const outliers = findOutliers(implementations, commonCalls);
  const roles = implementations.map((impl) => impl.functionRole ?? 'unknown');
  const roleCounts = new Map<string, number>();
  for (const role of roles) {
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  const mostCommonRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

  return {
    implementations,
    commonPattern: { calls: commonCalls, role: mostCommonRole },
    outliers,
    content: formatCompactSection('Compare result', [
      `- symbol: ${params.symbol ?? params.pattern ?? 'none'}`,
      `- scope: ${params.scope ?? 'workspace'}`,
      `- implementations found: ${implementations.length}`,
      `- common calls: ${commonCalls.length > 0 ? commonCalls.join(', ') : 'none'}`,
      `- common role: ${mostCommonRole}`,
      `- outliers: ${outliers.length}`,
      ...implementations.slice(0, 8).map((impl, i) => {
        const calls = impl.calls.length > 0 ? ` -> calls: ${impl.calls.slice(0, 5).join(', ')}` : '';
        return `- impl ${i + 1}: ${impl.file}:${impl.line} [${impl.functionRole}]${calls}`;
      }),
      ...outliers.slice(0, 3).map((outlier) => `- outlier: ${outlier.file} — ${outlier.reason}`),
      ...(implementations.length > 8 ? [`- ... and ${implementations.length - 8} more`] : []),
    ]),
    details: {
      symbol: params.symbol ?? params.pattern,
      implementations,
      commonPattern: { calls: commonCalls, role: mostCommonRole },
      outliers,
      totalImplementations: implementations.length,
      suggestedNextTool: outliers.length > 0 ? 'code_nav_get_symbol' : undefined,
      suggestedNextArgs: outliers.length > 0 ? { symbol: params.symbol, file: outliers[0]?.file.split(':')[0], includeBody: true } : undefined,
      suggestedNextReason: outliers.length > 0 ? `Outlier found at ${outliers[0]?.file}; read it for full context.` : undefined,
    },
  };
}
