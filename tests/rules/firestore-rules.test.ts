// Firestore security-rules tests. These need the emulator:
//   npm run test:rules
// They are skipped automatically in plain `npm test`. CI runs them in the
// dedicated `rules` job (see .github/workflows/deploy.yml).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!hasEmulator)("firestore.rules", () => {
  let env: RulesTestEnvironment;

  const PARENT = "dad@example.com";
  const KID_A = "kida@example.com";
  const KID_B = "kidb@example.com";
  const STRANGER = "rando@example.com";

  const ctx = (uid: string, email: string, verified = true) =>
    env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

  const VALID_SUMMARY = {
    readiness: 72,
    streak: 3,
    topicMastery: { "right-of-way": 80 },
    lastExam: { score: 21, total: 25, passed: true, at: 1234 },
  };

  const VALID_ATTEMPT = {
    mode: "drill",
    score: 8,
    total: 10,
    startedAt: 1700000000000,
    durationSec: 120,
    perTopic: { "right-of-way": { correct: 8, total: 10 } },
    missedIds: ["q1", "q2"],
  };

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "ar-driver-quiz-test",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
    await env.withSecurityRulesDisabled(async (c) => {
      await c
        .firestore()
        .doc("config/allowlist")
        .set({ emails: [PARENT, KID_A, KID_B], parentEmail: PARENT });
      await c.firestore().doc("users/kidA/state/srs").set({ entries: {} });
      await c.firestore().doc("users/kidA/attempts/a1").set({ startedAt: 1 });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allowlisted student reads and writes their own docs", async () => {
    const db = ctx("kidA", KID_A);
    await assertSucceeds(db.doc("users/kidA").set({ email: KID_A }));
    await assertSucceeds(db.doc("users/kidA/state/srs").get());
    await assertSucceeds(db.doc("users/kidA/state/srs").set({ entries: {} }));
  });

  it("a student cannot read a sibling's docs", async () => {
    const db = ctx("kidB", KID_B);
    await assertFails(db.doc("users/kidA/state/srs").get());
    await assertFails(db.doc("users/kidA").get());
  });

  it("the parent can read every student's docs but not write them", async () => {
    const db = ctx("dad", PARENT);
    await assertSucceeds(db.doc("users/kidA/state/srs").get());
    await assertSucceeds(db.doc("users/kidA").get());
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: {} }));
  });

  it("a non-allowlisted Google user is denied everything", async () => {
    const db = ctx("rando", STRANGER);
    await assertFails(db.doc("users/rando").set({ email: STRANGER }));
    await assertFails(db.doc("users/kidA").get());
  });

  it("an unauthenticated client is denied everything", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.doc("config/allowlist").get());
    await assertFails(db.doc("users/kidA").get());
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: {} }));
  });

  it("an unverified email is denied even when allowlisted", async () => {
    const db = ctx("kidA", KID_A, false);
    await assertFails(db.doc("users/kidA").set({ email: KID_A }));
    await assertFails(db.doc("users/kidA/state/srs").get());
  });

  it("an unverified parent email gets no dashboard access (isParent checks it too)", async () => {
    const db = ctx("dad", PARENT, false);
    await assertFails(db.doc("users/kidA").get());
    await assertFails(db.doc("users/kidA/state/srs").get());
  });

  it("nobody can write the allowlist", async () => {
    const db = ctx("dad", PARENT);
    await assertFails(db.doc("config/allowlist").set({ emails: [] }));
  });

  it("only family members can read the allowlist", async () => {
    await assertSucceeds(ctx("kidA", KID_A).doc("config/allowlist").get());
    await assertSucceeds(ctx("dad", PARENT).doc("config/allowlist").get());
    await assertFails(ctx("rando", STRANGER).doc("config/allowlist").get());
  });

  it("a student cannot self-promote to role parent (or forge an email)", async () => {
    const db = ctx("kidA", KID_A);
    await assertFails(db.doc("users/kidA").set({ email: KID_A, role: "parent" }));
    await assertFails(db.doc("users/kidA").set({ email: PARENT }));
    await assertSucceeds(db.doc("users/kidA").set({ email: KID_A, role: "student" }));
  });

  it("the parent's own doc gets role parent", async () => {
    const db = ctx("dad", PARENT);
    await assertSucceeds(db.doc("users/dad").set({ email: PARENT, role: "parent" }));
    await assertFails(db.doc("users/dad").set({ email: PARENT, role: "student" }));
  });

  it("the summary must have the dashboard's shape", async () => {
    const db = ctx("kidA", KID_A);
    await assertSucceeds(db.doc("users/kidA").set({ summary: VALID_SUMMARY }));
    await assertFails(
      db.doc("users/kidA").set({ summary: { ...VALID_SUMMARY, readiness: "high" } }),
    );
    await assertFails(
      db.doc("users/kidA").set({ summary: { ...VALID_SUMMARY, readiness: 9999 } }),
    );
    await assertFails(
      db.doc("users/kidA").set({ summary: { ...VALID_SUMMARY, injected: true } }),
    );
    await assertFails(db.doc("users/kidA").set({ summary: 42 }));
  });

  it("unknown top-level user-doc fields are rejected", async () => {
    const db = ctx("kidA", KID_A);
    await assertFails(db.doc("users/kidA").set({ email: KID_A, isAdmin: true }));
  });

  it("attempts subcollection: owner writes, parent reads, others denied", async () => {
    await assertSucceeds(
      ctx("kidA", KID_A).collection("users/kidA/attempts").add(VALID_ATTEMPT),
    );
    await assertSucceeds(ctx("dad", PARENT).doc("users/kidA/attempts/a1").get());
    await assertFails(ctx("kidB", KID_B).doc("users/kidA/attempts/a1").get());
    await assertFails(
      ctx("rando", STRANGER).collection("users/kidA/attempts").add(VALID_ATTEMPT),
    );
  });

  it("an attempt with the wrong shape is rejected", async () => {
    const db = ctx("kidA", KID_A);
    // Missing required fields (the shape isAttempt also checks client-side).
    await assertFails(db.collection("users/kidA/attempts").add({ startedAt: 2 }));
    // Right keys, wrong types.
    await assertFails(
      db.collection("users/kidA/attempts").add({ ...VALID_ATTEMPT, score: "lots" }),
    );
    await assertFails(
      db.collection("users/kidA/attempts").add({ ...VALID_ATTEMPT, missedIds: "q1" }),
    );
  });

  it("an oversized attempt is rejected (quota/cost abuse)", async () => {
    const db = ctx("kidA", KID_A);
    // ~60 KB of junk pushes the doc past the 50 KB bound in validAttempt.
    const huge = "x".repeat(60000);
    await assertFails(
      db.collection("users/kidA/attempts").add({ ...VALID_ATTEMPT, junk: huge }),
    );
  });

  it("a state doc with the wrong shape is rejected", async () => {
    const db = ctx("kidA", KID_A);
    // Missing `entries`.
    await assertFails(db.doc("users/kidA/state/srs").set({ nope: 1 }));
    // `entries` present but not a map.
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: 5 }));
    // Extra top-level keys.
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: {}, extra: 1 }));
  });

  it("an oversized state doc is rejected (quota/cost abuse)", async () => {
    const db = ctx("kidA", KID_A);
    const huge: Record<string, string> = {};
    // ~150 KB across many entries, past the 100 KB bound in validState.
    for (let i = 0; i < 1500; i++) huge["k" + i] = "x".repeat(100);
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: huge }));
  });

  it("a student cannot WRITE a sibling's subcollection docs", async () => {
    const db = ctx("kidB", KID_B);
    await assertFails(db.doc("users/kidA/state/srs").set({ entries: {} }));
    await assertFails(db.collection("users/kidA/attempts").add(VALID_ATTEMPT));
  });
});
