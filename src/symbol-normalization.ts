import { resolve } from 'node:path';
import type { SymbolCandidate } from './types.ts';
import type { BackendName, MatchKind, ToolInvoker } from './symbol-backends.ts';

export interface DocumentSymbolLike {
  name?: string;
  kind?: number | string;
  location?: { uri?: string; path?: string; range?: RangeLike };
  range?: RangeLike;
  selectionRange?: RangeLike;
  children?: unknown[];
}

export interface WorkspaceSymbolLike {
  name?: string;
  kind?: number | string;
  location?: { uri?: string; path?: string; range?: RangeLike };
}

export interface LocationLike {
  uri?: string;
  path?: string;
  file?: string;
  range?: RangeLike;
  targetUri?: string;
  targetSelectionRange?: RangeLike;
  targetRange?: RangeLike;
}

export interface RangeLike {
  start?: PositionLike;
  end?: PositionLike;
}

export interface PositionLike {
  line?: number;
  character?: number;
}

export function normalizeLocation(value: unknown): LocationLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as LocationLike;
}

export function normalizeRange(range: RangeLike | undefined): { startLine: number; endLine: number } | null {
  if (!range) return null;
  const start = normalizeLineNumber(range.start?.line);
  const end = normalizeLineNumber(range.end?.line ?? range.start?.line);
  return { startLine: start, endLine: Math.max(start, end) };
}

export function normalizeCharacter(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value + 1;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed > 0 ? parsed : parsed + 1;
  }
  return undefined;
}

export function normalizeLineNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value + 1;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed > 0 ? parsed : parsed + 1;
  }
  return 1;
}

export function normalizeFilePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('file://')) {
    try {
      return resolve(decodeURIComponent(new URL(value).pathname));
    } catch {
      return resolve(value.replace(/^file:\/\//, ''));
    }
  }
  return resolve(value);
}

export function normalizeSymbolKind(kind: unknown): SymbolCandidate['kind'] {
  if (typeof kind === 'string') {
    const lowered = kind.toLowerCase();
    if (lowered.includes('function')) return 'function';
    if (lowered.includes('class')) return 'class';
    if (lowered.includes('interface')) return 'interface';
    if (lowered.includes('type')) return 'type';
    if (lowered.includes('enum')) return 'enum';
    if (lowered.includes('method')) return 'method';
    return 'const';
  }

  switch (kind) {
    case 5: return 'class';
    case 6: return 'method';
    case 11: return 'interface';
    case 12: return 'function';
    case 13: return 'const';
    case 10: return 'enum';
    case 26: return 'type';
    default: return 'const';
  }
}

export async function safeInvoke(invokeTool: ToolInvoker, toolName: string, params: Record<string, unknown>) {
  try {
    return await invokeTool(toolName, params);
  } catch {
    return null;
  }
}

export function coerceArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as any).content)) return (value as any).content;
  return [];
}

export function classifyNameMatch(name: string, symbol: string): MatchKind {
  if (name === symbol) return 'exact';
  if (name.toLowerCase() === symbol.toLowerCase()) return 'case-insensitive';
  return name.toLowerCase().includes(symbol.toLowerCase()) ? 'partial' : 'partial';
}

export function declarationSearchPatterns(symbol: string): string[] {
  return [
    `function ${symbol}`,
    `class ${symbol}`,
    `interface ${symbol}`,
    `type ${symbol}`,
    `enum ${symbol}`,
    `const ${symbol}`,
    `let ${symbol}`,
    `var ${symbol}`,
  ];
}

export function extractAstCandidateName(preview: string, fallback: string): string | null {
  const regex = /\b(function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)\b/;
  const match = regex.exec(preview);
  return match?.[2] ?? (preview.includes(fallback) ? fallback : null);
}

export function containsSymbolReference(line: string, symbol: string) {
  return new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(line);
}

export function findSymbolColumn(line: string, symbol: string) {
  const index = line.search(new RegExp(`\\b${escapeRegExp(symbol)}\\b`));
  return index >= 0 ? index + 1 : undefined;
}

export function classifyReferenceMatchKind(line: string, symbol: string): MatchKind {
  if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(line)) return 'exact';
  if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'i').test(line)) return 'case-insensitive';
  return line.toLowerCase().includes(symbol.toLowerCase()) ? 'partial' : 'partial';
}

export function classifyDeclaration(line: string, symbol: string): SymbolCandidate['kind'] | null {
  const exactPatterns = declarationPatterns(symbol);
  for (const [kind, pattern] of exactPatterns) {
    if (pattern.test(line)) return kind;
  }

  const insensitivePatterns = declarationPatterns(symbol, 'i');
  for (const [kind, pattern] of insensitivePatterns) {
    if (pattern.test(line)) return kind;
  }

  return null;
}

export function classifyMatchKind(line: string, symbol: string): MatchKind {
  for (const [, pattern] of declarationPatterns(symbol)) {
    if (pattern.test(line)) return 'exact';
  }
  for (const [, pattern] of declarationPatterns(symbol, 'i')) {
    if (pattern.test(line)) return 'case-insensitive';
  }
  return line.toLowerCase().includes(symbol.toLowerCase()) ? 'partial' : 'partial';
}

export function declarationPatterns(symbol: string, flags = ''): Array<[SymbolCandidate['kind'], RegExp]> {
  const escaped = escapeRegExp(symbol);
  return [
    ['function', new RegExp(`\\bfunction\\s+${escaped}\\b`, flags)],
    ['class', new RegExp(`\\bclass\\s+${escaped}\\b`, flags)],
    ['interface', new RegExp(`\\binterface\\s+${escaped}\\b`, flags)],
    ['type', new RegExp(`\\btype\\s+${escaped}\\b`, flags)],
    ['enum', new RegExp(`\\benum\\s+${escaped}\\b`, flags)],
    ['const', new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`, flags)],
    ['method', new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*\\{`, flags)],
  ];
}

export function matchScore(kind: MatchKind) {
  switch (kind) {
    case 'exact': return 3;
    case 'case-insensitive': return 2;
    case 'partial': return 1;
  }
}

export function strongerConfidence(left: 'high' | 'medium' | 'low', right: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
  const score = { low: 1, medium: 2, high: 3 } as const;
  return score[right] > score[left] ? right : left;
}

export function optionsAwareFallbackBackend(invokeTool?: ToolInvoker): BackendName {
  return invokeTool ? 'ast' : 'fallback';
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
