import { classifyNavigationIntent } from './navigation-intent.ts';
import { snapshotNavigationEvidence } from './navigation-evidence.ts';
import { setLastPlannerResult } from './state.ts';
import type { NavigationPlan, NavigationStep, PlannerQuery, ToolRoute } from './types.ts';

function clampLimit(limit?: number) {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 3;
  return Math.max(1, Math.min(4, Math.floor(limit)));
}

function ladderForFamily(family: NavigationStep['toolFamily']): 1 | 2 | 3 | 4 {
  switch (family) {
    case 'discovery': return 1;
    case 'code_nav': return 2;
    case 'lsp_navigation': return 2;
    case 'read': return 4;
    case 'answer': return 4;
    default: return 4;
  }
}

function step(order: number, toolFamily: NavigationStep['toolFamily'], tool: string, reason: string, args?: Record<string, unknown>, stopIfResolved = false): NavigationStep {
  return { order, toolFamily, tool, args, reason, stopIfResolved, ladderPosition: ladderForFamily(toolFamily) };
}

function rawLspSeed(query: PlannerQuery, evidence: ReturnType<typeof snapshotNavigationEvidence>, operation: string) {
  if (evidence.lastResolvedDefinition?.file && typeof evidence.lastResolvedDefinition.line === 'number') {
    return {
      operation,
      filePath: evidence.lastResolvedDefinition.file,
      line: evidence.lastResolvedDefinition.line,
      character: evidence.lastResolvedDefinition.character ?? 1,
    };
  }

  if (evidence.symbol || query.symbol) {
    return {
      operation: 'workspaceSymbol',
      query: evidence.symbol ?? query.symbol,
      filePath: evidence.file ?? query.file,
    };
  }

  if (evidence.file || query.file) {
    return {
      operation: 'documentSymbol',
      filePath: evidence.file ?? query.file,
    };
  }

  return undefined;
}

