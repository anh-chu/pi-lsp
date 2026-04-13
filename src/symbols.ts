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
  const ambiguous = symbolResult.details.ambiguous === true;
  const status: DefinitionResult['details']['status'] = ok ? 'resolved' : (ambiguous ? 'ambiguous' : 'not-found');
  const owningFile = location?.file;
  const nextBestTool = ok ? 'pi_lsp_get_symbol' : (ambiguous ? 'pi_lsp_get_symbol' : 'codesight_*');
  const nextBestArgs = ok
    ? { symbol: params.symbol, file: owningFile, includeBody: true }
    : (ambiguous ? { symbol: params.symbol, file: params.file } : { query: params.symbol });
  const nextBestReason = ok
    ? 'Definition grounded; jump straight to the implementation body.'
    : (ambiguous
        ? 'Multiple candidates remain; narrow the owning file before reading code.'
        : 'Exact symbol or owning file is still ungrounded.');
  const suggestedNextSteps = ok
    ? [
        'Call pi_lsp_get_symbol with the resolved file to read the definition body with minimal surrounding code.',
        'Then call pi_lsp_find_references if you need impact or caller tracing.',
      ]
    : (ambiguous
        ? [
            'Pass a narrower file hint to pi_lsp_get_symbol to choose the intended candidate.',
            'If the owning file is still unknown, use codesight_* for repo-level discovery first.',
          ]
        : [
            'Use codesight_* or current source to confirm the exact symbol name or file.',
            'Retry pi_lsp_find_definition only after the name is grounded exactly.',
          ]);

  return {
    symbol: params.symbol,
    location,
    content: formatCompactSection('Definition lookup', [
      `- symbol: ${params.symbol}` ,
      params.file ? `- file hint: ${params.file}` : '- file hint: none',
      `- backend: ${backend}` ,
      ok && location ? `- definition: ${location.file}:${location.line}` : '- definition: none',
      location?.confidence ? `- confidence: ${location.confidence}` : '- confidence: unknown',
      ambiguous ? '- ambiguity: multiple definition candidates found' : '- ambiguity: none',
      `- status: ${status}` ,
      ok
        ? '- next: call pi_lsp_get_symbol with the resolved file to read the exact implementation body'
        : (ambiguous
            ? '- next: pass a narrower file hint to pi_lsp_get_symbol or use codesight_* to disambiguate'
            : '- next: use codesight_* or current source to ground the exact symbol name before retrying'),
    ]),
    details: {
      symbol: params.symbol,
      file: params.file,
      location,
      backend,
      ok,
      ambiguous,
      candidates: symbolResult.details.candidates,
      confidence: symbolResult.location?.confidence,
      owningFile,
      nextBestTool,
      nextBestReason,
      nextBestArgs,
      suggestedNextTool: nextBestTool,
      suggestedNextReason: nextBestReason,
      suggestedNextArgs: nextBestArgs,
      suggestedNextSteps,
      status,
    },
  };
}

