import 'server-only';
import crypto from 'node:crypto';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map([...BASE58].map((c, i) => [c, i]));

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(data: string | Buffer) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function hmac(data: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function timingSafeEqualString(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function decodeBase58(value: string) {
  if (!value) return Buffer.alloc(0);
  let bytes: number[] = [0];
  for (const char of value) {
    const digit = BASE58_MAP.get(char);
    if (digit == null) throw new Error('Invalid base58');
    let carry = digit;
    for (let j = 0; j < bytes.length; ++j) {
      const x = bytes[j] * 58 + carry;
      bytes[j] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < value.length - 1 && value[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}


export function isValidWalletAddress(network: 'SOLANA' | 'SUI', walletAddress: string) {
  try {
    if (network === 'SOLANA') return decodeBase58(walletAddress).length === 32;
    return /^0x[0-9a-fA-F]{1,64}$/.test(walletAddress);
  } catch {
    return false;
  }
}

export function verifySolanaMessage(walletAddress: string, message: string, signatureBase58: string) {
  const publicKey = decodeBase58(walletAddress);
  const signature = decodeBase58(signatureBase58);
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const key = crypto.createPublicKey({ key: Buffer.concat([spkiPrefix, publicKey]), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(message, 'utf8'), key, signature);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(object[k])}`).join(',')}}`;
}
