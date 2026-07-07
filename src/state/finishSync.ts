// Syncing a finished quiz to the cloud, extracted from the React provider so
// the offline/timeout fallback is plain async code that tests can drive.
//
// Why the timeout matters: a Firestore write promise NEVER settles while the
// device is offline (the mutation is queued in the persistent cache and only
// flushes on the next online launch). The provider used to `await
// addAttemptDoc(...)` directly, so offline it hung forever — saveSrsDoc /
// updateSummary never ran, the catch never fired, and the session's SRS/summary
// were silently trapped in React state (lost if the PWA closed before
// reconnecting). We bound the writes with the same withTimeout pattern
// bootstrap.ts uses; on timeout we take the localStorage fallback queue + show
// the banner. The queued cloud write still flushes later, but the login
// migration dedups attempts by startedAt, so that flush is harmless.
import { addAttemptDoc, saveSrsDoc, updateSummary } from "../firebase/store";
import { BANK_IDS } from "../data/bank";
import { summaryFor } from "../lib/summary";
import * as local from "../lib/storage";
import { withTimeout } from "../lib/withTimeout";
import type { Attempt, SrsState } from "../types";

export type SyncResult = { ok: true } | { ok: false; message: string };

/** Bound for the three cloud writes before we fall back to localStorage. */
export const FINISH_SYNC_TIMEOUT_MS = 8_000;

export async function syncFinishedQuiz(
  uid: string,
  srs: SrsState,
  attempt: Attempt,
  allAttempts: Attempt[],
  timeoutMs = FINISH_SYNC_TIMEOUT_MS,
): Promise<SyncResult> {
  try {
    await withTimeout(
      (async () => {
        await addAttemptDoc(uid, attempt);
        await saveSrsDoc(uid, srs);
        await updateSummary(uid, summaryFor(srs, allAttempts, BANK_IDS));
      })(),
      timeoutMs,
      "finish-sync",
    );
    return { ok: true };
  } catch {
    try {
      // Fallback queue: the login flow merges this back to the cloud.
      local.saveSrs(srs);
      local.saveAttempt(attempt);
      return {
        ok: false,
        message:
          "Couldn't sync to the cloud — this session is saved on this device and will sync next sign-in.",
      };
    } catch {
      return {
        ok: false,
        message:
          "Couldn't sync to the cloud or save on this device — this session may be lost.",
      };
    }
  }
}
