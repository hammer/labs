import type { APIRoute } from 'astro';
import { getEnv, randomToken, setSessionCookie, sessionExpiryISO } from '../../../lib/server/auth';

export const prerender = false;

// GitHub redirects back here with ?code&state. Verify state, exchange the code
// for an access token, fetch the user, upsert into D1, mint a session, redirect.
export const GET: APIRoute = async (context) => {
  const env = getEnv(context);
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = context.cookies.get('oauth_state')?.value;
  context.cookies.delete('oauth_state', { path: '/' });

  if (!code || !state || !expected || state !== expected) {
    return new Response('Invalid OAuth state.', { status: 400 });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('GitHub OAuth not configured.', { status: 503 });
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const tokenJson: any = await tokenRes.json();
  const accessToken = tokenJson?.access_token;
  if (!accessToken) return new Response('OAuth token exchange failed.', { status: 502 });

  const ghRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'labindex',
      accept: 'application/vnd.github+json',
    },
  });
  const gh: any = await ghRes.json();
  if (!gh?.id) return new Response('Failed to load GitHub profile.', { status: 502 });

  const row = await env.DB.prepare(
    `INSERT INTO users (gh_id, login, name, avatar_url)
       VALUES (?, ?, ?, ?)
     ON CONFLICT(gh_id) DO UPDATE SET
       login = excluded.login, name = excluded.name,
       avatar_url = excluded.avatar_url, last_seen_at = datetime('now')
     RETURNING id`,
  )
    .bind(gh.id, gh.login, gh.name ?? null, gh.avatar_url ?? null)
    .first();

  const token = randomToken(32);
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, row.id, sessionExpiryISO())
    .run();

  setSessionCookie(context, token);
  return context.redirect('/account', 302);
};
