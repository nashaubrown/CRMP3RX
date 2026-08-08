import type { NextConfig } from "next";

const securityHeaders = [
  // The app must never be framed (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // geolocation=(self): our own pages may ask the device where it is — reps use
  // it to pin a shopfront and to see which zone they're standing in. It stays
  // denied to anything we embed. camera and microphone stay fully off; nothing
  // in the CRM uses them, and `()` blocks our own origin too.
  //
  // This is a document-level gate that sits *above* the browser's permission
  // prompt: with `geolocation=()` the API fails as PERMISSION_DENIED even after
  // the user has allowed the site, which looks exactly like a bug in the app.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // No-op over plain HTTP; enforces HTTPS once deployed behind TLS
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
