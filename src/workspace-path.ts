import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Resolve a file path and ensure it stays within the workspace (process.cwd()).
 * Returns the resolved absolute path if safe, or null if the path escapes.
 */
export function resolveWorkspaceFile(file: string): string | null {
  const root = resolve(process.cwd());
  const abs = resolve(root, file);
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return abs;
}
