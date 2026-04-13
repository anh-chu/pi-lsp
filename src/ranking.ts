import { getState, setLastRankedItems } from './state.ts';
import type { RankedItem } from './types.ts';

export interface RankContextResult {
  items: RankedItem[];
  sessionState: {
    mentionedFiles: number;
    readFiles: number;
    queriedSymbols: number;
    hasConcreteEvidence: boolean;
  };
  query: string;
  note: string;
  guidance: string[];
  status: 'fresh-session' | 'ranked';
  confidence: 'low' | 'medium';
  shouldRerunAfterEvidence: boolean;
}

export function rankContext(query = '', limit = 10): RankContextResult {
  const state = getState();
  const items: RankedItem[] = [];

  // Ranking is intentionally session-aware. Benchmark baseline vs treatment
  // must therefore start from equivalent empty session state or use the same
  // reproducible reset procedure before each run.
  for (const file of state.mentionedFiles) {
    items.push({ kind: 'file', id: file, file, score: 8, reason: 'mentioned in conversation' });
  }

  for (const file of state.readFiles) {
    items.push({ kind: 'file', id: file, file, score: 5, reason: 'recently read' });
  }

  for (const symbol of state.queriedSymbols) {
    items.push({ kind: 'symbol', id: symbol, score: 5, reason: 'recently queried symbol' });
  }

  const queryText = query.trim();
  if (queryText) {
    items.push({ kind: 'symbol', id: queryText, score: 3, reason: 'current ranking query' });
  }

  const merged = new Map<string, RankedItem>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    const existing = merged.get(key);
    if (!existing || item.score > existing.score) merged.set(key, item);
  }

  const rankedItems = Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);

  setLastRankedItems(rankedItems);

  const sessionState = {
    mentionedFiles: state.mentionedFiles.length,
    readFiles: state.readFiles.length,
    queriedSymbols: state.queriedSymbols.length,
    hasConcreteEvidence: state.mentionedFiles.length + state.readFiles.length + state.queriedSymbols.length > 0,
  };

  if (!sessionState.hasConcreteEvidence) {
    return {
      items: [],
      sessionState,
      query: queryText,
      note: 'Fresh-session warning only. No files have been mentioned or read and no symbols have been queried in this run yet. Ranked items are intentionally withheld, and the query itself is not echoed back as a ranked candidate until some session evidence exists.',
      guidance: [
        'Do not treat this output as repo search or discovery.',
        'Inspect source first with read or codesight_* before using pi_lsp_rank_context.',
        'After reading a file, grounding a symbol, or mentioning a concrete file path, rerun ranking if prioritization is still useful.',
      ],
      status: 'fresh-session',
      confidence: 'low',
      shouldRerunAfterEvidence: true,
    };
  }

  return {
    items: rankedItems,
    sessionState,
    query: queryText,
    note: 'Session-memory ranking only. Results are limited to files and symbols already observed in this run.',
    guidance: [
      'Use this to prioritize already-seen files or symbols, not to discover the repo surface.',
      'If you still need repo-wide discovery, use read, codesight_*, or other repo tools.',
    ],
    status: 'ranked',
    confidence: 'medium',
    shouldRerunAfterEvidence: false,
  };
}
