import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPiLspTools } from '../src/tools.ts';
import { planNavigation } from '../src/navigation-planner.ts';
import { classifyNavigationIntent } from '../src/navigation-intent.ts';
import { rememberQueriedSymbol, resetState, setLastResolvedDefinition, setLastTopCallerFiles } from '../src/state.ts';
import { fakePi, findTool, withTempProject } from './helpers.ts';

test.beforeEach(() => {
  resetState();
});

test('planner routes grounded inspect task to symbol tool', () => {
  const plan = planNavigation({ task: 'Show implementation body for hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'code_nav');
  assert.equal(plan.nextTool, 'code_nav_get_symbol');
  assert.deepEqual(plan.nextArgs, { symbol: 'hello', file: 'src/demo.ts', includeBody: true });
});

test('planner routes impact task to trace or references tool', () => {
  const plan = planNavigation({ task: 'Where is hello used?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'code_nav');
  assert.ok(
    plan.nextTool === 'code_nav_trace' || plan.nextTool === 'code_nav_find_references',
    `Expected trace or references, got ${plan.nextTool}`
  );
});

test('planner sends fresh session to discovery first', () => {
  const plan = planNavigation({ task: 'What should I inspect next for route parsing bug?' });
  assert.equal(plan.freshSession, true);
  assert.equal(plan.bestRoute.primary, 'discovery');
  assert.equal(plan.nextTool, 'find');
});

test('planner routes hover-style question to raw lsp_navigation', () => {
  setLastResolvedDefinition({ symbol: 'hello', file: 'src/demo.ts', line: 3, character: 2 });
  const plan = planNavigation({ task: 'What type does hello have on hover?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'lsp_navigation');
  assert.equal(plan.nextTool, 'lsp_navigation');
  assert.equal(plan.nextArgs?.operation, 'hover');
});

test('planner routes to trace when caller evidence already exists', () => {
  setLastTopCallerFiles([{ file: 'src/caller.ts', reason: 'top hit', line: 8 }]);
  rememberQueriedSymbol('hello');
  const plan = planNavigation({ task: 'Where is hello used?', symbol: 'hello' });
  assert.equal(plan.bestRoute.primary, 'code_nav');
  assert.equal(plan.nextTool, 'code_nav_trace');
});

test('planner tool registered and returns machine-readable plan', async () => {
  const pi = fakePi();
  registerPiLspTools(pi);
  const tool = findTool(pi, 'code_nav_plan_navigation');
  const result = await tool.execute('call-1', { task: 'Show implementation body for hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.match(result.content[0].text, /Navigation plan/);
  assert.equal(result.details.nextTool, 'code_nav_get_symbol');
  assert.equal(result.details.bestRoute.primary, 'code_nav');
});

test('planner routes "what should I inspect next" to discovery, not inspect', () => {
  const plan = planNavigation({ task: 'What should I inspect next for this bug?' });
  assert.equal(plan.intent, 'discover');
  assert.notEqual(plan.bestRoute.primary, 'code_nav');
});

test('planner recognizes "declared" as define intent', () => {
  const plan = planNavigation({ task: 'Where is hello declared?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.intent, 'define');
  assert.equal(plan.nextTool, 'code_nav_find_definition');
});

test('planner recognizes "location of" as define intent', () => {
  const plan = planNavigation({ task: 'Give me the location of hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.intent, 'define');
  assert.equal(plan.nextTool, 'code_nav_find_definition');
});

test('planner treats "inspect" word without code noun as non-inspect', () => {
  const plan = planNavigation({ task: 'Inspect something broad in this repo' });
  assert.notEqual(plan.intent, 'inspect');
});

test('planner detects cross-subsystem bug and orients on one subsystem first', () => {
  const plan = planNavigation({ task: 'Bug touches 3 subsystems' });
  assert.equal(plan.intent, 'debug');
  assert.equal(plan.bestRoute.primary, 'discovery');
  assert.equal(plan.nextTool, 'find');
  assert.equal(plan.status, 'needs-discovery');
  assert.ok(plan.bestRoute.reason.includes('ONE subsystem'));
  assert.ok(plan.stopWhen.some((s) => s.includes('Do not read all subsystem docs')));
});

test('planner routes cross-subsystem bug with grounded symbol to trace', () => {
  const plan = planNavigation({ task: 'Bug across auth and billing subsystems', symbol: 'createInvoice', file: 'src/billing.ts' });
  assert.equal(plan.intent, 'debug');
  assert.equal(plan.bestRoute.primary, 'code_nav');
  assert.equal(plan.nextTool, 'code_nav_trace');
  assert.ok(plan.bestRoute.reason.toLowerCase().includes('cross-subsystem'));
  assert.ok(plan.stopWhen.some((s) => s.includes('boundary')));
});

test('planner does not flag single-subsystem bug as cross-subsystem', () => {
  const plan = planNavigation({ task: 'Bug in auth login flow' });
  assert.equal(plan.intent, 'debug');
  assert.notEqual(plan.bestRoute.reason.includes('ONE subsystem'), true);
});

test('planner includes phases for fix task', () => {
  const intent = classifyNavigationIntent('fix the auth login bug');
  assert.equal(intent.intent, 'debug');
  assert.ok(intent.phases, 'Expected phases for fix task');
  assert.ok(intent.phases.length >= 2, 'Expected at least 2 phases');
  assert.equal(intent.phases[0].intent, 'discover');
  assert.equal(intent.estimatedHops, 3);
});

test('planner includes phases for implement task', () => {
  const intent = classifyNavigationIntent('implement feature in auth module');
  assert.equal(intent.intent, 'discover');
  assert.ok(intent.phases, 'Expected phases for implement task');
  assert.equal(intent.phases[0].intent, 'discover');
  assert.equal(intent.phases[1].intent, 'inspect');
});

test('planner routes debug task with grounded symbol to trace', () => {
  const plan = planNavigation({ task: 'Debug why auth fails', symbol: 'validateUser', file: 'src/auth.ts' });
  assert.equal(plan.intent, 'debug');
  assert.equal(plan.bestRoute.primary, 'code_nav');
  assert.equal(plan.nextTool, 'code_nav_trace');
  assert.ok(plan.stopWhen.some((s) => s.includes('tracing')));
});

test('planner routes debug task without symbol to discovery', () => {
  const plan = planNavigation({ task: 'Debug why login fails' });
  assert.equal(plan.intent, 'debug');
  assert.equal(plan.bestRoute.primary, 'discovery');
  assert.equal(plan.nextTool, 'find');
});

test('classifyNavigationIntent detects cross-subsystem debug', () => {
  const intent = classifyNavigationIntent('Bug touches 3 subsystems');
  assert.equal(intent.intent, 'debug');
  assert.equal(intent.crossSubsystem, true);
});

test('trace tool registered and returns call chain', async () => {
  await withTempProject({
    'src/auth.ts': 'export function validateUser(user: string) { return checkDb(user); }\nfunction checkDb(user: string) { return true; }',
    'src/api.ts': 'import { validateUser } from "./auth";\nexport function login(req: any) { return validateUser(req.body); }',
  }, async () => {
    const pi = fakePi();
    registerPiLspTools(pi);
    const tool = findTool(pi, 'code_nav_trace');
    const result = await tool.execute('call-trace-1', { symbol: 'validateUser' });
    assert.match(result.content[0].text, /Trace result/);
    assert.equal(Array.isArray(result.details.callers), true);
  });
});

test('compare tool registered and returns implementations', async () => {
  await withTempProject({
    'src/handlers/user.ts': 'export function handleError(e: Error) { logError(e); return formatResponse(e); }',
    'src/handlers/order.ts': 'export function handleError(e: Error) { logError(e); return formatResponse(e); }',
  }, async () => {
    const pi = fakePi();
    registerPiLspTools(pi);
    const tool = findTool(pi, 'code_nav_compare');
    const result = await tool.execute('call-compare-1', { symbol: 'handleError' });
    assert.match(result.content[0].text, /Compare result/);
    assert.equal(Array.isArray(result.details.implementations), true);
  });
});
