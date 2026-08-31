import { toNextJsHandler } from 'better-auth/next-js';
import { env } from '@/lib/server/config';
import { getBetterAuth } from '@/lib/auth/better-auth';
export const runtime='nodejs';
async function disabled(){return Response.json({error:{code:'BETTER_AUTH_DISABLED',message:'Better Auth is not enabled for this deployment'}},{status:404,headers:{'cache-control':'no-store'}})}
export async function GET(request:Request){if(!env.betterAuthEnabled)return disabled();return toNextJsHandler(getBetterAuth()).GET(request)}
export async function POST(request:Request){if(!env.betterAuthEnabled)return disabled();return toNextJsHandler(getBetterAuth()).POST(request)}
