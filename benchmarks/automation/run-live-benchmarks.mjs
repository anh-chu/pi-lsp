#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const evidenceTools = new Set(['read', 'pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references']);
  let evidenceCallsSeen = 0;
  let evidenceBeforeFirstRank = null;
  let rankCallsWithoutPriorEvidence = 0;
  let totalRankCalls = 0;

  for (const event of events) {
    if (event.type !== 'tool_execution_start') continue;
    if (event.toolName === 'pi_lsp_rank_context') {
      totalRankCalls += 1;
      if (evidenceBeforeFirstRank === null) evidenceBeforeFirstRank = evidenceCallsSeen;
      if (evidenceCallsSeen === 0) rankCallsWithoutPriorEvidence += 1;
      continue;
    }
    if (evidenceTools.has(event.toolName)) evidenceCallsSeen += 1;
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
const promptsDir = path.resolve(packageRoot, 'benchmarks/prompts');
const resultsDir = path.resolve(packageRoot, 'benchmarks/results');
const liveRunsDir = path.resolve(resultsDir, 'live-runs');
const piLspExtension = path.resolve(packageRoot, 'src/index.ts');
const codesightExtension = path.resolve(workspaceRoot, 'pi-codesight/src/index.ts');
const piBin = process.env.PI_BIN || 'pi';
const nodeBin = process.execPath;
const runtimeBinDirs = Array.from(new Set([path.dirname(nodeBin), path.dirname(piBin)].filter(Boolean)));


function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    ids: null,
    out: null,
    provider: null,
    model: null,
    thinking: 'medium',
    conditions: ['baseline', 'treatment'],
    stack: 'codesight',
    rowTimeoutMs: 180000,
    dryRun: false,
    keepArtifacts: true,
    list: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ids') {
      args.ids = argv[index + 1]?.split(',').map((value) => value.trim()).filter(Boolean) ?? null;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--provider') {
      args.provider = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--model') {
      args.model = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--thinking') {
      args.thinking = argv[index + 1] ?? 'medium';
      index += 1;
      continue;
    }
    if (arg === '--conditions') {
      args.conditions = argv[index + 1]?.split(',').map((value) => value.trim()).filter(Boolean) ?? ['baseline', 'treatment'];
      index += 1;
      continue;
    }
    if (arg === '--stack') {
      args.stack = argv[index + 1] ?? 'codesight';
      index += 1;
      continue;
    }
    if (arg === '--row-timeout-ms') {
      const value = Number(argv[index + 1] ?? '180000');
      args.rowTimeoutMs = Number.isFinite(value) && value > 0 ? value : 180000;
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--cleanup-artifacts') {
      args.keepArtifacts = false;
      continue;
    }
    if (arg === '--list') {
      args.list = true;
      continue;
    }
    if (arg === '--help') {
      console.log([
        'Usage: node benchmarks/automation/run-live-benchmarks.mjs [options]',
        '',
        'Options:',
        '  --ids A-01,B-01,C-01,E-01   Prompt ids to run',
        '  --conditions baseline,treatment  Conditions to run (default both)',
        '  --stack codesight|raw        Benchmark stack (default codesight)',
        '  --provider <name>            Pi provider override',
        '  --model <pattern>            Pi model override',
        '  --thinking <level>           Thinking level (default medium)',
        '  --row-timeout-ms <ms>        Per-row timeout in ms (default 180000)',
        '  --out <file.jsonl>           Output results file',
        '  --dry-run                    Print commands only; do not execute pi',
        '  --cleanup-artifacts          Remove per-run raw artifacts after summary write',
      ].join('\n'));
      process.exit(0);
    }
  }

  return args;
}

function validateStackOption(stack) {
  if (stack === 'codesight' || stack === 'raw') return;
  fail(`Unsupported --stack value: ${stack}. Use codesight or raw.`);
}


