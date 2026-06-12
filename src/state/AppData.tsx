import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { isFirebaseConfigured } from "../firebase/config";
import { auth, signOutUser } from "../firebase/firebase";
import {
  addAttemptDoc,
  ensureUserDoc,
  fetchAllowlist,
  loadAttempts as loadCloudAttempts,
  loadSrsDoc,
  saveSrsDoc,
  updateSummary,
} from "../firebase/store";
import { BANK_IDS } from "../data/bank";
import { mergeSrs } from "../lib/leitner";
import { readinessScore, topicStatsFromAttempts } from "../lib/scoring";
import { studyStreak } from "../lib/streak";
import * as local from "../lib/storage";
import type { Attempt, SrsState } from "../types";

export type AppPhase = "loading" | "signed-out" | "denied" | "ready";

interface AppData {
  phase: AppPhase;
  mode: "local" | "cloud";
  userName: string | null;
  deniedReason: string | null;
  role: "parent" | "student";
  srs: SrsState;
  attempts: Attempt[];
  syncError: string | null;
  finishQuiz: (srs: SrsState, attempt: Attempt) => void;
  signOut: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const data = useContext(Ctx);
  if (!data) throw new Error("useAppData outside provider");
  return data;
}

function summaryFor(srs: SrsState, attempts: Attempt[]) {
  const stats = topicStatsFromAttempts(attempts);
  const topicMastery: Record<string, number> = {};
  for (const [topic, s] of Object.entries(stats)) {
    if (s.total > 0) topicMastery[topic] = Math.round((100 * s.correct) / s.total);
  }
  const exams = attempts.filter((a) => a.mode === "exam");
  const last = exams[exams.length - 1];
  return {
    readiness: readinessScore(srs, BANK_IDS, attempts),
    streak: studyStreak(attempts, Date.now()),
    topicMastery,
    ...(last && {
      lastExam: {
        score: last.score,
        total: last.total,
        passed: !!last.passed,
        at: last.startedAt,
      },
    }),
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const cloud = isFirebaseConfigured;
  const [phase, setPhase] = useState<AppPhase>(cloud ? "loading" : "ready");
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"parent" | "student">("student");
  const [srs, setSrs] = useState<SrsState>(() => (cloud ? {} : local.loadSrs()));
  const [attempts, setAttempts] = useState<Attempt[]>(() =>
    cloud ? [] : local.loadAttempts(),
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  // Mirror of `attempts` so finishQuiz can append without doing side effects
  // inside a state updater (StrictMode double-invokes updaters).
  const attemptsRef = useRef(attempts);

  useEffect(() => {
    if (!cloud || !auth) return;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setPhase("signed-out");
        return;
      }
      setPhase("loading");
      try {
        let allowlist;
        try {
          allowlist = await fetchAllowlist();
        } catch (e: unknown) {
          const code = (e as { code?: string }).code ?? (e as Error).message;
          setDeniedReason(
            code === "allowlist-missing"
              ? "Setup problem: the Firestore doc config/allowlist was not found. Check the collection is named exactly 'config' and the document 'allowlist'."
              : code === "permission-denied"
                ? "Setup problem: reading config/allowlist was denied even though you are signed in — the security rules from firestore.rules are probably not published yet."
                : `Unexpected error reading allowlist: ${code}`,
          );
          setUser(u);
          setPhase("denied");
          return;
        }
        if (!allowlist.emails?.includes(u.email ?? "")) {
          setDeniedReason(
            `You are signed in as ${u.email}, which is not in the allowlist's 'emails' array (${allowlist.emails?.length ?? 0} entries). Emails must match exactly, lowercase.`,
          );
          setUser(u);
          setPhase("denied");
          return;
        }
        const isParent = u.email === allowlist.parentEmail;
        setRole(isParent ? "parent" : "student");
        await ensureUserDoc(
          u.uid,
          u.email ?? "",
          u.displayName ?? "",
          isParent ? "parent" : "student",
        );

        let cloudSrs = (await loadSrsDoc(u.uid)) ?? {};
        let cloudAttempts = await loadCloudAttempts(u.uid);

        // Merge any local progress into the cloud (first login, offline
        // fallback queue, or a previously interrupted migration). Attempts
        // go up first so a partial failure retries on the next login;
        // localStorage is cleared only after everything succeeded.
        const localSrs = local.loadSrs();
        const localAttempts = local.loadAttempts();
        if (Object.keys(localSrs).length > 0 || localAttempts.length > 0) {
          const known = new Set(cloudAttempts.map((a) => a.startedAt));
          const fresh = localAttempts.filter((a) => !known.has(a.startedAt));
          for (const a of fresh) await addAttemptDoc(u.uid, a);
          cloudSrs = mergeSrs(cloudSrs, localSrs);
          await saveSrsDoc(u.uid, cloudSrs);
          local.clearAll();
          cloudAttempts = [...cloudAttempts, ...fresh].sort(
            (x, y) => x.startedAt - y.startedAt,
          );
        }

        setSrs(cloudSrs);
        attemptsRef.current = cloudAttempts;
        setAttempts(cloudAttempts);
        setUser(u);
        setPhase("ready");
      } catch (e: unknown) {
        const code = (e as { code?: string }).code ?? (e as Error).message;
        setDeniedReason(
          code === "permission-denied"
            ? `You are in the allowlist, but writing your user document was still denied (signed in as ${u.email}). Check that the published rules match firestore.rules.`
            : `Couldn't load your data (${code}). Check your connection, then sign out and back in.`,
        );
        setUser(u);
        setPhase("denied");
      }
    });
  }, [cloud]);

  const finishQuiz = useCallback(
    (newSrs: SrsState, attempt: Attempt) => {
      const all = [...attemptsRef.current, attempt];
      attemptsRef.current = all;
      setSrs(newSrs);
      setAttempts(all);
      if (cloud && user) {
        const uid = user.uid;
        void (async () => {
          try {
            await addAttemptDoc(uid, attempt);
            await saveSrsDoc(uid, newSrs);
            await updateSummary(uid, summaryFor(newSrs, all));
            setSyncError(null);
          } catch {
            try {
              // Fallback queue: the login flow merges this back to the cloud.
              local.saveSrs(newSrs);
              local.saveAttempt(attempt);
              setSyncError(
                "Couldn't sync to the cloud — this session is saved on this device and will sync next sign-in.",
              );
            } catch {
              setSyncError(
                "Couldn't sync to the cloud or save on this device — this session may be lost.",
              );
            }
          }
        })();
      } else {
        try {
          local.saveSrs(newSrs);
          local.saveAttempt(attempt);
        } catch {
          setSyncError("Couldn't save progress on this device (storage full?).");
        }
      }
    },
    [cloud, user],
  );

  const signOut = useCallback(() => {
    void signOutUser();
  }, []);

  return (
    <Ctx.Provider
      value={{
        phase,
        mode: cloud ? "cloud" : "local",
        userName: user?.displayName ?? null,
        deniedReason,
        role,
        srs,
        attempts,
        syncError,
        finishQuiz,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
