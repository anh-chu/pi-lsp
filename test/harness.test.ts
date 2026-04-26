import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createTestSession, when, calls, says } from '@marcfargas/pi-test-harness';
import { resetState } from '../src/state.ts';
import { makeTempProject } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const extensionEntry = resolve(here, '../src/index.ts');

process.env.OPENAI_API_KEY ??= 'test-key';
const originalCwd = process.cwd();
const harnessRuntimeDir = mkdtempSync(join(tmpdir(), 'pi-lsp-harness-runtime-'));
process.chdir(harnessRuntimeDir);
process.on('exit', () => {
  process.chdir(originalCwd);
  rmSync(harnessRuntimeDir, { recursive: true, force: true });
});


function disposeSession(session: { dispose(): void } | undefined) {
  session?.dispose();
}

function removeDir(path: string | undefined) {
  if (path) rmSync(path, { recursive: true, force: true });
}

function ensureHarnessAgentCompat(session: Awaited<ReturnType<typeof createTestSession>>) {
  const agent = session.session.agent as { state: { tools: unknown[] }; setTools?: (tools: unknown[]) => void };
  if (typeof agent.setTools !== 'function') {
    agent.setTools = (tools: unknown[]) => {
      agent.state.tools = tools;
    };
  }
}

test('pi-test-harness baseline session does not load pi-lsp tools', async () => {
  resetState();
  const cwd = makeTempProject({
    'README.md': '# demo\n',
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\n',
  });

  let session: Awaited<ReturnType<typeof createTestSession>> | undefined;
  try {
    session = await createTestSession({ cwd });
    ensureHarnessAgentCompat(session);
    const toolNames = session.session.agent.state.tools.map((tool: { name: string }) => tool.name);

    assert.equal(toolNames.includes('code_nav_get_symbol'), false);
    assert.equal(toolNames.includes('code_nav_find_definition'), false);

    await session.run(
      when('Read project README', [
        calls('read', { path: 'README.md' }),
        says('README read.'),
      ]),
    );

    assert.equal(session.events.toolCallsFor('read').length, 1);
    assert.equal(session.events.toolResultsFor('read').length, 1);
  } finally {
    disposeSession(session);
    removeDir(cwd);
    resetState();
  }
});

test('pi-test-harness treatment session loads pi-lsp and exercises symbol lookup tool path', async () => {
  resetState();
  const cwd = makeTempProject({
    'src/demo.ts': 'export function hello() {\n  return 1;\n}\n\nexport const value = hello();\n',
  });

  let session: Awaited<ReturnType<typeof createTestSession>> | undefined;
  try {
    session = await createTestSession({
      cwd,
      extensions: [extensionEntry],
    });
    ensureHarnessAgentCompat(session);

    const toolNames = session.session.agent.state.tools.map((tool: { name: string }) => tool.name);
    assert.equal(toolNames.includes('code_nav_get_symbol'), true);
    assert.equal(toolNames.includes('code_nav_find_definition'), true);
    assert.equal(toolNames.includes('code_nav_find_references'), true);
    assert.equal(toolNames.includes('code_nav_rank_context'), true);

    await session.run(
      when('Show exact hello definition', [
        calls('code_nav_get_symbol', { symbol: 'hello', file: 'src/demo.ts', contextLines: 0 }),
        says('Definition captured.'),
      ]),
    );

    const symbolResults = session.events.toolResultsFor('code_nav_get_symbol');
    assert.equal(symbolResults.length, 1);
    assert.equal(symbolResults[0].mocked, false);
    assert.match(
      symbolResults[0].text,
      /(function hello|no exact definition candidate found)/i,
    );

    assert.equal(session.events.toolCallsFor('code_nav_get_symbol').length, 1);
  } finally {
    disposeSession(session);
    removeDir(cwd);
    resetState();
  }
});

test('pi-test-harness treatment session preserves pi-lsp ranking state across turns', async () => {
  resetState();
  const cwd = makeTempProject({
    'src/routes.ts': 'export function readRoutes() {\n  return [];\n}\n',
  });

  let session: Awaited<ReturnType<typeof createTestSession>> | undefined;
  try {
    session = await createTestSession({
      cwd,
      extensions: [extensionEntry],
    });
    ensureHarnessAgentCompat(session);

    await session.run(
      when('Inspect readRoutes symbol first', [
        calls('code_nav_get_symbol', { symbol: 'readRoutes', file: 'src/routes.ts', contextLines: 0 }),
        says('Captured symbol.'),
      ]),
      when('Rank next context for route parsing', [
        calls('code_nav_rank_context', { query: 'route parsing', limit: 5 }),
        says('Ranked context returned.'),
      ]),
    );

    const rankResults = session.events.toolResultsFor('code_nav_rank_context');
    assert.equal(rankResults.length, 1);
    assert.equal(rankResults[0].mocked, false);
    assert.match(rankResults[0].text, /src\/routes\.ts/);
    assert.match(rankResults[0].text, /readRoutes/);
  } finally {
    disposeSession(session);
    removeDir(cwd);
    resetState();
  }
});
