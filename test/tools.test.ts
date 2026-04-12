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

test('getSymbolSlice returns explicit failure for missing symbol', async () => {
  await withTempProject({ 'src/demo.ts': 'export const hello = 1;\n' }, async () => {
    const result = await getSymbolSlice({ symbol: 'missing' });
    assert.equal(result.details.ok, false);
    assert.match(result.content, /no exact definition candidate found/i);
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

test('findReferences returns grouped symbol usages across workspace with fallback markers', async () => {
  await withTempProject({
    'src/demo.ts': 'export function hello() {\n  return helper();\n}\nconst value = hello();\n',
    'src/consumer.ts': 'import { hello } from "./demo";\nconsole.log(hello());\n',
  }, async () => {
    const result = await findReferences({ symbol: 'hello', limit: 10 });
    assert.equal(result.details.backend, 'fallback');
    assert.equal(result.details.fallback, true);
    assert.equal(result.details.confidence, 'low');
    assert.equal(result.hits.length >= 3, true);
    assert.match(result.content, /files: 2/i);
    assert.match(result.content, /confidence: low/i);
    assert.match(result.content, /fallback: yes/i);
    assert.match(result.content, /file: .*src\/consumer\.ts/i);
    assert.match(result.content, /file: .*src\/demo\.ts/i);
    assert.equal(Array.isArray(result.details.groupedHits), true);
    assert.equal((result.details.groupedHits as Array<{ file: string }>).length, 2);
    assert.equal(result.hits.some((hit) => hit.file.endsWith('src/demo.ts') && hit.line === 1 && hit.fallback === true), true);
    assert.equal(result.hits.some((hit) => hit.file.endsWith('src/demo.ts') && hit.line === 4), true);
    assert.equal(result.hits.some((hit) => hit.file.endsWith('src/consumer.ts') && hit.line === 1), true);
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
