# Runbook: restrict the Firebase Web API key

**Status:** requires Google Cloud Console action (no code change).
**Why deferred from the code PR:** the browser API key in `src/firebase/config.ts`
is public by design (Firestore access is gated by `firestore.rules`, which
require an allowlisted, email-verified account). The residual risk is not data
exposure but **denial-of-wallet**: an unrestricted key lets a third party burn
Identity Toolkit / Firestore quota against project `ar-driver-quiz`. Whether the
key already carries restrictions can only be verified/changed in the console.

## What to set

Restrict the browser key to (a) the site's HTTP referrers and (b) only the APIs
the web app actually calls.

### Console steps
1. Google Cloud Console → project **ar-driver-quiz** → **APIs & Services →
   Credentials**.
2. Open the **Browser key** (the `apiKey` value that starts `AIzaSyC6KN…`; it is
   the same string committed in `src/firebase/config.ts`).
3. **Application restrictions → HTTP referrers (web sites)**, add:
   - `https://derekleonard.github.io/*`
   - `http://localhost:*/*` and `http://127.0.0.1:*/*` (local `vite dev`, optional)
4. **API restrictions → Restrict key**, allow only:
   - **Identity Toolkit API** (Firebase Auth)
   - **Cloud Firestore API**
   - **Token Service API** (refresh tokens)
   - (add **Firebase Installations API** if the SDK logs installation errors)
5. **Save.** Propagation takes a few minutes.

### Equivalent gcloud (optional)
```sh
gcloud services api-keys list --project=ar-driver-quiz            # find the KEY_ID
gcloud services api-keys update KEY_ID --project=ar-driver-quiz \
  --allowed-referrers="https://derekleonard.github.io/*" \
  --api-target=service=identitytoolkit.googleapis.com \
  --api-target=service=firestore.googleapis.com \
  --api-target=service=sts.googleapis.com
```

## Verify
- Sign in on https://derekleonard.github.io/ar-driver-quiz — auth + Firestore
  still work.
- From an unlisted origin (e.g. `curl` with a foreign `Referer`), an
  Identity Toolkit call now returns `PERMISSION_DENIED` / `requests-from-referer
  … are blocked`.

## Notes
- Restricting the key does **not** rotate it and needs no redeploy; the same
  public key keeps working from the allowed referrers.
- If the app ever ships as a packaged mobile/desktop client (no HTTP referrer),
  revisit — referrer restrictions don't apply there.
