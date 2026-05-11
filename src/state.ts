import type { NavigationIntent, RankedItem, SessionRelationship, ToolRouteFamily } from './types.ts';

export interface PiLspSessionState {
  mentionedFiles: string[];
  readFiles: string[];
  queriedSymbols: string[];
  lastRankedItems: RankedItem[];
  lastResolvedDefinition?: {
    symbol: string;
    file: string;
    line: number;
    character?: number;
  };
  lastTopCallerFiles: Array<{
    file: string;
    reason?: string;
    line?: number;
  }>;
  lastPlannerResult?: {
    intent: NavigationIntent;
    route: ToolRouteFamily;
    nextTool?: string;
  };
  symbolRelationships: SessionRelationship[];
}

const state: PiLspSessionState = {
  mentionedFiles: [],
  readFiles: [],
  queriedSymbols: [],
  lastRankedItems: [],
  lastTopCallerFiles: [],
  symbolRelationships: [],
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

export function setLastResolvedDefinition(definition: PiLspSessionState['lastResolvedDefinition'] | undefined) {
  state.lastResolvedDefinition = definition;
}

export function setLastTopCallerFiles(files: PiLspSessionState['lastTopCallerFiles']) {
  state.lastTopCallerFiles = files;
}

export function setLastPlannerResult(result: PiLspSessionState['lastPlannerResult'] | undefined) {
  state.lastPlannerResult = result;
}

export function recordSymbolRelationship(relationship: SessionRelationship) {
  const exists = state.symbolRelationships.some(
    (r) => r.fromSymbol === relationship.fromSymbol &&
           r.toSymbol === relationship.toSymbol &&
           r.fromFile === relationship.fromFile &&
           r.toFile === relationship.toFile &&
           r.relationType === relationship.relationType,
  );
  if (!exists) state.symbolRelationships.push(relationship);
}

export function getSymbolRelationships(): SessionRelationship[] {
  return [...state.symbolRelationships];
}

export function resetState() {
  state.mentionedFiles = [];
  state.readFiles = [];
  state.queriedSymbols = [];
  state.lastRankedItems = [];
  state.lastResolvedDefinition = undefined;
  state.lastTopCallerFiles = [];
  state.lastPlannerResult = undefined;
  state.symbolRelationships = [];
}
