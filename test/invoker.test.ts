import test from 'node:test';
import assert from 'node:assert/strict';
import { createPiToolInvoker } from '../src/shared-tool-invoker.ts';

for (const method of ['invokeTool', 'callTool', 'runTool'] as const) {
  test(`shared invoker supports ${method}`, async () => {
    const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
    const pi = {
      [method]: async (toolName: string, params: Record<string, unknown>) => {
        calls.push({ toolName, params });
        return { ok: true };
      },
    };

    const invoker = createPiToolInvoker(pi);
    assert.equal(typeof invoker, 'function');
    const result = await invoker?.('lsp_navigation', { operation: 'documentSymbol', filePath: 'src/demo.ts' });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [{ toolName: 'lsp_navigation', params: { operation: 'documentSymbol', filePath: 'src/demo.ts' } }]);
  });
}
