#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestSession, when, calls, says } from '@marcfargas/pi-test-harness';
import { resetState } from '../../src/state.ts';


function classifyTreatmentPiLspUsage(breakdown = {}) {
  const directAdoptionTools = ['pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references', 'pi_lsp_plan_navigation'];
  const treatmentContextTools = ['pi_lsp_rank_context'];
  const directAdoptionCalls = directAdoptionTools.reduce((sum, toolName) => sum + (breakdown[toolName] ?? 0), 0);
  const treatmentContextCalls = treatmentContextTools.reduce((sum, toolName) => sum + (breakdown[toolName] ?? 0), 0);
  const totalPiLspCalls = directAdoptionCalls + treatmentContextCalls;

  if (totalPiLspCalls === 0) {
    return {
      directAdoptionCalls,
      treatmentContextCalls,
      totalPiLspCalls,
      usage_class: 'treatment_loaded_but_unused',
      summaryLabel: 'loaded but unused / bypass',
    };
  }

  if (directAdoptionCalls > 0) {
    return {
      directAdoptionCalls,
      treatmentContextCalls,
      totalPiLspCalls,
      usage_class: 'direct_adoption',
      summaryLabel: treatmentContextCalls > 0 ? 'direct pi_lsp adoption (+ rank context)' : 'direct pi_lsp adoption',
    };
  }

  return {
    directAdoptionCalls,
    treatmentContextCalls,
    totalPiLspCalls,
    usage_class: 'treatment_context_only',
    summaryLabel: 'treatment context only',
  };
}


function rankContextMisuseMetrics(events) {
  const evidenceToolNames = new Set(['read', 'pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references']);
  let evidenceCallsSeen = 0;
  let evidenceBeforeFirstRank = null;
  let rankCallsWithoutPriorEvidence = 0;
  let totalRankCalls = 0;

  for (const toolCall of events.toolCalls) {
    if (toolCall.toolName === 'pi_lsp_rank_context') {
      totalRankCalls += 1;
      if (evidenceBeforeFirstRank === null) evidenceBeforeFirstRank = evidenceCallsSeen;
      if (evidenceCallsSeen === 0) rankCallsWithoutPriorEvidence += 1;
      continue;
    }
    if (evidenceToolNames.has(toolCall.toolName)) evidenceCallsSeen += 1;
  }

  return {
    totalRankCalls,
    evidenceBeforeFirstRank,
    rankCallsWithoutPriorEvidence,
    firstRankCallHadNoPriorEvidence: totalRankCalls > 0 && (evidenceBeforeFirstRank ?? 0) === 0,
  };
}

