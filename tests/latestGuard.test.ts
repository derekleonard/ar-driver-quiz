import { describe, expect, it } from "vitest";
import { createLatestGuard } from "../src/state/latestGuard";

describe("createLatestGuard", () => {
  it("only the newest begun token is current", () => {
    const g = createLatestGuard();
    const a = g.begin();
    expect(g.isCurrent(a)).toBe(true);
    const b = g.begin();
    // starting b supersedes a
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);
  });

  it("cancel() supersedes an in-flight token without beginning a new one", () => {
    const g = createLatestGuard();
    const a = g.begin();
    g.cancel();
    expect(g.isCurrent(a)).toBe(false);
  });

  it("drops a stale result when a newer invocation resolves first (A->B switch)", async () => {
    // Model the real race: two overlapping bootstraps, the OLDER one (A)
    // settles AFTER the newer one (B). Only B's result may be applied.
    const g = createLatestGuard();
    const applied: string[] = [];

    const runBootstrap = async (name: string, delayMs: number) => {
      const token = g.begin();
      await new Promise((r) => setTimeout(r, delayMs));
      if (!g.isCurrent(token)) return;
      applied.push(name);
    };

    // A begins first but is slow; B begins second and resolves first.
    await Promise.all([runBootstrap("A", 20), runBootstrap("B", 5)]);

    expect(applied).toEqual(["B"]);
  });

  it("a sign-out mid-bootstrap drops the late resolve", async () => {
    const g = createLatestGuard();
    let applied = false;

    const bootstrap = (async () => {
      const token = g.begin();
      await new Promise((r) => setTimeout(r, 10));
      if (g.isCurrent(token)) applied = true;
    })();

    g.cancel(); // sign-out fires before the bootstrap resolves
    await bootstrap;

    expect(applied).toBe(false);
  });
});
