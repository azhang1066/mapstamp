import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export interface MapShareSnapshot {
  vc: string[];
  vs: string[];
  vp: string[];
  bc: string[];
  bs: string[];
  bp: string[];
  tv?: string[];
  tb?: string[];
  n?: Record<string, string>;
}

export const mapSharesTable = pgTable(
  "map_shares",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ownerUserId: varchar("owner_user_id"),
    snapshot: jsonb("snapshot").$type<MapShareSnapshot>().notNull(),
    visitedCount: integer("visited_count").notNull(),
    bucketCount: integer("bucket_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("map_shares_owner_user_id_idx").on(t.ownerUserId),
    index("map_shares_created_at_idx").on(t.createdAt),
  ],
);

export const insertMapShareSchema = createInsertSchema(mapSharesTable).omit({
  createdAt: true,
});

export type InsertMapShare = z.infer<typeof insertMapShareSchema>;
export type MapShare = typeof mapSharesTable.$inferSelect;