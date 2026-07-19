import type { APIRoute } from 'astro';
import { getSessionUser, jsonNoStore } from '../../lib/server/auth';

export const prerender = false;

// The client calls this on load to learn who (if anyone) is signed in.
export const GET: APIRoute = async (context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonNoStore({ user: null }, 200);
  return jsonNoStore({ user: { login: user.login, name: user.name, avatar_url: user.avatar_url } });
};
