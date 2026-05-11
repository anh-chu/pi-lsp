import { isAbsolute, relative, resolve, sep, dirname } from 'node:path';
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
    // File doesn't exist. Check if the parent directory is inside the workspace.
    // This catches cases like src/outside-link/missing.ts where outside-link
    // is a symlink to an external directory.
    try {
      const parentDir = dirname(abs);
      const parentReal = realpathSync(parentDir);
      const parentRel = relative(root, parentReal);
      if (parentRel === '..' || parentRel.startsWith(`..${sep}`) || isAbsolute(parentRel)) return null;
      return abs;
    } catch {
      return null;
    }
  }
}
