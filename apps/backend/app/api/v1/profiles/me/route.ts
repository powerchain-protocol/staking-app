import { requireSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
import { jsonBody, ok, optionalString, route } from '@/lib/server/http';

export const runtime='nodejs';export const dynamic='force-dynamic';

export const GET=route(async()=>{
  const s=await requireSession();
  const [row]=await db()`SELECT subject_id,username,display_name,avatar_url,bio,country_code,organization,updated_at FROM user_profiles WHERE subject_id=${s.sub}`;
  return ok({profile:row??{subject_id:s.sub}});
});

export const PATCH=route(async(request:Request)=>{
  const s=await requireSession();const body=await jsonBody<Record<string,unknown>>(request);
  const username=optionalString(body.username,40);const displayName=optionalString(body.displayName,80);const avatarUrl=optionalString(body.avatarUrl,500);const bio=optionalString(body.bio,500);const countryCode=optionalString(body.countryCode,2);const organization=optionalString(body.organization,120);
  const [row]=await db()`
    INSERT INTO user_profiles(subject_id,username,display_name,avatar_url,bio,country_code,organization,updated_at)
    VALUES(${s.sub},${username},${displayName},${avatarUrl},${bio},${countryCode},${organization},now())
    ON CONFLICT(subject_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,bio=EXCLUDED.bio,country_code=EXCLUDED.country_code,organization=EXCLUDED.organization,updated_at=now()
    RETURNING subject_id,username,display_name,avatar_url,bio,country_code,organization,updated_at
  `;
  return ok({profile:row});
});
