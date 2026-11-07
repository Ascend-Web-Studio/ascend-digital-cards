import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/cloudflare-staging.js';

test('staging blocks app routes, writes and forged Sites identity without touching D1', async () => {
  const env = new Proxy({}, { get() { throw new Error('Staging must not access bindings'); } });
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