function misuseNote(metrics) {
  if ((metrics.totalRankCalls ?? 0) === 0) return null;
  if (metrics.firstRankCallHadNoPriorEvidence) {
    return `rank_context_pre_evidence=yes (${metrics.rankCallsWithoutPriorEvidence}/${metrics.totalRankCalls} rank call(s) before any concrete file/symbol evidence)`;
  }
  return `rank_context_pre_evidence=no (${metrics.evidenceBeforeFirstRank} evidence call(s) before first rank)`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const workspaceRoot = path.resolve(packageRoot, '..');
const resultsDir = path.resolve(packageRoot, 'benchmarks/results');
const piLspExtension = path.resolve(packageRoot, 'src/index.ts');
const codesightExtension = path.resolve(workspaceRoot, 'pi-codesight/src/index.ts');

process.env.OPENAI_API_KEY ??= 'test-key';
const runtimeScratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-lsp-bench-runtime-'));
process.chdir(runtimeScratchDir);


const promptCases = {
  'A-01': {
    suite: 'symbol',
    cwd: path.resolve(packageRoot),
    prompt: 'Show `registerPiLspTools` implementation and explain what it registers.',
    baselineTurns: [
      when('Show `registerPiLspTools` implementation and explain what it registers.', [
        calls('read', { path: 'src/tools.ts' }),
        says('`registerPiLspTools` is implemented in `src/tools.ts`. It registers four tools: `pi_lsp_get_symbol`, `pi_lsp_find_definition`, `pi_lsp_find_references`, and `pi_lsp_rank_context`. Their purposes are exact symbol lookup, definition lookup, reference lookup, and ranking likely next files or symbols.'),
      ]),
    ],
    treatmentTurns: [
      when('Show `registerPiLspTools` implementation and explain what it registers.', [
        calls('pi_lsp_get_symbol', { symbol: 'registerPiLspTools', file: 'src/tools.ts', contextLines: 0 }),
        says('`registerPiLspTools` is implemented in `src/tools.ts`. It registers four tools: `pi_lsp_get_symbol`, `pi_lsp_find_definition`, `pi_lsp_find_references`, and `pi_lsp_rank_context`. Their purposes are exact symbol lookup, definition lookup, reference lookup, and ranking likely next files or symbols.'),
      ]),
    ],
  },
  'B-01': {
    suite: 'refs',
    cwd: path.resolve(workspaceRoot, 'pi-codesight'),
    prompt: 'Where is `registerCodesightTools` used? Group usages by file.',
    baselineTurns: [
      when('Where is `registerCodesightTools` used? Group usages by file.', [
        calls('read', { path: 'src/index.ts' }),
        says('Usages by file: `src/index.ts` imports `registerCodesightTools` and calls `registerCodesightTools(pi)`. Definition is in `src/tools.ts`, but main runtime usage is grouped under `src/index.ts`.'),
      ]),
    ],
    treatmentTurns: [
      when('Where is `registerCodesightTools` used? Group usages by file.', [
        calls('pi_lsp_find_references', { symbol: 'registerCodesightTools', file: 'src/tools.ts', limit: 10 }),
        says('Usages by file: `src/index.ts` imports `registerCodesightTools` and calls `registerCodesightTools(pi)`. Definition is in `src/tools.ts`, but main runtime usage is grouped under `src/index.ts`.'),
      ]),
    ],
  },
  'C-01': {
    suite: 'ranking',
    cwd: path.resolve(workspaceRoot),
    prompt: 'I’m debugging route parsing in `pi-codesight`; what files should I inspect next? Give top 5 with reasons.',
    baselineTurns: [
      when('I’m debugging route parsing in `pi-codesight`; what files should I inspect next? Give top 5 with reasons.', [
        calls('read', { path: 'pi-codesight/src/queries.ts' }),
        calls('read', { path: 'pi-codesight/src/tools.ts' }),
        says('Top 5: 1. `pi-codesight/src/queries.ts` — `readRoutes(...)` parses route artifacts. 2. `pi-codesight/src/tools.ts` — route tool schema and wiring live here. 3. `pi-codesight/src/format.ts` — formatting may hide parsing issues. 4. `pi-codesight/src/codesight.ts` — artifact generation/path resolution can break upstream. 5. `pi-codesight/src/index.ts` — final wiring context.'),
      ]),
    ],
    treatmentTurns: [
      when('I’m debugging route parsing in `pi-codesight`; what files should I inspect next? Give top 5 with reasons.', [
        calls('pi_lsp_get_symbol', { symbol: 'readRoutes', file: 'pi-codesight/src/queries.ts', contextLines: 0 }),
        calls('pi_lsp_rank_context', { query: 'route parsing in pi-codesight', limit: 5 }),
        says('Top 5: 1. `pi-codesight/src/queries.ts` — `readRoutes(...)` parses route artifacts. 2. `pi-codesight/src/tools.ts` — route tool schema and wiring live here. 3. `pi-codesight/src/format.ts` — formatting may hide parsing issues. 4. `pi-codesight/src/codesight.ts` — artifact generation/path resolution can break upstream. 5. `pi-codesight/src/index.ts` — final wiring context.'),
      ]),
    ],
  },
  'E-01': {
    suite: 'control',
    cwd: path.resolve(packageRoot),
    prompt: 'Summarize `pi-lsp` project purpose from README.',
    baselineTurns: [
      when('Summarize `pi-lsp` project purpose from README.', [
        calls('read', { path: 'README.md' }),
        says('`pi-lsp` is a thin Pi extension for symbol-level code navigation. It helps read exact symbol definitions, find definitions, find references, and rank likely next files or symbols. It complements repo-level context tools like codesight rather than replacing them.'),
      ]),
    ],
    treatmentTurns: [
      when('Summarize `pi-lsp` project purpose from README.', [
        calls('read', { path: 'README.md' }),
        says('`pi-lsp` is a thin Pi extension for symbol-level code navigation. It helps read exact symbol definitions, find definitions, find references, and rank likely next files or symbols. It complements repo-level context tools like codesight rather than replacing them.'),
      ]),
    ],
  },
};

const defaultPromptIds = ['A-01', 'B-01', 'C-01', 'E-01'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ensureHarnessAgentCompat(session) {
  const agent = session.session.agent;
  if (typeof agent.setTools !== 'function') {
    agent.setTools = (tools) => {
      agent.state.tools = tools;
    };
  }
}

function parseArgs(argv) {
  const args = { ids: defaultPromptIds, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ids') {
      args.ids = argv[index + 1]?.split(',').map((value) => value.trim()).filter(Boolean) ?? defaultPromptIds;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--list') {
      console.log(Object.keys(promptCases).join('\n'));
      process.exit(0);
    }
    if (arg === '--help') {
      console.log('Usage: node --experimental-strip-types benchmarks/automation/run-harness-benchmarks.mjs [--ids A-01,B-01,C-01,E-01] [--out benchmarks/results/file.jsonl]');
      process.exit(0);
    }
  }
  return args;
}

function cleanupAuthFile(cwd) {
  fs.rmSync(path.join(cwd, 'auth.json'), { force: true });
}

function toolBreakdown(toolCalls) {
  const counts = {};
  for (const call of toolCalls) counts[call.toolName] = (counts[call.toolName] ?? 0) + 1;
  return counts;
}

function resolveMaybeRelative(baseDir, filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

function distinctFilesRead(events, cwd) {
  const files = new Set();

  for (const call of events.toolCallsFor('read')) {
    const resolved = resolveMaybeRelative(cwd, call.input?.path);
    if (resolved) files.add(resolved);
  }

  for (const result of events.toolResultsFor('pi_lsp_get_symbol')) {
    const locationFile = resolveMaybeRelative(cwd, result.details?.location?.file);
    if (locationFile) files.add(locationFile);
    const hintedFile = resolveMaybeRelative(cwd, result.details?.file);
    if (hintedFile) files.add(hintedFile);
  }

  for (const result of events.toolResultsFor('pi_lsp_find_references')) {
    const groupedHits = Array.isArray(result.details?.groupedHits)
      ? result.details.groupedHits
      : Array.isArray(result.details?.hits)
        ? result.details.hits
        : [];
    for (const hit of groupedHits) {
      const resolved = resolveMaybeRelative(cwd, hit?.file);
      if (resolved) files.add(resolved);
    }
  }

  return Array.from(files).sort();
}

function estimateBytesRead(events) {
  let total = 0;
  for (const result of events.toolResults) {
    total += Buffer.byteLength(result.text ?? '', 'utf8');
  }
  return total;
}

function getAnswerText(events) {
  const message = [...events.messages].reverse().find((entry) => entry?.role === 'assistant');
  if (!message) return null;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('\n').trim() || null;
  }
  return null;
}

function scoreCase(promptId, condition, run) {
  const answer = run.answer_text ?? '';
  const treatmentUsage = classifyTreatmentPiLspUsage(run.tool_call_breakdown);
  const usedPiLsp = treatmentUsage.totalPiLspCalls > 0;
  if (promptId === 'A-01') {
    const hasAllTools = ['pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references', 'pi_lsp_rank_context', 'pi_lsp_plan_navigation'].every((name) => answer.includes(name));
    return {
      quality_score: hasAllTools ? 2 : 1,
      precision_score: condition === 'treatment' && usedPiLsp ? 2 : 1,
      notes: condition === 'treatment'
        ? 'Harness-scripted symbol benchmark. Treatment exercised pi_lsp_get_symbol.'
        : 'Harness-scripted baseline used read without pi-lsp loaded.',
    };
  }

  if (promptId === 'B-01') {
    const grouped = answer.includes('src/index.ts') && answer.includes('registerCodesightTools(pi)');
    return {
      quality_score: grouped ? 2 : 1,
      precision_score: null,
      notes: condition === 'treatment'
        ? 'Harness-scripted refs benchmark. Treatment exercised pi_lsp_find_references.'
        : 'Harness-scripted baseline used file read grouping.',
    };
  }

  if (promptId === 'C-01') {
    const relevant = answer.includes('pi-codesight/src/queries.ts') && answer.includes('readRoutes');
    return {
      quality_score: relevant ? 2 : 1,
      precision_score: null,
      notes: condition === 'treatment'
        ? 'Harness-scripted ranking benchmark. Treatment primed symbol state then called pi_lsp_rank_context.'
        : 'Harness-scripted baseline used direct file reads for route-ranking answer.',
    };
  }

  if (promptId === 'E-01') {
    const concise = answer.includes('thin Pi extension') || answer.includes('symbol-level code navigation');
    const unnecessaryPiLsp = Boolean(usedPiLsp);
    return {
      quality_score: concise && !unnecessaryPiLsp ? 2 : 1,
      precision_score: null,
      notes: unnecessaryPiLsp
        ? 'Control regression: treatment invoked pi-lsp on README task.'
        : 'Harness-scripted control task. No pi-lsp tool use required.',
    };
  }

  return {
    quality_score: 1,
    precision_score: null,
    notes: 'Harness-scripted run.',
  };
}

async function runCondition(promptId, condition, spec) {
  resetState();
  cleanupAuthFile(spec.cwd);

  const session = await createTestSession({
    cwd: spec.cwd,
    extensions: condition === 'treatment'
      ? [codesightExtension, piLspExtension]
      : [codesightExtension],
  });

  ensureHarnessAgentCompat(session);

  try {
    const startedAt = Date.now();
    const turns = condition === 'treatment' ? spec.treatmentTurns : spec.baselineTurns;
    await session.run(...turns);
    const duration_ms = Date.now() - startedAt;

    const files = distinctFilesRead(session.events, spec.cwd);
    const answer_text = getAnswerText(session.events);
    const tool_call_breakdown = toolBreakdown(session.events.toolCalls);
    const misuse = rankContextMisuseMetrics(session.events);
    const misuseSummary = misuseNote(misuse);
    const scoring = scoreCase(promptId, condition, {
      answer_text,
      tool_call_breakdown,
    });

    const treatmentUsage = condition === 'treatment' ? classifyTreatmentPiLspUsage(tool_call_breakdown) : null;

    return {
      run_id: `harness-${new Date().toISOString().slice(0, 10)}-${promptId.toLowerCase()}-${condition}`,
      condition,
      suite: spec.suite,
      prompt_id: promptId,
      cwd: spec.cwd,
      timestamp: new Date().toISOString(),
      model: 'harness-playbook',
      thinking_level: 'scripted',
      input_tokens: null,
      output_tokens: null,
      cost: null,
      duration_ms,
      turns: turns.length,
      tool_calls: session.events.toolCalls.length,
      tool_call_breakdown,
      files_read: files.length,
      bytes_read: estimateBytesRead(session.events),
      treatment_usage_class: treatmentUsage?.usage_class ?? null,
      treatment_direct_adoption_calls: treatmentUsage?.directAdoptionCalls ?? null,
      treatment_context_calls: treatmentUsage?.treatmentContextCalls ?? null,
      quality_score: scoring.quality_score,
      precision_score: scoring.precision_score,
      answer_text,
      session_path: null,
      notes: `${scoring.notes} ${treatmentUsage ? `usage_class=${treatmentUsage.usage_class}. direct_calls=${treatmentUsage.directAdoptionCalls}. context_calls=${treatmentUsage.treatmentContextCalls}. ` : ''}${misuseSummary ? `${misuseSummary}. ` : ''}Files touched: ${files.join(', ') || 'none'}. This is automated harness benchmark output, not live model output.`,
    };
  } finally {
    session.dispose();
    resetState();
    cleanupAuthFile(spec.cwd);
  }
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

function median(values) {
  const filtered = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (filtered.length === 0) return null;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 === 1 ? filtered[middle] : (filtered[middle - 1] + filtered[middle]) / 2;
}

function buildSummary(rows, selectedIds) {
  const lines = [
    `# Harness benchmark summary — ${new Date().toISOString().slice(0, 10)}`,
    '',
    '> Automated, playbook-driven benchmark rows. Good for regression and benchmark plumbing. Not substitute for live model/token/cost evaluation.',
    '',
    '## Prompt-level comparison',
    '',
    '| prompt_id | suite | baseline_duration_ms | treatment_duration_ms | baseline_tool_calls | treatment_tool_calls | baseline_files_read | treatment_files_read | baseline_quality | treatment_quality | baseline_precision | treatment_precision | notes |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];

  for (const promptId of selectedIds) {
    const baseline = rows.find((row) => row.prompt_id === promptId && row.condition === 'baseline');
    const treatment = rows.find((row) => row.prompt_id === promptId && row.condition === 'treatment');
    lines.push([
      `| ${promptId}`,
      `${baseline?.suite ?? treatment?.suite ?? 'unknown'}`,
      `${baseline?.duration_ms ?? 'n/a'}`,
      `${treatment?.duration_ms ?? 'n/a'}`,
      `${baseline?.tool_calls ?? 'n/a'}`,
      `${treatment?.tool_calls ?? 'n/a'}`,
      `${baseline?.files_read ?? 'n/a'}`,
      `${treatment?.files_read ?? 'n/a'}`,
      `${baseline?.quality_score ?? 'n/a'}`,
      `${treatment?.quality_score ?? 'n/a'}`,
      `${baseline?.precision_score ?? 'n/a'}`,
      `${treatment?.precision_score ?? 'n/a'}`,
      `${treatment?.notes ?? baseline?.notes ?? ''} |`,
    ].join(' | '));
  }

  lines.push('', '## Aggregate comparison', '', '| metric | baseline_median | treatment_median | delta |', '|---|---:|---:|---:|');

  for (const metric of ['duration_ms', 'tool_calls', 'files_read', 'quality_score']) {
    const baselineMedian = median(rows.filter((row) => row.condition === 'baseline').map((row) => row[metric]));
    const treatmentMedian = median(rows.filter((row) => row.condition === 'treatment').map((row) => row[metric]));
    const delta = typeof baselineMedian === 'number' && typeof treatmentMedian === 'number'
      ? treatmentMedian - baselineMedian
      : null;
    lines.push(`| ${metric} | ${baselineMedian ?? 'n/a'} | ${treatmentMedian ?? 'n/a'} | ${delta ?? 'n/a'} |`);
  }

  lines.push('', '## Recommendation', '', '- Use this harness runner for automated regression, extension-surface checks, and benchmark row plumbing.', '- Keep live Pi sessions for real token/cost and unscripted model-behavior benchmarking.', '', summarizeTreatmentUsage(rows, selectedIds));
  return lines.join('\n') + '\n';
}

function summarizeTreatmentUsage(rows, selectedIds) {
  const treatmentRows = rows
    .filter((row) => row.condition === 'treatment' && selectedIds.includes(row.prompt_id));
  const buckets = new Map([
    ['direct_adoption', { label: 'direct pi_lsp adoption', rows: [] }],
    ['treatment_context_only', { label: 'treatment context only', rows: [] }],
    ['treatment_loaded_but_unused', { label: 'loaded but unused / bypass', rows: [] }],
  ]);

  for (const row of treatmentRows) {
    const usageClass = row.treatment_usage_class ?? 'treatment_loaded_but_unused';
    if (!buckets.has(usageClass)) continue;
    buckets.get(usageClass).rows.push(row);
  }

  const lines = ['## Treatment usage breakdown', ''];
  for (const [, bucket] of buckets.entries()) {
    const promptIds = bucket.rows.map((row) => row.prompt_id).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const winCount = bucket.rows.filter((row) => {
      const baseline = rows.find((candidate) => candidate.prompt_id === row.prompt_id && candidate.condition === 'baseline');
      return typeof row.quality_score === 'number' && typeof baseline?.quality_score === 'number' && row.quality_score > baseline.quality_score;
    }).length;
    lines.push(`- ${bucket.label}: ${bucket.rows.length} row(s); treatment quality wins vs baseline = ${winCount}; prompts = ${promptIds.join(', ') || 'none'}.`);
  }
  return lines.join('\n');
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const selectedIds = args.ids;
    for (const promptId of selectedIds) {
      if (!promptCases[promptId]) fail(`Unsupported prompt id: ${promptId}`);
    }

    const outFile = args.out
      ? path.resolve(args.out)
      : path.join(resultsDir, `harness-benchmark-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const summaryFile = outFile.replace(/\.jsonl$/i, '-summary.md');

    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const rows = [];
    for (const promptId of selectedIds) {
      const spec = promptCases[promptId];
      rows.push(await runCondition(promptId, 'baseline', spec));
      rows.push(await runCondition(promptId, 'treatment', spec));
    }

    fs.writeFileSync(outFile, toJsonl(rows), 'utf8');
    fs.writeFileSync(summaryFile, buildSummary(rows, selectedIds), 'utf8');

    console.log(`Wrote ${rows.length} rows to ${outFile}`);
    console.log(`Wrote summary to ${summaryFile}`);
  } finally {
    fs.rmSync(runtimeScratchDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
