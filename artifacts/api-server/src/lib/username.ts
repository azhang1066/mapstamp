/**
 * Username generation and validation utilities.
 */
import { db, userProfilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// Usernames reserved to avoid route ambiguity and impersonation
const RESERVED = new Set([
  "me", "admin", "api", "search", "leaderboard", "compare",
  "connection", "connections", "profile", "user", "users",
  "stats", "health", "photos", "map", "mapdata", "support",
]);

/** Regex for valid usernames: 3–30 alphanumeric/underscore chars. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export interface UsernameValidationError {
  code: "invalid_format" | "reserved" | "username_taken";
  message: string;
}

/**
 * Validate and normalise a raw username string.
 * Returns the lowercased form if valid, or a validation error.
 */
export function validateUsername(
  raw: string,
): { ok: true; username: string } | { ok: false; error: UsernameValidationError } {
  const normalized = raw.trim().toLowerCase();

  if (!USERNAME_REGEX.test(normalized)) {
    return {
      ok: false,
      error: {
        code: "invalid_format",
        message:
          "Username must be 3–30 characters and contain only letters, numbers, and underscores.",
      },
    };
  }

  if (RESERVED.has(normalized)) {
    return {
      ok: false,
      error: { code: "reserved", message: "That username is reserved. Please choose another." },
    };
  }

  return { ok: true, username: normalized };
}

/** Convert arbitrary text into a safe username base slug (max 20 chars). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

/** Generate a random 4-char alphanumeric suffix. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, "0");
}

/**
 * Check if a (lowercased) username is already taken in the DB.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: userProfilesTable.userId })
    .from(userProfilesTable)
    .where(eq(sql`lower(${userProfilesTable.username})`, username))
    .limit(1);
  return !!row;
}

/**
 * Generate a unique username for a new user based on a display-name seed.
 * Always lowercase. Retries up to 10 times on collision, then falls back
 * to a timestamp suffix.
 */
export async function generateUniqueUsername(
  seed: string | null | undefined,
): Promise<string> {
  const base = slugify(seed ?? "") || "traveler";

  for (let i = 0; i < 10; i++) {
    const candidate = `${base}_${randomSuffix()}`;
    if (!(await isUsernameTaken(candidate))) return candidate;
  }

  // Near-impossible fallback: base + last 5 chars of timestamp in base-36
  return `${base}_${Date.now().toString(36).slice(-5)}`;
}
