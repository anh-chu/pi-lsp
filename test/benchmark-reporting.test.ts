import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');

function runHarness(outPath: string) {
  execFileSync(
    'node',
    ['--experimental-strip-types', 'benchmarks/automation/run-harness-benchmarks.mjs', '--ids', 'A-01,B-01,C-01,E-01', '--out', outPath],
    {
      cwd: packageRoot,
      env: { ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'test-key' },
      stdio: 'pipe',
    },
  );
}

test('harness benchmark summary distinguishes treatment usage classes', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pi-lsp-benchmark-reporting-'));
  try {
    const outPath = join(tempDir, 'harness-benchmark.jsonl');
    runHarness(outPath);

    const rows = readFileSync(outPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const summary = readFileSync(outPath.replace(/\.jsonl$/, '-summary.md'), 'utf8');

    const byPrompt = new Map(rows.filter((row) => row.condition === 'treatment').map((row) => [row.prompt_id, row]));
    assert.equal(byPrompt.get('A-01')?.treatment_usage_class, 'direct_adoption');
    assert.equal(byPrompt.get('B-01')?.treatment_usage_class, 'direct_adoption');
    assert.equal(byPrompt.get('C-01')?.treatment_usage_class, 'direct_adoption');
    assert.equal(byPrompt.get('E-01')?.treatment_usage_class, 'treatment_loaded_but_unused');
    assert.equal(byPrompt.get('C-01')?.treatment_context_calls, 1);
    assert.match(summary, /## Treatment usage breakdown/);
    assert.match(summary, /direct pi_lsp adoption: 3 row\(s\); treatment quality wins vs baseline = 0; prompts = A-01, B-01, C-01\./);
    assert.match(summary, /treatment context only: 0 row\(s\); treatment quality wins vs baseline = 0; prompts = none\./);
    assert.match(summary, /loaded but unused \/ bypass: 1 row\(s\); treatment quality wins vs baseline = 0; prompts = E-01\./);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
