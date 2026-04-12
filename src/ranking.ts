import { getState, setLastRankedItems } from './state.ts';
import type { RankedItem } from './types.ts';

export function rankContext(query = '', limit = 10): RankedItem[] {
  const state = getState();
  const items: RankedItem[] = [];

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

  const result = Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);

  setLastRankedItems(result);
  return result;
}
