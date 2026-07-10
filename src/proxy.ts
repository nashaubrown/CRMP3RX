import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Route protection: validates the session JWT via authConfig.callbacks.authorized.
// The DB-backed providers live in lib/auth.ts and are not needed here.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
