#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Failed to read JSON from ${filePath}: ${error.message}`);
  }
}

function readJsonlFirstMatch(filePath, predicate) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (predicate(parsed)) return parsed;
  }
  return null;
}

function readJsonlAllMatches(filePath, predicate) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const matches = [];
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (predicate(parsed)) matches.push(parsed);
  }
  return matches;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

function sumNumeric(records, fieldPath) {
  return records.reduce((total, record) => {
    const value = fieldPath.reduce((current, key) => (current == null ? undefined : current[key]), record);
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

function pickNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number') return value;
  }
  return null;
}

function buildAggregateUsage(usage) {
  const suggestionUsage = usage?.suggestionUsage ?? {};
  return {
    input_tokens: pickNumber(suggestionUsage.inputTokens, usage?.inputTokens),
    output_tokens: pickNumber(suggestionUsage.outputTokens, usage?.outputTokens),
    cost: pickNumber(suggestionUsage.costTotal, usage?.costTotal),
    calls: pickNumber(suggestionUsage.calls, usage?.calls),
    source: typeof usage?.suggestionUsage === 'object' && usage?.suggestionUsage != null
      ? 'usage.json:suggestionUsage'
      : 'usage.json:root',
  };
}

function buildEventSummary(eventsPath, sessionId, absoluteSessionPath) {
  const eventRecords = readJsonlAllMatches(eventsPath, (record) => {
    const eventMeta = record?.meta;
    if (!eventMeta || typeof eventMeta !== 'object') return false;
    return eventMeta.sessionId === sessionId || eventMeta.sessionFile === absoluteSessionPath;
  });

  if (eventRecords.length === 0) {
    return {
      matched_event_count: 0,
      matched_messages: [],
      input_tokens_sum: null,
      output_tokens_sum: null,
      cost_sum: null,
      note: 'No unambiguous session-linked events found in events.ndjson; use usage.json aggregate only.',
    };
  }

  return {
    matched_event_count: eventRecords.length,
    matched_messages: Array.from(new Set(eventRecords.map((record) => record.message).filter(Boolean))).sort(),
    input_tokens_sum: sumNumeric(eventRecords, ['meta', 'inputTokens']),
    output_tokens_sum: sumNumeric(eventRecords, ['meta', 'outputTokens']),
    cost_sum: sumNumeric(eventRecords, ['meta', 'cost']),
    note: 'Audit only. Do not merge event totals into benchmark rows unless event semantics are explicitly validated for the same session.',
  };
}

function normalizeSessionLink(sessionPath) {
  if (!sessionPath || typeof sessionPath !== 'string') {
    fail('Benchmark row must include a non-null session_path to resolve Pi usage.');
  }

  const expanded = sessionPath.startsWith('~/')
    ? path.join(process.env.HOME ?? '', sessionPath.slice(2))
    : sessionPath;
  const absoluteSessionPath = path.resolve(expanded);
  const sessionBase = path.basename(absoluteSessionPath);
  const match = sessionBase.match(/_([0-9a-fA-F-]{36})\.jsonl$/);
  if (!match) {
    fail(`Could not extract session id from session_path: ${sessionPath}`);
  }

  return {
    absoluteSessionPath,
    sessionId: match[1],
  };
}

function main() {
  const [, , rowFileArg, rowIdArg] = process.argv;
  if (!rowFileArg || !rowIdArg) {
    fail('Usage: node benchmarks/results/extract-pi-usage-from-row.mjs <results.jsonl> <run_id>');
  }

  const rowFile = path.resolve(rowFileArg);
  if (!fs.existsSync(rowFile)) fail(`Results file not found: ${rowFile}`);

  const row = readJsonlFirstMatch(rowFile, (record) => record?.run_id === rowIdArg);
  if (!row) fail(`Run id not found in ${rowFile}: ${rowIdArg}`);

  const { absoluteSessionPath, sessionId } = normalizeSessionLink(row.session_path);
  const suggesterSessionDir = path.join(process.env.HOME ?? '', '.pi', 'suggester', 'sessions', sessionId);
  const metaPath = path.join(suggesterSessionDir, 'meta.json');
  const usagePath = path.join(suggesterSessionDir, 'usage.json');
  const eventsPath = path.join(process.env.HOME ?? '', '.pi', 'suggester', 'logs', 'events.ndjson');

  if (!fs.existsSync(metaPath)) fail(`Expected meta.json not found for session ${sessionId}: ${metaPath}`);
  if (!fs.existsSync(usagePath)) fail(`Expected usage.json not found for session ${sessionId}: ${usagePath}`);

  const meta = readJson(metaPath);
  const usage = readJson(usagePath);
  const recordedSessionFile = meta?.sessionFile;
  const recordedSessionId = meta?.sessionId;
  if (recordedSessionFile !== absoluteSessionPath) {
    fail([
      'session_path does not match suggester metadata.',
      `benchmark row session_path: ${absoluteSessionPath}`,
      `meta.json sessionFile: ${recordedSessionFile ?? 'null'}`,
      'Refuse to attribute token/cost usage ambiguously.',
    ].join('\n'));
  }
  if (recordedSessionId != null && recordedSessionId !== sessionId) {
    fail([
      'session_id derived from session_path does not match suggester metadata.',
      `derived session_id: ${sessionId}`,
      `meta.json sessionId: ${recordedSessionId}`,
      'Refuse to attribute token/cost usage ambiguously.',
    ].join('\n'));
  }

  const aggregateUsage = buildAggregateUsage(usage);
  const aggregate = {
    ...aggregateUsage,
    usage_path: usagePath,
    meta_path: metaPath,
    session_id: sessionId,
    session_path: absoluteSessionPath,
    updated_at: usage?.updatedAt ?? null,
  };

  const eventSummary = fs.existsSync(eventsPath)
    ? buildEventSummary(eventsPath, sessionId, absoluteSessionPath)
    : {
        matched_event_count: 0,
        matched_messages: [],
        input_tokens_sum: null,
        output_tokens_sum: null,
        cost_sum: null,
        note: 'events.ndjson was not present; usage.json aggregate remains the canonical source.',
      };

  console.log(JSON.stringify({ run_id: row.run_id, aggregate, event_summary: eventSummary }, null, 2));
}

main();
