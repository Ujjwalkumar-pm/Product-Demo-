"use server";

import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "./db";
import { centres, centreConfig, stores, feedback } from "./schema";
import {
  allCategories,
  DEVICE_ID,
  defaultActiveCategories,
  defaultNegTags,
  defaultPosTags,
  defaultRouting,
  type Routing,
} from "./seed-data";

const COOLDOWN_MS = 15 * 60 * 1000; // 1 submission per vendor per device / 15 min

export type CafeStore = { id: string; name: string; cat: string; initial: string };
export type CafeConfig = {
  centreId: string;
  centreName: string;
  centreShort: string;
  vendors: CafeStore[];
  categories: { id: string; name: string }[];
  positiveTags: string[];
  negativeTags: string[];
  showComment: boolean;
  askContact: boolean;
  mandatoryContactLow: boolean;
};

export type AdminStore = {
  id: string;
  name: string;
  cat: string;
  initial: string;
  live: boolean;
  fb7d: number;
};
export type AdminData = {
  centreId: string;
  stores: AdminStore[];
  activeCategories: string[];
  positiveTags: string[];
  negativeTags: string[];
  showComment: boolean;
  askContact: boolean;
  mandatoryContactLow: boolean;
  routing: Routing;
};

async function ensureConfig(centreId: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(centreConfig)
    .where(eq(centreConfig.centreId, centreId));
  if (existing.length > 0) return existing[0];
  const inserted = await db
    .insert(centreConfig)
    .values({
      centreId,
      activeCategories: defaultActiveCategories,
      positiveTags: defaultPosTags,
      negativeTags: defaultNegTags,
      showComment: true,
      askContact: true,
      mandatoryContactLow: false,
      routing: defaultRouting,
    })
    .returning();
  return inserted[0];
}

export async function getCafeConfig(centreId: string): Promise<CafeConfig> {
  const db = getDb();
  const [centre] = await db.select().from(centres).where(eq(centres.id, centreId));
  const cfg = await ensureConfig(centreId);
  const liveStores = await db
    .select()
    .from(stores)
    .where(and(eq(stores.centreId, centreId), eq(stores.live, true)));

  return {
    centreId,
    centreName: centre?.name ?? centreId,
    centreShort: centre?.short ?? centreId,
    vendors: liveStores.map((s) => ({ id: s.id, name: s.name, cat: s.cat, initial: s.initial })),
    categories: cfg.activeCategories
      .map((id) => allCategories.find((c) => c.id === id))
      .filter((c): c is { id: string; name: string } => Boolean(c)),
    positiveTags: cfg.positiveTags,
    negativeTags: cfg.negativeTags,
    showComment: cfg.showComment,
    askContact: cfg.askContact,
    mandatoryContactLow: cfg.mandatoryContactLow,
  };
}

export async function getAdminData(centreId: string): Promise<AdminData> {
  const db = getDb();
  const cfg = await ensureConfig(centreId);
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.centreId, centreId));

  return {
    centreId,
    stores: rows.map((s) => ({
      id: s.id,
      name: s.name,
      cat: s.cat,
      initial: s.initial,
      live: s.live,
      fb7d: s.fb7d,
    })),
    activeCategories: cfg.activeCategories,
    positiveTags: cfg.positiveTags,
    negativeTags: cfg.negativeTags,
    showComment: cfg.showComment,
    askContact: cfg.askContact,
    mandatoryContactLow: cfg.mandatoryContactLow,
    routing: cfg.routing,
  };
}

export type SubmitPayload = {
  centreId: string;
  vendorId: string;
  overall: number;
  categoryRatings: Record<string, number>;
  positiveTags: string[];
  negativeTags: string[];
  comment: string;
  contact: string;
};

export type SubmitResult =
  | { ok: true; ref: string }
  | { ok: false; error: string };

export async function submitFeedback(p: SubmitPayload): Promise<SubmitResult> {
  if (!p.vendorId) return { ok: false, error: "Please pick a vendor." };
  if (!p.overall || p.overall < 1 || p.overall > 5)
    return { ok: false, error: "Please give an overall rating." };

  const db = getDb();

  // Anti-spam: 1 submission per vendor per device per 15 min (wireframe default).
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const recent = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(
      and(
        eq(feedback.vendorId, p.vendorId),
        eq(feedback.deviceId, DEVICE_ID),
        gt(feedback.createdAt, cutoff),
      ),
    )
    .limit(1);
  if (recent.length > 0) {
    return {
      ok: false,
      error: "Thanks — feedback for this vendor was just recorded from this tablet. Please try again in a few minutes.",
    };
  }

  const ref =
    "FB-2026-" + String(Math.floor(Math.random() * 99000) + 1000).padStart(5, "0");

  await db.insert(feedback).values({
    ref,
    centreId: p.centreId,
    vendorId: p.vendorId,
    overall: p.overall,
    categoryRatings: p.categoryRatings,
    positiveTags: p.positiveTags,
    negativeTags: p.negativeTags,
    comment: p.comment || null,
    contact: p.contact || null,
    deviceId: DEVICE_ID,
    autoTicket: p.overall > 0 && p.overall <= 2,
  });

  return { ok: true, ref };
}

export async function toggleStoreLive(storeId: string): Promise<AdminData> {
  const db = getDb();
  const [s] = await db.select().from(stores).where(eq(stores.id, storeId));
  if (s) {
    await db
      .update(stores)
      .set({ live: !s.live })
      .where(eq(stores.id, storeId));
    return getAdminData(s.centreId);
  }
  throw new Error("store not found");
}

export type SaveConfigInput = {
  centreId: string;
  activeCategories: string[];
  positiveTags: string[];
  negativeTags: string[];
  showComment: boolean;
  askContact: boolean;
  mandatoryContactLow: boolean;
  routing: Routing;
};

export async function saveCentreConfig(input: SaveConfigInput): Promise<{ ok: true }> {
  const db = getDb();
  await ensureConfig(input.centreId);
  await db
    .update(centreConfig)
    .set({
      activeCategories: input.activeCategories,
      positiveTags: input.positiveTags,
      negativeTags: input.negativeTags,
      showComment: input.showComment,
      askContact: input.askContact,
      mandatoryContactLow: input.mandatoryContactLow,
      routing: input.routing,
    })
    .where(eq(centreConfig.centreId, input.centreId));
  return { ok: true };
}

export async function getRecentFeedback(limit = 5) {
  const db = getDb();
  return db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(limit);
}
