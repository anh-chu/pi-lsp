import { getState } from './state.ts';
import type { EvidenceSnapshot, PlannerQuery } from './types.ts';

export function snapshotNavigationEvidence(query: PlannerQuery): EvidenceSnapshot {
  const state = getState();
  const symbol = query.symbol ?? state.lastResolvedDefinition?.symbol ?? state.queriedSymbols.at(-1);
  const file = query.file ?? state.lastResolvedDefinition?.file ?? state.readFiles.at(-1) ?? state.mentionedFiles.at(-1);
  const hasConcreteEvidence = state.mentionedFiles.length + state.readFiles.length + state.queriedSymbols.length > 0;

  return {
    task: query.task,
    symbol,
    file,
    freshSession: !hasConcreteEvidence,
    hasConcreteEvidence,
    mentionedFiles: [...state.mentionedFiles],
    readFiles: [...state.readFiles],
    queriedSymbols: [...state.queriedSymbols],
    lastResolvedDefinition: state.lastResolvedDefinition,
    lastTopCallerFiles: [...state.lastTopCallerFiles],
    lastPlannerSummary: state.lastPlannerResult,
  };
}
