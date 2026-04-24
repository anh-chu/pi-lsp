/** Supported ast-grep languages */
export const LANGUAGES = [
  'c',
  'cpp',
  'csharp',
  'css',
  'dart',
  'elixir',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'sql',
  'swift',
  'tsx',
  'typescript',
  'yaml',
] as const;

export type Language = (typeof LANGUAGES)[number];
