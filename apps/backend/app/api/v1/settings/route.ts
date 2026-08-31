import { requireSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
import { ApiError, jsonBody, ok, route } from '@/lib/server/http';

export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{const s=await requireSession();const [row]=await db()`SELECT subject_id,locale,currency,theme,notifications,privacy,updated_at FROM user_settings WHERE subject_id=${s.sub}`;return ok({settings:row??{subject_id:s.sub,locale:'en',currency:'USD',theme:'light',notifications:{},privacy:{}}});});
export const PATCH=route(async(request:Request)=>{
  const s=await requireSession();const b=await jsonBody<Record<string,unknown>>(request);
  const locale=typeof b.locale==='string'?b.locale.slice(0,16):'en';const currency=typeof b.currency==='string'?b.currency.toUpperCase().slice(0,8):'USD';const theme=typeof b.theme==='string'?b.theme:'light';
  if(!['light','dark','system'].includes(theme))throw new ApiError(400,'INVALID_THEME','theme must be light, dark, or system');
  const notifications=b.notifications&&typeof b.notifications==='object'?b.notifications:{};const privacy=b.privacy&&typeof b.privacy==='object'?b.privacy:{};
  const [row]=await db()`INSERT INTO user_settings(subject_id,locale,currency,theme,notifications,privacy,updated_at) VALUES(${s.sub},${locale},${currency},${theme},${JSON.stringify(notifications)}::jsonb,${JSON.stringify(privacy)}::jsonb,now()) ON CONFLICT(subject_id) DO UPDATE SET locale=EXCLUDED.locale,currency=EXCLUDED.currency,theme=EXCLUDED.theme,notifications=EXCLUDED.notifications,privacy=EXCLUDED.privacy,updated_at=now() RETURNING subject_id,locale,currency,theme,notifications,privacy,updated_at`;
  return ok({settings:row});
});
