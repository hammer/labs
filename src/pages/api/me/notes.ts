import type { APIRoute } from 'astro';
import { getSessionUser, getEnv, requireCsrf, jsonNoStore } from '../../../lib/server/auth';
import { isValidNoteTarget } from '../../../lib/tags';

export const prerender = false;

// GET ?target: the user's notes for a target (newest first).
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const target = new URL(context.request.url).searchParams.get('target') ?? '';
  if (!target) return jsonNoStore({ error: 'target_required' }, 400);
  const { results } = await getEnv(context).DB.prepare(
    `SELECT id, body, created_at, updated_at FROM notes WHERE user_id = ? AND target = ? ORDER BY created_at DESC`,
  ).bind(user.id, target).all();
  return jsonNoStore({ notes: results ?? [] });
};

// POST {target, body}: add a note.
export const POST: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  let b: any; try { b = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const target = String(b?.target ?? '');
  const body = String(b?.body ?? '').trim().slice(0, 10000);
  if (!isValidNoteTarget(target)) return jsonNoStore({ error: 'invalid_target' }, 400);
  if (!body) return jsonNoStore({ error: 'empty' }, 400);
  const row = await getEnv(context).DB
    .prepare(`INSERT INTO notes (user_id, target, body) VALUES (?, ?, ?) RETURNING id, body, created_at, updated_at`)
    .bind(user.id, target, body).first();
  return jsonNoStore({ note: row }, 201);
};

// PATCH ?id {body}: edit a note (scoped to user).
export const PATCH: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  let b: any; try { b = await context.request.json(); } catch { return jsonNoStore({ error: 'bad_json' }, 400); }
  const body = String(b?.body ?? '').trim().slice(0, 10000);
  if (!id || !body) return jsonNoStore({ error: 'invalid' }, 400);
  const row = await getEnv(context).DB
    .prepare(`UPDATE notes SET body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? RETURNING updated_at`)
    .bind(body, id, user.id).first();
  if (!row) return jsonNoStore({ error: 'not_found' }, 404);
  return jsonNoStore({ ok: true, updated_at: row.updated_at }); // client keeps the meta timestamp honest
};

// DELETE ?id: delete a note (scoped to user).
export const DELETE: APIRoute = async (context) => {
  if (!requireCsrf(context)) return jsonNoStore({ error: 'csrf' }, 403);
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ error: 'unauthorized' }, 401);
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  if (!id) return jsonNoStore({ error: 'id_required' }, 400);
  await getEnv(context).DB.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return jsonNoStore({ ok: true });
};
