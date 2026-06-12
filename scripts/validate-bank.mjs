// Validates the question bank: unique ids, valid topics, answerIndex in
// range, referenced sign images exist. Run in CI before build.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionsDir = join(root, "src", "data", "questions");
const publicDir = join(root, "public");

const TOPICS = new Set([
  "signs-signals-markings",
  "right-of-way",
  "speed-following",
  "turning-parking",
  "adverse-conditions",
  "sharing-the-road",
  "alcohol-gdl",
  "license-admin",
]);

const errors = [];
const ids = new Set();
let count = 0;

for (const file of readdirSync(questionsDir).filter((f) => f.endsWith(".json"))) {
  const bank = JSON.parse(readFileSync(join(questionsDir, file), "utf8"));
  if (!Array.isArray(bank)) {
    errors.push(`${file}: not a JSON array`);
    continue;
  }
  for (const q of bank) {
    count++;
    const where = `${file}:${q.id ?? "?"}`;
    if (!q.id) errors.push(`${where}: missing id`);
    else if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    else ids.add(q.id);
    if (!TOPICS.has(q.topic)) errors.push(`${where}: bad topic '${q.topic}'`);
    if (!Array.isArray(q.choices) || q.choices.length < 3 || q.choices.length > 4)
      errors.push(`${where}: needs 3-4 choices`);
    if (
      !Number.isInteger(q.answerIndex) ||
      q.answerIndex < 0 ||
      q.answerIndex >= (q.choices?.length ?? 0)
    )
      errors.push(`${where}: answerIndex out of range`);
    if (!q.question) errors.push(`${where}: missing question`);
    if (!q.explanation) errors.push(`${where}: missing explanation`);
    if (!q.citation) errors.push(`${where}: missing citation`);
    if (![1, 2, 3].includes(q.difficulty)) errors.push(`${where}: bad difficulty`);
    if (q.image && !existsSync(join(publicDir, q.image)))
      errors.push(`${where}: image '${q.image}' not found in public/`);
    if (new Set(q.choices).size !== q.choices?.length)
      errors.push(`${where}: duplicate choices`);
  }
}

if (errors.length > 0) {
  console.error(`Question bank INVALID (${errors.length} problems):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`Question bank OK: ${count} questions, ${ids.size} unique ids.`);
