import type { NextAuthConfig } from "next-auth";

// Edge-safe config shared with middleware: no adapter, no bcrypt, no Prisma.
// The full config (providers, adapter) lives in auth.ts.
export const authConfig = {
  // Standard for deployments behind a proxy (and Vercel); host comes from headers.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/book") ||
        pathname.startsWith("/capture") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/booking") ||
        // Telegram posts here unauthenticated; the route verifies its own
        // secret-token header.
        pathname.startsWith("/api/telegram/webhook") ||
        // Called by the reminders scheduler; the route verifies CRON_SECRET.
        pathname.startsWith("/api/cron") ||
        // Public read-only payload of published help articles; consumed by
        // the help site's Netlify build.
        pathname.startsWith("/api/help/published") ||
        // API-key authenticated surfaces (REST + MCP) do their own auth
        pathname.startsWith("/api/v1") ||
        // Affiliate portal API: bearer-token authenticated (AffiliateSession)
        // or deliberately public (registration, magic-link request) — the
        // routes enforce their own auth and rate limits. The admin-only
        // /api/affiliate-files route is NOT exempted: it uses the CRM session.
        pathname.startsWith("/api/affiliate/") ||
        // startsWith, not ===: the connector URL carries the key as a path
        // segment (/api/mcp/perx_…), and this check runs before the rewrite
        // that turns it back into ?key=.
        pathname.startsWith("/api/mcp") ||
        // OAuth discovery probes. MCP clients (claude.ai connectors) check
        // these before connecting; they must 404, not redirect to /login —
        // an HTML login page reads as "this server has a sign-in service"
        // and sends the client down a dynamic-registration path that fails.
        pathname.startsWith("/.well-known/");
      if (isPublic) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      // On sign-in, persist id + role into the JWT. Role changes take effect
      // on next sign-in (acceptable for an internal tool).
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "SALES_REP";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
