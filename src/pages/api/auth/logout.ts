import type { APIRoute } from 'astro';
import { getEnv, clearSessionCookie, requireCsrf, jsonNoStore } from '../../../lib/server/auth';

export const prerender = false;

// POST-only (mutating). Deletes the session row and clears the cookie.
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const token = context.cookies.get('session')?.value;
  if (token) {
    await getEnv(context).DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
  }
  clearSessionCookie(context);
  return jsonNoStore({ ok: true });
};
