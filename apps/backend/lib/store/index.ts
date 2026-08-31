import 'server-only';

type StoreKey = string;
type StoreValue = unknown;
const volatile = new Map<StoreKey, StoreValue>();

export const runtimeStore = {
  get<T>(key: StoreKey): T | undefined { return volatile.get(key) as T | undefined; },
  set<T>(key: StoreKey, value: T) { volatile.set(key, value); },
  delete(key: StoreKey) { volatile.delete(key); },
};