export function planNavigation(query: PlannerQuery): NavigationPlan {
  const evidence = snapshotNavigationEvidence(query);
  const intentResult = classifyNavigationIntent(query.task, query.mode ?? 'auto');
  const limit = clampLimit(query.limit);
  const steps: NavigationStep[] = [];
  const fallbackSteps: NavigationStep[] = [];
  const stopWhen: string[] = [];
  let status: NavigationPlan['status'] = 'grounded-next-hop';
  let bestRoute: ToolRoute;

  if (intentResult.rawLspOperation) {
    const args = rawLspSeed(query, evidence, intentResult.rawLspOperation);
    if (args) {
      bestRoute = {
        primary: 'lsp_navigation',
        toolName: 'lsp_navigation',
        args,
        reason: 'Raw IDE-style semantic op fits better than code_nav_* wrapper here.',
        ladderPosition: ladderForFamily('lsp_navigation'),
      };
      steps.push(step(1, 'lsp_navigation', 'lsp_navigation', bestRoute.reason, args, true));
      if (args.operation === 'workspaceSymbol' && intentResult.rawLspOperation !== 'workspaceSymbol') {
        steps.push(step(2, 'lsp_navigation', 'lsp_navigation', `After symbol position resolved, rerun raw ${intentResult.rawLspOperation} op on exact location.`, { operation: intentResult.rawLspOperation }, true));
      }
      fallbackSteps.push(step(1, 'read', 'read', 'If raw LSP result stays ambiguous, read owning file near resolved symbol.', evidence.file ? { path: evidence.file } : undefined, true));
      stopWhen.push('Stop once raw LSP answer returns requested semantic fact or target location.', 'Do not fall back to broad repo search unless symbol/file grounding is still missing.');
    } else {
      status = 'needs-discovery';
      bestRoute = {
        primary: 'discovery',
        toolName: 'find',
        args: { pattern: '*' },
        reason: 'Raw LSP op needs file or symbol grounding first. Use discovery tools for orientation, then trace symbols.',
        ladderPosition: ladderForFamily('discovery'),
      };
      steps.push(step(1, 'discovery', 'find', bestRoute.reason, { pattern: '*' }, true));
      fallbackSteps.push(step(1, 'read', 'read', 'Read likely file once narrowed.', evidence.file ? { path: evidence.file } : undefined, true));
      stopWhen.push('Stop after repo area or target file becomes grounded, then rerun planner.');
    }
  } else if (intentResult.intent === 'debug' && intentResult.crossSubsystem && !evidence.symbol) {
    status = 'needs-discovery';
    bestRoute = {
      primary: 'discovery',
      toolName: 'find',
      args: { pattern: '*' },
      reason: 'Cross-subsystem bug. Orient on ONE subsystem first with discovery, then code-nav across the rest. Do not discover all subsystems at once.',
      ladderPosition: ladderForFamily('discovery'),
    };
    steps.push(step(1, 'discovery', 'find', bestRoute.reason, { pattern: '*' }, true));
    steps.push(step(2, 'code_nav', 'code_nav_find_references', 'Once entry symbol is grounded from the oriented subsystem, trace callers across boundaries.', { symbol: '<grounded-symbol>', limit }, true));
    fallbackSteps.push(step(1, 'discovery', 'read', 'Pick one likely subsystem and read its key docs for orientation.', { path: 'README.md' }, true));
    stopWhen.push('Orient on one subsystem, then trace symbols across boundaries.', 'Do not read all subsystem docs simultaneously.');
  } else if (!evidence.symbol) {
    status = evidence.freshSession ? 'needs-discovery' : 'needs-narrowing';
    bestRoute = evidence.file
      ? {
          primary: 'read',
          toolName: 'read',
          args: { path: evidence.file },
          reason: 'File grounded, symbol not. Read local source before exact-symbol follow-up.',
          ladderPosition: ladderForFamily('read'),
        }
      : {
          primary: 'discovery',
          toolName: 'find',
          args: { pattern: '*' },
          reason: 'Task still ungrounded. Start with repo discovery (structural orientation first), not code_nav_rank_context.',
          ladderPosition: ladderForFamily('discovery'),
        };
    steps.push(step(1, bestRoute.primary, bestRoute.toolName ?? 'find', bestRoute.reason, bestRoute.args, true));
    fallbackSteps.push(step(1, 'discovery', 'find', 'If task still broad, inspect high-impact source files next.', { pattern: '**/*.{ts,js,tsx,jsx}', limit: 20 }, true));
    stopWhen.push('Stop discovery once exact symbol name or file is grounded.', 'Do not call code_nav_* until exact symbol or caller target is known.');
  } else if (intentResult.intent === 'define') {
    const matchesLastDefinition = evidence.lastResolvedDefinition?.symbol === evidence.symbol;
    if (matchesLastDefinition && evidence.lastResolvedDefinition?.file) {
      status = 'answer-now';
      bestRoute = {
        primary: 'answer',
        reason: 'Definition already grounded in session state.',
        ladderPosition: ladderForFamily('answer'),
      };
      stopWhen.push(`Answer with ${evidence.lastResolvedDefinition.file}:${evidence.lastResolvedDefinition.line}.`);
    } else {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_find_definition',
        args: { symbol: evidence.symbol, file: evidence.file },
        reason: 'Exact symbol grounded. Definition-first hop is shortest path.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_find_definition', bestRoute.reason, bestRoute.args, true));
      fallbackSteps.push(step(1, 'discovery', 'find', 'If exact symbol still fails, verify repo structure and name first.', { pattern: '*' }, true));
      stopWhen.push('Stop if definition file and line answer request directly.');
    }
  } else if (intentResult.intent === 'trace' || intentResult.intent === 'impact') {
    const hasCallerEvidence = evidence.lastTopCallerFiles.length > 0 && evidence.queriedSymbols.includes(evidence.symbol);
    if (hasCallerEvidence) {
      status = 'answer-now';
      bestRoute = {
        primary: 'answer',
        reason: 'Top caller evidence already exists in session state.',
        ladderPosition: ladderForFamily('answer'),
      };
      stopWhen.push(`Answer with strongest caller file first: ${evidence.lastTopCallerFiles[0]?.file ?? 'unknown'}.`);
    } else {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_find_references',
        args: { symbol: evidence.symbol, file: evidence.file, limit },
        reason: 'Grouped references give best first caller or impact hop.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_find_references', bestRoute.reason, bestRoute.args, true));
      fallbackSteps.push(step(1, 'read', 'read', 'If refs return strong caller file, read only that caller next.', evidence.lastTopCallerFiles[0] ? { path: evidence.lastTopCallerFiles[0].file } : undefined, true));
      stopWhen.push('Stop if grouped hits already answer simple usage question.', 'Inspect only best caller file before expanding to rest of impact list.');
    }
  } else if (intentResult.intent === 'inspect') {
    bestRoute = {
      primary: 'code_nav',
      toolName: 'code_nav_get_symbol',
      args: { symbol: evidence.symbol, file: evidence.file, includeBody: true },
      reason: 'Exact symbol grounded. Minimal body slice is best next hop.',
      ladderPosition: ladderForFamily('code_nav'),
    };
    steps.push(step(1, 'code_nav', 'code_nav_get_symbol', bestRoute.reason, bestRoute.args, true));
    fallbackSteps.push(step(1, 'code_nav', 'code_nav_find_definition', 'If file hint still wrong, resolve owning file first.', { symbol: evidence.symbol, file: evidence.file }, true));
    stopWhen.push('Stop if symbol body already answers request.');
  } else if (intentResult.intent === 'debug' && intentResult.crossSubsystem) {
    if (evidence.symbol) {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_find_references',
        args: { symbol: evidence.symbol, file: evidence.file, limit },
        reason: 'Cross-subsystem bug with grounded symbol. Trace callers across boundaries instead of reading all subsystems.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_find_references', bestRoute.reason, bestRoute.args, true));
      fallbackSteps.push(step(1, 'discovery', 'read', 'If references are sparse, orient on one subsystem\'s key docs to find entry points.', { path: 'README.md' }, true));
      stopWhen.push('Stop once boundary calls between subsystems are identified.', 'Do not wiki-read every subsystem simultaneously.');
    } else {
      status = 'needs-discovery';
      bestRoute = {
        primary: 'discovery',
        toolName: 'find',
        args: { pattern: '*' },
        reason: 'Cross-subsystem bug. Orient on ONE subsystem first with discovery, then code-nav across the rest. Do not discover all subsystems at once.',
        ladderPosition: ladderForFamily('discovery'),
      };
      steps.push(step(1, 'discovery', 'find', bestRoute.reason, { pattern: '*' }, true));
      steps.push(step(2, 'code_nav', 'code_nav_find_references', 'Once entry symbol is grounded from the oriented subsystem, trace callers across boundaries.', evidence.symbol ? { symbol: evidence.symbol, file: evidence.file, limit } : { symbol: '<grounded-symbol>', limit }, true));
      fallbackSteps.push(step(1, 'discovery', 'read', 'Pick one likely subsystem and read its key docs for orientation.', { path: 'README.md' }, true));
      stopWhen.push('Orient on one subsystem, then trace symbols across boundaries.', 'Do not read all subsystem docs simultaneously.');
    }
  } else {
    bestRoute = evidence.file
      ? {
          primary: 'read',
          toolName: 'read',
          args: { path: evidence.file },
          reason: 'Task not exact enough for code_nav_* yet. Narrow with current source first.',
          ladderPosition: ladderForFamily('read'),
        }
      : {
          primary: 'discovery',
          toolName: 'find',
          args: { pattern: '*' },
          reason: 'Task still mixed or explanatory. Start with repo discovery (structural orientation), then exact hop.',
          ladderPosition: ladderForFamily('discovery'),
        };
    status = bestRoute.primary === 'read' ? 'needs-narrowing' : 'needs-discovery';
    steps.push(step(1, bestRoute.primary, bestRoute.toolName ?? 'find', bestRoute.reason, bestRoute.args, true));
    if (evidence.symbol) {
      steps.push(step(2, 'code_nav', 'code_nav_get_symbol', 'Once current source confirms symbol, take exact body slice.', { symbol: evidence.symbol, file: evidence.file }, true));
    }
    fallbackSteps.push(step(1, 'discovery', 'find', 'If still broad, inspect top-impact source files instead of thrashing across random reads.', { pattern: '**/*.{ts,js,tsx,jsx}', limit: 20 }, true));
    stopWhen.push('Stop once one concrete file or symbol becomes grounded enough for exact follow-up.');
  }

  const plan: NavigationPlan = {
    intent: intentResult.intent,
    status,
    confidence: intentResult.confidence,
    evidence,
    steps: steps.slice(0, limit),
    nextTool: steps[0]?.tool,
    nextArgs: steps[0]?.args,
    fallbackSteps: fallbackSteps.slice(0, Math.max(1, Math.min(2, limit))),
    stopWhen,
    bestRoute,
    freshSession: evidence.freshSession,
  };

  setLastPlannerResult({
    intent: plan.intent,
    route: plan.bestRoute.primary,
    nextTool: plan.nextTool,
  });

  return plan;
}
