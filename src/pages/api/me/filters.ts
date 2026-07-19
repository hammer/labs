import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore } from '../../../lib/server/auth';

export const prerender = false;

// GET: list the current user's saved views (optionally scoped to ?page=).
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const page = new URL(context.request.url).searchParams.get('page');
  const env = getEnv(context);
  const stmt = page
    ? env.DB.prepare(`SELECT id, name, page, query, created_at FROM saved_filters WHERE user_id=? AND page=? ORDER BY created_at DESC`).bind(user.id, page)
    : env.DB.prepare(`SELECT id, name, page, query, created_at FROM saved_filters WHERE user_id=? ORDER BY created_at DESC`).bind(user.id);
  const { results } = await stmt.all();
  return jsonNoStore({ filters: results ?? [] });
};

// POST {name, page, query}: create a saved view for the current user.
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let body: any;
  try { body = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const name = String(body?.name ?? '').trim().slice(0, 120);
  const page = String(body?.page ?? '').trim().slice(0, 120);
  const query = String(body?.query ?? '').replace(/^\?/, '').slice(0, 2000);
  if (!name || !page) return jsonNoStore({ error: 'name_and_page_required' }, 400);
  const row = await getEnv(context).DB
    .prepare(`INSERT INTO saved_filters (user_id, name, page, query) VALUES (?, ?, ?, ?) RETURNING id, name, page, query, created_at`)
    .bind(user.id, name, page, query)
    .first();
  return jsonNoStore({ filter: row }, 201);
};

// DELETE ?id=: remove one of the current user's saved views (scoped to user_id).
export const DELETE: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  if (!id) return jsonNoStore({ error: 'id_required' }, 400);
  await getEnv(context).DB.prepare(`DELETE FROM saved_filters WHERE id=? AND user_id=?`).bind(id, user.id).run();
  return jsonNoStore({ ok: true });
};
