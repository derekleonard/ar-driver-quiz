// Sequences overlapping async invocations so only the newest one's result is
// ever applied. It guards the cloud bootstrap: bootstrapCloudUser can be in
// flight for up to ~28s (read + ensure + migrate budgets), and
// onAuthStateChanged can fire again — sign-out, or a rapid A->B account switch
// on a shared family device — before it settles. Without this, a stale
// bootstrap resolving late clobbers the newer session's role/srs/attempts in
// context, and the next finishQuiz writes one kid's SRS into the other's cloud
// doc (mergeSrs makes that cross-account contamination permanent).
//
// Usage: call begin() when work starts to get a token; after it resolves,
// apply the result only if isCurrent(token). Call cancel() to supersede an
// in-flight invocation without starting a new one (e.g. on sign-out).
export interface LatestGuard {
  /** Begin a new invocation, superseding any in-flight one. Returns its token. */
  begin(): number;
  /** True only while `token` is still the newest begun (not yet superseded). */
  isCurrent(token: number): boolean;
  /** Supersede any in-flight invocation without beginning a new one. */
  cancel(): void;
}

export function createLatestGuard(): LatestGuard {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (token: number) => token === latest,
    cancel: () => void ++latest,
  };
}
