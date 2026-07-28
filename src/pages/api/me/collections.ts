import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore, randomToken } from '../../../lib/server/auth';

export const prerender = false;

// GET: user's collections with item counts.
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const { results } = await getEnv(context).DB.prepare(
    `SELECT c.id, c.name, c.description, c.created_at, c.public_id, c.is_public,
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
    .prepare(`INSERT INTO collections (user_id, name, description) VALUES (?, ?, ?) RETURNING id, name, description, created_at, public_id, is_public`)
    .bind(user.id, name, description).first();
  return jsonNoStore({ collection: { ...row, n: 0 } }, 201);
};

// PATCH {id, name?, public?, description?}: rename, share toggle, and/or
// description edit. Publish mints public_id once (COALESCE keeps the token
// stable across unpublish/republish, so circulated links revive); unpublish
// only clears is_public. Ownership lives in every WHERE clause; the final
// SELECT returning nothing yields a uniform 404, so non-owners get no
// existence oracle.
export const PATCH: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let body: any; try { body = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const id = Number(body?.id);
  const hasName = typeof body?.name === 'string';
  const hasPublic = typeof body?.public === 'boolean';
  const hasDescription = typeof body?.description === 'string';
  if (!id || (!hasName && !hasPublic && !hasDescription)) return jsonNoStore({ error: 'invalid' }, 400);
  const env = getEnv(context);
  if (hasName) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return jsonNoStore({ error: 'name_required' }, 400);
    await env.DB.prepare(`UPDATE collections SET name = ? WHERE id = ? AND user_id = ?`)
      .bind(name, id, user.id).run();
  }
  if (hasDescription) {
    const description = String(body.description).trim().slice(0, 500) || null;
    await env.DB.prepare(`UPDATE collections SET description = ? WHERE id = ? AND user_id = ?`)
      .bind(description, id, user.id).run();
  }
  if (hasPublic && body.public) {
    for (let attempt = 0; ; attempt++) {
      try {
        await env.DB.prepare(`UPDATE collections SET public_id = COALESCE(public_id, ?), is_public = 1 WHERE id = ? AND user_id = ?`)
          .bind(randomToken(16), id, user.id).run();
        break;
      } catch (e) { if (attempt) throw e; } // 2^-128 token collision: retry once
    }
  } else if (hasPublic) {
    await env.DB.prepare(`UPDATE collections SET is_public = 0 WHERE id = ? AND user_id = ?`)
      .bind(id, user.id).run();
  }
  const row = await env.DB.prepare(
    `SELECT c.id, c.name, c.description, c.created_at, c.public_id, c.is_public,
            (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS n
       FROM collections c WHERE c.id = ? AND c.user_id = ?`,
  ).bind(id, user.id).first();
  if (!row) return jsonNoStore({ error: 'not_found' }, 404);
  return jsonNoStore({ collection: row });
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
