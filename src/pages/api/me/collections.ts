import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore } from '../../../lib/server/auth';

export const prerender = false;

// GET: user's collections with item counts.
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const { results } = await getEnv(context).DB.prepare(
    `SELECT c.id, c.name, c.description, c.created_at,
            (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS n
       FROM collections c WHERE c.user_id = ? ORDER BY c.created_at DESC`,
  ).bind(user.id).all();
  return jsonNoStore({ collections: results ?? [] });
};

// POST {name, description?}: create.
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let body: any; try { body = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const name = String(body?.name ?? '').trim().slice(0, 120);
  const description = String(body?.description ?? '').trim().slice(0, 500) || null;
  if (!name) return jsonNoStore({ error: 'name_required' }, 400);
  const row = await getEnv(context).DB
    .prepare(`INSERT INTO collections (user_id, name, description) VALUES (?, ?, ?) RETURNING id, name, description, created_at`)
    .bind(user.id, name, description).first();
  return jsonNoStore({ collection: { ...row, n: 0 } }, 201);
};

// DELETE ?id: remove a collection (cascade removes its items).
export const DELETE: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  if (!id) return jsonNoStore({ error: 'id_required' }, 400);
  await getEnv(context).DB.prepare(`DELETE FROM collections WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return jsonNoStore({ ok: true });
};
