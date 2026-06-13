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
import type { UserSummary } from "../lib/summary";
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
  return snap.data() as Allowlist;
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
  return snap.exists() ? ((snap.data().entries ?? {}) as SrsState) : null;
}

export async function saveSrsDoc(uid: string, entries: SrsState): Promise<void> {
  // Merge-write inside a transaction. A blind setDoc is last-writer-wins
  // across tabs/devices: whichever closed last would silently discard the
  // other's progress. mergeSrs keeps the most-progressed entry per id.
  const dbi = requireDb();
  const ref = doc(dbi, "users", uid, "state", "srs");
  await runTransaction(dbi, async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists() ? ((snap.data().entries ?? {}) as SrsState) : {};
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
  return snap.docs.map((d) => d.data() as Attempt).reverse();
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
  await setDoc(
    doc(requireDb(), "users", uid),
    { summary, lastActive: serverTimestamp() },
    { merge: true },
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
      summary: data.summary,
    };
  });
}
