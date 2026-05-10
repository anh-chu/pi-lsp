import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveWorkspaceFile } from '../src/workspace-path.ts';

function withTempDir(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'workspace-path-test-'));
  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    run(root);
  } finally {
    process.chdir(oldCwd);
  }
}

test('resolveWorkspaceFile accepts files within workspace', () => {
  withTempDir((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/index.ts'), 'export {};', 'utf8');
    const result = resolveWorkspaceFile('src/index.ts');
    assert.ok(result !== null);
    assert.equal(result, join(root, 'src/index.ts'));
  });
});

test('resolveWorkspaceFile accepts absolute path within workspace', () => {
  withTempDir((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/index.ts'), 'export {};', 'utf8');
    const result = resolveWorkspaceFile(join(root, 'src/index.ts'));
    assert.ok(result !== null);
    assert.equal(result, join(root, 'src/index.ts'));
  });
});

test('resolveWorkspaceFile rejects dot-dot traversal', () => {
  withTempDir(() => {
    const result = resolveWorkspaceFile('../../etc/passwd');
    assert.equal(result, null);
  });
});

test('resolveWorkspaceFile rejects absolute path outside workspace', () => {
  withTempDir(() => {
    const result = resolveWorkspaceFile('/etc/passwd');
    assert.equal(result, null);
  });
});

test('resolveWorkspaceFile rejects nested dot-dot that escapes', () => {
  withTempDir(() => {
    const result = resolveWorkspaceFile('src/../../etc/passwd');
    assert.equal(result, null);
  });
});

test('resolveWorkspaceFile accepts nested path staying inside', () => {
  withTempDir((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/index.ts'), 'export {};', 'utf8');
    const result = resolveWorkspaceFile('src/../src/index.ts');
    assert.ok(result !== null);
    assert.equal(result, join(root, 'src/index.ts'));
  });
});

test('resolveWorkspaceFile rejects deep dot-dot traversal', () => {
  withTempDir(() => {
    const result = resolveWorkspaceFile('src/../../../../etc/passwd');
    assert.equal(result, null);
  });
});

test('resolveWorkspaceFile rejects sibling-prefix path', () => {
  withTempDir((root) => {
    // If cwd is /tmp/workspace, reject /tmp/workspace-evil/file.ts
    const siblingDir = root + '-evil';
    mkdirSync(join(siblingDir, 'src'), { recursive: true });
    writeFileSync(join(siblingDir, 'src/evil.ts'), 'export {};', 'utf8');
    const result = resolveWorkspaceFile(join(siblingDir, 'src/evil.ts'));
    assert.equal(result, null);
  });
});

test('resolveWorkspaceFile rejects real symlink escape', () => {
  withTempDir((root) => {
    mkdirSync(join(root, 'src'), { recursive: true });
    const outsideDir = mkdtempSync(join(tmpdir(), 'outside-'));
    writeFileSync(join(outsideDir, 'secret.ts'), 'export {};', 'utf8');
    symlinkSync(outsideDir, join(root, 'src/outside-link'));
    const result = resolveWorkspaceFile('src/outside-link/secret.ts');
    assert.equal(result, null);
  });
});
