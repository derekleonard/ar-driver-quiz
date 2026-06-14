import type { Question } from "../types";

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Return a copy of the question with its choices permuted and answerIndex
 * remapped to wherever the correct choice landed. Keeps position from being a
 * tell (the bank historically put the answer at index 1 ~80% of the time).
 */
export function shuffleChoices(
  q: Question,
  rand: () => number = Math.random,
): Question {
  const order = shuffle(
    q.choices.map((_, i) => i),
    rand,
  );
  return {
    ...q,
    choices: order.map((i) => q.choices[i]),
    answerIndex: order.indexOf(q.answerIndex),
  };
}
