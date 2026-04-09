import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const businesses = sqliteTable("businesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  yelpUrl: text("yelp_url").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  reviewerName: text("reviewer_name").notNull(),
  reviewerLocation: text("reviewer_location"),
  rating: real("rating").notNull(),
  postedAtRaw: text("posted_at_raw").notNull(),
  postedAtIso: text("posted_at_iso"),
  reviewText: text("review_text").notNull(),
  reviewUrl: text("review_url").notNull().unique(),
  fetchedAtIso: text("fetched_at_iso").notNull(),
  locationName: text("location_name")
});

export const draftResponses = sqliteTable("draft_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  responseText: text("response_text").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});
