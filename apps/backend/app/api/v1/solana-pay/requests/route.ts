import { Keypair } from '@solana/web3.js';
import { requireSession } from '@/lib/server/session';
import { atomicString, jsonBody, ok, optionalString, requireString, route, ApiError } from '@/lib/server/http';
import { createSolanaPayUrl } from '@/lib/integrations/solana-pay';
import { db } from '@/lib/server/db';
import { atomicToUi } from '@/lib/utils/calculators';
import { safeAction } from '@/lib/server/safe-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const session = await requireSession();
  return ok({
    requests: await db()`
      SELECT id,recipient,amount_atomic::text,decimals,token_mint,reference_address,payment_url,status,signature,expires_at,created_at
      FROM solana_pay_requests
      WHERE subject_id=${session.sub}
      ORDER BY created_at DESC
      LIMIT 100
    `,
  });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const body = await jsonBody<Record<string, unknown>>(request);
  const recipient = requireString(body.recipient ?? session.wallet, 'recipient', 64);
  const amountAtomic = atomicString(body.amountAtomic, 'amountAtomic');
  const decimals = Number(body.decimals ?? 9);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new ApiError(400, 'INVALID_DECIMALS', 'decimals must be 0..18');

  const tokenMint = optionalString(body.tokenMint, 64);
  const label = optionalString(body.label, 64) ?? 'PowerChain';
  const message = optionalString(body.message, 160);
  const memo = optionalString(body.memo, 160);
  const payload = {
    recipient,
    amountAtomic: amountAtomic.toString(),
    decimals,
    tokenMint,
    label,
    message,
    memo,
  };
  const action = await safeAction(request, 'solana.pay', payload);

  const existing = await db()<Record<string, unknown>[]>`
    SELECT id,recipient,amount_atomic::text,decimals,token_mint,reference_address,payment_url,status,signature,expires_at,created_at,request_hash
    FROM solana_pay_requests
    WHERE subject_id=${session.sub} AND idempotency_key=${action.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    if (String(existing[0].request_hash ?? '') !== action.actionHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different Solana Pay request');
    return ok({ request: existing[0], idempotentReplay: true });
  }

  const human = Number(atomicToUi(amountAtomic, decimals));
  if (!Number.isFinite(human) || human <= 0) throw new ApiError(400, 'INVALID_AMOUNT', 'Amount cannot be represented safely');
  const reference = Keypair.generate().publicKey.toBase58();
  const paymentUrl = createSolanaPayUrl({
    recipient,
    amount: human,
    splToken: tokenMint ?? undefined,
    label,
    message: message ?? undefined,
    memo: memo ?? undefined,
    reference,
  });

  const [row] = await db()`
    INSERT INTO solana_pay_requests(
      subject_id,recipient,amount_atomic,decimals,token_mint,reference_address,label,message,memo,payment_url,expires_at,idempotency_key,request_hash
    ) VALUES(
      ${session.sub},${recipient},${amountAtomic.toString()},${decimals},${tokenMint},${reference},${label},${message},${memo},${paymentUrl},now()+interval '30 minutes',${action.idempotencyKey},${action.actionHash}
    )
    RETURNING id,recipient,amount_atomic::text,decimals,token_mint,reference_address,payment_url,status,expires_at,created_at
  `;
  return ok({ request: row }, { status: 201 });
});
