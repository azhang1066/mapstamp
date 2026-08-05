import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const userConnectionsTable = pgTable(
  "user_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: varchar("requester_id").notNull(),
    addresseeId: varchar("addressee_id").notNull(),
    // 'pending' | 'accepted' | 'declined'
    status: varchar("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    // One request per ordered pair (requester → addressee)
    uniqueIndex("user_connections_pair_uniq").on(t.requesterId, t.addresseeId),
    // For listing/filtering outgoing requests
    index("user_connections_requester_status_idx").on(t.requesterId, t.status),
    // For listing/filtering incoming requests
    index("user_connections_addressee_status_idx").on(t.addresseeId, t.status),
  ],
);

export type UserConnection = typeof userConnectionsTable.$inferSelect;
export type NewUserConnection = typeof userConnectionsTable.$inferInsert;
