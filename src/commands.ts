import { rankContext } from './ranking.ts';
import { findReferences, getSymbolSlice } from './symbols.ts';
import { formatCompactSection } from './format.ts';

function createPiToolInvoker(pi: any) {
  if (typeof pi?.invokeTool !== 'function' && typeof pi?.callTool !== 'function' && typeof pi?.runTool !== 'function') {
    return undefined;
  }

  return async (toolName: string, params: Record<string, unknown>) => {
    if (typeof pi?.invokeTool === 'function') return await pi.invokeTool(toolName, params);
    if (typeof pi?.callTool === 'function') return await pi.callTool(toolName, params);
    if (typeof pi?.runTool === 'function') return await pi.runTool(toolName, params);
    return null;
  };
}

function emitSessionMessage(pi: any, kind: string, content: string, details: Record<string, unknown>) {
  pi.sendMessage({
    customType: `pi-lsp-${kind}`,
    content,
    display: true,
    details,
  });
}

export function registerPiLspCommands(pi: any) {
  pi.registerCommand('symbol', {
    description: 'Show one symbol definition or code slice',
    handler: async (args: string, ctx: any) => {
      const [symbol, file] = args.trim().split(/\s+/, 2);
      if (!symbol) {
        ctx.ui.notify('Usage: /symbol <name> [fileHint]', 'warning');
        return;
      }
      const result = await getSymbolSlice({ symbol, file }, { invokeTool: createPiToolInvoker(pi) });
      emitSessionMessage(pi, 'symbol', result.content, result.details);
    },
  });

  pi.registerCommand('refs', {
    description: 'Show references for a symbol',
    handler: async (args: string, ctx: any) => {
      const [symbol, file] = args.trim().split(/\s+/, 2);
      if (!symbol) {
        ctx.ui.notify('Usage: /refs <name> [fileHint]', 'warning');
        return;
      }
      const result = await findReferences({ symbol, file }, { invokeTool: createPiToolInvoker(pi) });
      emitSessionMessage(pi, 'refs', result.content, result.details);
    },
  });

  pi.registerCommand('rank', {
    description: 'Rank relevant files and symbols for current task',
    handler: async (args: string) => {
      const items = rankContext(args.trim(), 10);
      const content = formatCompactSection(
        'Ranked context',
        items.map((item) => `- ${item.kind}: ${item.id} (${item.score}) — ${item.reason}`),
      );
      emitSessionMessage(pi, 'rank', content, { query: args.trim(), items });
    },
  });
}
