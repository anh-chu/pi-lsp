import test from 'node:test';
import assert from 'node:assert/strict';
import { rankContext } from '../src/ranking.ts';
import { getState, rememberMentionedFile, rememberQueriedSymbol, setLastRankedItems } from '../src/state.ts';

function resetRankingState() {
  const state = getState();
  state.mentionedFiles.length = 0;
  state.readFiles.length = 0;
  state.queriedSymbols.length = 0;
  setLastRankedItems([]);
}

test('ranking surfaces recently mentioned file and symbol', () => {
  resetRankingState();

  rememberMentionedFile('src/tools.ts');
  rememberQueriedSymbol('runRefresh');
  const result = rankContext('routes bug', 10);

  assert.equal(result.sessionState.hasConcreteEvidence, true);
  assert.equal(result.items.some((item) => item.kind === 'file' && item.id === 'src/tools.ts'), true);
  assert.equal(result.items.some((item) => item.kind === 'symbol' && item.id === 'runRefresh'), true);
});

test('ranking remains de-duplicated after repeated mentions and queries', () => {
  resetRankingState();

  rememberMentionedFile('src/demo.ts');
  rememberMentionedFile('src/demo.ts');
  rememberQueriedSymbol('hello');
  rememberQueriedSymbol('hello');

  const result = rankContext('hello demo', 10);
  assert.equal(result.items.filter((item) => item.kind === 'file' && item.id === 'src/demo.ts').length, 1);
  assert.equal(result.items.filter((item) => item.kind === 'symbol' && item.id === 'hello').length, 1);
});

test('ranking makes fresh-session limitations explicit and withholds ranked items', () => {
  resetRankingState();

  const result = rankContext('routes bug', 10);

  assert.equal(result.sessionState.hasConcreteEvidence, false);
  assert.equal(result.status, 'fresh-session');
  assert.equal(result.confidence, 'low');
  assert.equal(result.shouldRerunAfterEvidence, true);
  assert.equal(
    result.note,
    'Fresh-session warning only. No files have been mentioned or read and no symbols have been queried in this run yet. Ranked items are intentionally withheld, and the query itself is not echoed back as a ranked candidate until some session evidence exists.',
  );
  assert.match(result.guidance.join('\n'), /do not treat this output as repo search/i);
  assert.equal(result.items.length, 0);
});
