import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore } from '../../../lib/server/auth';
import { normalizeTag, isValidTarget } from '../../../lib/tags';

export const prerender = false;

// GET: the user's tags. ?target= scopes to one item; otherwise returns all
// (the client uses the full set for prefix-aware autocomplete + the overview).
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const target = new URL(context.request.url).searchParams.get('target');
  const env = getEnv(context);
  const stmt = target
    ? env.DB.prepare(`SELECT target, tag FROM tags WHERE user_id=? AND target=? ORDER BY tag`).bind(user.id, target)
    : env.DB.prepare(`SELECT target, tag FROM tags WHERE user_id=? ORDER BY tag`).bind(user.id);
  const { results } = await stmt.all();
  return jsonNoStore({ tags: results ?? [] });
};

// POST {target, tag}: add a tag (idempotent via UNIQUE — conflict is a no-op).
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let body: any;
  try { body = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const target = String(body?.target ?? '');
  const tag = normalizeTag(String(body?.tag ?? ''));
  if (!tag) return jsonNoStore({ error: 'invalid_tag' }, 400);
  if (!isValidTarget(target)) return jsonNoStore({ error: 'invalid_target' }, 400);
  await getEnv(context).DB
    .prepare(`INSERT INTO tags (user_id, target, tag) VALUES (?, ?, ?) ON CONFLICT(user_id, target, tag) DO NOTHING`)
    .bind(user.id, target, tag)
    .run();
  return jsonNoStore({ tag, target }, 201);
};

// DELETE ?target=&tag= : remove one tag (scoped to user_id).
export const DELETE: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const url = new URL(context.request.url);
  const target = url.searchParams.get('target') ?? '';
  const tag = url.searchParams.get('tag') ?? '';
  if (!target || !tag) return jsonNoStore({ error: 'target_and_tag_required' }, 400);
  await getEnv(context).DB.prepare(`DELETE FROM tags WHERE user_id=? AND target=? AND tag=?`).bind(user.id, target, tag).run();
  return jsonNoStore({ ok: true });
};
