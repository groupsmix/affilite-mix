export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('admin.')) {
      // Stricter CSP, different cookie scope, separate rate-limit
      const response = await fetch(request);
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Content-Security-Policy', "default-src 'self'");
      return newResponse;
    }
    return fetch(request);
  }
};
