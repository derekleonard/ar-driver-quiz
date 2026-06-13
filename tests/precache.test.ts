import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// The installed PWA must work fully offline: a cold launch with no network
// has to serve the app shell, the question bank, and every referenced sign
// image straight from the service-worker precache. An un-precached asset is
// a silently broken offline experience, so assert the generated manifest
// covers exactly what the app references. This guards the workbox globPatterns
// in vite.config.ts against future regressions (e.g. adding a .png sign or a
// lazy-loaded chunk that the glob doesn't catch).

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const swPath = join(dist, "sw.js");
const questionsDir = join(root, "src", "data", "questions");

function buildIfNeeded() {
  // CI runs the build after the test suite, so produce dist here if absent.
  if (!existsSync(swPath)) {
    execSync("npx vite build", { cwd: root, stdio: "inherit" });
  }
}

/** URLs workbox precaches, pulled from the inline __WB_MANIFEST in sw.js. */
function precachedUrls(): Set<string> {
  const sw = readFileSync(swPath, "utf8");
  // Tolerate both the minified (url:"x") and pretty ("url": "x") manifest
  // shapes — the build emits either depending on minification settings.
  const urls = [...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  return new Set(urls);
}

/** Sign images the question bank references at runtime. */
function referencedImages(): Set<string> {
  const refs = new Set<string>();
  for (const f of readdirSync(questionsDir)) {
    if (!f.endsWith(".json")) continue;
    const qs = JSON.parse(readFileSync(join(questionsDir, f), "utf8")) as {
      image?: string;
    }[];
    for (const q of qs) if (q.image) refs.add(q.image);
  }
  return refs;
}

describe("PWA precache manifest", () => {
  beforeAll(() => buildIfNeeded(), 120_000);

  it("precaches the full app shell", () => {
    const pre = precachedUrls();
    expect(pre.has("index.html")).toBe(true);
    expect(pre.has("manifest.webmanifest")).toBe(true);
    expect(pre.has("registerSW.js")).toBe(true);
    // The single CSS bundle and the JS bundle (hashed names).
    expect([...pre].some((u) => /^assets\/.*\.js$/.test(u))).toBe(true);
    expect([...pre].some((u) => /^assets\/.*\.css$/.test(u))).toBe(true);
  });

  it("precaches every sign image the bank references", () => {
    const pre = precachedUrls();
    const refs = referencedImages();
    expect(refs.size).toBeGreaterThan(0);
    const missing = [...refs].filter((r) => !pre.has(r));
    expect(missing).toEqual([]);
  });

  it("embeds the question bank in a precached JS chunk", () => {
    // The bank is bundled via import.meta.glob(eager), so it must live inside
    // a precached chunk — otherwise offline launch has no questions.
    const sample = JSON.parse(
      readFileSync(join(questionsDir, "signs.json"), "utf8"),
    )[0].question as string;
    const jsFiles = readdirSync(join(dist, "assets")).filter((f) =>
      f.endsWith(".js"),
    );
    const embedded = jsFiles.some((f) =>
      readFileSync(join(dist, "assets", f), "utf8").includes(
        sample.slice(0, 24),
      ),
    );
    expect(embedded).toBe(true);
  });
});
