import 'server-only';
import { db } from '@/lib/server/db';

export async function queryUserProfile(subjectId: string) {
  const [row] = await db()<{
    subject_id: string; display_name: string | null; username: string | null; avatar_url: string | null;
  }[]>`
    SELECT subject_id, display_name, username, avatar_url
    FROM user_profiles
    WHERE subject_id=${subjectId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function queryUserSettings(subjectId: string) {
  const [row] = await db()<{
    subject_id: string; locale: string; currency: string; theme: string; notifications: unknown;
  }[]>`
    SELECT subject_id, locale, currency, theme, notifications
    FROM user_settings
    WHERE subject_id=${subjectId}
    LIMIT 1
  `;
  return row ?? null;
}