function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadPromptCatalog() {
  const files = fs.readdirSync(promptsDir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort();
  const catalog = new Map();
  for (const file of files) {
    const rows = readJsonl(path.join(promptsDir, file));
    for (const row of rows) catalog.set(row.id, row);
  }
  return catalog;
}

function promptIdsFromCatalog(catalog) {
  return Array.from(catalog.keys()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}


function resolveMaybeRelative(baseDir, filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

function contentText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((entry) => entry?.type === 'text')
    .map((entry) => entry.text ?? '')
    .join('\n');
}

function findSessionPath(sessionDir) {
  const candidates = [];
  const stack = [sessionDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(next);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) candidates.push(next);
    }
  }
  candidates.sort();
  return candidates.length === 1 ? candidates[0] : candidates[candidates.length - 1] ?? null;
}
function sessionUsageFromSessionFile(sessionPath) {
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return {
      input_tokens: null,
      output_tokens: null,
      cost: null,
      note: 'session file missing; session usage unavailable.',
      verified: false,
    };
  }

  const entries = readJsonl(sessionPath);
  const assistantMessages = entries
    .filter((entry) => entry?.type === 'message' && entry?.message?.role === 'assistant')
    .map((entry) => entry.message);

  if (assistantMessages.length === 0) {
    return {
      input_tokens: null,
      output_tokens: null,
      cost: null,
      note: 'session file had no assistant messages with usage.',
      verified: false,
    };
  }

  const usage = assistantMessages.reduce((totals, message) => {
    const current = message?.usage ?? {};
    return {
      input_tokens: totals.input_tokens + (typeof current.input === 'number' ? current.input : 0),
      output_tokens: totals.output_tokens + (typeof current.output === 'number' ? current.output : 0),
      cost: totals.cost + (typeof current.cost === 'number' ? current.cost : 0),
      hadUsage: totals.hadUsage || typeof current.input === 'number' || typeof current.output === 'number' || typeof current.cost === 'number',
    };
  }, { input_tokens: 0, output_tokens: 0, cost: 0, hadUsage: false });

  if (!usage.hadUsage) {
    return {
      input_tokens: null,
      output_tokens: null,
      cost: null,
      note: 'assistant messages present but usage blocks missing; session usage unavailable.',
      verified: false,
    };
  }

  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost: usage.cost,
    note: 'usage recovered from assistant message usage blocks in session JSONL.',
    verified: true,
  };
}

function sessionUsageFromPath(sessionPath) {
  const usage = sessionUsageFromSessionFile(sessionPath);
  if (usage.verified) return usage;

  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost: usage.cost,
    note: usage.note,
    verified: false,
  };
}

function toolBreakdown(events) {
  const counts = {};
  for (const event of events) {
    if (event.type !== 'tool_execution_end') continue;
    counts[event.toolName] = (counts[event.toolName] ?? 0) + 1;
  }
  return counts;
}

function distinctFilesRead(events, cwd) {
  const files = new Set();
  for (const event of events) {
    if (event.type !== 'tool_execution_end') continue;
    const details = event.result?.details ?? {};

    if (event.toolName === 'read') {
      const resolved = resolveMaybeRelative(cwd, details?.path);
      if (resolved) files.add(resolved);
    }

    if (event.toolName === 'pi_lsp_get_symbol' || event.toolName === 'pi_lsp_find_definition') {
      const locationFile = resolveMaybeRelative(cwd, details?.location?.file);
      if (locationFile) files.add(locationFile);
      const hintedFile = resolveMaybeRelative(cwd, details?.file);
      if (hintedFile) files.add(hintedFile);
    }

    if (event.toolName === 'pi_lsp_find_references') {
      const hits = Array.isArray(details?.groupedHits)
        ? details.groupedHits
        : Array.isArray(details?.hits)
          ? details.hits
          : [];
      for (const hit of hits) {
        const resolved = resolveMaybeRelative(cwd, hit?.file);
        if (resolved) files.add(resolved);
      }
    }
  }
  return Array.from(files).sort();
}

