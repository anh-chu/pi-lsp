import type { NavigationIntent, NavigationMode } from './types.ts';

export interface IntentResult {
  intent: NavigationIntent;
  confidence: 'low' | 'medium' | 'high';
  rawLspOperation?: 'hover' | 'signatureHelp' | 'implementation' | 'incomingCalls' | 'outgoingCalls' | 'rename' | 'workspaceSymbol';
  crossSubsystem?: boolean;
  phases?: Array<{ intent: NavigationIntent; reason: string }>;
  estimatedHops?: number;
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function isCrossSubsystem(text: string): boolean {
  return hasAny(text, [
    /cross.{0,20}(subsystem|module|boundary)/,
    /across.{0,30}(subsystems|modules|boundaries)/,
    /between.{0,20}(subsystems|modules)/,
    /multiple.{0,20}(subsystems|modules)/,
    /several.{0,20}(subsystems|modules)/,
    /\d+.{0,20}(subsystems|modules)/,
    /touches.{0,30}(subsystem|module)/,
    /spanning.{0,20}(subsystems|modules)/,
  ]);
}

export function classifyNavigationIntent(task: string, mode: NavigationMode = 'auto'): IntentResult {
  if (mode !== 'auto') {
    return {
      intent: mode === 'trace' ? 'trace' : mode,
      confidence: 'high',
    };
  }

  const text = task.toLowerCase();

  const discoveryPhrases = [/what should i inspect next/, /where should i start/, /how do i navigate/, /which tool/];
  if (hasAny(text, discoveryPhrases)) {
    return { intent: 'discover', confidence: 'high' };
  }

  if (hasAny(text, [/show .*implementation/, /implementation body/, /read .*symbol/, /symbol body/, /\binspect\b .*(symbol|function|class|method|body|code)/, /(symbol|function|class|method) .*\binspect\b/, /open .*function/, /show .*code/])) {
    return { intent: 'inspect', confidence: 'high' };
  }

  if (hasAny(text, [/\bhover\b/, /\btype\b/, /signature/, /call hierarchy/, /incoming call/, /outgoing call/, /\brename\b/, /find implementation/, /go to implementation/, /implementations\b/])) {
    if (/signature/.test(text)) return { intent: 'debug', confidence: 'high', rawLspOperation: 'signatureHelp' };
    if (/call hierarchy/.test(text) || /incoming call/.test(text)) return { intent: 'trace', confidence: 'high', rawLspOperation: 'incomingCalls' };
    if (/outgoing call/.test(text)) return { intent: 'trace', confidence: 'high', rawLspOperation: 'outgoingCalls' };
    if (/\brename\b/.test(text)) return { intent: 'debug', confidence: 'high', rawLspOperation: 'rename' };
    if (/find implementation|go to implementation|implementations\b/.test(text)) return { intent: 'inspect', confidence: 'high', rawLspOperation: 'implementation' };
    return { intent: 'explain', confidence: 'medium', rawLspOperation: 'hover' };
  }

  if (hasAny(text, [/where .*used/, /references?/, /callers?/, /impact/, /who calls/, /usages?/])) {
    return {
      intent: /impact/.test(text) ? 'impact' : 'trace',
      confidence: 'high',
    };
  }

  if (hasAny(text, [/where .*(defined|declared)/, /definition/, /owning file/, /\bdeclared\b/, /location of/, /which file (defines|declares|has|contains)/, /file .*defines/])) {
    return { intent: 'define', confidence: 'high' };
  }

  if (hasAny(text, [/debug/, /why/, /failing/, /broken/, /error/, /\bbug\b/, /\bfix\b/])) {
    const result: IntentResult = { intent: 'debug', confidence: 'medium', crossSubsystem: isCrossSubsystem(text) };

    if (/\bfix\b/.test(text) || /\bbug\b/.test(text)) {
      result.phases = [
        { intent: 'discover', reason: 'Find the relevant subsystem or module' },
        { intent: 'trace', reason: 'Follow the call chain to the root cause' },
        { intent: 'inspect', reason: 'Read the failing code in detail' },
      ];
      result.estimatedHops = 3;
    } else if (/debug|why|failing|broken|error/.test(text)) {
      result.phases = [
        { intent: 'discover', reason: 'Locate the error source' },
        { intent: 'trace', reason: 'Trace the execution path' },
      ];
      result.estimatedHops = 2;
    }

    return result;
  }

  if (hasAny(text, [/\bimplement\b/, /\badd\b.*feature/, /\bbuild\b.*module/, /\bcreate\b.*handler/])) {
    return {
      intent: 'discover',
      confidence: 'medium',
      phases: [
        { intent: 'discover', reason: 'Find the target module and existing patterns' },
        { intent: 'inspect', reason: 'Read similar implementations for reference' },
      ],
      estimatedHops: 2,
    };
  }

  if (hasAny(text, [/\brepo\b/, /subsystem/, /\broute\b/, /schema/, /\benv\b/])) {
    return { intent: 'discover', confidence: 'medium' };
  }

  return { intent: 'explain', confidence: 'low' };
}
