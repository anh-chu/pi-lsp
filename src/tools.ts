import { astGrepReplaceTool } from './tools/ast-grep-replace.ts';
import { astGrepSearchTool } from './tools/ast-grep-search.ts';
import { buildCacheKey, getFileMtimeMs, readFreshCache, setCache } from './cache.ts';
import { formatCompactSection } from './format.ts';
import { formatNavigationPlan } from './plan-format.ts';
import { planNavigation } from './navigation-planner.ts';
import { rankContext } from './ranking.ts';
import { createPiToolInvoker, textToolResult } from './shared-tool-invoker.ts';
import { findDefinition, findReferences, getSymbolSlice } from './symbols.ts';
import { traceCallChain } from './trace.ts';
import { compareImplementations } from './compare.ts';
import type { CompareQuery, CompareResult, DefinitionQuery, DefinitionResult, PlannerQuery, ReferenceQuery, ReferenceResult, TraceQuery, TraceResult } from './types.ts';

const DEFINITION_CACHE_PREFIX = 'symbol:def';
const REFERENCES_CACHE_PREFIX = 'symbol:refs';
const TRACE_CACHE_PREFIX = 'symbol:trace';
const COMPARE_CACHE_PREFIX = 'symbol:compare';
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

async function buildTraceResult(params: TraceQuery, pi: any): Promise<TraceResult> {
  const cacheKey = buildCacheKey(TRACE_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
    depth: params.depth ?? 1,
    limit: params.limit ?? 8,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<TraceResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await traceCallChain(params, { invokeTool: createPiToolInvoker(pi) });
  setCache(cacheKey, result, fileMtime);
  return result;
}

async function buildCompareResult(params: CompareQuery, pi: any): Promise<CompareResult> {
  const cacheKey = buildCacheKey(COMPARE_CACHE_PREFIX, {
    symbol: params.symbol,
    pattern: params.pattern,
    scope: params.scope,
    limit: params.limit ?? 8,
  });
  const cached = readFreshCache<CompareResult>(cacheKey);
  if (cached) return cached;

  const result = await compareImplementations(params, { invokeTool: createPiToolInvoker(pi) });
  setCache(cacheKey, result);
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
      'Ladder position: 2 (function-level tracing). Use only after discovery tools (find, read) have grounded the repo area and exact symbol name.',
      'Use code_nav_get_symbol after exact function, class, type, or method name is grounded from current source, repo context, or earlier navigation work inside same debugging, fix, or feature task.',
      'Prefer code_nav_get_symbol over plain read once exact symbol is known and current subtask is minimal implementation inspection, because it returns focused definition slice plus exact location metadata and next-step args.',
      'Trigger: when you need the full function body, use code_nav_get_symbol with includeBody: true.',
      'If exact symbol name is still uncertain, do not guess variants; use discovery tools (find, read) or read current source first, then retry code_nav_get_symbol with precise name or file hint.',
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
      'Ladder position: 2 (function-level tracing). Use only after exact symbol name is grounded.',
      'Use code_nav_find_definition after exact symbol name is known during navigation work inside larger debug, fix, or implementation flow.',
      'Prefer code_nav_find_definition over plain read when current subtask is owning file or line resolution, because it returns exact location plus nextBestTool and nextBestArgs for jump-ready follow-up.',
      'Trigger: when you only need the file and line, use code_nav_find_definition instead of broad reads.',
      'Prefer discovery tools (find, read) first for repo-level exploration or when you only know feature area, route surface, schema area, or package name; use code_nav_find_definition once symbol name is exact.',
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
      'Ladder position: 2 (function-level tracing). Use only after exact symbol name is grounded.',
      'Use code_nav_find_references when current navigation subtask is caller tracing, usage tracing, or impact discovery for exact grounded symbol at code level.',
      'Prefer code_nav_find_references over grep or broad read once symbol is exact, because it groups usages, prioritizes likely caller files, and returns nextBestTool and nextBestArgs for best next hop.',
      'Trigger: before debugging a bug, use code_nav_find_references on the suspect function to trace callers and usage context.',
      'Trigger: before changing a file, understand impact via code_nav_find_references grouped by caller file.',
      'Do not use code_nav_find_references as first-pass repo exploration tool; prefer discovery tools (find, read) first when callers, subsystem, or symbol name are still unknown.',
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
    name: 'code_nav_trace',
    label: 'Pi LSP Trace',
    description: 'Transitive call-chain exploration: find references to a symbol, then extract what each caller file invokes',
    promptSnippet: 'Trace transitive call chains from a grounded symbol',
    promptGuidelines: [
      'Ladder position: 2 (function-level tracing). Use only after exact symbol name is grounded.',
      'Use code_nav_trace when debugging requires following call chains: auth.login() -> validateUser() -> checkPermissions().',
      'code_nav_trace finds references, then for each top caller file, extracts what other symbols that call-site invokes.',
      'Trigger: when you hit a multi-step trace and need to follow a call chain, use code_nav_trace instead of manually chaining code_nav_find_references.',
      'For depth > 1, the tool recursively traces the strongest caller chain. Keep depth <= 2 to avoid explosion.',
      'If the root cause is already identified from one hop, stop and answer instead of tracing deeper.',
    ],
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol to trace from' },
        file: { type: 'string', description: 'Optional file hint for the symbol definition' },
        depth: { type: 'number', description: 'Number of hops to trace (1-3, default 1)', minimum: 1, maximum: 3 },
        limit: { type: 'number', description: 'Max callers per hop (3-20, default 8)', minimum: 3, maximum: 20 },
      },
      required: ['symbol'],
    },
    execute: async (_toolCallId: string, params: TraceQuery) => {
      const result = await buildTraceResult(params, pi);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'code_nav_compare',
    label: 'Pi LSP Compare',
    description: 'Side-by-side implementation analysis: find similar function implementations across scope, detect common patterns and outliers',
    promptSnippet: 'Compare similar implementations across files',
    promptGuidelines: [
      'Ladder position: 2 (function-level tracing). Use when comparing how a pattern is implemented across files.',
      'Use code_nav_compare when you need to compare error handling, validation, or other patterns across multiple files.',
      'Trigger: when you need to know "do all route handlers follow the same pattern?" use code_nav_compare.',
      'Trigger: when looking for duplicated logic across files, use code_nav_compare.',
      'The tool finds references to a symbol, extracts calls from each implementation, and identifies common patterns and outliers.',
      'Outliers are implementations that deviate from the common pattern; inspect those first for bugs or intentional differences.',
    ],
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find similar implementations of' },
        pattern: { type: 'string', description: 'Optional pattern to search for instead of symbol' },
        scope: { type: 'string', description: 'Optional file/directory scope' },
        limit: { type: 'number', description: 'Max implementations to compare (2-15, default 8)', minimum: 2, maximum: 15 },
      },
    },
    execute: async (_toolCallId: string, params: CompareQuery) => {
      const result = await buildCompareResult(params, pi);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool({
    name: 'code_nav_rank_context',
    label: 'Pi LSP Rank Context',
    description: 'Prioritize files and symbols already observed in this session; never use for first-step repo discovery',
    promptSnippet: 'Prioritize already-seen session context for current task',
    promptGuidelines: [
      'Ladder position: session-state ranking, not discovery. Never use for first-step repo exploration.',
      'Use code_nav_rank_context only after concrete session evidence exists from this run, such as read files, mentioned files, or grounded symbol lookups.',
      'Do not use code_nav_rank_context as first-step repo exploration in a fresh session — it ranks session memory only and cannot discover unseen code.',
      'If session evidence counts are all zero, inspect source with read or discovery tools (find, read) first, then call code_nav_rank_context only if prioritization is needed.',
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
    description: 'Plan next 1-4 navigation hops, choosing among discovery tools (find, read), code_nav_*, raw lsp_navigation, read, or answer-now',
    promptSnippet: 'Plan next navigation hop for compound code task',
    promptGuidelines: [
      'Ladder position: compound-task router. Use when a multi-step trace risks wandering across random files.',
      'Use code_nav_plan_navigation as front door for compound code navigation inside broad debug, fix, and feature tasks once agent needs to choose next navigation move.',
      'code_nav_plan_navigation reasons about current subtask shape, not literal user wording: discovery goes to find/read, grounded symbol hops go to code_nav_*, IDE-style semantic asks go to raw lsp_navigation, and resolved follow-ups may stop with answer-now.',
      'Trigger: when you hit a multi-step trace, use code_nav_plan_navigation to avoid wandering. It returns ladder-ranked steps to keep exploration ordered.',
      'Never use code_nav_plan_navigation as a substitute for code_nav_rank_context fresh-session discovery; route to discovery tools (find, read) first when task is still ungrounded.',
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
