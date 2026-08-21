import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const distDirectory = path.resolve(import.meta.dirname, "../dist/public");
const assetsDirectory = path.join(distDirectory, "assets");
const panelMarkers = [
  "Search by username or display name",
  "No pending requests.",
];

test("production build keeps Connections in its own async chunk", async () => {
  const assetNames = await readdir(assetsDirectory);
  const scripts = await Promise.all(
    assetNames
      .filter((assetName) => assetName.endsWith(".js"))
      .map(async (assetName) => ({
        name: assetName,
        contents: await readFile(path.join(assetsDirectory, assetName), "utf8"),
      })),
  );

  const panelChunks = scripts.filter(({ contents }) =>
    panelMarkers.every((marker) => contents.includes(marker)),
  );

  assert.equal(
    panelChunks.length,
    1,
    `Expected exactly one async Connections panel chunk containing ${panelMarkers
      .map((marker) => JSON.stringify(marker))
      .join(" and ")}; found ${panelChunks.map(({ name }) => name).join(", ") || "none"}. ` +
      "A static import will fold the panel back into the initial map bundle.",
  );

  const indexHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");
  const entryMatch = indexHtml.match(
    /<script[^>]+src="\/assets\/([^"]+\.js)"/,
  );
  assert.ok(entryMatch, "Could not find the initial JavaScript entry in dist/public/index.html.");

  const entry = scripts.find(({ name }) => name === entryMatch[1]);
  assert.ok(entry, `Initial entry ${entryMatch[1]} is missing from dist/public/assets.`);

  const panelChunk = panelChunks[0];
  assert.notEqual(
    panelChunk.name,
    entry.name,
    "Connections panel code was emitted in the initial map bundle instead of an async chunk.",
  );
  assert.ok(
    entry.contents.includes(`import("./${panelChunk.name}")`),
    `Initial map bundle does not asynchronously import ${panelChunk.name}. ` +
      "Keep ConnectionsPanel behind React.lazy(() => import('./ConnectionsPanel')).",
  );
  for (const marker of panelMarkers) {
    assert.ok(
      !entry.contents.includes(marker),
      `Initial map bundle contains Connections panel UI (${JSON.stringify(marker)}). ` +
        "This means the panel is no longer deferred.",
    );
  }
});