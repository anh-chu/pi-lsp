import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export function makeTempProject(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'pi-lsp-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  return root;
}

export async function withTempProject<T>(files: Record<string, string>, run: (root: string) => Promise<T> | T): Promise<T> {
  const root = makeTempProject(files);
  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    return await run(root);
  } finally {
    process.chdir(oldCwd);
  }
}

export function fakePi() {
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const messages: any[] = [];
  return {
    tools,
    commands,
    messages,
    registerTool(def: any) { tools.push(def); },
    registerCommand(name: string, def: any) { commands[name] = def; },
    sendMessage(message: any) { messages.push(message); },
  };
}

export function findTool(pi: ReturnType<typeof fakePi>, name: string) {
  const tool = pi.tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Expected tool ${name} to be registered`);
  return tool;
}

export function fileUri(path: string) {
  return `file://${resolve(path).replace(/\\/g, '/')}`;
}
