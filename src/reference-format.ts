import type { ReferenceFileGroup, ReferenceHit } from './types.ts';
import type { BackendName } from './symbol-backends.ts';
import { strongerConfidence } from './symbol-normalization.ts';

export function groupReferenceHits(
  hits: ReferenceHit[],
  backend: BackendName,
  fallback: boolean,
  confidence: 'high' | 'medium' | 'low',
): ReferenceFileGroup[] {
  const groups = new Map<string, ReferenceFileGroup>();

  for (const hit of hits) {
    const existing = groups.get(hit.file);
    const lineInfo = {
      line: hit.line,
      character: hit.character,
      preview: hit.preview,
      confidence: hit.confidence ?? confidence,
      backend: hit.backend ?? backend,
      fallback: hit.fallback ?? fallback,
    };

    if (existing) {
      existing.count += 1;
      existing.lines.push(lineInfo);
      existing.confidence = strongerConfidence(existing.confidence, lineInfo.confidence ?? confidence);
      existing.fallback = existing.fallback || Boolean(lineInfo.fallback);
      continue;
    }

    groups.set(hit.file, {
      file: hit.file,
      count: 1,
      confidence: lineInfo.confidence ?? confidence,
      backend: lineInfo.backend ?? backend,
      fallback: Boolean(lineInfo.fallback),
      lines: [lineInfo],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      lines: group.lines.sort((left, right) => left.line - right.line),
    }))
    .sort((left, right) => {
      if (left.file !== right.file) return left.file.localeCompare(right.file);
      return left.lines[0]!.line - right.lines[0]!.line;
    });
}

export function formatReferenceGroups(groups: ReferenceFileGroup[]): string[] {
  return groups.slice(0, 8).flatMap((group) => {
    const header = `- file: ${group.file} (${group.count} hit${group.count === 1 ? '' : 's'}, backend=${group.backend}, confidence=${group.confidence}, fallback=${group.fallback ? 'yes' : 'no'})`;
    const lines = group.lines.slice(0, 3).map((hit) => `  - line ${hit.line}${hit.character ? `:${hit.character}` : ''}${hit.preview ? ` — ${hit.preview}` : ''}`);
    return [header, ...lines];
  });
}
