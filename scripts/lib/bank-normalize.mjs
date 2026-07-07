// The single copy of the answer-placement algorithm, shared by
// scripts/normalize-bank.mjs (which rewrites the at-rest question bank) and
// scripts/export-parity-vectors.ts (which certifies the DriverPrepCore KMP
// port byte-for-byte). If these ever drift, the exporter keeps certifying a
// placement/hash the normalizer no longer produces and the Kotlin port passes
// parity against stale semantics with nothing failing — so there must be ONE
// implementation both import.

// FNV-1a (32-bit) — a stable, well-spread string hash so target positions
// don't cluster the way Math.random across a single seed might.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Moves the correct choice to a hash-derived position (correct answer ->
// hash(id) % n) while keeping distractor order; returns the new choices and
// answerIndex. Deterministic in the id, so re-running is idempotent.
export function placeCorrect(id, choices, answerIndex) {
  const n = choices.length;
  const correct = choices[answerIndex];
  const others = choices.filter((_, i) => i !== answerIndex);
  const target = fnv1a(id) % n;
  return {
    choices: [...others.slice(0, target), correct, ...others.slice(target)],
    answerIndex: target,
  };
}
