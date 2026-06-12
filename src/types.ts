export const TOPICS = [
  "signs-signals-markings",
  "right-of-way",
  "speed-following",
  "turning-parking",
  "adverse-conditions",
  "sharing-the-road",
  "alcohol-gdl",
  "license-admin",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  "signs-signals-markings": "Signs, Signals & Markings",
  "right-of-way": "Right-of-Way",
  "speed-following": "Speed & Following Distance",
  "turning-parking": "Turning & Parking",
  "adverse-conditions": "Adverse Conditions",
  "sharing-the-road": "Sharing the Road",
  "alcohol-gdl": "Alcohol & Teen (GDL) Laws",
  "license-admin": "License Rules",
};

export interface Question {
  id: string;
  topic: Topic;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  citation: string;
  image?: string;
  difficulty: 1 | 2 | 3;
}

export interface SrsEntry {
  box: number; // 1..5
  due: number; // epoch ms
  seen: number;
  correct: number;
}

export type SrsState = Record<string, SrsEntry>;

export type QuizMode = "drill" | "exam" | "diagnostic";

export interface Attempt {
  mode: QuizMode;
  topic?: Topic;
  score: number;
  total: number;
  passed?: boolean;
  startedAt: number;
  durationSec: number;
  perTopic: Partial<Record<Topic, { correct: number; total: number }>>;
  missedIds: string[];
}
