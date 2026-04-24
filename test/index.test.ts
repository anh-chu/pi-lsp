import test from 'node:test';
import assert from 'node:assert/strict';
import register from '../src/index.ts';
import { fakePi } from './helpers.ts';

test('index registers tools and commands', () => {
  const pi = fakePi();
  register(pi);
  assert.equal(pi.tools.length, 7);
  assert.equal(typeof pi.commands.symbol?.handler, 'function');
  assert.equal(typeof pi.commands.refs?.handler, 'function');
  assert.equal(typeof pi.commands.rank?.handler, 'function');
  assert.equal(typeof pi.commands.nav?.handler, 'function');
});
