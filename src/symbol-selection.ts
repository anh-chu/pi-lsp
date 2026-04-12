import { sliceSymbolFromFile } from './slices.ts';
import { formatCompactSection } from './format.ts';
import type { SymbolCandidate, SymbolResult } from './types.ts';
import type { BackendName } from './symbol-backends.ts';
import { matchScore } from './symbol-normalization.ts';

interface ResolvedSlice {
  candidate: SymbolCandidate;
  content: string;
  location: {
    file: string;
    line: number;
    startLine: number;
    endLine: number;
    confidence: 'high' | 'medium' | 'low';
    backend: BackendName;
  };
}

export function selectBestResult(
  symbol: string,
  candidates: SymbolCandidate[],
  includeBody: boolean,
  contextLines: number,
  backend: BackendName,
  rememberReadFile: (file: string) => void,
  fileHint?: string,
): SymbolResult | null {
  const exactHinted = candidates.filter((candidate) => candidate.matchKind === 'exact' && candidate.hinted);
  if (exactHinted.length === 1) {
    return makeResolvedResult(exactHinted[0], includeBody, contextLines, backend, true, rememberReadFile);
  }
  if (exactHinted.length > 1) {
    return makeAmbiguousResult(symbol, exactHinted, backend, true, fileHint);
  }

  const exactCandidates = candidates.filter((candidate) => candidate.matchKind === 'exact');
  if (exactCandidates.length === 1) {
    return makeResolvedResult(exactCandidates[0], includeBody, contextLines, backend, false, rememberReadFile);
  }
  if (exactCandidates.length > 1) {
    return makeAmbiguousResult(symbol, exactCandidates, backend, false, fileHint);
  }

  const fallbackCandidates = candidates.filter((candidate) => candidate.matchKind !== 'exact');
  if (fallbackCandidates.length === 1) {
    return makeResolvedResult(fallbackCandidates[0], includeBody, contextLines, backend, Boolean(fileHint), rememberReadFile);
  }
  if (fallbackCandidates.length > 1) {
    return makeAmbiguousResult(symbol, fallbackCandidates, backend, Boolean(fileHint), fileHint);
  }

  return null;
}

function makeResolvedResult(
  candidate: SymbolCandidate,
  includeBody: boolean,
  contextLines: number,
  backend: BackendName,
  narrowedByFile: boolean,
  rememberReadFile: (file: string) => void,
): SymbolResult {
  const resolved = resolveCandidateSlice(candidate, includeBody, contextLines, backend);
  rememberReadFile(resolved.location.file);
  return {
    symbol: candidate.name,
    location: resolved.location,
    content: resolved.content,
    details: {
      symbol: candidate.name,
      file: resolved.location.file,
      line: resolved.location.line,
      startLine: resolved.location.startLine,
      endLine: resolved.location.endLine,
      confidence: resolved.location.confidence,
      backend,
      ambiguous: false,
      narrowedByFile,
    },
  };
}

function makeAmbiguousResult(symbol: string, candidates: SymbolCandidate[], backend: BackendName, narrowedByFile: boolean, fileHint?: string): SymbolResult {
  const sorted = sortCandidates(candidates).slice(0, 8);
  return {
    symbol,
    content: formatCompactSection('Symbol lookup ambiguous', [
      `- symbol: ${symbol}`,
      fileHint ? `- file hint: ${fileHint}` : '- file hint: none',
      ...sorted.map((candidate) => `- candidate: ${candidate.file}:${candidate.line} (${candidate.kind})`),
      '- next: pass a more specific file hint',
    ]),
    details: {
      symbol,
      file: fileHint,
      backend,
      ok: false,
      ambiguous: true,
      narrowedByFile,
      candidates: sorted.map((candidate) => ({
        file: candidate.file,
        line: candidate.line,
        kind: candidate.kind,
        matchKind: candidate.matchKind,
      })),
    },
  };
}

function resolveCandidateSlice(candidate: SymbolCandidate, includeBody: boolean, contextLines: number, backend: BackendName): ResolvedSlice {
  const slice = sliceSymbolFromFile(candidate.file, {
    line: candidate.line,
    startLine: candidate.startLine,
    endLine: includeBody ? candidate.endLine : candidate.line,
    contextLines,
    includeBody,
  });

  return {
    candidate,
    content: slice.content,
    location: {
      file: candidate.file,
      line: candidate.line,
      startLine: slice.startLine,
      endLine: slice.endLine,
      confidence: candidate.matchKind === 'exact' ? 'high' : 'medium',
      backend,
    },
  };
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