function bytesRead(events) {
  let total = 0;
  for (const event of events) {
    if (event.type !== 'tool_execution_end') continue;
    total += Buffer.byteLength(contentText(event.result?.content ?? []), 'utf8');
  }
  return total;
}

function finalAssistantMessage(events) {
  const candidates = events.filter((event) => event.type === 'message_end' && event.message?.role === 'assistant');
  return candidates[candidates.length - 1]?.message ?? null;
}

function finalAnswerText(events) {
  const message = finalAssistantMessage(events);
  return message ? contentText(message.content ?? []) || null : null;
}

function hasAnchor(answer, ...parts) {
  return parts.every((part) => answer.includes(part));
}

function countAnchors(answer, anchors) {
  return anchors.filter((anchor) => answer.includes(anchor)).length;
}

function mentionsBroadRepoDrift(answer) {
  return /README\.md|plan\.md|review\.md|broad view|general overview|whole repo|architecture overview/i.test(answer);
}

function mentionsCurrentCodeEvidence(answer) {
  return /src\/tools\.ts|src\/symbols\.ts|src\/symbol-reference-resolution\.ts|src\/symbol-backends\.ts|src\/symbol-fallback\.ts|findReferences|resolveReferences|findLspReferences|buildReferenceResult/.test(answer);
}

function mentionsExternalRuntime(answer) {
  return /runtime|host|external Pi|lsp_navigation|invokeTool|callTool|runTool/i.test(answer);
}

function mentionsRepoSideGap(answer) {
  return /repo-side|in-repo|repo gap|fallback labeling|metadata|confidence|preview|ranking|dedup|group(ed)?Hits|grouping|scanReferences|reference classification/i.test(answer);
}

function mentionsNoRepoGap(answer) {
  return /repo side:\s*already done|repo already has|not the tool implementation itself|missing piece is not the tool implementation/i.test(answer);
}

