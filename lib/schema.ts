import {
  pgTable,
  text,
  integer,
  boolean,
  serial,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const centres = pgTable("centres", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  short: text("short").notNull(),
});

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  centreId: text("centre_id")
    .notNull()
    .references(() => centres.id),
  name: text("name").notNull(),
  cat: text("cat").notNull(),
  initial: text("initial").notNull(),
  live: boolean("live").notNull().default(false),
  fb7d: integer("fb7d").notNull().default(0),
});

export const centreConfig = pgTable("centre_config", {
  centreId: text("centre_id")
    .primaryKey()
    .references(() => centres.id),
  activeCategories: jsonb("active_categories").$type<string[]>().notNull(),
  positiveTags: jsonb("positive_tags").$type<string[]>().notNull(),
  negativeTags: jsonb("negative_tags").$type<string[]>().notNull(),
  showComment: boolean("show_comment").notNull().default(true),
  askContact: boolean("ask_contact").notNull().default(true),
  mandatoryContactLow: boolean("mandatory_contact_low").notNull().default(false),
  routing: jsonb("routing")
    .$type<{
      dailyDigest: boolean;
      autoTicketLow: boolean;
      rollupDashboard: boolean;
      slackAlertLow: boolean;
    }>()
    .notNull(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().unique(),
  centreId: text("centre_id").notNull(),
  vendorId: text("vendor_id").notNull(),
  overall: integer("overall").notNull(),
  categoryRatings: jsonb("category_ratings").$type<Record<string, number>>().notNull(),
  positiveTags: jsonb("positive_tags").$type<string[]>().notNull(),
  negativeTags: jsonb("negative_tags").$type<string[]>().notNull(),
  comment: text("comment"),
  contact: text("contact"),
  deviceId: text("device_id").notNull(),
  autoTicket: boolean("auto_ticket").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeedbackRow = typeof feedback.$inferSelect;
export type CentreConfigRow = typeof centreConfig.$inferSelect;
export type StoreRow = typeof stores.$inferSelect;
