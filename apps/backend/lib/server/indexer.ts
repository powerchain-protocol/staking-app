import 'server-only';
import { integrationHealth } from '@/lib/integrations/registry';
import { cctpMessages } from '@/lib/integrations/cctp';
import { prices } from '@/lib/prices';
import { refreshLeaderboard } from '@/lib/leaderboard';
import { solanaConnection } from './solana';
import { suiClient } from '@/lib/sui/sui';
import { env } from './config';
import { db } from './db';
import { pruneAiData } from '@/lib/ai/retention';

function firstCircleMessage(payload: any) {
  return Array.isArray(payload?.messages) ? payload.messages[0] : Array.isArray(payload) ? payload[0] : payload?.message ?? null;
}

async function snapshotPrices() {
  const points = await prices(['SOL', 'PWRC', 'USDC']).catch(() => []);
  for (const point of points) {
    await db()`
      INSERT INTO price_snapshots(symbol,currency,price,source,source_timestamp)
      VALUES(${point.symbol},${point.currency},${String(point.price)},${point.source},${point.timestamp ? new Date(point.timestamp) : null})
    `;
  }
  return points.length;
}

async function reconcilePendingSwaps() {
  const rows = await db()<Record<string, any>[]>`
    SELECT id,chain,provider,transaction_id
    FROM swap_intents
    WHERE status IN ('SUBMITTED','FINALIZED') AND transaction_id IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT ${env.indexerBatchSize}
  `;
  let reconciled = 0;
  let failed = 0;
  let pending = 0;
  for (const row of rows) {
    try {
      if (String(row.chain) === 'SOLANA') {
        const tx = await solanaConnection().getTransaction(String(row.transaction_id), { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
        if (!tx) { pending++; continue; }
        const isFailed = Boolean(tx.meta?.err);
        await db()`UPDATE swap_intents SET status=${isFailed ? 'FAILED' : 'RECONCILED'},error_code=${isFailed ? 'CHAIN_EXECUTION_FAILED' : null},error_detail=${isFailed ? JSON.stringify(tx.meta?.err) : null},updated_at=now() WHERE id=${String(row.id)}::uuid`;
        await db()`INSERT INTO integration_execution_events(integration_id,action,intent_id,chain,network,transaction_id,status,metadata) VALUES(${String(row.provider).toLowerCase()},'SWAP_INDEX',${String(row.id)},'SOLANA',${env.solanaCluster},${String(row.transaction_id)},${isFailed ? 'FAILED' : 'RECONCILED'},${JSON.stringify({finalized:true})}::jsonb)`;
        isFailed ? failed++ : reconciled++;
      } else {
        const result: any = await suiClient().getTransaction({ digest: String(row.transaction_id), include: { effects: true, events: true } }).catch(() => null);
        const tx = result?.Transaction ?? result?.FailedTransaction;
        if (!tx) { pending++; continue; }
        const success = tx.status?.success !== false;
        await db()`UPDATE swap_intents SET status=${success ? 'RECONCILED' : 'FAILED'},error_code=${success ? null : 'CHAIN_EXECUTION_FAILED'},error_detail=${success ? null : JSON.stringify(tx.status?.error ?? null)},updated_at=now() WHERE id=${String(row.id)}::uuid`;
        await db()`INSERT INTO integration_execution_events(integration_id,action,intent_id,chain,network,transaction_id,status,metadata) VALUES(${String(row.provider).toLowerCase()},'SWAP_INDEX',${String(row.id)},'SUI',${env.suiNetwork},${String(row.transaction_id)},${success ? 'RECONCILED' : 'FAILED'},${JSON.stringify({finalized:true})}::jsonb)`;
        success ? reconciled++ : failed++;
      }
    } catch {
      pending++;
    }
  }
  return { processed: rows.length, reconciled, failed, pending };
}

async function reconcilePendingCctp() {
  const rows = await db()<Record<string, any>[]>`
    SELECT id,source_domain,destination_domain,recipient,source_tx,status
    FROM cctp_intents
    WHERE status IN ('BURN_SUBMITTED','ATTESTING','ATTESTED','MINT_SUBMITTED') AND source_tx IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT ${env.indexerBatchSize}
  `;
  let attesting = 0;
  let attested = 0;
  let reconciled = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const response = await cctpMessages(Number(row.source_domain), String(row.source_tx));
      const message = firstCircleMessage(response);
      if (!message) {
        await db()`UPDATE cctp_intents SET status='ATTESTING',attestation_status='pending',updated_at=now() WHERE id=${String(row.id)}::uuid AND status='BURN_SUBMITTED'`;
        attesting++;
        continue;
      }
      const attestation = message.attestation ?? message.attestationSignature ?? null;
      const messageHash = message.messageHash ?? message.hash ?? null;
      const destinationTx = message.destinationTxHash ?? message.destinationTransactionHash ?? null;
      const isAttested = Boolean(attestation && String(attestation).length > 10);
      const status = destinationTx ? 'RECONCILED' : isAttested ? 'ATTESTED' : 'ATTESTING';
      await db()`UPDATE cctp_intents SET status=${status},message_hash=COALESCE(${messageHash},message_hash),attestation=COALESCE(${attestation},attestation),attestation_status=${isAttested ? 'complete' : 'pending'},destination_tx=COALESCE(${destinationTx},destination_tx),updated_at=now() WHERE id=${String(row.id)}::uuid`;
      await db()`INSERT INTO integration_execution_events(integration_id,action,intent_id,chain,network,transaction_id,status,metadata) VALUES('cctp','CCTP_INDEX',${String(row.id)},'SOLANA',${env.solanaCluster},${String(row.source_tx)},${status},${JSON.stringify({destinationDomain:Number(row.destination_domain),attested:isAttested,destinationTx:destinationTx ?? null})}::jsonb)`;
      if (status === 'RECONCILED') reconciled++;
      else if (status === 'ATTESTED') attested++;
      else attesting++;
    } catch {
      errors++;
    }
  }
  return { processed: rows.length, attesting, attested, reconciled, errors };
}

export async function runApplicationIndexer() {
  const started = new Date();
  await refreshLeaderboard();
  const health = await integrationHealth();
  for (const item of health) {
    await db()`INSERT INTO integration_health_snapshots(integration_id,network,status,latency_ms,detail) VALUES(${item.id},${item.network},${item.mode.toUpperCase()},${item.latencyMs ?? null},${item.detail ?? null})`;
  }
  const [priceCount, swaps, cctp, aiRetention] = await Promise.all([
    snapshotPrices(),
    reconcilePendingSwaps(),
    reconcilePendingCctp(),
    pruneAiData(),
  ]);
  await db()`DELETE FROM app_cache_entries WHERE expires_at<now()`;
  return {
    ok: true,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    integrations: health.length,
    prices: priceCount,
    swaps,
    cctp,
    aiRetention,
  };
}
