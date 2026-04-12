export function formatCompactSection(title: string, lines: string[]) {
  const body = lines.filter(Boolean).join('\n');
  return body ? `${title}\n${body}` : title;
}

export function truncateText(text: string, max = 4000) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\n…`;
}

export function bulletize(lines: string[]) {
  return lines.map((line) => (line.startsWith('- ') ? line : `- ${line}`));
}
