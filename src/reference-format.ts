import { basename } from 'node:path';
import type { ReferenceFileGroup, ReferenceHit } from './types.ts';
import type { BackendName } from './symbol-backends.ts';
import { strongerConfidence } from './symbol-normalization.ts';

function scoreReferencePreview(hit: ReferenceHit): { priority: number; reason: string } {
  const preview = hit.preview ?? '';
  const compact = preview.replace(/\s+/g, ' ').trim();
  const lower = compact.toLowerCase();
  let priority = 0;
  const reasons: string[] = [];

  if (/\b(from|require\s*\()/.test(lower)) {
    priority += 5;
    reasons.push('import/export boundary');
  }
  if (/\b(export\b|public\b)/.test(lower)) {
    priority += 3;
    reasons.push('exported or public usage');
  }
  if (/\b(new\s+[a-z_$]|extends\b|implements\b)/.test(lower)) {
    priority += 4;
    reasons.push('construction or type relationship');
  }
  if (/\b(return\b|await\b|if\b|switch\b|throw\b)/.test(lower)) {
    priority += 2;
    reasons.push('control flow usage');
  }
  if (/\b(console\.|logger\.|describe\(|it\(|test\()/.test(lower)) {
    priority -= 2;
    reasons.push('debug/test style usage');
  }
  if (/\bfunction\b|=>/.test(lower)) {
    priority += 1;
    reasons.push('callable context');
  }

  priority += Math.max(0, 3 - Math.floor(Math.max(0, hit.line - 1) / 40));
  reasons.push(hit.line <= 40 ? 'earlier file position' : 'deeper file position');

  return {
    priority,
    reason: reasons.join(', '),
  };
}

function scoreReferenceGroup(file: string, lines: ReferenceFileGroup['lines']): { impactScore: number; impactReason: string; topPreview?: ReferenceFileGroup['topPreview'] } {
  const topLine = [...lines].sort((left, right) => {
    const priorityDelta = (right.previewPriority ?? 0) - (left.previewPriority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return left.line - right.line;
  })[0];

  const baseName = basename(file).toLowerCase();
  let impactScore = lines.length * 10 + (topLine?.previewPriority ?? 0);
  const reasons = [`${lines.length} grounded hit${lines.length === 1 ? '' : 's'}`];

  if (baseName.includes('test') || baseName.includes('spec')) {
    impactScore -= 6;
    reasons.push('test file deprioritized');
  } else {
    impactScore += 4;
    reasons.push('non-test caller file');
  }

  if (baseName.includes('index')) {
    impactScore -= 2;
    reasons.push('aggregator-style file');
  }

  if (topLine?.previewPriorityReason) reasons.push(`top preview: ${topLine.previewPriorityReason}`);

  return {
    impactScore,
    impactReason: reasons.join(', '),
    topPreview: topLine
      ? {
          line: topLine.line,
          character: topLine.character,
          preview: topLine.preview,
          previewPriority: topLine.previewPriority,
          previewPriorityReason: topLine.previewPriorityReason,
        }
      : undefined,
  };
}

export function groupReferenceHits(
  hits: ReferenceHit[],
  backend: BackendName,
  fallback: boolean,
  confidence: 'high' | 'medium' | 'low',
): ReferenceFileGroup[] {
  const groups = new Map<string, ReferenceFileGroup>();

  for (const hit of hits) {
    const previewRanking = scoreReferencePreview(hit);
    const existing = groups.get(hit.file);
    const lineInfo = {
      line: hit.line,
      character: hit.character,
      preview: hit.preview,
      confidence: hit.confidence ?? confidence,
      backend: hit.backend ?? backend,
      fallback: hit.fallback ?? fallback,
      previewPriority: previewRanking.priority,
      previewPriorityReason: previewRanking.reason,
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
    .map((group) => {
      const sortedLines = group.lines.sort((left, right) => {
        const priorityDelta = (right.previewPriority ?? 0) - (left.previewPriority ?? 0);
        if (priorityDelta !== 0) return priorityDelta;
        return left.line - right.line;
      });
      const impact = scoreReferenceGroup(group.file, sortedLines);
      return {
        ...group,
        lines: sortedLines,
        topPreview: impact.topPreview,
        impactScore: impact.impactScore,
        impactReason: impact.impactReason,
      };
    })
    .sort((left, right) => {
      const impactDelta = (right.impactScore ?? 0) - (left.impactScore ?? 0);
      if (impactDelta !== 0) return impactDelta;
      if (left.file !== right.file) return left.file.localeCompare(right.file);
      return left.lines[0]!.line - right.lines[0]!.line;
    });
}

export function formatReferenceGroups(groups: ReferenceFileGroup[]): string[] {
  return groups.slice(0, 8).flatMap((group, index) => {
    const header = `- ${index === 0 ? 'best next caller' : 'impact file'}: ${group.file} (${group.count} hit${group.count === 1 ? '' : 's'}, impact=${group.impactScore ?? 0}, backend=${group.backend}, confidence=${group.confidence}, fallback=${group.fallback ? 'yes' : 'no'})`;
    const reason = group.impactReason ? `  - why: ${group.impactReason}` : null;
    const lines = group.lines.slice(0, 3).map((hit, hitIndex) => {
      const label = hitIndex === 0 ? 'top preview' : 'line';
      const priority = typeof hit.previewPriority === 'number' ? `, priority=${hit.previewPriority}` : '';
      const rationale = hit.previewPriorityReason ? `, why=${hit.previewPriorityReason}` : '';
      return `  - ${label} ${hit.line}${hit.character ? `:${hit.character}` : ''}${priority}${rationale}${hit.preview ? ` — ${hit.preview}` : ''}`;
    });
    return [header, ...(reason ? [reason] : []), ...lines];
  });
}
