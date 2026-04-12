import test from 'node:test';
import assert from 'node:assert/strict';
import { rankContext } from '../src/ranking.ts';
import { getState, rememberMentionedFile, rememberQueriedSymbol, setLastRankedItems } from '../src/state.ts';

test('ranking surfaces recently mentioned file and symbol', () => {
  const state = getState();
  state.mentionedFiles.length = 0;
  state.readFiles.length = 0;
  state.queriedSymbols.length = 0;
  setLastRankedItems([]);

  rememberMentionedFile('src/tools.ts');
  rememberQueriedSymbol('runRefresh');
  const result = rankContext('routes bug', 10);

  assert.equal(result.some((item) => item.kind === 'file' && item.id === 'src/tools.ts'), true);
  assert.equal(result.some((item) => item.kind === 'symbol' && item.id === 'runRefresh'), true);
});

test('ranking remains de-duplicated after repeated mentions and queries', () => {
  const state = getState();
  state.mentionedFiles.length = 0;
  state.readFiles.length = 0;
  state.queriedSymbols.length = 0;
  setLastRankedItems([]);

  rememberMentionedFile('src/demo.ts');
  rememberMentionedFile('src/demo.ts');
  rememberQueriedSymbol('hello');
  rememberQueriedSymbol('hello');

  const result = rankContext('hello demo', 10);
  assert.equal(result.filter((item) => item.kind === 'file' && item.id === 'src/demo.ts').length, 1);
  assert.equal(result.filter((item) => item.kind === 'symbol' && item.id === 'hello').length, 1);
});
