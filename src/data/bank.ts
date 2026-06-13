import type { Question } from "../types";

const modules = import.meta.glob<{ default: Question[] }>("./questions/*.json", {
  eager: true,
});

export const BANK: Question[] = Object.values(modules)
  .flatMap((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

export const BANK_IDS = BANK.map((q) => q.id);
