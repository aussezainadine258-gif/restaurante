// Cabeçalhos de segurança e helpers comuns.
function cabecalhosSeguranca(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // A câmara/microfone são usados apenas pelo seletor nativo de ficheiros
  // (input capture) no painel; não há getUserMedia na aplicação.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: wss:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'"
    ].join('; ')
  );
  next();
}

function semCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
}

module.exports = { cabecalhosSeguranca, semCache };
