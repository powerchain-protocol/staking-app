export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function redact(value: string, left = 4, right = 4) {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function nowIso() { return new Date().toISOString(); }
