import { pgTable, uuid, varchar, smallint, timestamp } from "drizzle-orm/pg-core";

export const userPhotosTable = pgTable("user_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull(),
  category: varchar("category").notNull(), // country | state | province | tcc
  destinationId: varchar("destination_id").notNull(),
  storageKey: varchar("storage_key").notNull(), // GCS object path, e.g. /objects/uploads/<uuid>
  caption: varchar("caption", { length: 120 }).notNull().default(""),
  position: smallint("position").notNull().default(0), // 0–2 slot within this destination
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserPhoto = typeof userPhotosTable.$inferSelect;
