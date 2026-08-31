import 'server-only';

type Entry<T> = { value: T; expiresAt: number };
const cache = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const current = cache.get(key) as Entry<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

export function invalidateCache(prefix?: string) {
  if (!prefix) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}
