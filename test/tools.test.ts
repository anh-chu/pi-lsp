import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPiLspCommands } from '../src/commands.ts';
import { registerPiLspTools } from '../src/tools.ts';
import { findDefinition, findReferences, getSymbolSlice } from '../src/symbols.ts';
import {
  astGrepSearchParams,
  lspDocumentSymbolParams,
  lspReferencesParams,
  lspWorkspaceSymbolParams,
} from '../src/symbol-backends.ts';
import { fakePi, findTool, withTempProject } from './helpers.ts';
import { resetState } from '../src/state.ts';

test('registers expected pi-lsp tools', () => {
  const pi = fakePi();
  registerPiLspTools(pi);
  assert.deepEqual(
    pi.tools.map((tool) => tool.name),
    ['pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references', 'pi_lsp_rank_context'],
  );
});

test('registers expected pi-lsp commands', () => {
  const pi = fakePi();
  registerPiLspCommands(pi);
  assert.equal(typeof pi.commands.symbol.handler, 'function');
  assert.equal(typeof pi.commands.refs.handler, 'function');
  assert.equal(typeof pi.commands.rank.handler, 'function');
});

test('symbol command emits result message', async () => {
  await withTempProject({ 'src/demo.ts': 'export function hello() {\n  return 1;\n}\n' }, async () => {
    const pi = fakePi();
    registerPiLspCommands(pi);
    await pi.commands.symbol.handler('hello src/demo.ts', { ui: { notify() {} } });
    assert.equal(pi.messages.length, 1);
    assert.equal(pi.messages[0].customType, 'pi-lsp-symbol');
    assert.match(pi.messages[0].content, /function hello/);
  });
});

test('getSymbolSlice uses file hint to return exact function body', async () => {
  await withTempProject({
    'src/demo.ts': 'const before = 0;\nexport function hello() {\n  return before + 1;\n}\n',
  }, async () => {
    const result = await getSymbolSlice({ symbol: 'hello', file: 'src/demo.ts', contextLines: 0 });
    assert.equal(result.location?.file.endsWith('src/demo.ts'), true);
    assert.equal(result.location?.line, 2);
    assert.equal(result.location?.startLine, 2);
    assert.equal(result.location?.endLine, 4);
    assert.equal(result.details.backend, 'fallback');
    assert.match(result.content, /function hello/);
    assert.doesNotMatch(result.content, /const before/);
  });
});

test('getSymbolSlice reports ambiguity honestly', async () => {
  await withTempProject({
    'src/one.ts': 'export function duplicate() {\n  return 1;\n}\n',
    'src/two.ts': 'export function duplicate() {\n  return 2;\n}\n',
  }, async () => {
    const result = await getSymbolSlice({ symbol: 'duplicate' });
    assert.equal(result.details.ambiguous, true);
    assert.match(result.content, /ambiguous/i);
    assert.deepEqual((result.details.candidates as Array<{ file: string }>).length, 2);
  });
});

test('getSymbolSlice returns explicit failure for missing symbol with anti-guess guidance', async () => {
  await withTempProject({ 'src/demo.ts': 'export const hello = 1;\n' }, async () => {
    const result = await getSymbolSlice({ symbol: 'missing' });
    assert.equal(result.details.ok, false);
    assert.equal(result.details.likelyCause, 'inexact-symbol-name');
    assert.match(result.content, /no exact definition candidate found/i);
    assert.match(result.content, /guessed or approximate symbol name/i);
    assert.match(result.content, /use codesight_\*/i);
    assert.equal(Array.isArray(result.details.suggestedNextSteps), true);
  });
});

test('findDefinition returns exact symbol location via shared navigation engine', async () => {
  await withTempProject({
    'src/demo.ts': 'const before = 0;\nexport function hello() {\n  return before + 1;\n}\n',
  }, async () => {
    const result = await findDefinition({ symbol: 'hello', file: 'src/demo.ts' });
    assert.equal(result.location?.file.endsWith('src/demo.ts'), true);
    assert.equal(result.location?.line, 2);
    assert.equal(result.details.backend, 'fallback');
    assert.equal(result.details.ok, true);
    assert.match(result.content, /definition: .*src\/demo.ts:2/i);
  });
});

