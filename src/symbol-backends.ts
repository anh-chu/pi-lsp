import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReferenceHit, SymbolCandidate } from './types.ts';
import { resolveFileHint } from './symbol-fallback.ts';
import {
  classifyDeclaration,
  classifyNameMatch,
  classifyReferenceMatchKind,
  coerceArray,
  declarationSearchPatterns,
  extractAstCandidateName,
  matchScore,
  normalizeCharacter,
  normalizeFilePath,
  normalizeLineNumber,
  normalizeLocation,
  normalizeRange,
  normalizeSymbolKind,
  safeInvoke,
} from './symbol-normalization.ts';

export type BackendName = 'lsp' | 'ast' | 'fallback';
export type MatchKind = 'exact' | 'case-insensitive' | 'partial';
export type ToolInvoker = (toolName: string, params: Record<string, unknown>) => Promise<any>;

interface DocumentSymbolLike {
  name?: string;
  kind?: number | string;
  location?: { uri?: string; path?: string; range?: RangeLike };
  range?: RangeLike;
  selectionRange?: RangeLike;
  children?: unknown[];
}

interface WorkspaceSymbolLike {
  name?: string;
  kind?: number | string;
  location?: { uri?: string; path?: string; range?: RangeLike };
}

interface LocationLike {
  uri?: string;
  path?: string;
  file?: string;
  range?: RangeLike;
  targetUri?: string;
  targetSelectionRange?: RangeLike;
  targetRange?: RangeLike;
}

interface RangeLike {
  start?: PositionLike;
  end?: PositionLike;
}

interface PositionLike {
  line?: number;
  character?: number;
}

interface ReferenceCandidate extends ReferenceHit {
  matchKind: MatchKind;
  hinted: boolean;
}

/** Extension to ast-grep language mapping */
const extToAstGrepLang: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.css': 'css',
  '.scss': 'css',
  '.sass': 'css',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.php': 'php',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.hs': 'haskell',
  '.lua': 'lua',
  '.scala': 'scala',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sql': 'sql',
  '.c': 'c',
  '.cpp': 'cpp',
};

/**
 * Detect language from file path extension.
 * @param filePath - The file path to detect language from
 * @returns The ast-grep language string, defaults to 'typescript'
 */
export function detectLangFromPath(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return extToAstGrepLang[ext] ?? 'typescript';
}

export function astGrepSearchParams(pattern: string, scope: string, lang?: string): Record<string, unknown> {
  const detectedLang = lang ?? detectLangFromPath(scope);
  return {
    pattern,
    lang: detectedLang,
    paths: [scope],
  };
}

export function lspDocumentSymbolParams(file: string): Record<string, unknown> {
  return {
    operation: 'documentSymbol',
    filePath: file,
  };
}

export function lspWorkspaceSymbolParams(symbol: string, fileHint: string | undefined): Record<string, unknown> {
  return {
    operation: 'workspaceSymbol',
    query: symbol,
    filePath: fileHint,
  };
}

export function lspReferencesParams(definitionLocation: { file: string; line: number; character?: number }): Record<string, unknown> {
  return {
    operation: 'references',
    filePath: definitionLocation.file,
    line: definitionLocation.line,
    character: definitionLocation.character ?? 1,
  };
}

export async function findLspCandidates(symbol: string, fileHint: string | undefined, invokeTool?: ToolInvoker): Promise<SymbolCandidate[]> {
  if (!invokeTool) {
    const { findFileHintCandidates, findWorkspaceCandidates } = await import('./symbol-fallback.ts');
    return fileHint ? findFileHintCandidates(symbol, fileHint) : findWorkspaceCandidates(symbol, fileHint);
  }

  const hintedFiles = fileHint ? resolveFileHint(fileHint) : [];
  const hintedCandidates = hintedFiles.length > 0
    ? await Promise.all(hintedFiles.map((file) => fetchDocumentSymbolCandidates(file, symbol, invokeTool, fileHint)))
    : [];
  const flattenedHinted = sortCandidates(hintedCandidates.flat());
  if (flattenedHinted.some((candidate) => candidate.matchKind === 'exact')) {
    return flattenedHinted;
  }

  const workspace = await fetchWorkspaceSymbolCandidates(symbol, invokeTool, fileHint);
  return sortCandidates([...flattenedHinted, ...workspace]);
}

