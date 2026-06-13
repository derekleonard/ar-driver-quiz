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
import { addAttemptDoc, saveSrsDoc, updateSummary } from "../firebase/store";
import { BANK_IDS } from "../data/bank";
import { summaryFor } from "../lib/summary";
import * as local from "../lib/storage";
import { bootstrapCloudUser } from "./bootstrap";
import type { Attempt, SrsState } from "../types";

export type AppPhase = "loading" | "signed-out" | "denied" | "error" | "ready";

interface AppData {
  phase: AppPhase;
  mode: "local" | "cloud";
  userName: string | null;
  deniedReason: string | null;
  errorReason: string | null;
  role: "parent" | "student";
  srs: SrsState;
  attempts: Attempt[];
  syncError: string | null;
  finishQuiz: (srs: SrsState, attempt: Attempt) => void;
  retry: () => void;
  signOut: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const data = useContext(Ctx);
  if (!data) throw new Error("useAppData outside provider");
  return data;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const cloud = isFirebaseConfigured;
  const [phase, setPhase] = useState<AppPhase>(cloud ? "loading" : "ready");
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
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

  const runBootstrap = useCallback(async (u: User) => {
    setPhase("loading");
    const result = await bootstrapCloudUser(u);
    if (result.kind === "denied") {
      setDeniedReason(result.reason);
      setPhase("denied");
    } else if (result.kind === "error") {
      setErrorReason(result.reason);
      setPhase("error");
    } else {
      setRole(result.role);
      setSrs(result.srs);
      attemptsRef.current = result.attempts;
      setAttempts(result.attempts);
      setPhase("ready");
    }
  }, []);

  useEffect(() => {
    if (!cloud || !auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setPhase("signed-out");
        return;
      }
      void runBootstrap(u);
    });
  }, [cloud, runBootstrap]);

  const retry = useCallback(() => {
    if (user) void runBootstrap(user);
  }, [user, runBootstrap]);

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
            await updateSummary(uid, summaryFor(newSrs, all, BANK_IDS));
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
        errorReason,
        role,
        srs,
        attempts,
        syncError,
        finishQuiz,
        retry,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
