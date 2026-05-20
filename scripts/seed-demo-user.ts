// Seed a Cafe PWA demo login. Idempotent — if the username already exists,
// the password is updated in place.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/seed-demo-user.ts
//
// Override defaults with env vars, e.g.:
//   DEMO_USERNAME=demo@smartworks.in DEMO_PASSWORD=Demo@2026 npx dotenv -e .env.local -- npx tsx scripts/seed-demo-user.ts

import { randomBytes, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { adminUsers } from "../lib/schema";

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const username = process.env.DEMO_USERNAME ?? "demo@smartworks.in";
  const password = process.env.DEMO_PASSWORD ?? "Demo@2026";

  const sql = neon(url);
  const db = drizzle(sql);
  const passwordHash = hashPassword(password);

  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(adminUsers)
      .set({ passwordHash })
      .where(eq(adminUsers.username, username));
    console.log(`Updated password for existing user "${username}".`);
  } else {
    await db.insert(adminUsers).values({ username, passwordHash });
    console.log(`Created demo user "${username}".`);
  }

  console.log("---");
  console.log(`  Login ID : ${username}`);
  console.log(`  Password : ${password}`);
  console.log("---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
