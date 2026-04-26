import { astGrepReplaceTool } from './tools/ast-grep-replace.ts';
import { astGrepSearchTool } from './tools/ast-grep-search.ts';
import { buildCacheKey, getFileMtimeMs, readFreshCache, setCache } from './cache.ts';
import { formatCompactSection } from './format.ts';
import { formatNavigationPlan } from './plan-format.ts';
import { planNavigation } from './navigation-planner.ts';
import { rankContext } from './ranking.ts';
import { createPiToolInvoker, textToolResult } from './shared-tool-invoker.ts';
import { findDefinition, findReferences, getSymbolSlice } from './symbols.ts';
import type { DefinitionQuery, DefinitionResult, PlannerQuery, ReferenceQuery, ReferenceResult } from './types.ts';

const DEFINITION_CACHE_PREFIX = 'symbol:def';
const REFERENCES_CACHE_PREFIX = 'symbol:refs';
const NAVIGATION_CACHE_PREFIX = 'nav:plan';

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

function buildNavigationPlanResult(params: PlannerQuery) {
  const cacheKey = buildCacheKey(NAVIGATION_CACHE_PREFIX, params as unknown as Record<string, unknown>);
  const cached = readFreshCache<ReturnType<typeof planNavigation>>(cacheKey);
  if (cached) return cached;
  const result = planNavigation(params);
  setCache(cacheKey, result);
  return result;
}

export function registerPiLspTools(pi: any) {
  pi.registerTool({
    name: 'code_nav_get_symbol',
    label: 'Pi LSP Get Symbol',
    description: 'Read one exact grounded symbol definition with minimal code, plus jump-ready next-step hints for follow-up tracing',
    promptSnippet: 'Read one grounded symbol definition with minimal surrounding code',
    promptGuidelines: [
      'Use code_nav_get_symbol after exact function, class, type, or method name is grounded from current source, repo context, or earlier navigation work inside same debugging, fix, or feature task.',
      'Prefer code_nav_get_symbol over plain read once exact symbol is known and current subtask is minimal implementation inspection, because it returns focused definition slice plus exact location metadata and next-step args.',
      'If exact symbol name is still uncertain, do not guess variants; use codesight_* or read current source first, then retry code_nav_get_symbol with precise name or file hint.',
      'If current file is already open and nearby lines answer subtask faster, plain read is still fine instead of code_nav_get_symbol.',
      'If code_nav_get_symbol already returned the definition slice, stop and answer immediately instead of taking another hop.'
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
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'code_nav_find_definition',
    label: 'Pi LSP Find Definition',
    description: 'Find exact definition location for grounded symbol, with jump-ready next-step guidance for implementation reads',
    promptSnippet: 'Find where grounded symbol is defined',
    promptGuidelines: [
      'Use code_nav_find_definition after exact symbol name is known during navigation work inside larger debug, fix, or implementation flow.',
      'Prefer code_nav_find_definition over plain read when current subtask is owning file or line resolution, because it returns exact location plus nextBestTool and nextBestArgs for jump-ready follow-up.',
      'Prefer codesight_* first for repo-level discovery or when you only know feature area, route surface, schema area, or package name; use code_nav_find_definition once symbol name is exact.',
      'If current file is already grounded and nearby lines reveal definition immediately, plain read is still fine instead of code_nav_find_definition.',
      'If code_nav_find_definition already returned the location, answer immediately instead of chaining another code_nav_* call.'
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
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'code_nav_find_references',
    label: 'Pi LSP Find References',
    description: 'Find grounded symbol usages with grouped hits, prioritized caller files, and jump-ready next-step hints',
    promptSnippet: 'Find references or usages of grounded symbol',
    promptGuidelines: [
      'Use code_nav_find_references when current navigation subtask is caller tracing, usage tracing, or impact discovery for exact grounded symbol at code level.',
      'Prefer code_nav_find_references over grep or broad read once symbol is exact, because it groups usages, prioritizes likely caller files, and returns nextBestTool and nextBestArgs for best next hop.',
      'Do not use code_nav_find_references as first-pass repo exploration tool; prefer codesight_* first when callers, subsystem, or symbol name are still unknown.',
      'If one already-open file answers subtask faster, plain read is still fine; use code_nav_find_references for cross-file usage tracing.',
      'If code_nav_find_references grouped hits already answer current subtask, stop and answer without taking another hop.'
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
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'code_nav_rank_context',
    label: 'Pi LSP Rank Context',
    description: 'Prioritize files and symbols already observed in this session; never use for first-step repo discovery',
    promptSnippet: 'Prioritize already-seen session context for current task',
    promptGuidelines: [
      'Use code_nav_rank_context only after concrete session evidence exists from this run, such as read files, mentioned files, or grounded symbol lookups.',
      'Do not use code_nav_rank_context as first-step repo exploration in a fresh session — it ranks session memory only and cannot discover unseen code.',
      'If session evidence counts are all zero, inspect source with read or codesight_* first, then call code_nav_rank_context only if prioritization is needed.',
      'Treat any code_nav_rank_context fresh-session result as a warning state — delay ranking until after evidence exists.',
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
      return textToolResult(
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
              : [result.sessionState.hasConcreteEvidence ? '- ranked items: none yet' : '- ranked items: withheld until some session evidence exists']),
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
        },
      );
    },
  });

  pi.registerTool({
    name: 'code_nav_plan_navigation',
    label: 'Code Nav Plan Navigation',
    description: 'Plan next 1-4 navigation hops, choosing among codesight_*, code_nav_*, raw lsp_navigation, read, or answer-now',
    promptSnippet: 'Plan next navigation hop for compound code task',
    promptGuidelines: [
      'Use code_nav_plan_navigation as front door for compound code navigation inside broad debug, fix, and feature tasks once agent needs to choose next navigation move.',
      'code_nav_plan_navigation reasons about current subtask shape, not literal user wording: discovery goes to codesight_* or read, grounded symbol hops go to code_nav_*, IDE-style semantic asks go to raw lsp_navigation, and resolved follow-ups may stop with answer-now.',
      'Never use code_nav_plan_navigation as a substitute for code_nav_rank_context fresh-session discovery; route to codesight_* or read first when task is still ungrounded.',
      'Keep code_nav_plan_navigation plan bounded — one strong next hop beats a long speculative chain.',
      'If enough evidence already exists in session state, code_nav_plan_navigation may return answer-now instead of another tool call.'
    ],
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task to route' },
        symbol: { type: 'string', description: 'Optional exact symbol if already grounded' },
        file: { type: 'string', description: 'Optional file hint' },
        mode: { type: 'string', enum: ['auto', 'inspect', 'trace', 'impact', 'debug', 'explain'] },
        limit: { type: 'number', minimum: 1, maximum: 4 },
      },
      required: ['task'],
    },
    execute: async (_toolCallId: string, params: PlannerQuery) => {
      const plan = buildNavigationPlanResult(params);
      return textToolResult(formatNavigationPlan(plan), {
        intent: plan.intent,
        status: plan.status,
        confidence: plan.confidence,
        evidence: plan.evidence,
        steps: plan.steps,
        nextTool: plan.nextTool,
        nextArgs: plan.nextArgs,
        fallbackSteps: plan.fallbackSteps,
        stopWhen: plan.stopWhen,
        bestRoute: plan.bestRoute,
        freshSession: plan.freshSession,
      });
    },
  });

  pi.registerTool(astGrepSearchTool);
  pi.registerTool(astGrepReplaceTool);
}
