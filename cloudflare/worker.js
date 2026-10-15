const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    // The public presentation must never forward credentials or client data to
    // the loopback-only Python workspace. Its APIs require separate hosting.
    if (path === '/api' || path.startsWith('/api/')) {
      const body = JSON.stringify({
        error: 'Live screening and research are available in the local NeoLaw workspace. This hosted version is the presentation demo.',
        code: 'LOCAL_BACKEND_REQUIRED'
      });
      return new Response(request.method === 'HEAD' ? null : body, {status: 503, headers});
    }
    return env.ASSETS.fetch(request);
  }
};
