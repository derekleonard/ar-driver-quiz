// The one canonical mulberry32 seeded PRNG used by the parity exporter and the
// deterministic tests. It previously lived in three textually-different but
// bit-identical copies (the exporter, shuffle.test, examBuilder.test) — one
// careless edit away from silently diverging the golden vectors from what the
// tests assert. Keep exactly one implementation so a change is impossible to
// make in only one place.
//
// Reproduce EXACTLY in Kotlin (Int math; treat state as unsigned):
//   var a = seed
//   fun rawNext(): Int {
//     a += 0x6D2B79F5
//     var t = (a xor (a ushr 15)) * (1 or a)
//     t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
//     return (t xor (t ushr 14))            // compare as (toLong() and 0xFFFFFFFFL)
//   }
//   fun rand(): Double = (rawNext().toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0

/** Raw uint32 stream — the PRNG state the Kotlin port validates first. */
export function mulberry32Raw(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Doubles in [0, 1): the raw stream divided by 2^32. */
export function mulberry32(seed: number): () => number {
  const raw = mulberry32Raw(seed);
  return () => raw() / 4294967296;
}
