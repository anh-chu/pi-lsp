import { statSync } from 'node:fs';

export interface CacheEntry<T> {
  value: T;
  mtimeMs?: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string): CacheEntry<T> | undefined {
  return cache.get(key) as CacheEntry<T> | undefined;
}

export function setCache<T>(key: string, value: T, mtimeMs?: number) {
  cache.set(key, { value, mtimeMs });
}

export function clearCache() {
  cache.clear();
}

export function invalidateCache(keyPrefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}

export function readFreshCache<T>(key: string, mtimeMs?: number): T | undefined {
  const entry = getCache<T>(key);
  if (!entry) return undefined;
  if (mtimeMs === undefined || entry.mtimeMs === undefined || entry.mtimeMs >= mtimeMs) {
    return entry.value;
  }
  cache.delete(key);
  return undefined;
}

export function getFileMtimeMs(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

export function buildCacheKey(prefix: string, params: Record<string, unknown>) {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('|');
  return `${prefix}:${normalized}`;
}
