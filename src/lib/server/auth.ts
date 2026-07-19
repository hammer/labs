// Auth foundation for issue #21 step 1. Private per-user accounts via GitHub
// OAuth; opaque session tokens stored in D1 (revocable, no session secret).
import type { APIContext } from 'astro';

export interface Env {
  // D1Database — typed as any to avoid a hard @cloudflare/workers-types dep.
  // Used as env.DB.prepare(sql).bind(...).first()/.run()/.all().
  DB: any;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export interface User {
  id: number;
  gh_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE = 'session';

export function getEnv(context: APIContext): Env {
  return (context.locals as any).runtime.env as Env;
}

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function secureFor(context: APIContext): boolean {
  return new URL(context.request.url).protocol === 'https:';
}

export function setSessionCookie(context: APIContext, token: string) {
  context.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureFor(context),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(context: APIContext) {
  context.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function sessionExpiryISO(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Resolve the logged-in user from the session cookie, or null. Also refreshes
// last_seen. Expiry compared via SQLite datetime() so ISO strings parse cleanly.
export async function getSessionUser(context: APIContext): Promise<User | null> {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const env = getEnv(context);
  const row = await env.DB.prepare(
    `SELECT u.id, u.gh_id, u.login, u.name, u.avatar_url
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')`,
  )
    .bind(token)
    .first();
  if (!row) return null;
  await env.DB.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  return row as User;
}

// Standard JSON response for /api/me* — never cache a user-scoped response.
export function jsonNoStore(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...extra },
  });
}

// CSRF guard for mutating endpoints: require a custom header a cross-site form
// POST can't set without a preflight. Pair with SameSite=Lax on the cookie.
export function requireCsrf(context: APIContext): boolean {
  return context.request.headers.get('x-requested-with') === 'labindex';
}
