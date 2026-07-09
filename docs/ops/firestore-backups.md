# Runbook: Firestore scheduled backups

**Status:** requires Google Cloud Console / gcloud action (no code change).
**Why deferred from the code PR:** enabling managed backups mutates a cloud
resource (blocked by the repo's cloud-mutation guardrail) and is a one-time
project setup, not app code.

## What this protects
The only durable copy of each child's identified quiz record (attempts, SRS
state, summary) lives in Cloud Firestore. There is currently **no backup**, so
an accidental delete, a bad `firestore.rules` publish, or a console mishap is
unrecoverable. Firestore's native **scheduled backups** give point-in-time
recovery with zero app code.

## Prerequisite: billing (discovered 2026-07-08)
`gcloud firestore backups schedules create` fails on this project with
`PERMISSION_DENIED` / `BILLING_DISABLED` — the project is on the free **Spark**
plan. Enabling backup schedules requires linking a billing account (**Blaze**
plan). **Status: pending Derek's billing decision.**

## Enable daily scheduled backups (gcloud)
```sh
# Daily backups, retained 7 days (native backup schedule; default database).
gcloud firestore backups schedules create \
  --project=ar-driver-quiz \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d

# Verify
gcloud firestore backups schedules list \
  --project=ar-driver-quiz --database='(default)'
```
(Weekly schedules are also supported: `--recurrence=weekly
--day-of-week=SUN --retention=14w`. This dataset is tiny, so daily/7d is cheap.)

## Restore (disaster recovery)
Backups restore into a **new** database (they never overwrite in place):
```sh
gcloud firestore backups list --project=ar-driver-quiz --location=nam5
gcloud firestore databases restore \
  --project=ar-driver-quiz \
  --source-backup=projects/ar-driver-quiz/locations/nam5/backups/BACKUP_ID \
  --destination-database=restored-YYYYMMDD
```
Then validate the restored database and, if adopting it, repoint the app's
`databaseId` (or migrate the docs back into `(default)`).

## Verify
- `gcloud firestore backups schedules list …` shows the schedule.
- After the first daily run, `gcloud firestore backups list …` shows a backup.

## Notes
- Native backups are storage-billed only; for this small dataset the cost is
  negligible.
- Alternative (heavier): a scheduled `gcloud firestore export` to a GCS bucket
  via Cloud Scheduler — only worth it if a portable, queryable dump is needed.
