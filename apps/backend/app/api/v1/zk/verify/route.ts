import { createHash } from 'node:crypto';
import { jsonBody, ok, requireString, route } from '@/lib/server/http';
import { verifyZkProof } from '@/lib/integrations/zk';
import { getSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
export const runtime='nodejs';
export const POST=route(async(request:Request)=>{
  const body=await jsonBody<Record<string,unknown>>(request);const circuit=requireString(body.circuit,'circuit',128);const proof=body.proof;const publicInputs=body.publicInputs;
  const result=await verifyZkProof({circuit,proof,publicInputs});const session=await getSession();const h=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
  await db()`INSERT INTO zk_verification_records(subject_id,circuit,public_inputs_hash,proof_hash,valid,provider_proof_id) VALUES(${session?.sub??null},${circuit},${h(publicInputs)},${h(proof)},${result.valid},${result.proofId})`;
  return ok({valid:result.valid,proofId:result.proofId});
});
