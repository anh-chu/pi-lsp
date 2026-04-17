import { formatCompactSection } from './format.ts';
import { formatNavigationPlan } from './plan-format.ts';
import { planNavigation } from './navigation-planner.ts';
import { rankContext } from './ranking.ts';
import { findReferences, getSymbolSlice } from './symbols.ts';
import { createPiToolInvoker } from './shared-tool-invoker.ts';

function emitSessionMessage(pi: any, kind: string, content: string, details: Record<string, unknown>) {
  pi.sendMessage({
    customType: `pi-lsp-${kind}`,
    content,
    display: true,
    details: {
      ...details,
      benchmarkUsageNote:
        'Benchmark rows should source input_tokens/output_tokens/cost from Pi session artifacts when available; otherwise record those fields as null and rely on duration/turns/tool_calls/files_read/quality.',
    },
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
      const result = rankContext(args.trim(), 10);
      const content = formatCompactSection(
        result.sessionState.hasConcreteEvidence ? 'Ranked context' : 'Fresh-session warning',
        result.items.length > 0
          ? result.items.map((item) => `- ${item.kind}: ${item.id} (${item.score}) — ${item.reason}`)
          : [`- ${result.note}`],
      );
      emitSessionMessage(pi, 'rank', content, result as unknown as Record<string, unknown>);
    },
  });

  pi.registerCommand('nav', {
    description: 'Plan next navigation hop for compound task',
    handler: async (args: string, ctx: any) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify('Usage: /nav <task>', 'warning');
        return;
      }
      const plan = planNavigation({ task });
      emitSessionMessage(pi, 'nav', formatNavigationPlan(plan), plan as unknown as Record<string, unknown>);
    },
  });
}
