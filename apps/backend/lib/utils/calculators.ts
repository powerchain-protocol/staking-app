export function bpsAmount(amount: bigint, bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('bps must be an integer between 0 and 10000');
  return amount * BigInt(bps) / 10_000n;
}
export function atomicToUi(amount: bigint | string, decimals: number) {
  const raw = typeof amount === 'bigint' ? amount : BigInt(amount);
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
export function uiToAtomic(value: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal amount');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Amount has more than ${decimals} decimal places`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
