import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { readinessScore, topicStatsFromAttempts } from "../lib/scoring";
import * as local from "../lib/storage";
import type { Attempt, SrsState } from "../types";

export type AppPhase = "loading" | "signed-out" | "denied" | "ready";

interface AppData {
  phase: AppPhase;
  mode: "local" | "cloud";
  userName: string | null;
  role: "parent" | "student";
  srs: SrsState;
  attempts: Attempt[];
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
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"parent" | "student">("student");
  const [srs, setSrs] = useState<SrsState>(() => (cloud ? {} : local.loadSrs()));
  const [attempts, setAttempts] = useState<Attempt[]>(() =>
    cloud ? [] : local.loadAttempts(),
  );

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
        const allowlist = await fetchAllowlist();
        const isParent = u.email === allowlist.parentEmail;
        setRole(isParent ? "parent" : "student");
        await ensureUserDoc(
          u.uid,
          u.email ?? "",
          u.displayName ?? "",
          isParent ? "parent" : "student",
        );

        let cloudSrs = await loadSrsDoc(u.uid);
        if (cloudSrs === null) {
          // First login on this account: migrate any pre-login local progress.
          const localSrs = local.loadSrs();
          cloudSrs = localSrs;
          if (Object.keys(localSrs).length > 0) {
            await saveSrsDoc(u.uid, localSrs);
            for (const a of local.loadAttempts()) await addAttemptDoc(u.uid, a);
          }
        }
        setSrs(cloudSrs);
        setAttempts(await loadCloudAttempts(u.uid));
        setUser(u);
        setPhase("ready");
      } catch (e: unknown) {
        const code = (e as { code?: string }).code ?? (e as Error).message;
        if (code === "permission-denied" || code === "allowlist-missing") {
          setUser(u);
          setPhase("denied");
        } else {
          throw e;
        }
      }
    });
  }, [cloud]);

  const finishQuiz = useCallback(
    (newSrs: SrsState, attempt: Attempt) => {
      setSrs(newSrs);
      setAttempts((prev) => {
        const all = [...prev, attempt];
        if (cloud && user) {
          void saveSrsDoc(user.uid, newSrs);
          void addAttemptDoc(user.uid, attempt);
          void updateSummary(user.uid, summaryFor(newSrs, all));
        } else {
          local.saveSrs(newSrs);
          local.saveAttempt(attempt);
        }
        return all;
      });
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
        role,
        srs,
        attempts,
        finishQuiz,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
