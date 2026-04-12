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
    description: 'Read one symbol definition with minimal surrounding code',
    promptSnippet: 'Read one symbol definition with minimal surrounding code',
    promptGuidelines: [
      'Use this tool when exact function/class/type is needed instead of whole-file reads.',
      'Prefer this before reading large files.',
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
    description: 'Find where a symbol is defined',
    promptSnippet: 'Find where a symbol is defined',
    promptGuidelines: ['Use this tool before tracing references or reading implementation.'],
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
    description: 'Find references or usages of a symbol',
    promptSnippet: 'Find references or usages of a symbol',
    promptGuidelines: ['Use this tool when tracing symbol impact at code level.'],
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
    description: 'Rank most relevant files and symbols for current task',
    promptSnippet: 'Rank most relevant files and symbols for current task',
    promptGuidelines: [
      'Use this tool in large repos or monorepos before broad exploration.',
      'Use when user asks what to inspect next.',
    ],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Task or question to rank context for' },
        limit: { type: 'number', description: 'Maximum number of ranked items', minimum: 1, maximum: 20 },
      },
    },
    execute: async (_toolCallId: string, params: { query?: string; limit?: number }) => {
      const items = rankContext(params.query ?? '', params.limit ?? 10);
      return textResult(
        formatCompactSection(
          'Ranked context',
          items.map((item) => `- ${item.kind}: ${item.id} (${item.score}) — ${item.reason}`),
        ),
        { query: params.query ?? '', items },
      );
    },
  });
}
