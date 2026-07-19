import type { APIRoute } from 'astro';
import { getEnv, randomToken } from '../../../lib/server/auth';

export const prerender = false;

// Kick off GitHub OAuth: set a short-lived state cookie (login CSRF) and
// redirect to GitHub's authorize page. redirect_uri is derived from the
// request origin so it works on labindex.ai, previews, and localhost alike
// (GitHub matches the registered app's callback host).
export const GET: APIRoute = (context) => {
  const env = getEnv(context);
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('GitHub OAuth not configured (GITHUB_CLIENT_ID missing).', { status: 503 });
  }
  const origin = new URL(context.request.url).origin;
  const state = randomToken(16);
  context.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https:'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/callback`);
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);
  return context.redirect(authorize.toString(), 302);
};
