import { randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, mapSharesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { publicShareRouter } from "../routes/shares";

const id = randomBytes(24).toString("base64url");
const app = express().use(publicShareRouter);

describe("public share social preview", () => {
  beforeAll(async () => {
    await db.insert(mapSharesTable).values({
      id,
      ownerUserId: null,
      snapshot: { vc: ["FR", "US"], vs: [], vp: [], bc: ["JP"], bs: [], bp: [] },
      visitedCount: 2,
      bucketCount: 1,
    });
  });

  afterAll(async () => {
    await db.delete(mapSharesTable).where(eq(mapSharesTable.id, id));
  });

  it("advertises the raster preview with matching metadata", async () => {
    const response = await request(app).get(`/s/${id}`).set("Host", "example.test");
    expect(response.status).toBe(200);
    expect(response.text).toContain(`content="http://example.test/s/${id}/preview.png"`);
    expect(response.text).toContain('property="og:image:type" content="image/png"');
    expect(response.text).toContain('property="og:site_name" content="World Map"');
    expect(response.text).toContain('name="twitter:image:alt" content="Travel map preview showing 2 visited places"');
    expect(response.text).toContain('property="og:image:alt" content="Travel map preview showing 2 visited places"');
    expect(response.text).not.toContain("preview.svg");
  });

  it("serves a 1200×630 PNG for a share", async () => {
    const response = await request(app).get(`/s/${id}/preview.png`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^image\/png/);
    expect(response.headers["cache-control"]).toContain("immutable");
    const image = await sharp(response.body as Buffer).metadata();
    expect(image).toMatchObject({ format: "png", width: 1200, height: 630 });
  });

  it("returns 404 for unknown and invalid preview IDs", async () => {
    expect((await request(app).get("/s/invalid/preview.png")).status).toBe(404);
    expect((await request(app).get(`/s/${"a".repeat(32)}/preview.png`)).status).toBe(404);
  });
});