test('findDefinition exposes concise jump metadata once owning file is grounded', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\n',
  }, async () => {
    const result = await findDefinition({ symbol: 'hello', file: 'src/demo.ts' });

    assert.equal(result.details.owningFile?.endsWith('src/demo.ts'), true);
    assert.equal(result.details.nextBestTool, 'pi_lsp_get_symbol');
    assert.deepEqual(result.details.nextBestArgs, {
      symbol: 'hello',
      file: result.location?.file,
      includeBody: true,
    });
    assert.equal(result.details.nextBestReason, 'Definition grounded; jump straight to the implementation body.');
    assert.equal(result.details.suggestedNextTool, result.details.nextBestTool);
    assert.equal(result.details.suggestedNextReason, result.details.nextBestReason);
    assert.deepEqual(result.details.suggestedNextArgs, result.details.nextBestArgs);
  });
});

test('findDefinition tool replaces placeholder text with shared navigation result', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\n',
  }, async () => {
    const pi = fakePi();
    registerPiLspTools(pi);
    const tool = findTool(pi, 'pi_lsp_find_definition');
    const response = await tool.execute('call-1', { symbol: 'hello', file: 'src/demo.ts' });

    assert.equal(response.details.ok, true);
    assert.equal(response.details.backend, 'fallback');
    assert.match(response.content[0].text, /Definition lookup/);
    assert.doesNotMatch(response.content[0].text, /not implemented yet/i);
    assert.doesNotMatch(response.content[0].text, /workspaceSymbol/i);
  });
});

test('findReferences returns prioritized grouped symbol usages across workspace with fallback markers', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return helper();\n}\nconst value = hello();\n',
    'src/consumer.ts': 'import { hello } from "./demo";\nconsole.log(hello());\n',
    'src/feature.ts': 'import { hello } from "./demo";\nexport function runFeature() {\n  return hello();\n}\n',
  }, async () => {
    const result = await findReferences({ symbol: 'hello', limit: 10 });
    assert.equal(result.details.backend, 'fallback');
    assert.equal(result.details.fallback, true);
    assert.equal(result.details.confidence, 'low');
    assert.equal(result.hits.length >= 4, true);
    assert.match(result.content, /files: 3/i);
    assert.match(result.content, /best next caller file:/i);
    assert.match(result.content, /top likely impact 1:/i);
    assert.match(result.content, /top preview/i);
    assert.equal(Array.isArray(result.details.groupedHits), true);
    assert.equal(Array.isArray(result.details.topImpactFiles), true);
    assert.equal(typeof result.details.bestNextCallerFile, 'string');
    assert.equal((result.details.topImpactFiles as Array<{ file: string }>).length >= 1, true);
    assert.equal(result.hits.some((hit) => hit.file.endsWith('src/demo.ts') && hit.line === 1 && hit.fallback === true), true);
    assert.equal(result.hits.some((hit) => hit.file.endsWith('src/feature.ts') && hit.line === 3), true);
  });
});

test('findReferences exposes concise jump metadata for the best next caller file', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\n',
    'src/feature.ts': 'import { hello } from "./demo";\nexport async function runFeature() {\n  return await hello();\n}\n',
    'src/debug.test.ts': 'import { hello } from "./demo";\nit("uses hello", () => {\n  expect(hello()).toBe(1);\n});\n',
  }, async () => {
    const result = await findReferences({ symbol: 'hello', limit: 10 });

    assert.equal(result.details.owningFile?.endsWith(result.details.bestNextCallerFile ?? ''), true);
    assert.equal(typeof result.details.bestNextCallerFile, 'string');
    assert.equal(result.details.nextBestTool, 'pi_lsp_get_symbol');
    assert.deepEqual(result.details.nextBestArgs, {
      symbol: 'hello',
      file: result.details.owningFile,
      includeBody: false,
    });
    assert.equal(result.details.bestNextReadArgs?.file?.toString(), result.details.bestNextCallerFile);
    assert.equal(typeof result.details.bestNextReadArgs?.startLine, 'number');
    assert.equal(Array.isArray(result.details.topImpactFiles), true);
    assert.equal((result.details.topImpactFiles as Array<{ file: string }>)[0]?.file, result.details.bestNextCallerFile);
    assert.equal(result.details.suggestedNextTool, result.details.nextBestTool);
    assert.equal(result.details.suggestedNextReason, result.details.nextBestReason);
    assert.deepEqual(result.details.suggestedNextArgs, result.details.nextBestArgs);
  });
});