export async function findAstCandidates(symbol: string, fileHint: string | undefined, invokeTool?: ToolInvoker): Promise<SymbolCandidate[]> {
  if (!invokeTool) {
    const { findFileHintCandidates, findWorkspaceCandidates } = await import('./symbol-fallback.ts');
    return fileHint ? findFileHintCandidates(symbol, fileHint) : findWorkspaceCandidates(symbol, fileHint);
  }

  const scopes = fileHint ? resolveFileHint(fileHint) : [process.cwd()];
  const patterns = declarationSearchPatterns(symbol);
  const results: SymbolCandidate[] = [];

  for (const scope of scopes) {
    for (const pattern of patterns) {
      const response = await safeInvoke(invokeTool, 'ast_grep_search', astGrepSearchParams(pattern, scope));
      const items = coerceArray(response?.matches ?? response?.results ?? response?.hits ?? response?.content ?? response);
      for (const item of items) {
        const candidate = candidateFromAstMatch(item, symbol, fileHint);
        if (candidate) results.push(candidate);
      }
      if (results.some((candidate) => candidate.matchKind === 'exact')) {
        return sortCandidates(results);
      }
    }
  }

  return sortCandidates(results);
}

export async function findLspReferences(
  symbol: string,
  fileHint: string | undefined,
  limit: number,
  resolveDefinition: (symbol: string, fileHint: string | undefined) => Promise<{ file?: string; line?: number; character?: number } | null>,
  invokeTool?: ToolInvoker,
): Promise<ReferenceHit[] | null> {
  if (!invokeTool) return null;

  const definitionLocation = await resolveDefinition(symbol, fileHint);
  if (!definitionLocation?.file || typeof definitionLocation.line !== 'number') return null;

  const response = await safeInvoke(invokeTool, 'lsp_navigation', lspReferencesParams({
    file: definitionLocation.file,
    line: definitionLocation.line,
    character: definitionLocation.character,
  }));

  const items = coerceArray(response?.references ?? response?.locations ?? response?.items ?? response?.result ?? response);
  if (items.length === 0) return [];

  const hits = items
    .map((item) => referenceHitFromLspLocation(item, symbol, fileHint))
    .filter((hit): hit is ReferenceCandidate => Boolean(hit));
  return sortReferenceCandidates(hits).slice(0, limit).map(({ matchKind: _matchKind, hinted: _hinted, ...hit }) => hit);
}

function fetchDocumentSymbolCandidates(
  file: string,
  symbol: string,
  invokeTool: ToolInvoker,
  fileHint?: string,
): Promise<SymbolCandidate[]> {
  return safeInvoke(invokeTool, 'lsp_navigation', lspDocumentSymbolParams(file)).then((response) => {
    const payload = response?.symbols ?? response?.items ?? response?.result ?? response;
    const flattened = flattenDocumentSymbols(payload);
    return sortCandidates(
      flattened
        .map((item) => candidateFromDocumentSymbol(item, symbol, fileHint))
        .filter((candidate): candidate is SymbolCandidate => Boolean(candidate)),
    );
  });
}

function fetchWorkspaceSymbolCandidates(symbol: string, invokeTool: ToolInvoker, fileHint?: string): Promise<SymbolCandidate[]> {
  return safeInvoke(invokeTool, 'lsp_navigation', lspWorkspaceSymbolParams(symbol, fileHint)).then((response) => {
    const payload = response?.symbols ?? response?.items ?? response?.result ?? response;
    const items = coerceArray(payload);
    return sortCandidates(
      items
        .map((item) => candidateFromWorkspaceSymbol(item, symbol, fileHint))
        .filter((candidate): candidate is SymbolCandidate => Boolean(candidate)),
    );
  });
}

function candidateFromDocumentSymbol(item: DocumentSymbolLike, symbol: string, fileHint?: string): SymbolCandidate | null {
  const name = typeof item?.name === 'string' ? item.name : '';
  if (!name) return null;

  const range = normalizeRange(item.range ?? item.selectionRange ?? item.location?.range);
  const file = normalizeFilePath(item.location?.uri ?? item.location?.path ?? fileHint);
  if (!range || !file) return null;

  return {
    name,
    file,
    line: range.startLine,
    startLine: range.startLine,
    endLine: range.endLine,
    kind: normalizeSymbolKind(item.kind),
    matchKind: classifyNameMatch(name, symbol),
    hinted: Boolean(fileHint && file.includes(fileHint)),
  };
}

