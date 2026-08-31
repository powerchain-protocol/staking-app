import 'server-only';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationPost } from '@/lib/clients/http';

export async function verifyZkProof(input:{circuit:string;proof:unknown;publicInputs:unknown}){
  if(!env.zkEnabled)throw new ConfigurationError('ZK verification is disabled');
  if(!env.zkVerifierUrl)throw new ConfigurationError('ZK_VERIFIER_URL is not configured');
  const response:any=await integrationPost('zk',env.zkVerifierUrl,input,{headers:env.zkVerifierApiKey?{'authorization':`Bearer ${env.zkVerifierApiKey}`}:{}}); 
  return {valid:response?.valid===true,proofId:response?.proofId??null,raw:response};
}
