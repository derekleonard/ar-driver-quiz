// Race a promise against a deadline. Firestore writes NEVER settle while the
// device is offline (the mutation is just queued in the persistent cache), so
// any code path that `await`s one would hang forever without this bound. On
// timeout the returned promise rejects; the underlying promise keeps running
// (its queued write flushes on the next online launch), so callers that also
// persist a local fallback must dedup that later flush.
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout-${label}`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
