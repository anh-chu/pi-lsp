import type { ToolInvoker } from './symbol-backends.ts';

export function createPiToolInvoker(pi: any): ToolInvoker | undefined {
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

export function textToolResult(content: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text: content }],
    details,
  };
}
