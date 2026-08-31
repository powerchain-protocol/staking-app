import { ApiError, jsonBody, ok, requireString, route } from '@/lib/server/http';
import { listRuntimeControls, requireAdminSession, setRuntimeControl, type RuntimeControl } from '@/lib/server/controls';
import { enforceRateLimit, rateLimitKey } from '@/lib/server/rate-limit';
import { consumeActionConfirmation } from '@/lib/auth/confirmations';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const KEYS = new Set<RuntimeControl>(['GLOBAL','STAKING','GOVERNANCE','BONDS','TRANSFERS','REWARDS','BRIDGE','AI']);
export const GET=route(async()=>{await requireAdminSession();return ok({controls:await listRuntimeControls()});});
export const POST=route(async(r:Request)=>{const s=await requireAdminSession();await enforceRateLimit(rateLimitKey('admin-controls',s.sub),20,60);const b=await jsonBody<Record<string,unknown>>(r);await consumeActionConfirmation(r,'admin.controls',b);const key=requireString(b.key,'key',32).toUpperCase() as RuntimeControl;if(!KEYS.has(key))throw new ApiError(400,'INVALID_CONTROL','Unknown runtime control');if(typeof b.enabled!=='boolean')throw new ApiError(400,'INVALID_ARGUMENT','enabled must be boolean');const reason=typeof b.reason==='string'?b.reason.slice(0,512):null;let expiresAt:Date|null=null;if(typeof b.expiresAt==='string'&&b.expiresAt){expiresAt=new Date(b.expiresAt);if(!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now())throw new ApiError(400,'INVALID_ARGUMENT','expiresAt must be a future ISO timestamp');}return ok(await setRuntimeControl({key,enabled:b.enabled,reason,expiresAt,changedBy:s.wallet}));});
