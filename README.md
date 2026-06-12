# AR Driver Quiz

Mobile-first study app for the **Arkansas driver knowledge test** (25 questions, 80% to pass).
Question bank is derived from the official [Arkansas Driver License Study Guide](https://dps.arkansas.gov/wp-content/uploads/Arkansas-DL-Manual-English.pdf),
with explanations and citations on every question.

## Features

- **Topic drills** — instant feedback, worst-known questions first (Leitner spaced repetition)
- **Exam simulator** — 25 questions matching the real test's topic mix, graded at the end like the real thing
- **Readiness score** — bank mastery + recent exam results + weakest-topic floor

## Development

```sh
npm install
npm run dev          # local dev server
npm test             # vitest unit tests
npm run validate-bank  # lint the question bank JSON
npm run build        # type-check + production build
```

Deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`.

## Question bank

One JSON file per topic in `src/data/questions/`. Schema:

```json
{
  "id": "signs-001",
  "topic": "signs-signals-markings",
  "question": "...",
  "choices": ["...", "...", "...", "..."],
  "answerIndex": 1,
  "explanation": "...",
  "citation": "AR Driver License Study Guide — ...",
  "image": "signs/stop.svg",
  "difficulty": 1
}
```

Sign images in `public/signs/` are original MUTCD-style SVG renderings.

> This is an unofficial study aid. The authoritative source is the official
> Arkansas Driver License Study Guide published by the Arkansas Department of
> Public Safety.
