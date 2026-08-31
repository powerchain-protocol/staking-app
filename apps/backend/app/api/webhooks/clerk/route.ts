import { Webhook } from 'svix';
import { env } from '@/lib/server/config';
import { db } from '@/lib/server/db';
import { ApiError, ok, route } from '@/lib/server/http';
import { recordPlatformEvent } from '@/lib/events';
import { sendWelcomeEmail } from '@/lib/mail/mail';
export const runtime='nodejs';
export const POST=route(async(request:Request)=>{
  if(!env.clerkWebhookSigningSecret)throw new ApiError(503,'CLERK_WEBHOOK_NOT_CONFIGURED','CLERK_WEBHOOK_SIGNING_SECRET is required');
  const payload=await request.text();const headers={"svix-id":request.headers.get('svix-id')??'',"svix-timestamp":request.headers.get('svix-timestamp')??'',"svix-signature":request.headers.get('svix-signature')??''};
  let event:any;try{event=new Webhook(env.clerkWebhookSigningSecret).verify(payload,headers)}catch{throw new ApiError(401,'INVALID_CLERK_WEBHOOK_SIGNATURE','Clerk webhook signature verification failed')}
  const user=event.data;const id=user?.id?`clerk:${user.id}`:null;if(!id)return ok({accepted:true,ignored:true});
  const email=user.email_addresses?.find((e:any)=>e.id===user.primary_email_address_id)?.email_address??user.email_addresses?.[0]?.email_address??null;const name=[user.first_name,user.last_name].filter(Boolean).join(' ')||user.username||'PowerChain participant';
  if(event.type==='user.created'||event.type==='user.updated'){
    await db().begin(async tx=>{await tx`INSERT INTO users(id,status) VALUES(${id},'ACTIVE') ON CONFLICT(id) DO UPDATE SET status='ACTIVE',updated_at=now()`;await tx`INSERT INTO user_profiles(subject_id,display_name,email,avatar_url,auth_provider,last_sign_in_at) VALUES(${id},${name},${email},${user.image_url??null},'CLERK',now()) ON CONFLICT(subject_id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email,avatar_url=excluded.avatar_url,auth_provider='CLERK',updated_at=now()`;await tx`INSERT INTO linked_accounts(subject_id,provider,provider_subject,verified_at) VALUES(${id},'CLERK',${user.id},now()) ON CONFLICT(provider,provider_subject) DO UPDATE SET subject_id=excluded.subject_id,verified_at=now()`;await tx`INSERT INTO user_settings(subject_id) VALUES(${id}) ON CONFLICT(subject_id) DO NOTHING`;});
    await recordPlatformEvent({type:event.type==='user.created'?'IDENTITY_CREATED':'IDENTITY_UPDATED',subjectId:id,source:'CLERK_WEBHOOK',payload:{providerSubject:user.id}});if(event.type==='user.created'&&email){try{await sendWelcomeEmail(email,name)}catch{}}
  }else if(event.type==='user.deleted'){await db()`UPDATE users SET status='DELETED',updated_at=now() WHERE id=${id}`;await recordPlatformEvent({type:'IDENTITY_DELETED',subjectId:id,source:'CLERK_WEBHOOK',severity:'WARNING'});}
  return ok({accepted:true});
});
