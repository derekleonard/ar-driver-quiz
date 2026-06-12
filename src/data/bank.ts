import type { Question } from "../types";

const modules = import.meta.glob<{ default: Question[] }>("./questions/*.json", {
  eager: true,
});

export const BANK: Question[] = Object.values(modules)
  .flatMap((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

export const BANK_IDS = BANK.map((q) => q.id);

export function byId(id: string): Question | undefined {
  return BANK.find((q) => q.id === id);
}
