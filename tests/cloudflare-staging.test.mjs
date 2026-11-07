import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/cloudflare-staging.js';
import {stagingAuth} from '../worker/staging-auth.js';

test('staging blocks app routes, writes and forged Sites identity without touching D1', async () => {
  const env = {get DB() { throw new Error('Staging must not access D1'); }};
  for (const path of ['/', '/login', '/company', '/personal', '/api/workspace', '/api/admin/profiles/test/deletion', '/p/test', '/p/test/contact.vcf', '/n/test', '/signin-with-chatgpt', '/_assets/app.js']) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']) {
      const response = await worker.fetch(new Request(`https://staging.example${path}`, {
        method,
        headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.com' },
      }), env);
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
      assert.equal(response.headers.get('Location'), null);
      if (method === 'HEAD') assert.equal(await response.text(), '');
    }
  }
});

const configured = {
  STAGING_AUTH_ENABLED:'true',
  SUPABASE_URL:'https://fezkiiecfmwbdcdhghzg.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only',
  STAGING_OWNER_EMAIL:'ascendwebstudios777@gmail.com',
  get DB() { throw new Error('Authentication probe must not touch D1'); },
};
const req = headers => new Request('https://staging.example/auth/session',{headers});
const validUser = {id:'test-id',email:'ascendwebstudios777@gmail.com',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false};

test('Sites headers cannot authenticate, and only configured Auth validates bearer tokens', async () => {
  const forged = await stagingAuth(req({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':configured.STAGING_OWNER_EMAIL}),configured,()=>{throw Error('Must not fetch');});
  assert.equal(forged.status,401);
  let calls = 0;
  const response = await stagingAuth(req({Authorization:'Bearer test-token'}),configured,async (url,init)=>{
    calls++;
    assert.equal(url,'https://fezkiiecfmwbdcdhghzg.supabase.co/auth/v1/user');
    assert.equal(init.headers.Authorization,'Bearer test-token');
    assert.equal(init.headers.apikey,'sb_publishable_test_only');
    assert.equal(init.redirect,'manual');
    return Response.json(validUser);
  });
  assert.equal(calls,1);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{email:configured.STAGING_OWNER_EMAIL,access:'staging-signin-test',applicationReady:false});
});

test('rejects unverified, anonymous and other accounts, ignoring user-editable metadata', async () => {
  for (const user of [
    {...validUser,email_confirmed_at:null},
    {...validUser,is_anonymous:true},
    {...validUser,id:''},
    {...validUser,email:'other@example.com',user_metadata:{email:configured.STAGING_OWNER_EMAIL,role:'owner'}},
  ]) {
    const response = await stagingAuth(req({Authorization:'Bearer test'}),configured,async()=>Response.json(user));
    assert.equal(response.status,403);
    assert.ok(!(await response.text()).includes('other@example.com'));
  }
  for (const status of [401,403,500]) {
    const response = await stagingAuth(req({Authorization:'Bearer test'}),configured,async()=>new Response('secret upstream detail',{status}));
    assert.equal(response.status,status===500?503:401);
    assert.ok(!(await response.text()).includes('secret upstream'));
  }
  assert.equal((await stagingAuth(req({Authorization:'Bearer test'}),configured,async()=>{throw new Error('network');})).status,503);
});

test('uses Workers-supported redirect mode and rejects redirects without forwarding credentials', async () => {
  let calls = 0;
  const response = await stagingAuth(req({Authorization:'Bearer test'}),configured,async (url,init)=>{
    calls++;
    if (init.redirect === 'error') throw new TypeError('Unsupported redirect mode');
    assert.equal(init.redirect,'manual');
    assert.equal(url,configured.SUPABASE_URL+'/auth/v1/user');
    return new Response(null,{status:302,headers:{Location:'https://untrusted.example/collect'}});
  });
  assert.equal(calls,1);
  assert.equal(response.status,503);
  assert.equal(response.headers.get('Location'),null);
  assert.ok(!(await response.text()).includes('untrusted.example'));
});

test('configured sign-in never enables application routes, even with an owner token', async () => {
  for (const path of ['/api/workspace','/api/admin/customers','/company','/personal','/p/test','/n/test','/_assets/app.js']) {
    const response = await worker.fetch(new Request(`https://staging.example${path}`,{headers:{Authorization:'Bearer owner'}}),configured);
    assert.equal(response.status,503);
  }
  const login = await worker.fetch(new Request('https://staging.example/login'),configured);
  assert.equal(login.status,200);
  assert.match(login.headers.get('Content-Security-Policy'),/script-src 'self'/);
  assert.match(await login.text(),/Continue with Google/);
  assert.equal(await (await worker.fetch(new Request('https://staging.example/login',{method:'HEAD'}),configured)).text(),'');
});

test('auth configuration fails closed, public config excludes owner and all server secrets', async () => {
  for (const override of [{STAGING_AUTH_ENABLED:'false'},{SUPABASE_URL:'https://attacker.example'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_allowed'},{STAGING_OWNER_EMAIL:''}]) {
    assert.equal(await stagingAuth(new Request('https://staging.example/auth/config'),Object.assign(Object.create(configured),override)),null);
  }
  const response = await stagingAuth(new Request('https://staging.example/auth/config'),configured);
  assert.deepEqual(await response.json(),{url:configured.SUPABASE_URL,publishableKey:configured.SUPABASE_PUBLISHABLE_KEY});
  assert.equal((await stagingAuth(new Request('https://staging.example/auth/session',{method:'POST'}),configured)).status,405);
  assert.equal((await stagingAuth(req({'Sec-Fetch-Site':'cross-site',Authorization:'Bearer test'}),configured)).status,403);
});

test('health reports only the locked infrastructure state', async () => {
  const response = await worker.fetch(new Request('https://staging.example/healthz'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'ascend-digital-cards-staging', status: 'locked', applicationReady: false });
  assert.equal((await worker.fetch(new Request('https://staging.example/healthz', { method: 'POST' }))).status, 503);
  assert.equal(await (await worker.fetch(new Request('https://staging.example/healthz', { method: 'HEAD' }))).text(), '');
});

test('Cloudflare configuration points only to the locked staging entry and separate D1', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
  assert.equal(config.name, 'ascend-digital-cards-staging');
  assert.equal(config.main, 'worker/cloudflare-staging.js');
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'ascend-digital-cards-staging', database_id: '2cf54796-7336-4133-bd80-7f595c5a0374', migrations_dir: 'drizzle' }]);
});
