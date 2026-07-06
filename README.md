# AR Driver Quiz

Mobile-first study app for the **Arkansas driver knowledge test** (25 questions, 80% to pass).
Question bank is derived from the official [Arkansas Driver License Study Guide](https://dps.arkansas.gov/wp-content/uploads/Arkansas-DL-Manual-English.pdf),
with explanations and citations on every question.

## Features

- **Topic drills** — instant feedback, worst-known questions first (Leitner spaced repetition)
- **Exam simulator** — 25 questions matching the real test's topic mix, graded at the end like the real thing
- **Readiness score** — bank mastery + recent exam results + weakest-topic floor

## Accounts & sync (Firebase)

Until `src/firebase/config.ts` is filled in, the app runs in **local mode**
(progress in the browser's localStorage). To enable Google sign-in, cross-device
sync, and the family allowlist:

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project (e.g. `ar-driver-quiz`). Analytics optional.
2. Build → **Authentication** → Get started → Sign-in method → enable **Google**.
3. Authentication → Settings → **Authorized domains** → add `derekleonard.github.io`.
4. Build → **Firestore Database** → Create database → production mode.
5. Firestore → **Rules** tab → paste the contents of `firestore.rules` → Publish.
   (CI can publish these automatically on merge to `main` — see "Deploying
   firestore.rules" below.)
6. Firestore → Data → Start collection: id `config`, doc id `allowlist`, fields:
   - `emails` (array of strings): every family Google email, parent included
   - `parentEmail` (string): the parent's email
7. Project settings → General → Your apps → **Web app** (`</>`): register, copy the
   `firebaseConfig` object into `src/firebase/config.ts`, commit, push.

On each student's first sign-in, any existing localStorage progress is migrated
to their account automatically. Non-allowlisted Google accounts get a
permission-denied screen.

Rules tests (needs the Firebase CLI + Java for the emulator):

```sh
npm run test:rules
```

## Development

```sh
npm install
npm run dev          # local dev server
npm test             # vitest unit tests
npm run validate-bank  # lint the question bank JSON
npm run build        # type-check + production build
```

Deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`. Lint,
bank validation, unit tests, and the emulator-based `firestore.rules` job run on
every pull request as merge gates, and again on push to `main` before deploy.

Use Node 20 locally to match CI (`.nvmrc` + the `engines` field pin it).

The static **Privacy Policy** and **Terms of Use** are served at
`/privacy.html` and `/terms.html` (sources in `public/`, linked from the login
screen). Update them before any store distribution or expansion beyond the
family.

### Deploying firestore.rules

The `deploy-rules` job in the workflow publishes `firestore.rules` to production
on merge to `main`, so the live rules can't drift from the tested repo copy. It
is **inert until** a `FIREBASE_TOKEN` repository secret is set — without it the
job just prints the manual command and succeeds. To enable automated publishing,
generate a CI token (`npx firebase login:ci`) and add it as the `FIREBASE_TOKEN`
secret. To publish by hand instead:

```sh
npx firebase deploy --only firestore:rules --project ar-driver-quiz
```

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
  "image": "signs/stop.svg"
}
```

Sign images in `public/signs/` are original MUTCD-style SVG renderings.

> This is an unofficial study aid. The authoritative source is the official
> Arkansas Driver License Study Guide published by the Arkansas Department of
> Public Safety.
