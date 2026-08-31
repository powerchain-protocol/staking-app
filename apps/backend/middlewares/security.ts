import 'server-only';
import { ApiError } from '@/lib/server/http';
export function requireJsonContentType(request:Request){const type=request.headers.get('content-type')??'';if(!/^application\/(?:[^;]+\+)?json\b/i.test(type))throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','application/json is required');}
