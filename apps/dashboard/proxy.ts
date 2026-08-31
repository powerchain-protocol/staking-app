import { clerkMiddleware } from '@clerk/nextjs/server';
import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { protectedDashboardRoutes, safeNextPath } from '@/redirects';

const authMode=process.env.NEXT_PUBLIC_AUTH_PROVIDER??'clerk';
const isProtected=(path:string)=>protectedDashboardRoutes.some(prefix=>path===prefix||path.startsWith(`${prefix}/`));
function loginRedirect(request:NextRequest){const login=new URL('/login',request.url);login.searchParams.set('next',safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));return NextResponse.redirect(login)}

const clerkProxy=clerkMiddleware(async(auth,request)=>{const state=await auth();if(isProtected(request.nextUrl.pathname)&&!state.isAuthenticated)return loginRedirect(request);return NextResponse.next()});

export default function proxy(request:NextRequest,event:NextFetchEvent){
  if(authMode==='better-auth'){
    if(isProtected(request.nextUrl.pathname)&&!getSessionCookie(request))return loginRedirect(request);
    return NextResponse.next();
  }
  return (clerkProxy as any)(request,event);
}
export const config={matcher:['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)','/(api|trpc)(.*)','/__clerk/(.*)']};
