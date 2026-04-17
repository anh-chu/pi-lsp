import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPiLspTools } from '../src/tools.ts';
import { planNavigation } from '../src/navigation-planner.ts';
import { rememberQueriedSymbol, resetState, setLastResolvedDefinition, setLastTopCallerFiles } from '../src/state.ts';
import { fakePi, findTool } from './helpers.ts';

test.beforeEach(() => {
  resetState();
});

test('planner routes grounded inspect task to symbol tool', () => {
  const plan = planNavigation({ task: 'Show implementation body for hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'pi_lsp');
  assert.equal(plan.nextTool, 'pi_lsp_get_symbol');
  assert.deepEqual(plan.nextArgs, { symbol: 'hello', file: 'src/demo.ts', includeBody: true });
});

test('planner routes impact task to references tool', () => {
  const plan = planNavigation({ task: 'Where is hello used?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'pi_lsp');
  assert.equal(plan.nextTool, 'pi_lsp_find_references');
});

test('planner sends fresh session to discovery first', () => {
  const plan = planNavigation({ task: 'What should I inspect next for route parsing bug?' });
  assert.equal(plan.freshSession, true);
  assert.equal(plan.bestRoute.primary, 'codesight');
  assert.equal(plan.nextTool, 'codesight_get_summary');
});

test('planner routes hover-style question to raw lsp_navigation', () => {
  setLastResolvedDefinition({ symbol: 'hello', file: 'src/demo.ts', line: 3, character: 2 });
  const plan = planNavigation({ task: 'What type does hello have on hover?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.bestRoute.primary, 'lsp_navigation');
  assert.equal(plan.nextTool, 'lsp_navigation');
  assert.equal(plan.nextArgs?.operation, 'hover');
});

test('planner returns answer-now when caller evidence already exists', () => {
  setLastTopCallerFiles([{ file: 'src/caller.ts', reason: 'top hit', line: 8 }]);
  rememberQueriedSymbol('hello');
  const plan = planNavigation({ task: 'Where is hello used?', symbol: 'hello' });
  assert.equal(plan.status, 'answer-now');
  assert.equal(plan.bestRoute.primary, 'answer');
});

test('planner tool registered and returns machine-readable plan', async () => {
  const pi = fakePi();
  registerPiLspTools(pi);
  const tool = findTool(pi, 'pi_lsp_plan_navigation');
  const result = await tool.execute('call-1', { task: 'Show implementation body for hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.match(result.content[0].text, /Navigation plan/);
  assert.equal(result.details.nextTool, 'pi_lsp_get_symbol');
  assert.equal(result.details.bestRoute.primary, 'pi_lsp');
});

test('planner routes "what should I inspect next" to discovery, not inspect', () => {
  const plan = planNavigation({ task: 'What should I inspect next for this bug?' });
  assert.equal(plan.intent, 'discover');
  assert.notEqual(plan.bestRoute.primary, 'pi_lsp');
});

test('planner recognizes "declared" as define intent', () => {
  const plan = planNavigation({ task: 'Where is hello declared?', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.intent, 'define');
  assert.equal(plan.nextTool, 'pi_lsp_find_definition');
});

test('planner recognizes "location of" as define intent', () => {
  const plan = planNavigation({ task: 'Give me the location of hello', symbol: 'hello', file: 'src/demo.ts' });
  assert.equal(plan.intent, 'define');
  assert.equal(plan.nextTool, 'pi_lsp_find_definition');
});

test('planner treats "inspect" word without code noun as non-inspect', () => {
  const plan = planNavigation({ task: 'Inspect something broad in this repo' });
  assert.notEqual(plan.intent, 'inspect');
});
