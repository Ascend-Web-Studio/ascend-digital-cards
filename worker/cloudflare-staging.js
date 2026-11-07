import {stagingAuth} from './staging-auth.js';
// Only the sign-in probe can be enabled. The actual application remains locked.
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (url.pathname === '/healthz' && read) {
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({
        service: 'ascend-digital-cards-staging',
        status: 'locked',
        applicationReady: false,
      }), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const authResponse = await stagingAuth(request,env);
    if (authResponse) return request.method === 'HEAD' ? new Response(null,authResponse) : authResponse;
    return new Response(request.method === 'HEAD' ? null :
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ascend Digital Cards staging</title><main><h1>Staging setup in progress</h1><p>Ascend Digital Cards is being prepared for Cloudflare. Sign-in and card access are not available on this staging address yet.</p></main></html>',
    { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  },
};
