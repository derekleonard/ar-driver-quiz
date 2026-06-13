// The cloud sign-in bootstrap, extracted from the React provider so the
// allowlist policy, denial diagnoses, and local->cloud migration are plain
// async code that tests can drive with a mocked store.
import {
  addAttemptDoc,
  ensureUserDoc,
  fetchAllowlist,
  loadAttempts as loadCloudAttempts,
  loadSrsDoc,
  saveSrsDoc,
  type Allowlist,
} from "../firebase/store";
import { mergeSrs } from "../lib/leitner";
import * as local from "../lib/storage";
import type { Attempt, SrsState } from "../types";

/** The slice of firebase.User the bootstrap needs (testable without auth). */
export interface BootstrapUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

export type BootstrapResult =
  /** Access/setup problem — retrying won't help until something changes. */
  | { kind: "denied"; reason: string }
  /** Offline/transient problem — show a retry button, data is intact. */
  | { kind: "error"; reason: string }
  | {
      kind: "ready";
      role: "parent" | "student";
      srs: SrsState;
      attempts: Attempt[];
    };

export interface BootstrapTimeouts {
  /** Reads must settle within this or we call it an outage. */
  readMs: number;
  /** How long to wait for the user-doc write before proceeding without it. */
  ensureWaitMs: number;
  /** Budget for the local->cloud migration writes. */
  migrateMs: number;
}

const DEFAULT_TIMEOUTS: BootstrapTimeouts = {
  readMs: 12_000,
  ensureWaitMs: 4_000,
  migrateMs: 12_000,
};

const denied = (reason: string): BootstrapResult => ({ kind: "denied", reason });
const error = (reason: string): BootstrapResult => ({ kind: "error", reason });

function errCode(e: unknown): string {
  return (e as { code?: string }).code ?? (e as Error)?.message ?? String(e);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout-${label}`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function bootstrapCloudUser(
  u: BootstrapUser,
  timeouts: BootstrapTimeouts = DEFAULT_TIMEOUTS,
): Promise<BootstrapResult> {
  let allowlist: Allowlist;
  try {
    allowlist = await withTimeout(fetchAllowlist(), timeouts.readMs, "allowlist");
  } catch (e: unknown) {
    const code = errCode(e);
    if (code === "allowlist-missing") {
      return denied(
        "Setup problem: the Firestore doc config/allowlist was not found. Check the collection is named exactly 'config' and the document 'allowlist'.",
      );
    }
    if (code === "permission-denied") {
      // The rules only let family members read the allowlist, so this is
      // the normal denial for strangers — but also what a missing rules
      // publish looks like. Name both.
      return denied(
        `You are signed in as ${u.email}. Either this account isn't on the family list, or the security rules from firestore.rules haven't been published yet.`,
      );
    }
    return error(
      `Couldn't reach the cloud to check your access (${code}). If you're offline, reconnect and retry.`,
    );
  }

  if (!allowlist.emails?.includes(u.email ?? "")) {
    return denied(
      `You are signed in as ${u.email}, which is not in the allowlist's 'emails' array (${allowlist.emails?.length ?? 0} entries). Emails must match exactly, lowercase.`,
    );
  }
  // Mirror of the rules' isAllowed(): an unverified email fails every
  // read/write server-side, which would otherwise look like a rules bug.
  if (!u.emailVerified) {
    return denied(
      `Your Google account's email (${u.email}) isn't verified, so the security rules reject all access. Verify the email with Google, then sign in again.`,
    );
  }

  const role: "parent" | "student" =
    u.email === allowlist.parentEmail ? "parent" : "student";

  try {
    // ensureUserDoc's setDoc never settles while offline (the write is just
    // queued), so don't let it block launch: give it a few seconds, then
    // proceed — a fast rejection (permission-denied) still fails loudly.
    const ensure = ensureUserDoc(u.uid, u.email ?? "", u.displayName ?? "", role);
    ensure.catch(() => {}); // a queued write may reject long after we move on
    await Promise.race([ensure, sleep(timeouts.ensureWaitMs)]);

    const cloudSrs =
      (await withTimeout(loadSrsDoc(u.uid), timeouts.readMs, "srs")) ?? {};
    const cloudAttempts = await withTimeout(
      loadCloudAttempts(u.uid),
      timeouts.readMs,
      "attempts",
    );

    // Merge any local progress into the cloud (first login, offline fallback
    // queue, or a previously interrupted migration). Attempts go up first so
    // a partial failure retries on the next login; localStorage is cleared
    // only after everything succeeded.
    const localSrs = local.loadSrs();
    const localAttempts = local.loadAttempts();
    let srs = cloudSrs;
    let attempts = cloudAttempts;
    if (Object.keys(localSrs).length > 0 || localAttempts.length > 0) {
      const known = new Set(cloudAttempts.map((a) => a.startedAt));
      const fresh = localAttempts.filter((a) => !known.has(a.startedAt));
      srs = mergeSrs(cloudSrs, localSrs);
      attempts = [...cloudAttempts, ...fresh].sort(
        (x, y) => x.startedAt - y.startedAt,
      );
      try {
        await withTimeout(
          (async () => {
            for (const a of fresh) await addAttemptDoc(u.uid, a);
            await saveSrsDoc(u.uid, srs);
          })(),
          timeouts.migrateMs,
          "migrate",
        );
        local.clearAll();
      } catch (e: unknown) {
        if (errCode(e) === "permission-denied") throw e;
        // Transient/offline: serve the merged view now, keep localStorage
        // so the next sign-in retries the upload.
      }
    }

    return { kind: "ready", role, srs, attempts };
  } catch (e: unknown) {
    const code = errCode(e);
    if (code === "permission-denied") {
      return denied(
        `You are on the family list, but accessing your user data was still denied (signed in as ${u.email}). Check that the published rules match firestore.rules.`,
      );
    }
    return error(
      `Couldn't load your data (${code}). If you're offline, reconnect and retry.`,
    );
  }
}
