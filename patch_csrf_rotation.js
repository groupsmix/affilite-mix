const fs = require('fs');

let content = fs.readFileSync('/data/user/work/affilite-mix/middleware.ts', 'utf8');

// Remove the CSRF rotation block
const toRemove = `  // ── CSRF token rotation on state-changing requests ──────
  // Rotate the CSRF token after every successful state-changing request
  // for defence-in-depth (one-time-use tokens).
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const newToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE, newToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4,
    });
  }`;

content = content.replace(toRemove, `  // Removed CSRF token rotation on state-changing requests
  // to support concurrent POST requests and prevent token exposure in response headers.`);

fs.writeFileSync('/data/user/work/affilite-mix/middleware.ts', content);

