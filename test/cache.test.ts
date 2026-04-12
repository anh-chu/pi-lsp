import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCache, getCache, invalidateCache, setCache, readFreshCache, buildCacheKey } from '../src/cache.ts';

test('cache set/get/clear works', () => {
  clearCache();
  setCache('symbol:def:demo', { ok: true }, 123);
  assert.deepEqual(getCache<{ ok: boolean }>('symbol:def:demo')?.value, { ok: true });
  clearCache();
  assert.equal(getCache('symbol:def:demo'), undefined);
});

test('cache invalidates by prefix', () => {
  clearCache();
  setCache('symbol:def:a', 1);
  setCache('symbol:refs:a', 2);
  invalidateCache('symbol:def:');
  assert.equal(getCache('symbol:def:a'), undefined);
  assert.equal(getCache('symbol:refs:a')?.value, 2);
});

test('readFreshCache evicts stale entries', () => {
  clearCache();
  setCache('symbol:slice:demo', { ok: true }, 100);
  assert.deepEqual(readFreshCache<{ ok: boolean }>('symbol:slice:demo', 100), { ok: true });
  assert.equal(readFreshCache('symbol:slice:demo', 101), undefined);
  assert.equal(getCache('symbol:slice:demo'), undefined);
});

test('buildCacheKey normalizes parameter ordering and undefined values', () => {
  assert.equal(
    buildCacheKey('symbol:def', { file: 'src/demo.ts', symbol: 'hello', includeBody: undefined }),
    buildCacheKey('symbol:def', { symbol: 'hello', file: 'src/demo.ts' }),
  );
});
