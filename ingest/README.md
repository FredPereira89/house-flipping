# Ingest Service

The ingest service handles fetching parsed listings, evaluating them, and storing them in the Postgres database.

## Environment Variables
* `DATABASE_URL` (Required): The Postgres connection string (e.g. `postgresql://user:pass@localhost:5432/houseflip`)
* `INGEST_SHARED_SECRET` (Required): The shared secret for authenticating POST requests to `/ingest/listings`.
* `HEALTHCHECK_PING_URL` (Optional): A URL to ping on successful ingestion for dead-man switch monitoring.

## Local Run
To run the server locally:
```powershell
$env:DATABASE_URL="postgresql://user:pass@localhost:5432/houseflip"
$env:INGEST_SHARED_SECRET="dev-secret"
waitress-serve --port=5000 --call ingest.app:create_app
```
