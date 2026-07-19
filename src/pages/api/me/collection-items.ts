import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore } from '../../../lib/server/auth';
import { isValidTarget } from '../../../lib/tags';

export const prerender = false;

// GET ?collection_id → items in a collection; OR ?target → the collection ids
// that contain a given item (for the "add to collection" membership UI).
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const url = new URL(context.request.url);
  const env = getEnv(context);
  const cid = url.searchParams.get('collection_id');
  const target = url.searchParams.get('target');
  if (cid) {
    const { results } = await env.DB.prepare(
      `SELECT ci.target FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
        WHERE c.id = ? AND c.user_id = ? ORDER BY ci.position, ci.added_at`,
    ).bind(Number(cid), user.id).all();
    return jsonNoStore({ items: (results ?? []).map((r: any) => r.target) });
  }
  if (target) {
    const { results } = await env.DB.prepare(
      `SELECT ci.collection_id FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
        WHERE c.user_id = ? AND ci.target = ?`,
    ).bind(user.id, target).all();
    return jsonNoStore({ collection_ids: (results ?? []).map((r: any) => r.collection_id) });
  }
  return jsonNoStore({ error: 'collection_id_or_target_required' }, 400);
};

// POST {collection_id, target}: add item (verifies collection ownership).
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let body: any; try { body = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const cid = Number(body?.collection_id);
  const target = String(body?.target ?? '');
  if (!cid || !isValidTarget(target)) return jsonNoStore({ error: 'invalid' }, 400);
  const env = getEnv(context);
  const owns = await env.DB.prepare(`SELECT 1 FROM collections WHERE id = ? AND user_id = ?`).bind(cid, user.id).first();
  if (!owns) return jsonNoStore({ error: 'not_found' }, 404);
  await env.DB.prepare(`INSERT INTO collection_items (collection_id, target) VALUES (?, ?) ON CONFLICT(collection_id, target) DO NOTHING`).bind(cid, target).run();
  return jsonNoStore({ ok: true }, 201);
};

// DELETE ?collection_id&target: remove item (verifies ownership).
export const DELETE: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const url = new URL(context.request.url);
  const cid = Number(url.searchParams.get('collection_id'));
  const target = url.searchParams.get('target') ?? '';
  if (!cid || !target) return jsonNoStore({ error: 'invalid' }, 400);
  const env = getEnv(context);
  await env.DB.prepare(
    `DELETE FROM collection_items WHERE collection_id = (SELECT id FROM collections WHERE id = ? AND user_id = ?) AND target = ?`,
  ).bind(cid, user.id, target).run();
  return jsonNoStore({ ok: true });
};
