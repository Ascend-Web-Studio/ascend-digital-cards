import {authJs} from '../dist/staging/auth-assets.js';

const paths = new Set(['/', '/login', '/auth/callback', '/auth/config', '/auth/session', '/_auth/client.js']);
const baseHeaders = {
  'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer',
};
const reply = (body,status=200) => Response.json(body,{status,headers:baseHeaders});
export function authConfig(env) {
  // This milestone is a sign-in probe only, not an application access switch.
  if (env?.STAGING_AUTH_ENABLED !== 'true') return null;
  if (env.SUPABASE_URL !== 'https://fezkiiecfmwbdcdhghzg.supabase.co') return null;
  if (typeof env.SUPABASE_PUBLISHABLE_KEY !== 'string' || !env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) return null;
  if (env.STAGING_OWNER_EMAIL !== 'ascendwebstudios777@gmail.com') return null;
  return {url:env.SUPABASE_URL, publishableKey:env.SUPABASE_PUBLISHABLE_KEY, ownerEmail:env.STAGING_OWNER_EMAIL};
}
export async function stagingAuth(request,env,fetcher=fetch) {
  const url = new URL(request.url), path = url.pathname;
  if (!paths.has(path)) return null;
  const config = authConfig(env);
  if (!config) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply({error:'Method not allowed'},405);
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' && !['/','/login','/auth/callback'].includes(path)) return reply({error:'Forbidden'},403);
  if (path === '/') return new Response(null,{status:302,headers:{...baseHeaders,Location:'/login'}});
  if (path === '/auth/session') {
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer [^\s]{1,8192}$/.test(auth)) return reply({error:'Sign-in required'},401);
    try {
      // Validate with the configured Auth server; never trust client-decoded JWTs,
      // user_metadata, caller-supplied email or Sites identity headers.
      const response = await fetcher(`${config.url}/auth/v1/user`, {
        headers:{apikey:config.publishableKey, Authorization:auth},
        // Workers rejects redirect:'error' before sending the request. Inspect
        // manual redirects instead, never forwarding the bearer to another host.
        redirect:'manual', signal:AbortSignal.timeout(10000),
      });
      if (response.status >= 300 && response.status < 400) return reply({error:'Sign-in verification temporarily unavailable'},503);
      if (!response.ok) return reply({error:'Session could not be verified'}, response.status >= 500 ? 503 : 401);
      const user = await response.json();
      if (!user || typeof user.id !== 'string' || !user.id || user.is_anonymous === true || !user.email_confirmed_at || typeof user.email !== 'string') return reply({error:'Verified email required'},403);
      if (user.email.toLowerCase() !== config.ownerEmail) return reply({error:'Account not enabled for staging'},403);
      return reply({email:user.email.toLowerCase(), access:'staging-signin-test', applicationReady:false});
    } catch { return reply({error:'Sign-in verification temporarily unavailable'},503); }
  }
  if (path === '/auth/config') return reply({url:config.url,publishableKey:config.publishableKey});
  if (path === '/_auth/client.js') return new Response(request.method === 'HEAD' ? null : authJs,{headers:{...baseHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
  const csp = `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' ${config.url}; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  return new Response(request.method === 'HEAD' ? null : loginHtml,{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp}});
}
const loginHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | Ascend Digital Cards staging</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf5fa;color:#011e50;font:16px/1.6 system-ui,sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}main{width:min(100%,480px);background:white;border:1px solid #dce9f3;border-radius:24px;padding:32px}h1{font-size:28px;line-height:1.2}label{display:block;margin-top:16px}input,button{font:inherit;width:100%;padding:12px;border-radius:10px;border:1px solid #b3c7db}button{cursor:pointer;margin-top:12px;background:#011e50;color:white;font-weight:600}button:disabled{opacity:.55;cursor:wait}input:focus-visible,button:focus-visible{outline:3px solid #4e8dff;outline-offset:3px}.note{font-size:14px;color:#49617c}#message{background:#edf5fa;padding:16px;border-radius:10px}hr{border:0;border-top:1px solid #dce9f3;margin:24px 0}[hidden]{display:none!important}</style><script type="module" src="/_auth/client.js"></script></head><body><main>
<p class="note">ASCEND DIGITAL CARDS · STAGING</p><h1>Welcome to your studio.</h1><p>Sign in to test your account connection.</p>
<button id="google" type="button" disabled>Continue with Google</button><hr>
<form id="email-form"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required maxlength="254" disabled><button id="send" type="button" disabled>Send sign-in code</button></form>
<label for="code">8-digit email code</label><input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" disabled><button id="verify" type="button" disabled>Verify code</button>
<p id="message" role="status" aria-live="polite">Preparing sign-in…</p><button id="signout" type="button" hidden disabled>Sign out</button>
<p class="note">This staging test is restricted to the studio owner. Dashboards and card data remain unavailable until migration checks are complete. Closing this tab ends browser storage for this test.</p>
</main></body></html>`;
