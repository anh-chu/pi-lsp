import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceFile } from '../src/workspace-path.ts';

test('resolveWorkspaceFile accepts files within workspace', () => {
  const result = resolveWorkspaceFile('src/index.ts');
  assert.ok(result !== null);
  assert.ok(result.endsWith('/src/index.ts'));
});

test('resolveWorkspaceFile accepts absolute path within workspace', () => {
  const cwd = process.cwd();
  const result = resolveWorkspaceFile(`${cwd}/src/index.ts`);
  assert.ok(result !== null);
  assert.equal(result, `${cwd}/src/index.ts`);
});

test('resolveWorkspaceFile rejects dot-dot traversal', () => {
  const result = resolveWorkspaceFile('../../etc/passwd');
  assert.equal(result, null);
});

test('resolveWorkspaceFile rejects absolute path outside workspace', () => {
  const result = resolveWorkspaceFile('/etc/passwd');
  assert.equal(result, null);
});

test('resolveWorkspaceFile rejects nested dot-dot that escapes', () => {
  const result = resolveWorkspaceFile('src/../../etc/passwd');
  assert.equal(result, null);
});

test('resolveWorkspaceFile accepts nested path staying inside', () => {
  const result = resolveWorkspaceFile('src/../src/index.ts');
  assert.ok(result !== null);
  assert.ok(result.endsWith('/src/index.ts'));
});

test('resolveWorkspaceFile rejects symlink-style escape attempt', () => {
  const result = resolveWorkspaceFile('src/../../../../etc/passwd');
  assert.equal(result, null);
});
