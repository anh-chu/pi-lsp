import { formatCompactSection } from './format.ts';
import { rankContext } from './ranking.ts';
import { findDefinition, findReferences, getSymbolSlice } from './symbols.ts';
import { buildCacheKey, getFileMtimeMs, readFreshCache, setCache } from './cache.ts';
import type { DefinitionQuery, DefinitionResult, ReferenceQuery, ReferenceResult } from './types.ts';

function createPiToolInvoker(pi: any) {
  if (typeof pi?.invokeTool !== 'function' && typeof pi?.callTool !== 'function' && typeof pi?.runTool !== 'function') {
    return undefined;
  }

  return async (toolName: string, params: Record<string, unknown>) => {
    if (typeof pi?.invokeTool === 'function') return await pi.invokeTool(toolName, params);
    if (typeof pi?.callTool === 'function') return await pi.callTool(toolName, params);
    if (typeof pi?.runTool === 'function') return await pi.runTool(toolName, params);
    return null;
  };
}

const DEFINITION_CACHE_PREFIX = 'symbol:def';
const REFERENCES_CACHE_PREFIX = 'symbol:refs';

function textResult(content: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text: content }],
    details,
  };
}

async function buildDefinitionResult(params: DefinitionQuery, pi: any): Promise<DefinitionResult> {
  const cacheKey = buildCacheKey(DEFINITION_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<DefinitionResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await findDefinition(params, { invokeTool: createPiToolInvoker(pi) });
  setCache(cacheKey, result, fileMtime);
  return result;
}

async function buildReferenceResult(params: ReferenceQuery, pi: any): Promise<ReferenceResult> {
  const limit = params.limit ?? 20;
  const cacheKey = buildCacheKey(REFERENCES_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
    limit,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<ReferenceResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await findReferences(params, { invokeTool: createPiToolInvoker(pi) });
  setCache(cacheKey, result, fileMtime);
  return result;
}

export function registerPiLspTools(pi: any) {
  pi.registerTool({
    name: 'pi_lsp_get_symbol',
    label: 'Pi LSP Get Symbol',
    description: 'Read one exact grounded symbol definition with minimal code, plus jump-ready next-step hints for follow-up tracing',
    promptSnippet: 'Read one grounded symbol definition with minimal surrounding code',
    promptGuidelines: [
      'Use this tool after the exact function/class/type name is grounded from current source or repo context.',
      'Prefer this over plain read once you know the exact symbol name, because it returns a minimal definition slice plus exact location/confidence and jump-ready next-step args.',
      'If exact symbol name is still uncertain, do not guess variants; use codesight_* or read current source first, then retry with a precise name or file hint.',
      'If returned definition slice already answers the request, stop and answer immediately instead of taking another hop.',
      'Use returned nextBestTool/nextBestArgs only when the task explicitly requires deeper tracing beyond this symbol body.',
    ],
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name like runRefresh or UserService' },
        file: { type: 'string', description: 'Optional file path hint to narrow lookup' },
        includeBody: { type: 'boolean', description: 'If true, include full definition body when possible' },
        contextLines: { type: 'number', description: 'Extra lines around symbol', minimum: 0, maximum: 50 },
      },
      required: ['symbol'],
    },
    execute: async (_toolCallId: string, params: { symbol: string; file?: string; includeBody?: boolean; contextLines?: number }) => {
      const result = await getSymbolSlice(params, { invokeTool: createPiToolInvoker(pi) });
      return textResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'pi_lsp_find_definition',
    label: 'Pi LSP Find Definition',
    description: 'Find the exact definition location for a grounded symbol, with jump-ready next-step guidance for implementation reads',
    promptSnippet: 'Find where a grounded symbol is defined',
    promptGuidelines: [
      'Use this after the exact symbol name is known.',
      'Prefer this over plain read when you only need the owning file/line first; it returns exact location/confidence plus nextBestTool/nextBestArgs for the next jump.',
      'Prefer codesight_* first for repo-level discovery or when you only know a feature area, route surface, schema area, or package name.',
      'If returned location already answers the request, answer immediately instead of chaining another pi_lsp_* call.',
      'Do not follow nextBestTool automatically on simple lookup questions; use one precise pi_lsp_* call first and chain only when deeper tracing is required.',
    ],
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol to resolve' },
        file: { type: 'string', description: 'Optional file hint' },
      },
      required: ['symbol'],
    },
    execute: async (_toolCallId: string, params: DefinitionQuery) => {
      const result = await buildDefinitionResult(params, pi);
      return textResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'pi_lsp_find_references',
    label: 'Pi LSP Find References',
    description: 'Find grounded symbol usages with grouped hits, prioritized caller files, and jump-ready next-step hints',
    promptSnippet: 'Find references or usages of a grounded symbol',
    promptGuidelines: [
      'Use this when tracing impact for an exact grounded symbol at code level.',
      'Prefer this over grep or broad read once the symbol is exact, because it groups usages, prioritizes likely caller files, and returns nextBestTool/nextBestArgs for the best next hop.',
      'Do not use this as a first-pass repo exploration tool; prefer codesight_* first when callers or names are still unknown.',
      'If grouped hits already answer a simple "where used?" question, stop and answer without taking another hop.',
      'Do not follow nextBestTool automatically on simple lookup questions; start with one precise pi_lsp_* call and chain only when the task explicitly asks for deeper tracing or caller inspection.',
    ],
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol to find usages for' },
        file: { type: 'string', description: 'Optional file hint' },
        limit: { type: 'number', description: 'Maximum number of matches', minimum: 1, maximum: 100 },
      },
      required: ['symbol'],
    },
    execute: async (_toolCallId: string, params: ReferenceQuery) => {
      const result = await buildReferenceResult(params, pi);
      return textResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'pi_lsp_rank_context',
    label: 'Pi LSP Rank Context',
    description: 'Prioritize files and symbols already observed in this session; never use for first-step repo discovery',
    promptSnippet: 'Prioritize already-seen session context for the current task',
    promptGuidelines: [
      'Use this only after concrete session evidence exists from this run, such as read files, mentioned files, or grounded symbol lookups.',
      'Do not use this as a first-step repo exploration tool in a fresh session. It ranks session memory only and cannot discover unseen code.',
      'If session evidence counts are all zero, inspect source with read or codesight_* first, then rerun ranking only if you need prioritization.',
      'Treat any fresh-session result as a warning state that should delay ranking until after evidence exists.',
    ],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Task or question to prioritize already-seen context for' },
        limit: { type: 'number', description: 'Maximum number of ranked items', minimum: 1, maximum: 20 },
      },
    },
    execute: async (_toolCallId: string, params: { query?: string; limit?: number }) => {
      const result = rankContext(params.query ?? '', params.limit ?? 10);
      return textResult(
        formatCompactSection(
          result.sessionState.hasConcreteEvidence ? 'Session context ranking' : 'Fresh-session warning',
          [
            `- query: ${result.query || '(empty)'}`,
            `- session files mentioned: ${result.sessionState.mentionedFiles}`,
            `- session files read: ${result.sessionState.readFiles}`,
            `- session symbols queried: ${result.sessionState.queriedSymbols}`,
            `- concrete session evidence: ${result.sessionState.hasConcreteEvidence ? 'yes' : 'no'}`,
            `- status: ${result.status}`,
            `- confidence: ${result.confidence}`,
            `- rerun after evidence: ${result.shouldRerunAfterEvidence ? 'recommended' : 'not needed'}`,
            `- note: ${result.note}`,
            ...result.guidance.map((line) => `- guidance: ${line}`),
            ...(result.items.length > 0
              ? result.items.map((item) => `- ${item.kind}: ${item.id} (${item.score}) — ${item.reason}`)
              : [
                  result.sessionState.hasConcreteEvidence
                    ? '- ranked items: none yet'
                    : '- ranked items: withheld until some session evidence exists',
                ]),
          ],
        ),
        {
          query: result.query,
          items: result.items,
          sessionState: result.sessionState,
          note: result.note,
          guidance: result.guidance,
          status: result.status,
          confidence: result.confidence,
          shouldRerunAfterEvidence: result.shouldRerunAfterEvidence,
          freshSession: !result.sessionState.hasConcreteEvidence,
        }
      );
    },
  });
}