test('findReferences tool replaces placeholder text with shared navigation result', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\nconsole.log(hello());\n',
  }, async () => {
    const pi = fakePi();
    registerPiLspTools(pi);
    const tool = findTool(pi, 'pi_lsp_find_references');
    const response = await tool.execute('call-2', { symbol: 'hello', file: 'src/demo.ts', limit: 10 });

    assert.equal(response.details.ok, true);
    assert.equal(response.details.backend, 'fallback');
    assert.match(response.content[0].text, /Reference lookup/);
    assert.doesNotMatch(response.content[0].text, /not implemented yet/i);
    assert.doesNotMatch(response.content[0].text, /lsp_navigation\.references/i);
  });
});

test('refs command emits shared reference lookup result', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\nconsole.log(hello());\n',
  }, async () => {
    const pi = fakePi();
    registerPiLspCommands(pi);
    await pi.commands.refs.handler('hello src/demo.ts', { ui: { notify() {} } });
    assert.equal(pi.messages.length, 1);
    assert.equal(pi.messages[0].customType, 'pi-lsp-refs');
    assert.match(pi.messages[0].content, /Reference lookup/);
    assert.equal(pi.messages[0].details.backend, 'fallback');
  });
});

test('getSymbolSlice uses canonical Pi tool payload names', async () => {
  const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  const invokeTool = async (toolName: string, params: Record<string, unknown>) => {
    calls.push({ toolName, params });
    if (toolName === 'lsp_navigation' && params.operation === 'documentSymbol') {
      return {
        symbols: [{
          name: 'hello',
          kind: 12,
          range: { start: { line: 1 }, end: { line: 3 } },
        }],
      };
    }
    return null;
  };

  await withTempProject({
    'src/demo.ts': 'const before = 0;\nexport function hello() {\n  return before + 1;\n}\n',
  }, async () => {
    const result = await getSymbolSlice({ symbol: 'hello', file: 'src/demo.ts', contextLines: 0 }, { invokeTool });
    assert.equal(result.details.backend, 'lsp');
    assert.equal(calls.length >= 1, true);
    assert.deepEqual(calls[0], {
      toolName: 'lsp_navigation',
      params: { operation: 'documentSymbol', filePath: `${process.cwd()}/src/demo.ts` },
    });
  });
});

test('canonical Pi tool payload helper shapes remain unchanged', () => {
  assert.deepEqual(
    astGrepSearchParams('export function hello', `${process.cwd()}/src/demo.ts`),
    {
      pattern: 'export function hello',
      lang: 'typescript',
      paths: [`${process.cwd()}/src/demo.ts`],
    },
  );
  assert.deepEqual(
    lspDocumentSymbolParams(`${process.cwd()}/src/demo.ts`),
    {
      operation: 'documentSymbol',
      filePath: `${process.cwd()}/src/demo.ts`,
    },
  );
  assert.deepEqual(
    lspWorkspaceSymbolParams('hello', 'src/demo.ts'),
    {
      operation: 'workspaceSymbol',
      query: 'hello',
      filePath: 'src/demo.ts',
    },
  );
  assert.deepEqual(
    lspReferencesParams({ file: `${process.cwd()}/src/demo.ts`, line: 1 }),
    {
      operation: 'references',
      filePath: `${process.cwd()}/src/demo.ts`,
      line: 1,
      character: 1,
    },
  );
  assert.deepEqual(
    lspReferencesParams({ file: `${process.cwd()}/src/demo.ts`, line: 1, character: 4 }),
    {
      operation: 'references',
      filePath: `${process.cwd()}/src/demo.ts`,
      line: 1,
      character: 4,
    },
  );
});

