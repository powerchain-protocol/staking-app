'use client';
import { createAuthClient } from 'better-auth/react';

export const betterAuthClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
});

export const betterAuthSocialProviders = (process.env.NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDERS ?? 'google,github,apple')
  .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) as Array<'google'|'github'|'apple'>;
