export interface SymbolQuery {
  symbol: string;
  file?: string;
  includeBody?: boolean;
  contextLines?: number;
}

export interface DefinitionQuery {
  symbol: string;
  file?: string;
}

export interface ReferenceQuery {
  symbol: string;
  file?: string;
  limit?: number;
}

export interface SymbolLocation {
  file: string;
  line: number;
  character?: number;
  startLine?: number;
  endLine?: number;
  preview?: string;
  confidence?: 'high' | 'medium' | 'low';
  backend?: 'lsp' | 'ast' | 'fallback';
}

export interface SymbolCandidate {
  name: string;
  file: string;
  line: number;
  startLine: number;
  endLine: number;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'method';
  matchKind: 'exact' | 'case-insensitive' | 'partial';
  hinted: boolean;
}

export interface SymbolResult {
  symbol: string;
  location?: SymbolLocation;
  content: string;
  details: Record<string, unknown>;
}

export interface DefinitionResult {
  symbol: string;
  location?: SymbolLocation;
  content: string;
  details: Record<string, unknown> & {
    symbol?: string;
    file?: string;
    location?: SymbolLocation;
    backend?: 'lsp' | 'ast' | 'fallback';
    ok?: boolean;
    ambiguous?: boolean;
    candidates?: unknown;
    confidence?: 'high' | 'medium' | 'low';
    owningFile?: string;
    nextBestTool?: 'pi_lsp_get_symbol' | 'pi_lsp_find_references' | 'codesight_*' | 'read';
    nextBestReason?: string;
    nextBestArgs?: Record<string, unknown>;
    suggestedNextTool?: 'pi_lsp_get_symbol' | 'pi_lsp_find_references' | 'codesight_*' | 'read';
    suggestedNextReason?: string;
    suggestedNextArgs?: Record<string, unknown>;
    suggestedNextSteps?: string[];
    status?: 'resolved' | 'ambiguous' | 'not-found';
  };
}

export interface ReferenceHit {
  file: string;
  line: number;
  character?: number;
  preview?: string;
  confidence?: 'high' | 'medium' | 'low';
  backend?: 'lsp' | 'ast' | 'fallback';
  fallback?: boolean;
  previewPriority?: number;
  previewPriorityReason?: string;
}

export interface ReferenceFileGroup {
  file: string;
  count: number;
  confidence: 'high' | 'medium' | 'low';
  backend: 'lsp' | 'ast' | 'fallback';
  fallback: boolean;
  lines: Array<{
    line: number;
    character?: number;
    preview?: string;
    confidence?: 'high' | 'medium' | 'low';
    backend?: 'lsp' | 'ast' | 'fallback';
    fallback?: boolean;
    previewPriority?: number;
    previewPriorityReason?: string;
  }>;
  topPreview?: {
    line: number;
    character?: number;
    preview?: string;
    previewPriority?: number;
    previewPriorityReason?: string;
  };
  impactScore?: number;
  impactReason?: string;
}

export interface ReferenceResult {
  symbol: string;
  hits: ReferenceHit[];
  content: string;
  details: Record<string, unknown> & {
    symbol?: string;
    file?: string;
    limit?: number;
    hits?: ReferenceHit[];
    groupedHits?: ReferenceFileGroup[];
    backend?: 'lsp' | 'ast' | 'fallback';
    confidence?: 'high' | 'medium' | 'low';
    fallback?: boolean;
    source?: 'lsp' | 'scan';
    definitionBackend?: 'lsp' | 'ast' | 'fallback';
    definitionConfidence?: 'high' | 'medium' | 'low';
    definitionFallback?: boolean;
    ok?: boolean;
    owningFile?: string;
    nextBestTool?: 'pi_lsp_get_symbol' | 'pi_lsp_find_definition' | 'codesight_*' | 'read';
    nextBestReason?: string;
    nextBestArgs?: Record<string, unknown>;
    suggestedNextTool?: 'pi_lsp_get_symbol' | 'pi_lsp_find_definition' | 'codesight_*' | 'read';
    suggestedNextReason?: string;
    suggestedNextArgs?: Record<string, unknown>;
    suggestedNextSteps?: string[];
    bestNextCallerFile?: string;
    bestNextCallerReason?: string;
    bestNextReadArgs?: Record<string, unknown>;
    topImpactFiles?: Array<{
      file: string;
      impactScore: number;
      reason: string;
      count: number;
      topLine?: number;
      topPreview?: string;
    }>;
    status?: 'resolved' | 'not-found';
  };
}

export interface RankedItem {
  kind: 'file' | 'symbol';
  id: string;
  score: number;
  reason: string;
  file?: string;
}
