// Server-only configuration. Nothing here is ever sent to the browser except the explicitly public values in /api/config.
export const isMock = (): boolean => !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
export const pushConfigured = (): boolean => Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
