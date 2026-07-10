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
        pathname.startsWith("/api/booking");
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
