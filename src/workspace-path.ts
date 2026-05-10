import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Resolve a file path and ensure it stays within the workspace (process.cwd()).
 * Returns the resolved absolute path if safe, or null if the path escapes.
 * Follows symlinks to prevent symlink-based escapes.
 */
export function resolveWorkspaceFile(file: string): string | null {
  const root = resolve(process.cwd());
  const abs = resolve(root, file);
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;

  // Follow symlinks to prevent symlink-based escapes
  try {
    const real = realpathSync(abs);
    const realRel = relative(root, real);
    if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return null;
    return real;
  } catch {
    // File doesn't exist yet - that's fine, the path itself is safe
    return abs;
  }
}
