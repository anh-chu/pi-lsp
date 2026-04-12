import { formatCompactSection } from './format.ts';
import { groupReferenceHits, formatReferenceGroups } from './reference-format.ts';
import {
  findAstCandidates,
  findLspCandidates,
} from './symbol-backends.ts';
import { rememberMentionedFile, rememberQueriedSymbol, rememberReadFile } from './state.ts';
import { selectBestResult } from './symbol-selection.ts';
import { resolveReferences } from './symbol-reference-resolution.ts';
import type { DefinitionQuery, DefinitionResult, ReferenceQuery, ReferenceResult, SymbolQuery, SymbolResult } from './types.ts';
import type { BackendName, ToolInvoker } from './symbol-backends.ts';

interface ResolutionOptions {
  invokeTool?: ToolInvoker;
}

export async function findDefinition(params: DefinitionQuery, options: ResolutionOptions = {}): Promise<DefinitionResult> {
  const symbolResult = await getSymbolSlice({
    symbol: params.symbol,
    file: params.file,
    includeBody: false,
    contextLines: 0,
  }, options);

  const location = symbolResult.location;
  const backend = (symbolResult.details.backend as BackendName | undefined) ?? 'fallback';
  const ok = Boolean(location);

  return {
    symbol: params.symbol,
    location,
    content: formatCompactSection('Definition lookup', [
      `- symbol: ${params.symbol}`,
      params.file ? `- file hint: ${params.file}` : '- file hint: none',
      `- backend: ${backend}`,
      ok && location ? `- definition: ${location.file}:${location.line}` : '- status: no definition found',
      symbolResult.details.ambiguous === true ? '- status: multiple definition candidates found' : '- ambiguity: none',
    ]),
    details: {
      symbol: params.symbol,
      file: params.file,
      location,
      backend,
      ok,
      ambiguous: symbolResult.details.ambiguous === true,
      candidates: symbolResult.details.candidates,
      confidence: symbolResult.location?.confidence,
    },
  };
}

export async function findReferences(params: ReferenceQuery, options: ResolutionOptions = {}): Promise<ReferenceResult> {
  rememberQueriedSymbol(params.symbol);
  if (params.file) rememberMentionedFile(params.file);

  const symbol = params.symbol.trim();
  const limit = params.limit ?? 20;
  if (!symbol) {
    return {
      symbol: params.symbol,
      hits: [],
      content: formatCompactSection('Reference lookup failed', ['- reason: symbol name was empty after trimming']),
      details: {
        symbol: params.symbol,
        file: params.file,
        limit,
        hits: [],
        backend: 'fallback',
        ok: false,
      },
    };
  }

  const resolution = await resolveReferences(symbol, params.file, limit, async (resolvedSymbol, fileHint, invokeTool) => {
    return findDefinition({ symbol: resolvedSymbol, file: fileHint }, { invokeTool });
  }, options.invokeTool);
  const hits = resolution.hits;
  for (const hit of hits) rememberReadFile(hit.file);
  const groupedHits = groupReferenceHits(hits, resolution.backend, resolution.fallback, resolution.confidence);

  return {
    symbol,
    hits,
    content: formatCompactSection('Reference lookup', [
      `- symbol: ${symbol}`,
      params.file ? `- file scope: ${params.file}` : '- file scope: workspace',
      `- backend: ${resolution.backend}`,
      `- confidence: ${resolution.confidence}`,
      `- fallback: ${resolution.fallback ? 'yes' : 'no'}`,
      resolution.definitionBackend ? `- definition backend: ${resolution.definitionBackend}` : '- definition backend: none',
      resolution.definitionConfidence ? `- definition confidence: ${resolution.definitionConfidence}` : '- definition confidence: n/a',
      `- limit: ${limit}`,
      `- hits: ${hits.length}`,
      `- files: ${groupedHits.length}`,
      ...formatReferenceGroups(groupedHits),
      hits.length === 0 ? '- status: no references found' : '- status: references resolved',
    ]),
    details: {
      symbol,
      file: params.file,
      limit,
      hits,
      groupedHits,
      backend: resolution.backend,
      confidence: resolution.confidence,
      fallback: resolution.fallback,
      source: resolution.source,
      definitionBackend: resolution.definitionBackend,
      definitionConfidence: resolution.definitionConfidence,
      definitionFallback: resolution.definitionFallback,
      ok: hits.length > 0,
    },
  };
}

export async function getSymbolSlice(params: SymbolQuery, options: ResolutionOptions = {}): Promise<SymbolResult> {
  rememberQueriedSymbol(params.symbol);
  if (params.file) rememberMentionedFile(params.file);

  const contextLines = params.contextLines ?? 12;
  const includeBody = params.includeBody ?? true;
  const exactQuery = params.symbol.trim();
  if (!exactQuery) {
    return {
      symbol: params.symbol,
      content: formatCompactSection('Symbol lookup failed', ['- reason: symbol name was empty after trimming']),
      details: {
        symbol: params.symbol,
        file: params.file,
        backend: 'fallback',
        ok: false,
      },
    };
  }

  const lspCandidates = await findLspCandidates(exactQuery, params.file, options.invokeTool);
  const lspResult = selectBestResult(exactQuery, lspCandidates, includeBody, contextLines, options.invokeTool ? 'lsp' : 'fallback', rememberReadFile, params.file);
  if (lspResult) return lspResult;

  const astCandidates = await findAstCandidates(exactQuery, params.file, options.invokeTool);
  const astResult = selectBestResult(exactQuery, astCandidates, includeBody, contextLines, options.invokeTool ? 'ast' : 'fallback', rememberReadFile, params.file);
  if (astResult) return astResult;

  return {
    symbol: exactQuery,
    content: formatCompactSection('Symbol lookup failed', [
      `- symbol: ${exactQuery}`,
      params.file ? `- file hint: ${params.file}` : '- file hint: none',
      '- result: no exact definition candidate found',
      '- next: provide a narrower file hint or try definition/references lookup',
    ]),
    details: {
      symbol: exactQuery,
      file: params.file,
      backend: options.invokeTool ? 'ast' : 'fallback',
      ok: false,
      ambiguous: false,
    },
  };
}

