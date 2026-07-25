export const publicContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

export const publicSecurityResponseHeaders = Object.freeze([
  {
    key: 'Content-Security-Policy',
    value: publicContentSecurityPolicy,
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
] as const);

export function publicSecurityHeaderRules() {
  return [{
    headers: publicSecurityResponseHeaders.map(header => ({...header})),
    source: '/:path*',
  }];
}
