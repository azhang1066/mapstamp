import {
  pgTable,
  varchar,
  boolean,
  smallint,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const userDestinationsTable = pgTable(
  "user_destinations",
  {
    userId: varchar("user_id").notNull(),
    // 'country' | 'us_state' | 'ca_province' | 'tcc'
    category: varchar("category").notNull(),
    destinationId: varchar("destination_id").notNull(),

    isVisited: boolean("is_visited").notNull().default(false),
    isBucket: boolean("is_bucket").notNull().default(false),

    // Year integers (e.g. 2018), not timestamps
    firstVisitedYear: smallint("first_visited_year"),
    lastVisitedYear: smallint("last_visited_year"),
    timesVisited: smallint("times_visited"),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Unique per (user, category, destination) — one row, both visited+bucket flags
    uniqueIndex("user_destinations_pk").on(t.userId, t.category, t.destinationId),
    // Fast per-user load
    index("user_destinations_user_id_idx").on(t.userId),
    // Aggregate queries across all users by place
    index("user_destinations_category_dest_idx").on(t.category, t.destinationId),
  ],
);

export type UserDestination = typeof userDestinationsTable.$inferSelect;
export type NewUserDestination = typeof userDestinationsTable.$inferInsert;
