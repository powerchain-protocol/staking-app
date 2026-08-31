export const protectedDashboardRoutes = [
  '/portfolio',
  '/accounts',
  '/wallets',
  '/settings',
  '/profiles',
  '/claim',
  '/security',
  '/histories',
  '/bridge',
  '/integrations',
  '/stake',
  '/positions',
  '/rewards',
  '/governance',
] as const;

export function safeNextPath(value: string | undefined | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export function loginRedirect(path: string, search = '') {
  return `/login?next=${encodeURIComponent(safeNextPath(`${path}${search}`))}`;
}
