import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ReferenceHit, SymbolCandidate } from './types.ts';
import type { MatchKind } from './symbol-backends.ts';
import {
  classifyDeclaration,
  classifyMatchKind,
  classifyReferenceMatchKind,
  containsSymbolReference,
  findSymbolColumn,
  matchScore,
} from './symbol-normalization.ts';

interface ReferenceCandidate extends ReferenceHit {
  matchKind: MatchKind;
  hinted: boolean;
}

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);

export function findFileHintCandidates(symbol: string, fileHint: string): SymbolCandidate[] {
  const matches = resolveFileHint(fileHint);
  const candidates = matches.flatMap((file) => scanFileForSymbol(file, symbol));
  return sortCandidates(candidates);
}

export function findWorkspaceCandidates(symbol: string, fileHint?: string): SymbolCandidate[] {
  const root = process.cwd();
  const files = listWorkspaceSourceFiles(root);
  const scored = files.flatMap((file) => scanFileForSymbol(file, symbol, fileHint));
  return sortCandidates(scored);
}

export function scanReferences(symbol: string, fileHint: string | undefined, limit: number): ReferenceHit[] {
  const files = fileHint ? resolveFileHint(fileHint) : listWorkspaceSourceFiles(process.cwd());
  const candidates: ReferenceCandidate[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (!containsSymbolReference(line, symbol)) continue;
      const preview = line.trim();
      candidates.push({
        file,
        line: index + 1,
        character: findSymbolColumn(line, symbol),
        preview: preview.length > 180 ? `${preview.slice(0, 177)}...` : preview,
        matchKind: classifyReferenceMatchKind(line, symbol),
        hinted: Boolean(fileHint && file.includes(fileHint)),
      });
    }
  }

  return sortReferenceCandidates(candidates).slice(0, limit).map(({ matchKind: _matchKind, hinted: _hinted, ...hit }) => hit);
}

export function resolveFileHint(fileHint: string): string[] {
  const absoluteHint = resolve(process.cwd(), fileHint);
  try {
    const stats = statSync(absoluteHint);
    if (stats.isFile()) return [absoluteHint];
    if (stats.isDirectory()) return listWorkspaceSourceFiles(absoluteHint);
  } catch {
    // continue to fuzzy matching below
  }

  const root = process.cwd();
  const normalizedHint = fileHint.replace(/\\/g, '/');
  return listWorkspaceSourceFiles(root).filter((file) => relative(root, file).replace(/\\/g, '/').includes(normalizedHint));
}

export function listWorkspaceSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        visit(join(dir, entry.name));
        continue;
      }
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      files.push(join(dir, entry.name));
    }
  };
  visit(root);
  return files;
}

function scanFileForSymbol(file: string, symbol: string, fileHint?: string): SymbolCandidate[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const candidates: SymbolCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const declaration = classifyDeclaration(line, symbol);
    if (!declaration) continue;
    const matchKind = classifyMatchKind(line, symbol);
    const range = findBlockRange(lines, index + 1);
    candidates.push({
      name: symbol,
      file,
      line: index + 1,
      startLine: range.startLine,
      endLine: range.endLine,
      kind: declaration,
      matchKind,
      hinted: Boolean(fileHint && file.includes(fileHint)),
    });
  }

  return candidates;
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

function findBlockRange(lines: string[], lineNumber: number) {
  const declarationLine = lines[lineNumber - 1] ?? '';
  let braceBalance = countChar(declarationLine, '{') - countChar(declarationLine, '}');
  let endLine = lineNumber;

  if (braceBalance <= 0) {
    return { startLine: lineNumber, endLine: lineNumber };
  }

  for (let index = lineNumber; index < lines.length; index += 1) {
    const line = lines[index]!;
    braceBalance += countChar(line, '{') - countChar(line, '}');
    endLine = index + 1;
    if (braceBalance <= 0) break;
  }

  return { startLine: lineNumber, endLine };
}

function countChar(text: string, char: string) {
  return Array.from(text).filter((value) => value === char).length;
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
