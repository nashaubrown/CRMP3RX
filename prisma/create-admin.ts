import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

// Bootstrap a real admin account on a fresh (production) database — without the
// demo seed data. Run once after migrating:
//
//   ADMIN_EMAIL="you@perx.mv" ADMIN_PASSWORD="a-strong-password" \
//   ADMIN_NAME="Your Name" pnpm create:admin
//
// Safe to re-run: it upserts (updates the password/role if the email exists).

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? process.argv[2] ?? "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3] ?? "";
  const name = process.env.ADMIN_NAME ?? process.argv[4] ?? "Admin";

  if (!email || !password) {
    console.error(
      'Usage: ADMIN_EMAIL="you@perx.mv" ADMIN_PASSWORD="strong-password" ADMIN_NAME="Your Name" pnpm create:admin'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Choose a password of at least 8 characters.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  const passwordHash = await hash(password, 10);
  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", name },
    create: { email, name, role: "ADMIN", passwordHash },
  });

  console.log(`✓ Admin ready: ${user.name} <${user.email}> — sign in and start adding your team.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
