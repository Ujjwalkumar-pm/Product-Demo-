"use server";

import { and, desc, eq, gte, gt } from "drizzle-orm";
import { getDb } from "./db";
import {
  centres,
  centreConfig,
  stores,
  feedback,
  adminUsers,
} from "./schema";
import {
  allCategories,
  DEVICE_ID,
  defaultActiveCategories,
  defaultNegTags,
  defaultPosTags,
  defaultRouting,
  type Routing,
} from "./seed-data";
import { hashPassword, requirePwa } from "./auth";

const MOBILE_RE = /^\d{10}$/;

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
  customCategories: { id: string; name: string }[];
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
      customCategories: [],
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

  const catalog: { id: string; name: string }[] = [
    ...allCategories,
    ...cfg.customCategories,
  ];
  return {
    centreId,
    centreName: centre?.name ?? centreId,
    centreShort: centre?.short ?? centreId,
    vendors: liveStores.map((s) => ({ id: s.id, name: s.name, cat: s.cat, initial: s.initial })),
    categories: cfg.activeCategories
      .map((id) => catalog.find((c) => c.id === id))
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
    customCategories: cfg.customCategories,
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
  name: string;
  mobile: string;
};

export type SubmitResult =
  | { ok: true; ref: string }
  | { ok: false; error: string };

export async function submitFeedback(p: SubmitPayload): Promise<SubmitResult> {
  await requirePwa();
  if (!p.vendorId) return { ok: false, error: "Please pick a vendor." };
  if (!p.overall || p.overall < 1 || p.overall > 5)
    return { ok: false, error: "Please give an overall rating." };

  const name = (p.name ?? "").trim();
  const mobile = (p.mobile ?? "").trim();

  // 10-digit mobile validation whenever a mobile is provided.
  if (mobile && !MOBILE_RE.test(mobile)) {
    return { ok: false, error: "Mobile number must be exactly 10 digits." };
  }

  // Low-rating gate: when this centre requires contact on low ratings,
  // name + mobile become mandatory for overall ≤ 2.
  if (p.overall <= 2) {
    const cfg = await ensureConfig(p.centreId);
    if (cfg.mandatoryContactLow) {
      if (!name) {
        return { ok: false, error: "Please share your name so we can follow up." };
      }
      if (!MOBILE_RE.test(mobile)) {
        return {
          ok: false,
          error: "Please share a valid 10-digit mobile number so we can follow up.",
        };
      }
    }
  }

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
    name: name || null,
    mobile: mobile || null,
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
  customCategories: { id: string; name: string }[];
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
      customCategories: input.customCategories,
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

// --- Admin user management ---

export type AdminUserView = {
  id: number;
  username: string;
  createdAt: string;
};

export async function listAdminUsers(): Promise<AdminUserView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(desc(adminUsers.createdAt));
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type AdminUserMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addAdminUser(
  username: string,
  password: string,
): Promise<AdminUserMutationResult> {
  const u = (username ?? "").trim();
  if (!u) return { ok: false, error: "Login ID is required." };
  if (!/^[A-Za-z0-9._\-+@]{3,64}$/.test(u)) {
    return {
      ok: false,
      error:
        "Login ID must be 3–64 chars (letters, digits, or any of . _ - + @). Emails are fine.",
    };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  const db = getDb();
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.username, u))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "A user with that username already exists." };
  }
  const passwordHash = await hashPassword(password);
  await db.insert(adminUsers).values({ username: u, passwordHash });
  return { ok: true };
}

export async function deleteAdminUser(
  id: number,
): Promise<AdminUserMutationResult> {
  const db = getDb();
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  return { ok: true };
}

// --- Feedback log (admin) ---

export type FeedbackLogRow = {
  id: number;
  ref: string;
  centreId: string;
  centreName: string;
  vendorId: string;
  vendorName: string;
  overall: number;
  categoryRatings: Record<string, number>;
  positiveTags: string[];
  negativeTags: string[];
  comment: string | null;
  name: string | null;
  mobile: string | null;
  contact: string | null;
  autoTicket: boolean;
  createdAt: string;
};

export type FeedbackLogFilter = {
  centreId?: string;
  minRating?: number;
  limit?: number;
};

export async function getAllFeedback(
  filter: FeedbackLogFilter = {},
): Promise<FeedbackLogRow[]> {
  const db = getDb();
  const conds = [] as ReturnType<typeof eq>[];
  if (filter.centreId) conds.push(eq(feedback.centreId, filter.centreId));
  if (typeof filter.minRating === "number" && filter.minRating > 0) {
    conds.push(gte(feedback.overall, filter.minRating));
  }
  const selection = db
    .select({
      id: feedback.id,
      ref: feedback.ref,
      centreId: feedback.centreId,
      centreName: centres.name,
      vendorId: feedback.vendorId,
      vendorName: stores.name,
      overall: feedback.overall,
      categoryRatings: feedback.categoryRatings,
      positiveTags: feedback.positiveTags,
      negativeTags: feedback.negativeTags,
      comment: feedback.comment,
      name: feedback.name,
      mobile: feedback.mobile,
      contact: feedback.contact,
      autoTicket: feedback.autoTicket,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .leftJoin(centres, eq(centres.id, feedback.centreId))
    .leftJoin(stores, eq(stores.id, feedback.vendorId));

  const filtered =
    conds.length > 0 ? selection.where(and(...conds)) : selection;
  const rows = await filtered
    .orderBy(desc(feedback.createdAt))
    .limit(filter.limit ?? 500);

  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    centreId: r.centreId,
    centreName: r.centreName ?? r.centreId,
    vendorId: r.vendorId,
    vendorName: r.vendorName ?? r.vendorId,
    overall: r.overall,
    categoryRatings: r.categoryRatings,
    positiveTags: r.positiveTags,
    negativeTags: r.negativeTags,
    comment: r.comment,
    name: r.name,
    mobile: r.mobile,
    contact: r.contact,
    autoTicket: r.autoTicket,
    createdAt: r.createdAt.toISOString(),
  }));
}
