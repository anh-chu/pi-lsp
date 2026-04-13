import type { RankedItem } from './types.ts';

export interface PiLspSessionState {
  mentionedFiles: string[];
  readFiles: string[];
  queriedSymbols: string[];
  lastRankedItems: RankedItem[];
}

const state: PiLspSessionState = {
  mentionedFiles: [],
  readFiles: [],
  queriedSymbols: [],
  lastRankedItems: [],
};

export function getState() {
  return state;
}

export function rememberMentionedFile(file: string) {
  if (!state.mentionedFiles.includes(file)) state.mentionedFiles.push(file);
}

export function rememberReadFile(file: string) {
  if (!state.readFiles.includes(file)) state.readFiles.push(file);
}

export function rememberQueriedSymbol(symbol: string) {
  if (!state.queriedSymbols.includes(symbol)) state.queriedSymbols.push(symbol);
}

export function setLastRankedItems(items: RankedItem[]) {
  state.lastRankedItems = items;
}

export function resetState() {
  state.mentionedFiles = [];
  state.readFiles = [];
  state.queriedSymbols = [];
  state.lastRankedItems = [];
}
