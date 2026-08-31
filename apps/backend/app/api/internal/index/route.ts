import { env } from '@/lib/server/config';
import { timingSafeEqualString } from '@/lib/server/crypto';
import { ApiError, ok, route } from '@/lib/server/http';
import { runApplicationIndexer } from '@/lib/server/indexer';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const POST=route(async(request:Request)=>{const token=request.headers.get('authorization')??'';const expected=env.workerSecret?`Bearer ${env.workerSecret}`:'';if(!expected||!timingSafeEqualString(token,expected))throw new ApiError(401,'WORKER_AUTH_REQUIRED','Invalid indexer authorization');return ok(await runApplicationIndexer());});
