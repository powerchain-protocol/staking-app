import { NextResponse, type NextRequest } from 'next/server';
import { corsHeaders } from '@/lib/cors';

export function proxy(request:NextRequest){
  if(!request.nextUrl.pathname.startsWith('/api/'))return NextResponse.next();
  if(request.method==='OPTIONS')return new NextResponse(null,{status:204,headers:corsHeaders(request)});
  const response=NextResponse.next();
  for(const [key,value] of Object.entries(corsHeaders(request)))response.headers.set(key,value);
  return response;
}
export const config={matcher:['/api/:path*']};