export async function findReferences(params: ReferenceQuery, options: ResolutionOptions = {}): Promise<ReferenceResult> {
  // These lookups intentionally update session memory used later by rankContext.
  // Benchmarks that compare baseline vs treatment should isolate runs with fresh
  // sessions or an equivalent reset so prior symbol/navigation history does not leak.
  rememberQueriedSymbol(params.symbol);
  if (params.file) rememberMentionedFile(params.file);

  const symbol = params.symbol.trim();
  const limit = params.limit ?? 20;
  if (!symbol) {
    return {
      symbol: params.symbol,
      hits: [],
      content: formatCompactSection('Reference lookup failed', [
        '- reason: symbol name was empty after trimming',
        '- next: pass one exact grounded symbol name before asking for references',
      ]),
      details: {
        symbol: params.symbol,
        file: params.file,
        limit,
        hits: [],
        backend: 'fallback',
        ok: false,
        status: 'not-found',
        suggestedNextTool: 'codesight_*',
        suggestedNextReason: 'Ground the exact symbol name or file before tracing usages.',
        suggestedNextArgs: { query: params.symbol },
        suggestedNextSteps: [
          'Confirm the exact symbol name from current source or repo context.',
          'Retry pi_lsp_find_references with one grounded symbol name.',
        ],
      },
    };
  }

  const resolution = await resolveReferences(symbol, params.file, limit, async (resolvedSymbol, fileHint, invokeTool) => {
    return findDefinition({ symbol: resolvedSymbol, file: fileHint }, { invokeTool });
  }, options.invokeTool);
  const hits = resolution.hits;
  for (const hit of hits) rememberReadFile(hit.file);
  const groupedHits = groupReferenceHits(hits, resolution.backend, resolution.fallback, resolution.confidence);
  const ok = hits.length > 0;
  const status: ReferenceResult['details']['status'] = ok ? 'resolved' : 'not-found';
  const bestNextCaller = groupedHits[0];
  const owningFile = bestNextCaller?.file ?? params.file;
  const nextBestTool = ok ? 'pi_lsp_get_symbol' : 'pi_lsp_find_definition';
  const nextBestArgs = ok
    ? { symbol, file: owningFile, includeBody: false }
    : { symbol, file: params.file };
  const nextBestReason = ok
    ? 'Best caller file is grounded; inspect one exact usage or callee next.'
    : 'Definition is not grounded yet; resolve the owning file before tracing callers.';
  const topImpactFiles = groupedHits.slice(0, 3).map((group) => ({
    file: group.file,
    impactScore: group.impactScore ?? 0,
    reason: group.impactReason ?? 'grounded grouped reference hits',
    count: group.count,
    topLine: group.topPreview?.line,
    topPreview: group.topPreview?.preview,
  }));
  const bestNextReadArgs = ok
    ? {
        file: bestNextCaller?.file ?? params.file,
        startLine: bestNextCaller?.topPreview?.line ?? bestNextCaller?.lines[0]?.line,
      }
    : undefined;
  const bestNextCallerReason = ok
    ? (bestNextCaller?.impactReason ?? 'Highest-impact grounded caller file from grouped references.')
    : undefined;
  const suggestedNextSteps = ok
    ? [
        'Start with the best next caller file first for compound tasks, then widen only if needed.',
        'Prefer the top preview line in that file before reading more surrounding code.',
        'Use the remaining impact files as secondary follow-up sites if the first caller is not enough.',
      ]
    : [
        'Call pi_lsp_find_definition first to verify the exact symbol and owning file.',
        'If names are still uncertain, use codesight_* for repo-level discovery before retrying references.',
      ];

  return {
    symbol,
    hits,
    content: formatCompactSection('Reference lookup', [
      `- symbol: ${symbol}` ,
      params.file ? `- file scope: ${params.file}` : '- file scope: workspace',
      `- backend: ${resolution.backend}` ,
      `- confidence: ${resolution.confidence}` ,
      `- fallback: ${resolution.fallback ? 'yes' : 'no'}` ,
      resolution.definitionBackend ? `- definition backend: ${resolution.definitionBackend}` : '- definition backend: none',
      resolution.definitionConfidence ? `- definition confidence: ${resolution.definitionConfidence}` : '- definition confidence: n/a',
      `- limit: ${limit}` ,
      `- hits: ${hits.length}` ,
      `- files: ${groupedHits.length}` ,
      ok && bestNextCaller ? `- best next caller file: ${bestNextCaller.file}` : '- best next caller file: none',
      ok && bestNextCallerReason ? `- best next caller reason: ${bestNextCallerReason}` : '- best next caller reason: n/a',
      ...topImpactFiles.map((item, index) => `- top likely impact ${index + 1}: ${item.file} (impact=${item.impactScore}, hits=${item.count}${item.topLine ? `, top line=${item.topLine}` : ''}) — ${item.reason}${item.topPreview ? ` — ${item.topPreview}` : ''}`),
      ...formatReferenceGroups(groupedHits),
      ok
        ? '- status: references resolved with prioritized caller previews'
        : '- status: no references found; verify the exact symbol or definition first',
      ok
        ? '- next: inspect the best next caller file with pi_lsp_get_symbol or a small targeted read'
        : '- next: call pi_lsp_find_definition first, or use codesight_* if the symbol/path is still not grounded',
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
      ok,
      owningFile,
      nextBestTool,
      nextBestReason,
      nextBestArgs,
      suggestedNextTool: nextBestTool,
      suggestedNextReason: nextBestReason,
      suggestedNextArgs: nextBestArgs,
      suggestedNextSteps,
      bestNextCallerFile: bestNextCaller?.file,
      bestNextCallerReason,
      bestNextReadArgs,
      topImpactFiles,
      status,
    },
  };
}
export async function getSymbolSlice(params: SymbolQuery, options: ResolutionOptions = {}): Promise<SymbolResult> {
  // These lookups intentionally update session memory used later by rankContext.
  // Benchmarks that compare baseline vs treatment should isolate runs with fresh
  // sessions or an equivalent reset so prior symbol/navigation history does not leak.
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
      '- likely cause: guessed or approximate symbol name did not match current source exactly',
      '- next: verify exact exported symbol name from current source before retrying; do not keep guessing variants of the name',
      '- hint: use codesight_* for fresh repo/path discovery, and reserve pi_lsp_* for exact symbol or caller follow-up once names are grounded',
    ]),
    details: {
      symbol: exactQuery,
      file: params.file,
      backend: options.invokeTool ? 'ast' : 'fallback',
      ok: false,
      ambiguous: false,
      likelyCause: 'inexact-symbol-name',
      suggestedNextSteps: [
        'Verify the exact symbol name from current source before retrying; do not keep guessing variants.',
        'Use codesight_* first for repo-level discovery when the symbol/path is not yet grounded.',
        'Retry pi_lsp_get_symbol with an exact symbol name or a narrower file hint.',
      ],
    },
  };
}