function scorePrompt(promptId, condition, answerText, breakdown) {
  const answer = answerText ?? '';
  const treatmentUsage = classifyTreatmentPiLspUsage(breakdown);
  const usedPiLsp = treatmentUsage.totalPiLspCalls > 0;
  const directPiLspAdoption = treatmentUsage.directAdoptionCalls > 0;
  if (promptId === 'A-01') {
    const correct = ['pi_lsp_get_symbol', 'pi_lsp_find_definition', 'pi_lsp_find_references', 'pi_lsp_rank_context', 'pi_lsp_plan_navigation']
      .every((toolName) => answer.includes(toolName));
    return {
      quality_score: correct ? 2 : (answer ? 1 : 0),
      precision_score: condition === 'treatment' && usedPiLsp ? 2 : (answer ? 1 : 0),
      note: condition === 'treatment'
        ? `Treatment ${directPiLspAdoption ? 'used direct' : usedPiLsp ? 'used rank-only' : 'did not use'} pi-lsp symbol tool path.`
        : 'Baseline kept pi-lsp unloaded.',
    };
  }

  if (promptId === 'F-01') {
    const staged = /1\.|2\.|3\.|4\.|5\./.test(answer) || /step 1|step 2|step 3|step 4|step 5/i.test(answer);
    const stage1 = (/src\/tools\.ts/.test(answer) || /src\/commands\.ts/.test(answer)) && /pi_lsp_get_symbol|getSymbolSlice/.test(answer);
    const core = /src\/symbols\.ts/.test(answer) && /getSymbolSlice/.test(answer);
    const backend = /src\/symbol-backends\.ts/.test(answer) && /(findLspCandidates|findAstCandidates)/.test(answer);
    const selection = (/src\/symbol-selection\.ts/.test(answer) && /selectBestResult/.test(answer))
      || (/src\/slices\.ts/.test(answer) && /sliceSymbolFromFile/.test(answer));
    const fallback = /fallback|fall back|ast/i.test(answer);
    const invented = /server\.ts|handleLspRequest|handleDefinitionRequest|provideDocumentSymbols|getIndexedSymbols|SymbolManager|CodeSight API/i.test(answer)
      || (/likely|probably/i.test(answer) && !/insufficient evidence/i.test(answer));
    const fileArgsOnly = !/src\/symbol-backends\.ts|src\/symbol-selection\.ts|src\/slices\.ts/.test(answer);
    const anchored = staged && stage1 && core && backend && selection && fallback && !fileArgsOnly;
    return {
      quality_score: invented ? 0 : anchored ? 2 : ((core || stage1) && !fileArgsOnly ? 1 : 0),
      precision_score: condition === 'treatment' && usedPiLsp && anchored ? 2 : null,
      note: invented
        ? 'Compound failure: ungrounded or invented symbol-flow path.'
        : fileArgsOnly
          ? 'Compound failure: answer stayed within provided fileArgs and never grounded backend/selection hops.'
          : anchored
            ? 'Compound chain grounded beyond fileArgs in current pi-lsp source.'
            : 'Compound chain partially grounded but missing required backend/selection evidence.',
    };
  }


  if (promptId === 'B-01') {
    const grouped = answer.includes('src/index.ts') && answer.includes('registerCodesightTools');
    return {
      quality_score: grouped ? 2 : (answer ? 1 : 0),
      precision_score: null,
      note: condition === 'treatment'
        ? `Treatment ${directPiLspAdoption ? 'used direct' : usedPiLsp ? 'used rank-only' : 'did not use'} pi-lsp reference tool path.`
        : 'Baseline used non-pi-lsp navigation only.',
    };
  }

  if (promptId === 'F-02') {
    const anchored = hasAnchor(answer, 'src/tools.ts')
      && hasAnchor(answer, 'src/queries.ts', 'readRoutes')
      && /breakpoint/i.test(answer);
    const invented = /likely|probably|api endpoint|database|in-memory data structures/i.test(answer);
    return {
      quality_score: invented ? 0 : anchored ? 2 : (answer.includes('readRoutes') || answer.includes('src/queries.ts') ? 1 : 0),
      precision_score: null,
      note: invented
        ? 'Compound failure: route-flow answer remained generic or invented missing layers.'
        : anchored
          ? 'Compound route-flow chain grounded in current pi-codesight source.'
          : 'Compound route-flow chain partially grounded but incomplete.',
    };
  }


  if (promptId === 'C-01') {
    const relevant = /src\/queries\.ts|queries\.ts/.test(answer) && /readRoutes/.test(answer);
    const focused = /src\/tools\.ts|tools\.ts/.test(answer);
    return {
      quality_score: relevant && focused ? 2 : (relevant ? 1 : (answer ? 1 : 0)),
      precision_score: null,
      note: condition === 'treatment'
        ? `Treatment ${directPiLspAdoption ? 'used direct' : usedPiLsp ? 'used rank-only' : 'did not use'} pi-lsp ranking path.`
        : 'Baseline used non-pi-lsp planning path.',
    };
  }

  if (promptId === 'C-02') {
    const coreAnchors = [
      'src/symbols.ts',
      'src/symbol-backends.ts',
      'src/symbol-selection.ts',
      'src/symbol-reference-resolution.ts',
      'src/symbol-normalization.ts',
      'src/symbol-fallback.ts',
    ];
    const anchorCount = countAnchors(answer, coreAnchors);
    const broadDrift = mentionsBroadRepoDrift(answer) || /README|plan|review|index\.ts|commands\.ts|state\.ts|types\.ts/.test(answer);
    const testAllowance = countAnchors(answer, ['test/tools.test.ts', 'test/ranking.test.ts']);
    const quality = broadDrift && anchorCount < 4
      ? 0
      : anchorCount >= 4 && testAllowance <= 1
        ? 2
        : answer ? 1 : 0;
    return {
      quality_score: quality,
      precision_score: condition === 'treatment' && usedPiLsp && anchorCount >= 4 && !broadDrift ? 2 : (anchorCount >= 3 ? 1 : 0),
      note: broadDrift
        ? 'Ranking regression: answer drifted toward broad repo summary or non-core files.'
        : anchorCount >= 4
          ? 'Ranking answer stayed on the concrete pi-lsp symbol-resolution path.'
          : 'Ranking answer was only partially anchored in the symbol-resolution path.',
    };
  }

  if (promptId === 'F-03') {
    const staged = /stage 1|stage 2/i.test(answer);
    const stage1Anchored = (/codesight_get_routes/.test(answer) || /registerCodesightTools/.test(answer))
      && /pi-codesight\/src\/tools\.ts/.test(answer);
    const stage2Anchored = /pi-codesight\/src\/queries\.ts/.test(answer) && /readRoutes\(/.test(answer);
    const impactAnchored = /pi-codesight\/test\/queries\.test\.ts|pi-codesight\/src\/index\.ts|pi-codesight\/test\/tools\.test\.ts/.test(answer);
    const bannedPrimaryEvidence = /review\.md/.test(answer) || /plan\.md/.test(answer);
    const explicitUncertainty = /insufficient evidence/i.test(answer);
    const invented = /likely|probably|maybe|might want to|could inspect/i.test(answer) && !explicitUncertainty;
    const fileArgsOnly = !/pi-codesight\/src\/queries\.ts|pi-codesight\/test\/queries\.test\.ts|pi-codesight\/src\/index\.ts/.test(answer);
    const anchored = staged && stage1Anchored && stage2Anchored && impactAnchored && !bannedPrimaryEvidence && !fileArgsOnly;
    return {
      quality_score: invented ? 0 : anchored ? 2 : (staged && (stage1Anchored || stage2Anchored) && !fileArgsOnly ? 1 : 0),
      precision_score: condition === 'treatment' && usedPiLsp && anchored ? 2 : null,
      note: invented
        ? 'Compound failure: staged plan relied on speculative or weakly grounded navigation.'
        : fileArgsOnly
          ? 'Compound failure: staged plan never moved beyond provided fileArgs to ground implementation/impact.'
          : anchored
            ? 'Compound staged plan grounded in route surface, exact call edge, and verified impact sites beyond fileArgs.'
            : bannedPrimaryEvidence
              ? 'Compound staged plan leaned on review/plan docs instead of primary source grounding.'
              : 'Compound staged plan had order but weak source grounding.',
    };
  }


  if (promptId === 'D-02') {
    const repoEvidence = mentionsCurrentCodeEvidence(answer);
    const externalRuntime = mentionsExternalRuntime(answer);
    const repoGap = mentionsRepoSideGap(answer);
    const deniesRepoGap = mentionsNoRepoGap(answer);
    const stalePlaceholderClaim = /placeholder in tools\.ts|not implemented yet|placeholder behavior in tools\.ts/i.test(answer);
    const bulletShape = /1\)|2\)|^- /m.test(answer);
    const quality = stalePlaceholderClaim
      ? 0
      : repoEvidence && repoGap && !deniesRepoGap && (bulletShape || externalRuntime)
        ? 2
        : repoEvidence || externalRuntime
          ? 1
          : 0;
    return {
      quality_score: quality,
      precision_score: condition === 'treatment' && usedPiLsp && quality === 2 ? 2 : (quality === 1 ? 1 : 0),
      note: stalePlaceholderClaim
        ? 'Debug regression: answer relied on stale placeholder framing.'
        : quality === 2
          ? 'Debug answer separated current repo gaps from external runtime dependencies.'
          : deniesRepoGap
            ? 'Debug answer over-credited runtime dependencies and under-isolated repo-side gaps.'
            : 'Debug answer was only partially grounded in current reference-resolution code.',
    };
  }

  if (promptId === 'E-01') {
    const correct = /thin pi extension|symbol-level code navigation|code navigation/i.test(answer)
      && /codesight|symbol|definition|reference|rank/i.test(answer);
    const wrongProject = /minimal terminal coding harness|prompt templates|themes|sdk modes|interactive, print or json/i.test(answer);
    return {
      quality_score: wrongProject ? 0 : (correct && !usedPiLsp ? 2 : (answer ? 1 : 0)),
      precision_score: null,
      note: wrongProject
        ? 'Control failure: answered from wrong README/project context.'
        : usedPiLsp
          ? 'Control regression: pi-lsp tools used on README-only task.'
          : 'Control task avoided unnecessary pi-lsp usage.',
    };
  }

  return {
    quality_score: answer ? 1 : 0,
    precision_score: null,
    note: 'No prompt-specific scorer configured.',
  };
}

