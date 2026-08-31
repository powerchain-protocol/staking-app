export const PWRC_DECIMALS = 9;
export const PWRC_SCALE = 10n ** 9n;

export function parsePwrc(value: string, decimals = PWRC_DECIMALS): bigint {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === '' || cleaned === '.') throw new Error('Enter a valid PWRC amount.');
  const [whole = '0', fraction = ''] = cleaned.split('.');
  if (fraction.length > decimals) throw new Error(`PWRC supports up to ${decimals} decimal places.`);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

export function formatAtomic(value: string | bigint | null | undefined, decimals = PWRC_DECIMALS, maximumFractionDigits = 4) {
  if (value == null) return '0';
  const atomic = typeof value === 'bigint' ? value : BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = atomic / scale;
  const fraction = (atomic % scale).toString().padStart(decimals, '0').slice(0, maximumFractionDigits).replace(/0+$/, '');
  return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ''}`;
}

export function atomicToNumber(value: string | bigint | null | undefined, decimals = PWRC_DECIMALS) {
  if (value == null) return 0;
  const n = typeof value === 'bigint' ? value : BigInt(value);
  const scale = 10 ** Math.min(decimals, 9);
  if (decimals <= 9) return Number(n) / scale;
  return Number(n / 10n ** BigInt(decimals - 9)) / 1e9;
}
