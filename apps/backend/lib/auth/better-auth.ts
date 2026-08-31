import 'server-only';
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { env } from '@/lib/server/config';
import { sendVerificationEmail } from '@/lib/mail/mail';

let instance:ReturnType<typeof betterAuth>|null=null;
export function getBetterAuth(){
  if(instance)return instance;
  if(!env.betterAuthEnabled)throw new Error('Better Auth is disabled');
  const pool=new Pool({connectionString:env.databaseUrl,max:5,ssl:env.nodeEnv==='production'?{rejectUnauthorized:true}:undefined});
  const socialProviders:any={};
  if(env.googleClientId&&env.googleClientSecret)socialProviders.google={clientId:env.googleClientId,clientSecret:env.googleClientSecret};
  if(env.githubClientId&&env.githubClientSecret)socialProviders.github={clientId:env.githubClientId,clientSecret:env.githubClientSecret};
  if(env.appleClientId&&env.appleClientSecret)socialProviders.apple={clientId:env.appleClientId,clientSecret:env.appleClientSecret};
  instance=betterAuth({
    database:pool,
    secret:env.betterAuthSecret,
    baseURL:env.betterAuthUrl,
    emailAndPassword:{enabled:true,requireEmailVerification:true},
    emailVerification:{sendVerificationEmail:async({user,url}:any)=>{await sendVerificationEmail(user.email,url);}},
    socialProviders,
    user:{modelName:'auth_users',fields:{emailVerified:'email_verified',createdAt:'created_at',updatedAt:'updated_at'}},
    session:{modelName:'auth_sessions_better',fields:{userId:'user_id',expiresAt:'expires_at',ipAddress:'ip_address',userAgent:'user_agent',createdAt:'created_at',updatedAt:'updated_at'}},
    account:{modelName:'auth_accounts',fields:{userId:'user_id',accountId:'account_id',providerId:'provider_id',accessToken:'access_token',refreshToken:'refresh_token',accessTokenExpiresAt:'access_token_expires_at',refreshTokenExpiresAt:'refresh_token_expires_at',idToken:'id_token',createdAt:'created_at',updatedAt:'updated_at'}},
    verification:{modelName:'auth_verifications',fields:{expiresAt:'expires_at',createdAt:'created_at',updatedAt:'updated_at'}},
  } as any);
  return instance;
}
