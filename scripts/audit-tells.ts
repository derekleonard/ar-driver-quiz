// Reports every "test-wiseness" tell in the question bank and fails (exit 1)
// if a guarded one breaches its threshold. Metric logic is shared with the CI
// guard in tests/bank-quality.test.ts via src/lib/tellAudit.ts.
// Run: npm run audit-tells  (uses vite-node, since this imports a .ts module)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Question } from "../src/types";
import { auditTells, passes } from "../src/lib/tellAudit";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "questions");
const bank: Question[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const results = auditTells(bank);
const pct = (x: number) => (x <= 1 ? (100 * x).toFixed(1) + "%" : String(x));

console.log(`Question bank tell audit — ${bank.length} questions (chance ≈ 25%)\n`);
let failed = 0;
for (const t of results.filter((r) => r.guarded)) {
  const ok = passes(t);
  if (!ok) failed++;
  console.log(
    `  [${ok ? "OK " : "BAD"}] ${t.name.padEnd(34)} ${pct(t.value).padStart(7)}  (need ${t.op} ${pct(t.threshold!)})`,
  );
}
console.log("  -- report only --");
for (const t of results.filter((r) => !r.guarded))
  console.log(`        ${t.name.padEnd(34)} ${pct(t.value).padStart(7)}`);

if (failed) {
  console.error(`\nTELL AUDIT FAILED: ${failed} guarded tell(s) over threshold.`);
  process.exit(1);
}
console.log("\nTell audit OK.");
