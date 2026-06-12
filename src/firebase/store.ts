import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Attempt, SrsState } from "../types";
import { db } from "./firebase";

export interface Allowlist {
  emails: string[];
  parentEmail: string;
}

export async function fetchAllowlist(): Promise<Allowlist> {
  const snap = await getDoc(doc(db!, "config", "allowlist"));
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
    doc(db!, "users", uid),
    { email, displayName, role, lastActive: serverTimestamp() },
    { merge: true },
  );
}

export async function loadSrsDoc(uid: string): Promise<SrsState | null> {
  const snap = await getDoc(doc(db!, "users", uid, "state", "srs"));
  return snap.exists() ? (snap.data().entries as SrsState) : null;
}

export async function saveSrsDoc(uid: string, entries: SrsState): Promise<void> {
  await setDoc(doc(db!, "users", uid, "state", "srs"), { entries });
}

export const ATTEMPTS_LOAD_LIMIT = 200;

export async function loadAttempts(uid: string): Promise<Attempt[]> {
  // desc + reverse keeps the NEWEST attempts when over the limit; asc+limit
  // would freeze streak/readiness on the oldest 200 forever.
  const q = query(
    collection(db!, "users", uid, "attempts"),
    orderBy("startedAt", "desc"),
    limit(ATTEMPTS_LOAD_LIMIT),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Attempt).reverse();
}

export async function addAttemptDoc(uid: string, attempt: Attempt): Promise<void> {
  await addDoc(collection(db!, "users", uid, "attempts"), attempt);
}

export interface UserSummary {
  readiness: number;
  streak: number;
  topicMastery: Record<string, number>;
  lastExam?: { score: number; total: number; passed: boolean; at: number };
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
    doc(db!, "users", uid),
    { summary, lastActive: serverTimestamp() },
    { merge: true },
  );
}

export async function fetchFamily(): Promise<FamilyUser[]> {
  const snap = await getDocs(collection(db!, "users"));
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
