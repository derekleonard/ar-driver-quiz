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

export async function loadAttempts(uid: string): Promise<Attempt[]> {
  const q = query(
    collection(db!, "users", uid, "attempts"),
    orderBy("startedAt", "asc"),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Attempt);
}

export async function addAttemptDoc(uid: string, attempt: Attempt): Promise<void> {
  await addDoc(collection(db!, "users", uid, "attempts"), attempt);
}

export async function updateSummary(
  uid: string,
  summary: {
    readiness: number;
    topicMastery: Record<string, number>;
    lastExam?: { score: number; total: number; passed: boolean; at: number };
  },
): Promise<void> {
  await setDoc(
    doc(db!, "users", uid),
    { summary, lastActive: serverTimestamp() },
    { merge: true },
  );
}
