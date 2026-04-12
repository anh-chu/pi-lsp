import { optionsAwareFallbackBackend } from './symbol-normalization.ts';
import { findLspReferences, type BackendName, type ToolInvoker } from './symbol-backends.ts';
import { scanReferences } from './symbol-fallback.ts';
import type { DefinitionResult, ReferenceResult, SymbolLocation } from './types.ts';

export interface ReferenceResolution {
  hits: ReferenceResult['hits'];
  backend: BackendName;
  fallback: boolean;
  confidence: 'high' | 'medium' | 'low';
  source: 'lsp' | 'scan';
  definitionBackend?: BackendName;
  definitionConfidence?: 'high' | 'medium' | 'low';
  definitionFallback?: boolean;
}

export interface DefinitionLocationResolver {
  (symbol: string, fileHint: string | undefined, invokeTool?: ToolInvoker): Promise<DefinitionResult>;
}

export async function resolveReferences(
  symbol: string,
  fileHint: string | undefined,
  limit: number,
  resolveDefinition: DefinitionLocationResolver,
  invokeTool?: ToolInvoker,
): Promise<ReferenceResolution> {
  const definition = await resolveDefinition(symbol, fileHint, invokeTool);
  const definitionLocation = (definition.location ?? definition.details.location) as SymbolLocation | undefined;
  const definitionBackend = (definition.details.backend as BackendName | undefined) ?? 'fallback';
  const definitionConfidence = (definition.details.confidence as 'high' | 'medium' | 'low' | undefined)
    ?? definition.location?.confidence
    ?? (definitionLocation?.file ? 'medium' : 'low');
  const definitionFallback = definitionBackend !== 'lsp';

  const lspHits = await findLspReferences(
    symbol,
    fileHint,
    limit,
    async () => (definitionLocation?.file && typeof definitionLocation.line === 'number' ? definitionLocation : null),
    invokeTool,
  );

  if (lspHits) {
    return {
      hits: lspHits.map((hit) => ({
        ...hit,
        confidence: definitionFallback ? 'medium' : 'high',
        backend: 'lsp',
        fallback: definitionFallback,
      })),
      backend: 'lsp',
      fallback: definitionFallback,
      confidence: definitionFallback ? 'medium' : 'high',
      source: 'lsp',
      definitionBackend,
      definitionConfidence,
      definitionFallback,
    };
  }

  return {
    hits: scanReferences(symbol, fileHint, limit).map((hit) => ({
      ...hit,
      confidence: fileHint ? 'medium' : 'low',
      backend: optionsAwareFallbackBackend(invokeTool),
      fallback: true,
    })),
    backend: optionsAwareFallbackBackend(invokeTool),
    fallback: true,
    confidence: fileHint ? 'medium' : 'low',
    source: 'scan',
    definitionBackend,
    definitionConfidence,
    definitionFallback,
  };
}