function candidateFromWorkspaceSymbol(item: WorkspaceSymbolLike, symbol: string, fileHint?: string): SymbolCandidate | null {
  const name = typeof item?.name === 'string' ? item.name : '';
  if (!name) return null;

  const range = normalizeRange(item.location?.range);
  const file = normalizeFilePath(item.location?.uri ?? item.location?.path);
  if (!range || !file) return null;

  return {
    name,
    file,
    line: range.startLine,
    startLine: range.startLine,
    endLine: range.endLine,
    kind: normalizeSymbolKind(item.kind),
    matchKind: classifyNameMatch(name, symbol),
    hinted: Boolean(fileHint && file.includes(fileHint)),
  };
}

function candidateFromAstMatch(item: any, symbol: string, fileHint?: string): SymbolCandidate | null {
  const file = normalizeFilePath(item?.file ?? item?.path ?? item?.uri);
  if (!file) return null;

  const startLine = normalizeLineNumber(item?.line ?? item?.startLine ?? item?.range?.start?.line ?? item?.start?.line);
  const endLine = normalizeLineNumber(item?.endLine ?? item?.range?.end?.line ?? item?.end?.line ?? startLine);
  const preview = typeof item?.preview === 'string'
    ? item.preview
    : typeof item?.text === 'string'
      ? item.text
      : typeof item?.match === 'string'
        ? item.match
        : '';
  const name = extractAstCandidateName(preview, symbol) ?? symbol;

  return {
    name,
    file,
    line: startLine,
    startLine,
    endLine: Math.max(startLine, endLine),
    kind: classifyDeclaration(preview, name) ?? 'const',
    matchKind: classifyNameMatch(name, symbol),
    hinted: Boolean(fileHint && file.includes(fileHint)),
  };
}

function referenceHitFromLspLocation(item: any, symbol: string, fileHint?: string): ReferenceCandidate | null {
  const location = normalizeLocation(item);
  const file = normalizeFilePath(location?.uri ?? location?.path ?? location?.file ?? location?.targetUri);
  const range = normalizeRange(location?.range ?? location?.targetSelectionRange ?? location?.targetRange);
  if (!file || !range) return null;

  let preview = '';
  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    preview = (lines[range.startLine - 1] ?? '').trim();
  } catch {
    preview = '';
  }

  return {
    file,
    line: range.startLine,
    character: normalizeCharacter(item?.character ?? location?.range?.start?.character ?? location?.targetSelectionRange?.start?.character),
    preview: preview ? (preview.length > 180 ? `${preview.slice(0, 177)}...` : preview) : undefined,
    matchKind: preview ? classifyReferenceMatchKind(preview, symbol) : 'exact',
    hinted: Boolean(fileHint && file.includes(fileHint)),
  };
}

function flattenDocumentSymbols(payload: unknown): DocumentSymbolLike[] {
  const items = coerceArray(payload);
  const output: DocumentSymbolLike[] = [];
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return;
    const symbol = entry as DocumentSymbolLike;
    output.push(symbol);
    for (const child of coerceArray(symbol.children)) visit(child);
  };
  for (const item of items) visit(item);
  return output;
}

function sortReferenceCandidates(candidates: ReferenceCandidate[]): ReferenceCandidate[] {
  return [...candidates].sort((left, right) => {
    const hintDelta = Number(right.hinted) - Number(left.hinted);
    if (hintDelta !== 0) return hintDelta;
    const matchDelta = matchScore(right.matchKind) - matchScore(left.matchKind);
    if (matchDelta !== 0) return matchDelta;
    if (left.file !== right.file) return left.file.localeCompare(right.file);
    return left.line - right.line;
  });
}

function sortCandidates(candidates: SymbolCandidate[]): SymbolCandidate[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((candidate) => {
      const key = `${candidate.file}:${candidate.startLine}:${candidate.endLine}:${candidate.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const hintDelta = Number(right.hinted) - Number(left.hinted);
      if (hintDelta !== 0) return hintDelta;
      const matchDelta = matchScore(right.matchKind) - matchScore(left.matchKind);
      if (matchDelta !== 0) return matchDelta;
      if (left.file !== right.file) return left.file.localeCompare(right.file);
      return left.line - right.line;
    });
}
