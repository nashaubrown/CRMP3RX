import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Compared when the email doesn't exist, so response timing doesn't reveal
// which accounts are real (same bcrypt cost as stored hashes).
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const googleAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        // Brute-force guard: 10 attempts per account per 15 minutes.
        if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000)) return null;

        const user = await db.user.findUnique({ where: { email } });

        const valid = await compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.passwordHash || !valid) return null;
        // Offboarded accounts keep their records but can't sign in.
        if (user.disabledAt) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
    ...(googleAuthEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Internal tool: users are pre-created by an admin, so linking a
            // Google account to the matching email row is safe.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // No self-serve signup: Google sign-in only works for invited users.
      if (account?.provider === "google") {
        const existing = await db.user.findUnique({
          where: { email: user.email ?? "" },
        });
        return Boolean(existing) && !existing?.disabledAt;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // OAuth sign-ins go through the adapter user, which carries role.
        token.role = user.role ?? "SALES_REP";
      }
      return token;
    },
  },
});
