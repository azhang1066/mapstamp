import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userProfilesTable = pgTable(
  "user_profiles",
  {
    userId: varchar("user_id").primaryKey(),
    // Always stored in lowercase — uniqueness and search are case-insensitive by default
    username: varchar("username").notNull(),
    displayName: varchar("display_name"),
    // false = auto-generated placeholder; true = user explicitly chose this username
    usernameSet: boolean("username_set").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Case-insensitive unique constraint via expression index
    uniqueIndex("user_profiles_username_lower_uniq").on(sql`lower(${t.username})`),
    // Prefix-search support
    uniqueIndex("user_profiles_username_uniq").on(t.username),
  ],
);

export type UserProfile = typeof userProfilesTable.$inferSelect;
export type NewUserProfile = typeof userProfilesTable.$inferInsert;
