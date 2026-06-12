// Firestore security-rules tests. These need the emulator:
//   npm run test:rules
// They are skipped automatically in plain `npm test`.
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

  const ctx = (uid: string, email: string) =>
    env.authenticatedContext(uid, { email, email_verified: true }).firestore();

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

  it("nobody can write the allowlist", async () => {
    const db = ctx("dad", PARENT);
    await assertFails(db.doc("config/allowlist").set({ emails: [] }));
  });

  it("signed-in users can read the allowlist", async () => {
    const db = ctx("rando", STRANGER);
    await assertSucceeds(db.doc("config/allowlist").get());
  });
});
