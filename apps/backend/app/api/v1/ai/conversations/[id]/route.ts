import { requirePlatformIdentity } from '@/lib/auth/identity';
import { db } from '@/lib/server/db';
import { ApiError, ok, route } from '@/lib/server/http';
export const runtime='nodejs';
export const DELETE=route(async(request:Request,{params}:{params:Promise<{id:string}>})=>{const identity=await requirePlatformIdentity(request);const{id}=await params;const rows=await db()`DELETE FROM ai_conversations WHERE id=${id}::uuid AND subject_id=${identity.subjectId} RETURNING id::text`;if(!rows[0])throw new ApiError(404,'AI_CONVERSATION_NOT_FOUND','Conversation not found');return ok({deleted:true,id:rows[0].id});});