function fileArgsForPrompt(spec) {
  if (!Array.isArray(spec?.fileArgs)) return [];
  return spec.fileArgs
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => `@${value}`);
}


function buildPiArgs(condition, spec, options, sessionDir) {
  const args = [
    '--mode', 'json',
    '--print',
    '--session-dir', sessionDir,
    '--thinking', options.thinking,
    '--tools', 'read,bash,edit,write,grep,find,ls',
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-themes',
  ];

  if (options.stack === 'codesight') args.push('--extension', codesightExtension);
  if (condition === 'treatment') args.push('--extension', piLspExtension);
  if (options.provider) args.push('--provider', options.provider);
  if (options.model) args.push('--model', options.model);
  args.push(...fileArgsForPrompt(spec));
  args.push(spec.prompt);
  return args;
}

function runPi(command, args, cwd, env, rawEventsPath, stderrPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      fs.writeFileSync(rawEventsPath, stdout, 'utf8');
      fs.writeFileSync(stderrPath, stderr, 'utf8');
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

function parseEvents(stdout) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // ignore non-json lines
    }
  }
  return events;
}

function summarizeRowGroup(rows, selectedIds, options) {
  const baselineLabel = options.stack === 'raw' ? 'raw pi only' : 'pi-codesight only';
  const treatmentLabel = options.stack === 'raw' ? 'raw pi + pi-lsp' : 'pi-codesight + pi-lsp';
  const lines = [
    `# Live benchmark summary — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `> Fresh-session live runs via \`pi --mode json --print\` with explicit extension control. Stack = \`${options.stack}\`. Token fields come from recorded session JSONL assistant usage blocks; cost is only as reliable as those usage blocks.`,
    '',
    '## Prompt-level comparison',
    '',
    '| prompt_id | suite | baseline_duration_ms | treatment_duration_ms | baseline_tool_calls | treatment_tool_calls | baseline_files_read | treatment_files_read | baseline_quality | treatment_quality | baseline_input_tokens | treatment_input_tokens | baseline_cost | treatment_cost | notes |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];

  for (const promptId of selectedIds) {
    const baseline = rows.find((row) => row.prompt_id === promptId && row.condition === 'baseline');
    const treatment = rows.find((row) => row.prompt_id === promptId && row.condition === 'treatment');
    lines.push(`| ${promptId} | ${baseline?.suite ?? treatment?.suite ?? 'unknown'} | ${baseline?.duration_ms ?? 'n/a'} | ${treatment?.duration_ms ?? 'n/a'} | ${baseline?.tool_calls ?? 'n/a'} | ${treatment?.tool_calls ?? 'n/a'} | ${baseline?.files_read ?? 'n/a'} | ${treatment?.files_read ?? 'n/a'} | ${baseline?.quality_score ?? 'n/a'} | ${treatment?.quality_score ?? 'n/a'} | ${baseline?.input_tokens ?? 'n/a'} | ${treatment?.input_tokens ?? 'n/a'} | ${baseline?.cost ?? 'n/a'} | ${treatment?.cost ?? 'n/a'} | ${treatment?.notes ?? baseline?.notes ?? ''} |`);
  }

  lines.push('', summarizeTreatmentUsage(rows, selectedIds), '', '## Notes', '', '- `fresh_session` control: every run gets its own dedicated `--session-dir`.', `- baseline loads ${baselineLabel}.`, `- treatment loads ${treatmentLabel}.`, '- raw JSON event streams and stderr logs live under `benchmarks/results/live-runs/` unless cleanup requested.');
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

async function runOne(promptId, condition, spec, options) {
  const timestamp = new Date();
  const dateTag = timestamp.toISOString().slice(0, 10);
  const runId = `live-${dateTag}-${promptId.toLowerCase()}-${condition}`;
  const runDir = path.join(liveRunsDir, runId);
  const sessionDir = path.join(runDir, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });

  const args = buildPiArgs(condition, spec, options, sessionDir);
  const commandRecordPath = path.join(runDir, 'command.json');
  const rawEventsPath = path.join(runDir, 'events.jsonl');
  const stderrPath = path.join(runDir, 'stderr.log');
  fs.writeFileSync(commandRecordPath, JSON.stringify({ cwd: spec.cwd, command: 'pi', args }, null, 2) + '\n', 'utf8');

  if (options.dryRun) {
    return {
      run_id: runId,
      condition,
      suite: spec.suite,
      prompt_id: promptId,
      cwd: spec.cwd,
      timestamp: timestamp.toISOString(),
      model: options.model ?? 'default-live-model',
      thinking_level: options.thinking,
      stack: options.stack,
      input_tokens: null,
      output_tokens: null,
      cost: null,
      duration_ms: null,
      turns: null,
      tool_calls: null,
      tool_call_breakdown: {},
      files_read: null,
      bytes_read: null,
      quality_score: 0,
      precision_score: null,
      answer_text: null,
      session_path: null,
      notes: `DRY RUN only. Stack=${options.stack}. Command recorded at ${commandRecordPath}`,
    };
  }

  const envPath = [
    ...runtimeBinDirs,
    process.env.PATH ?? '',
  ].filter(Boolean).join(path.delimiter);
  const env = {
    ...process.env,
    PATH: envPath,
    PI_OFFLINE: process.env.PI_OFFLINE ?? '1',
  };

  const startedAt = Date.now();
  const outcome = await runPi(piBin, args, spec.cwd, env, rawEventsPath, stderrPath, options.rowTimeoutMs);
  const duration = Date.now() - startedAt;
  const events = parseEvents(outcome.stdout);
  const answerText = finalAnswerText(events);
  const breakdown = toolBreakdown(events);
  const sessionPath = findSessionPath(sessionDir);
  const usage = sessionUsageFromPath(sessionPath);
  const misuse = rankContextMisuseMetrics(events);
  const misuseSummary = misuseNote(misuse);

  const baseRow = {
    run_id: runId,
    condition,
    suite: spec.suite,
    prompt_id: promptId,
    cwd: spec.cwd,
    timestamp: timestamp.toISOString(),
    model: finalAssistantMessage(events)?.model ?? options.model ?? 'default-live-model',
    thinking_level: options.thinking,
    stack: options.stack,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost: usage.cost,
    duration_ms: outcome.code === 0 ? duration : null,
    turns: outcome.code === 0 ? events.filter((event) => event.type === 'turn_end').length : null,
    tool_calls: outcome.code === 0 ? Object.values(breakdown).reduce((sum, count) => sum + count, 0) : null,
    tool_call_breakdown: breakdown,
    files_read: outcome.code === 0 ? distinctFilesRead(events, spec.cwd).length : null,
    bytes_read: outcome.code === 0 ? bytesRead(events) : null,
    treatment_usage_class: condition === 'treatment' ? classifyTreatmentPiLspUsage(breakdown).usage_class : null,
    treatment_direct_adoption_calls: condition === 'treatment' ? classifyTreatmentPiLspUsage(breakdown).directAdoptionCalls : null,
    treatment_context_calls: condition === 'treatment' ? classifyTreatmentPiLspUsage(breakdown).treatmentContextCalls : null,
    quality_score: 0,
    precision_score: null,
    answer_text: answerText,
    session_path: sessionPath,
    notes: '',
  };

  if (outcome.code !== 0) {
    baseRow.notes = outcome.timedOut
      ? `LIVE RUN FAILED. timeout=${options.rowTimeoutMs}ms signal=${outcome.signal ?? 'none'}. stderr: ${outcome.stderr.trim() || 'none'}`
      : `LIVE RUN FAILED. exit=${outcome.code} signal=${outcome.signal ?? 'none'}. stderr: ${outcome.stderr.trim() || 'none'}`;
    return baseRow;
  }

  const scoring = scorePrompt(promptId, condition, answerText, breakdown);
  const files = distinctFilesRead(events, spec.cwd);
  baseRow.quality_score = scoring.quality_score;
  baseRow.precision_score = scoring.precision_score;
  const treatmentUsage = condition === 'treatment' ? classifyTreatmentPiLspUsage(breakdown) : null;
  const baselineLabel = options.stack === 'raw' ? 'raw pi only' : 'codesight only';
  const treatmentLabel = options.stack === 'raw' ? 'raw pi + pi-lsp' : 'codesight + pi-lsp';
  baseRow.notes = [
    'fresh_session live run.',
    condition === 'treatment'
      ? `treatment tools loaded: ${treatmentLabel}. usage_class=${treatmentUsage.usage_class}. direct_calls=${treatmentUsage.directAdoptionCalls}. context_calls=${treatmentUsage.treatmentContextCalls}.`
      : `baseline tools loaded: ${baselineLabel}.`,
    scoring.note,
    misuseSummary,
    usage.note,
    `files touched: ${files.join(', ') || 'none'}.`,
    `raw artifacts: ${runDir}`,
  ].filter(Boolean).join(' ');
  return baseRow;
}

async function main() {
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(liveRunsDir, { recursive: true });

  const options = parseArgs(process.argv.slice(2));
  validateStackOption(options.stack);
  const catalog = loadPromptCatalog();
  const selectedIds = options.ids ?? promptIdsFromCatalog(catalog);

  if (options.list) {
    for (const id of selectedIds) console.log(id);
    return;
  }

  const missing = selectedIds.filter((id) => !catalog.has(id));
  if (missing.length > 0) fail(`Unknown prompt ids: ${missing.join(', ')}`);

  const rows = [];
  for (const promptId of selectedIds) {
    const spec = catalog.get(promptId);
    for (const condition of options.conditions) {
      const row = await runOne(promptId, condition, spec, options);
      rows.push(row);
      console.error(`[bench] ${promptId} ${condition}: quality=${row.quality_score} tools=${row.tool_calls ?? 'n/a'} duration=${row.duration_ms ?? 'n/a'}ms`);
    }
  }

  const outPath = options.out
    ? path.resolve(options.out)
    : path.join(resultsDir, `live-benchmark-${new Date().toISOString().slice(0, 10)}.jsonl`);
  const summaryPath = outPath.replace(/\.jsonl$/, '-summary.md');
  fs.writeFileSync(outPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(summaryPath, summarizeRowGroup(rows, selectedIds, options), 'utf8');

  if (!options.keepArtifacts) {
    for (const row of rows) {
      const artifacts = row.notes.match(/raw artifacts: (.+)$/)?.[1];
      if (artifacts && fs.existsSync(artifacts)) fs.rmSync(artifacts, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({ outPath, summaryPath, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
