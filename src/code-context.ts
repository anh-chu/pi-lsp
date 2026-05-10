/**
 * Shared code context extraction utilities.
 * Used by reference-format.ts, trace.ts, and compare.ts.
 */

/**
 * Infer the role of a function based on its file path.
 */
export function inferFunctionRole(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('/api/') || lower.includes('/routes/') || lower.includes('/handlers/')) return 'route handler';
  if (lower.includes('/middleware/')) return 'middleware';
  if (lower.includes('/test/') || lower.includes('.test.') || lower.includes('.spec.')) return 'test';
  if (lower.includes('/utils/') || lower.includes('/helpers/')) return 'utility';
  if (lower.includes('/services/')) return 'service';
  if (lower.includes('/models/') || lower.includes('/entities/')) return 'model';
  return 'unknown';
}

/**
 * Extract function calls from a preview line.
 * Returns unique call names, excluding the given symbol and common keywords.
 */
export function extractCallsFromPreview(preview: string, symbol: string): string[] {
  const calls: string[] = [];
  const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  const keywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'await', 'new',
    'typeof', 'import', 'require', 'expect', 'describe', 'it', 'test',
    'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
  ]);
  let match;
  while ((match = callPattern.exec(preview)) !== null) {
    const name = match[1]!;
    if (name !== symbol && !keywords.has(name)) {
      calls.push(name);
    }
  }
  return [...new Set(calls)];
}

/**
 * Extract import paths from source lines.
 * Returns unique import module specifiers.
 */
export function extractImportsFromLines(lines: string[]): string[] {
  const imports: string[] = [];
  for (const line of lines) {
    const fromMatch = line.match(/from\s+['"]([^'"]+)['"]\s*;?/);
    if (fromMatch) imports.push(fromMatch[1]!);
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) imports.push(requireMatch[1]!);
  }
  return [...new Set(imports)];
}
