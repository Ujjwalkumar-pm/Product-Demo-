// Idempotent seed: centres, stores, and default per-centre config.
// Run with: npx dotenv -e .env.local -- npx tsx scripts/seed.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/schema";
import {
  centres as centreData,
  stores as storeData,
  defaultActiveCategories,
  defaultNegTags,
  defaultPosTags,
  defaultRouting,
} from "../lib/seed-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (use: npx dotenv -e .env.local -- npx tsx scripts/seed.ts)");
  const db = drizzle(neon(url), { schema });

  for (const c of centreData) {
    await db
      .insert(schema.centres)
      .values(c)
      .onConflictDoUpdate({
        target: schema.centres.id,
        set: { name: c.name, short: c.short },
      });
  }
  console.log(`✓ ${centreData.length} centres`);

  for (const s of storeData) {
    await db
      .insert(schema.stores)
      .values(s)
      .onConflictDoUpdate({
        target: schema.stores.id,
        set: { name: s.name, cat: s.cat, initial: s.initial, live: s.live, fb7d: s.fb7d },
      });
  }
  console.log(`✓ ${storeData.length} stores`);

  for (const c of centreData) {
    await db
      .insert(schema.centreConfig)
      .values({
        centreId: c.id,
        activeCategories: defaultActiveCategories,
        positiveTags: defaultPosTags,
        negativeTags: defaultNegTags,
        showComment: true,
        askContact: true,
        mandatoryContactLow: false,
        routing: defaultRouting,
      })
      .onConflictDoNothing({ target: schema.centreConfig.centreId });
  }
  console.log(`✓ centre_config defaults ensured`);
  console.log("Seed complete.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
