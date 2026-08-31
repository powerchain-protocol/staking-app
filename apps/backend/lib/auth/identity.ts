import 'server-only';
import { headers } from 'next/headers';
import { verifyToken } from '@clerk/backend';
import { getBetterAuth } from './better-auth';
import { env } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';
import { annotateRequestContext } from '@/lib/server/request-context';

export type PlatformIdentity={subjectId:string;provider:'CLERK'|'BETTER_AUTH';providerSubject:string;sessionId?:string|null};

function cookieValue(cookieHeader:string|undefined,name:string){
  if(!cookieHeader)return null;
  for(const part of cookieHeader.split(';')){const [k,...v]=part.trim().split('=');if(k===name)return decodeURIComponent(v.join('='));}
  return null;
}

async function clerkIdentity(h:Headers):Promise<PlatformIdentity|null>{
  if(env.authProvider==='better-auth')return null;
  const bearer=h.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  const token=bearer||cookieValue(h.get('cookie')??undefined,'__session');
  if(!token)return null;
  if(!env.clerkSecretKey&&!env.clerkJwtKey)throw new ApiError(503,'CLERK_NOT_CONFIGURED','Clerk authentication is selected but no verification key is configured');
  try{
    const verified=await verifyToken(token,{
      secretKey:env.clerkSecretKey||undefined,
      jwtKey:env.clerkJwtKey||undefined,
      authorizedParties:env.clerkAuthorizedParties.length?env.clerkAuthorizedParties:[env.appOrigin],
      clockSkewInMs:5000,
    });
    if(!verified.sub) return null;
    return {subjectId:`clerk:${verified.sub}`,provider:'CLERK',providerSubject:verified.sub,sessionId:typeof verified.sid==='string'?verified.sid:null};
  }catch{return null;}
}

async function betterIdentity(h:Headers):Promise<PlatformIdentity|null>{
  if(!env.betterAuthEnabled||env.authProvider==='clerk')return null;
  try{
    const auth=getBetterAuth();
    const session=await auth.api.getSession({headers:h});
    if(!session?.user?.id)return null;
    return {subjectId:`better:${session.user.id}`,provider:'BETTER_AUTH',providerSubject:session.user.id,sessionId:session.session?.id??null};
  }catch{return null;}
}

export async function getPlatformIdentity(input?:Request|Headers):Promise<PlatformIdentity|null>{
  const h=input instanceof Request?input.headers:input instanceof Headers?input:await headers();
  const first=env.authProvider==='better-auth'?await betterIdentity(h):await clerkIdentity(h);
  const identity=first??(env.authProvider==='hybrid'?(await betterIdentity(h)):null);
  if(identity)annotateRequestContext({subjectId:identity.subjectId});
  return identity;
}

export async function requirePlatformIdentity(input?:Request|Headers){
  const identity=await getPlatformIdentity(input);
  if(!identity)throw new ApiError(401,'ACCOUNT_AUTH_REQUIRED','Sign in to your PowerChain account before continuing');
  return identity;
}
