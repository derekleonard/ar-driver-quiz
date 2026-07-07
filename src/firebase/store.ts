import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { mergeSrs } from "../lib/leitner";
import { isAttempt, isRecord, sanitizeSrs } from "../lib/storage";
import { isUserSummary, type UserSummary } from "../lib/summary";
import type { Attempt, SrsState } from "../types";
import { db } from "./firebase";

export type { UserSummary } from "../lib/summary";

/**
 * Every function in this module is cloud-only; AppData routes to lib/storage
 * in local mode. Make that invariant explicit: if the routing is ever broken,
 * fail with a named error instead of a cryptic null dereference.
 */
function requireDb(): Firestore {
  if (!db) {
    throw new Error("cloud-store-in-local-mode: Firestore is not configured");
  }
  return db;
}

export interface Allowlist {
  emails: string[];
  parentEmail: string;
}

export async function fetchAllowlist(): Promise<Allowlist> {
  const snap = await getDoc(doc(requireDb(), "config", "allowlist"));
  if (!snap.exists()) throw new Error("allowlist-missing");
  // Validate instead of blind-casting: a hand-edited doc (it's maintained in
  // the Firebase console) with a string `emails` or missing `parentEmail`
  // should fail with a named setup error, not a confusing denial downstream.
  const data: unknown = snap.data();
  if (
    !isRecord(data) ||
    !Array.isArray(data.emails) ||
    !data.emails.every((e) => typeof e === "string") ||
    typeof data.parentEmail !== "string"
  ) {
    throw new Error("allowlist-malformed");
  }
  return { emails: data.emails, parentEmail: data.parentEmail };
}

export async function ensureUserDoc(
  uid: string,
  email: string,
  displayName: string,
  role: "parent" | "student",
): Promise<void> {
  await setDoc(
    doc(requireDb(), "users", uid),
    { email, displayName, role, lastActive: serverTimestamp() },
    { merge: true },
  );
}

export async function loadSrsDoc(uid: string): Promise<SrsState | null> {
  const snap = await getDoc(doc(requireDb(), "users", uid, "state", "srs"));
  // sanitizeSrs (not a blind cast) drops malformed entries — including a
  // doc that exists but is missing `entries` entirely.
  return snap.exists() ? sanitizeSrs(snap.data().entries) : null;
}

export async function saveSrsDoc(uid: string, entries: SrsState): Promise<void> {
  // Merge-write inside a transaction. A blind setDoc is last-writer-wins
  // across tabs/devices: whichever closed last would silently discard the
  // other's progress. mergeSrs keeps the most-progressed entry per id.
  const dbi = requireDb();
  const ref = doc(dbi, "users", uid, "state", "srs");
  await runTransaction(dbi, async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists() ? sanitizeSrs(snap.data().entries) : {};
    tx.set(ref, { entries: mergeSrs(existing, entries) });
  });
}

export const ATTEMPTS_LOAD_LIMIT = 200;

export async function loadAttempts(uid: string): Promise<Attempt[]> {
  // desc + reverse keeps the NEWEST attempts when over the limit; asc+limit
  // would freeze streak/readiness on the oldest 200 forever.
  const q = query(
    collection(requireDb(), "users", uid, "attempts"),
    orderBy("startedAt", "desc"),
    limit(ATTEMPTS_LOAD_LIMIT),
  );
  const snap = await getDocs(q);
  // Keep only well-formed attempts: one malformed doc (e.g. written by an
  // old client version) must not poison streak/readiness/summary math.
  return snap.docs
    .map((d) => d.data())
    .filter(isAttempt)
    .reverse();
}

export async function addAttemptDoc(uid: string, attempt: Attempt): Promise<void> {
  await addDoc(collection(requireDb(), "users", uid, "attempts"), attempt);
}

export interface FamilyUser {
  uid: string;
  email: string;
  displayName: string;
  role: "parent" | "student";
  lastActive: number | null;
  summary?: UserSummary;
}

export async function updateSummary(
  uid: string,
  summary: UserSummary,
): Promise<void> {
  // mergeFields (NOT merge:true): a plain merge deep-merges map values, so a
  // topicMastery key present in the stored summary but absent from the freshly
  // computed one (a topic that fell out of the ATTEMPTS_LOAD_LIMIT window)
  // would persist forever and show a frozen historical mastery chip on the
  // parent dashboard as if current. Listing "summary" as a merge field
  // overwrites the whole summary map wholesale while still leaving the other
  // user-doc fields (email/displayName/role) untouched.
  await setDoc(
    doc(requireDb(), "users", uid),
    { summary, lastActive: serverTimestamp() },
    { mergeFields: ["summary", "lastActive"] },
  );
}

export async function fetchFamily(): Promise<FamilyUser[]> {
  const snap = await getDocs(collection(requireDb(), "users"));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName ?? data.email ?? d.id,
      role: data.role ?? "student",
      lastActive: data.lastActive?.toMillis?.() ?? null,
      // Validate the whole shape instead of blind-casting: a pre-shape-rule
      // legacy doc with wrong-typed fields is dropped rather than handed to the
      // dashboard, where numeric reads would silently render NaN/undefined.
      summary: isUserSummary(data.summary) ? data.summary : undefined,
    };
  });
}
