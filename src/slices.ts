import { existsSync, readFileSync } from 'node:fs';

export interface SliceRequest {
  line: number;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
  includeBody?: boolean;
}

export function readFileSlice(file: string, startLine: number, endLine: number) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start - 1, end).join('\n');
}

export function expandRange(line: number, contextLines = 6) {
  return {
    startLine: Math.max(1, line - contextLines),
    endLine: line + contextLines,
  };
}

export function sliceSymbolFromFile(file: string, request: SliceRequest) {
  if (!existsSync(file)) {
    return {
      content: '',
      startLine: request.startLine ?? request.line,
      endLine: request.endLine ?? request.line,
    };
  }

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const declarationStart = request.startLine ?? request.line;
  const declarationEnd = request.includeBody ? (request.endLine ?? request.line) : request.line;
  const contextLines = request.contextLines ?? 0;
  const startLine = Math.max(1, declarationStart - contextLines);
  const endLine = Math.min(lines.length, declarationEnd + contextLines);

  return {
    content: lines.slice(startLine - 1, endLine).join('\n'),
    startLine,
    endLine,
  };
}
