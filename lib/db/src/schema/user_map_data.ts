import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const userMapDataTable = pgTable("user_map_data", {
  userId: varchar("user_id").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserMapData = typeof userMapDataTable.$inferSelect;