test('findReferences uses canonical Pi tool payload names and exposes lsp confidence metadata', async () => {
  const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  const invokeTool = async (toolName: string, params: Record<string, unknown>) => {
    calls.push({ toolName, params });
    if (toolName === 'lsp_navigation' && params.operation === 'documentSymbol') {
      return {
        symbols: [{
          name: 'hello',
          kind: 12,
          range: { start: { line: 0 }, end: { line: 2 } },
        }],
      };
    }
    if (toolName === 'lsp_navigation' && params.operation === 'references') {
      return {
        references: [{
          uri: `file://${process.cwd()}/src/demo.ts`,
          range: { start: { line: 3, character: 12 }, end: { line: 3, character: 17 } },
        }],
      };
    }
    return null;
  };

  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\nconsole.log(hello());\n',
  }, async () => {
    const result = await findReferences({ symbol: 'hello', file: 'src/demo.ts', limit: 10 }, { invokeTool });
    assert.equal(result.details.backend, 'lsp');
    assert.equal(result.details.fallback, false);
    assert.equal(result.details.confidence, 'high');
    assert.equal(result.details.definitionBackend, 'lsp');
    assert.match(result.content, /backend: lsp/i);
    assert.match(result.content, /confidence: high/i);
    assert.match(result.content, /fallback: no/i);
    assert.deepEqual(calls[0], {
      toolName: 'lsp_navigation',
      params: { operation: 'documentSymbol', filePath: `${process.cwd()}/src/demo.ts` },
    });
    assert.deepEqual(calls[1], {
      toolName: 'lsp_navigation',
      params: {
        operation: 'references',
        filePath: `${process.cwd()}/src/demo.ts`,
        line: 1,
        character: 1,
      },
    });
  });
});

test('rank context tool makes fresh-session warning explicit in text and details', async () => {
  resetState();
  const pi = fakePi();
  registerPiLspTools(pi);
  const tool = findTool(pi, 'pi_lsp_rank_context');

  const response = await tool.execute('call-rank-1', { query: 'routes bug', limit: 10 });

  assert.match(response.content[0].text, /Fresh-session warning/);
  assert.match(response.content[0].text, /concrete session evidence: no/i);
  assert.match(response.content[0].text, /rerun after evidence: recommended/i);
  assert.match(response.content[0].text, /do not treat this output as repo search/i);
  assert.match(response.content[0].text, /query: routes bug/i);
  assert.match(response.content[0].text, /ranked items: withheld until some session evidence exists/i);
  assert.equal(response.details.freshSession, true);
  assert.equal(response.details.sessionState.hasConcreteEvidence, false);
  assert.equal(response.details.shouldRerunAfterEvidence, true);
  assert.equal(Array.isArray(response.details.guidance), true);
});

test('rank context tool emphasizes session-only scope when evidence exists', async () => {
  resetState();
  await withTempProject({ 'src/demo.ts': 'export function hello() {\n  return 1;\n}\n' }, async () => {
    const pi = fakePi();
    registerPiLspTools(pi);
    const symbolTool = findTool(pi, 'pi_lsp_get_symbol');
    const rankTool = findTool(pi, 'pi_lsp_rank_context');

    await symbolTool.execute('call-symbol-1', { symbol: 'hello', file: 'src/demo.ts' });
    const response = await rankTool.execute('call-rank-2', { query: 'hello bug', limit: 10 });

    assert.match(response.content[0].text, /Session context ranking/);
    assert.match(response.content[0].text, /concrete session evidence: yes/i);
    assert.match(response.content[0].text, /rerun after evidence: not needed/i);
    assert.match(response.content[0].text, /session-memory ranking only/i);
    assert.equal(response.details.freshSession, false);
    assert.equal(response.details.sessionState.hasConcreteEvidence, true);
    assert.equal(response.details.shouldRerunAfterEvidence, false);
    assert.equal(response.details.items.some((item: { id: string }) => item.id === 'src/demo.ts'), true);
    assert.equal(response.details.items.some((item: { id: string }) => item.id === 'hello bug'), true);
  });
});
