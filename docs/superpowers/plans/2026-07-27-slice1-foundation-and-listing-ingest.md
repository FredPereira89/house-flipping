# Slice 1, Plan 1: Data Foundation and Listing Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSV-backed Flask prototype with a Postgres-backed ingest service that parses portal HTML into normalized, evaluated, deduplicated leads — and migrate the 731 existing listings into it.

**Architecture:** Prisma (in `web/`) owns all schema and migrations; the Python ingest service talks to the same Postgres via psycopg and never runs DDL. HTML arrives by HTTP POST, is routed to a portal-specific parser, normalized, area-matched, disqualification-filtered, upserted on `(portal, external_id)`, then evaluated against area baselines. No browser automation and no web UI in this plan — those are Plans 2 and 3.

**Tech Stack:** PostgreSQL 18 (Docker), Prisma 6, Python 3.13, Flask 3, psycopg 3, BeautifulSoup 4, pytest.

**Spec:** `docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md`

## Global Constraints

- Python 3.13.1, Node 24.18.0, Docker Compose v5.3.1 — all already installed.
- Postgres 18 runs **in Docker**; the native `postgresql-x64-18` Windows service must be stopped and set to Manual (D6).
- **Prisma owns every DDL statement.** Python issues DML only. No SQLAlchemy, no Alembic, no `CREATE TABLE` from Python (D7).
- Every money column is `Decimal` / `numeric(12,2)` with an adjacent currency column defaulting to `'EUR'`.
- Every table has `created_at` and `updated_at`.
- Tenant-owned tables carry `org_id`. `areas` and `area_price_baselines` are **global reference data with no `org_id`** (D9).
- Only `metric_type = 'asking'` rows are ever written to `area_price_baselines` (D4).
- Thresholds live in the `settings` table, never as constants in code (build prompt §9).
- Ingest endpoints require a shared secret and log rejected requests (build prompt §6).
- All tests run offline against local fixtures. No test may make a network request.
- Existing top-level `debug*.py`, `test_*.py`, `scratch_*.py` files are exploratory scratch work — leave them untouched; this plan does not modify them.

---

## File Structure

```
docker-compose.yml                    Postgres service
db/init/01-extensions.sql             pg_trgm, unaccent
.env.example                          documented env vars

web/package.json                      Prisma host (no Next.js app yet — Plan 3)
web/prisma/schema.prisma              THE schema, single source of truth
web/prisma/migrations/                git-tracked migrations
web/prisma/seed.ts                    orgs, user, areas, settings, keywords

ingest/__init__.py
ingest/config.py                      env loading, typed settings
ingest/db.py                          psycopg connection pool
ingest/auth.py                        shared-secret decorator
ingest/normalize.py                   raw parser dict -> normalized lead
ingest/area_matcher.py                location string -> area_id via aliases
ingest/disqualify.py                  rented / no-licence keyword filter
ingest/evaluate.py                    price/m2, baseline lookup, discount
ingest/health.py                      dead-man's-switch ping
ingest/parsers/__init__.py            portal router
ingest/parsers/base.py                Parser protocol
ingest/parsers/idealista.py
ingest/parsers/imovirtual.py
ingest/parsers/olx.py
ingest/repositories/leads.py          upsert, price history
ingest/repositories/areas.py          alias lookup, baseline lookup
ingest/repositories/captures.py       capture_runs, alerts
ingest/app.py                         Flask factory + /ingest/listings

scripts/migrate_csv.py                731-row import

tests/conftest.py                     DB fixture, app fixture
tests/fixtures/idealista_search.html  real captured HTML
tests/fixtures/imovirtual_search.html
tests/fixtures/olx_search.html
tests/test_parsers_*.py
tests/test_area_matcher.py
tests/test_disqualify.py
tests/test_evaluate.py
tests/test_ingest_listings.py
tests/test_migrate_csv.py
```

**Boundaries:** parsers know only HTML→dicts. `normalize.py` knows only dicts→leads. Repositories know only SQL. `app.py` wires them and owns no logic. This is what makes each unit testable without a browser or a network.

---

### Task 1: Postgres in Docker with extensions

**Files:**
- Create: `docker-compose.yml`, `db/init/01-extensions.sql`, `.env.example`
- Test: `tests/test_db_connection.py`

**Interfaces:**
- Produces: a Postgres 18 instance on `localhost:5432`, database `houseflip`, user `houseflip`. Connection string in env var `DATABASE_URL`.

- [ ] **Step 1: Stop the conflicting native Postgres service**

Run in an **Administrator** PowerShell (UAC required):

```powershell
Stop-Service postgresql-x64-18
Set-Service postgresql-x64-18 -StartupType Manual
```

Verify it is stopped:

```powershell
Get-Service postgresql-x64-18 | Select-Object Status,StartType
```

Expected: `Stopped  Manual`

- [ ] **Step 2: Write the Compose file**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:18-alpine
    container_name: houseflip-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: houseflip
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-houseflip_dev}
      POSTGRES_DB: houseflip
    ports:
      - "5432:5432"
    volumes:
      - houseflip_pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U houseflip -d houseflip"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  houseflip_pgdata:
```

- [ ] **Step 3: Write the extensions init script**

`db/init/01-extensions.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

`unaccent` matters here: Portuguese area names carry diacritics ("Ruína", "São Vicente") and scraped text is inconsistent about them.

- [ ] **Step 4: Write `.env.example`**

```bash
# Postgres
POSTGRES_PASSWORD=houseflip_dev
DATABASE_URL=postgresql://houseflip:houseflip_dev@localhost:5432/houseflip

# Ingest service
INGEST_SHARED_SECRET=change-me-to-a-long-random-string
INGEST_PORT=5000

# Dead-man's-switch (external liveness monitoring, D12)
# Leave blank to disable. Get a URL from https://healthchecks.io (free tier).
HEALTHCHECK_PING_URL=
```

Note: the existing `.env` is gitignored and holds live credentials. Do not overwrite it — add the new keys to it by hand.

- [ ] **Step 5: Bring it up and verify extensions**

```bash
docker compose up -d db
docker compose exec db psql -U houseflip -d houseflip -c "\dx"
```

Expected: output lists `pg_trgm` and `unaccent`.

- [ ] **Step 6: Write the connection test**

`tests/test_db_connection.py`:

```python
import os
import psycopg
import pytest


def test_database_reachable_with_extensions():
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn) as conn:
        rows = conn.execute(
            "SELECT extname FROM pg_extension ORDER BY extname"
        ).fetchall()
    names = {r[0] for r in rows}
    assert "pg_trgm" in names
    assert "unaccent" in names
```

- [ ] **Step 7: Run it**

```bash
pytest tests/test_db_connection.py -v
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml db/init/01-extensions.sql .env.example tests/test_db_connection.py
git commit -m "feat: run Postgres 18 in Docker with pg_trgm and unaccent"
```

---

### Task 2: Prisma schema — tenancy, auth and reference data

**Files:**
- Create: `web/package.json`, `web/prisma/schema.prisma`
- Test: verified by migration applying cleanly

**Interfaces:**
- Produces: tables `orgs`, `users`, `accounts`, `sessions`, `verification_tokens`, `areas`, `area_price_baselines`, `org_area_overrides`, `saved_searches`, `settings`, `disqualify_keywords`.

- [ ] **Step 1: Initialise the Prisma host**

```bash
mkdir web
cd web
npm init -y
npm install --save-dev prisma@6
npm install @prisma/client@6
npx prisma init --datasource-provider postgresql
```

Then set `web/.env` to contain `DATABASE_URL` matching Task 1 (Prisma reads its own `.env`).

- [ ] **Step 2: Write the schema**

Replace `web/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Org {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  users              User[]
  settings           Settings?
  savedSearches      SavedSearch[]
  disqualifyKeywords DisqualifyKeyword[]
  areaOverrides      OrgAreaOverride[]

  @@map("orgs")
}

model User {
  id            String    @id @default(cuid())
  orgId         String    @map("org_id")
  email         String    @unique
  passwordHash  String?   @map("password_hash")
  name          String?
  emailVerified DateTime? @map("email_verified")
  image         String?
  role          String    @default("admin")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  org      Org       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  accounts Account[]
  sessions Session[]

  @@index([orgId])
  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

/// Global reference data — deliberately NOT org-scoped (D9).
model Area {
  id           String   @id @default(cuid())
  name         String
  municipality String
  slug         String   @unique
  aliases      String[]
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  baselines AreaPriceBaseline[]
  overrides OrgAreaOverride[]
  leads     SourcingLead[]

  @@index([municipality])
  @@map("areas")
}

/// Global reference data (D9). Only metric_type='asking' is written (D4).
model AreaPriceBaseline {
  id           String   @id @default(cuid())
  areaId       String   @map("area_id")
  source       String
  metricType   String   @map("metric_type")
  period       DateTime @db.Date
  pricePerSqm  Decimal  @map("price_per_sqm") @db.Decimal(12, 2)
  currency     String   @default("EUR")
  sampleSize   Int?     @map("sample_size")
  capturedAt   DateTime @map("captured_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  area Area @relation(fields: [areaId], references: [id], onDelete: Cascade)

  @@unique([areaId, source, metricType, period])
  @@index([areaId, period])
  @@map("area_price_baselines")
}

model OrgAreaOverride {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  areaId      String   @map("area_id")
  pricePerSqm Decimal  @map("price_per_sqm") @db.Decimal(12, 2)
  currency    String   @default("EUR")
  note        String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  org  Org  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  area Area @relation(fields: [areaId], references: [id], onDelete: Cascade)

  @@unique([orgId, areaId])
  @@map("org_area_overrides")
}

model SavedSearch {
  id        String   @id @default(cuid())
  orgId     String   @map("org_id")
  portal    String
  url       String
  label     String?
  enabled   Boolean  @default(true)
  schedule  String   @default("0 */6 * * *")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, enabled])
  @@map("saved_searches")
}

model Settings {
  id                     String   @id @default(cuid())
  orgId                  String   @unique @map("org_id")
  discountThresholdPct   Decimal  @default(15.0) @map("discount_threshold_pct") @db.Decimal(5, 2)
  maxPrice               Decimal  @default(250000) @map("max_price") @db.Decimal(12, 2)
  minTypology            Int      @default(1) @map("min_typology")
  stalenessThresholdDays Int      @default(3) @map("staleness_threshold_days")
  currency               String   @default("EUR")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("settings")
}

model DisqualifyKeyword {
  id        String   @id @default(cuid())
  orgId     String   @map("org_id")
  category  String
  keyword   String
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, keyword])
  @@index([orgId, enabled])
  @@map("disqualify_keywords")
}
```

`discountThresholdPct` defaults to 15 to match today's behaviour, but per the spec it **must be retuned** once real idealista baselines land — it was calibrated against hand-entered numbers.

- [ ] **Step 3: Create and apply the migration**

```bash
cd web
npx prisma migrate dev --name init_tenancy_and_reference
```

Expected: migration applies, `prisma/migrations/*_init_tenancy_and_reference/` created.

- [ ] **Step 4: Verify tables exist**

```bash
docker compose exec db psql -U houseflip -d houseflip -c "\dt"
```

Expected: all eleven tables listed.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat: add Prisma schema for tenancy, auth and reference data"
```

---

### Task 3: Prisma schema — sourcing tables and duplicate view

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: migration containing the duplicate-clustering view

**Interfaces:**
- Produces: tables `sourcing_leads`, `lead_price_history`, `lead_tags`, `alerts`, `capture_runs`; view `v_lead_duplicate_groups`.

- [ ] **Step 1: Append the sourcing models to `web/prisma/schema.prisma`**

```prisma
model SourcingLead {
  id              String    @id @default(cuid())
  orgId           String    @map("org_id")
  portal          String
  externalId      String    @map("external_id")
  url             String
  title           String?
  description     String?
  price           Decimal?  @db.Decimal(12, 2)
  currency        String    @default("EUR")
  areaSqmGross    Decimal?  @map("area_sqm_gross") @db.Decimal(10, 2)
  areaSqmUseful   Decimal?  @map("area_sqm_useful") @db.Decimal(10, 2)
  landAreaSqm     Decimal?  @map("land_area_sqm") @db.Decimal(10, 2)
  typology        Int?
  areaId          String?   @map("area_id")
  rawLocationText String?   @map("raw_location_text")
  latitude        Decimal?  @db.Decimal(9, 6)
  longitude       Decimal?  @db.Decimal(9, 6)
  imageUrls       Json      @default("[]") @map("image_urls")
  pricePerSqmGross  Decimal? @map("price_per_sqm_gross") @db.Decimal(12, 2)
  pricePerSqmUseful Decimal? @map("price_per_sqm_useful") @db.Decimal(12, 2)
  discountPct     Decimal?  @map("discount_pct") @db.Decimal(6, 2)
  status          String    @default("evaluating")
  disqualifiedAt     DateTime? @map("disqualified_at")
  disqualifyReason   String?   @map("disqualify_reason")
  firstSeenAt     DateTime  @map("first_seen_at")
  lastSeenAt      DateTime  @map("last_seen_at")
  raw             Json?
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  area         Area?              @relation(fields: [areaId], references: [id])
  priceHistory LeadPriceHistory[]
  tags         LeadTag[]

  @@unique([orgId, portal, externalId])
  @@index([orgId, status])
  @@index([orgId, areaId])
  @@index([areaId])
  @@map("sourcing_leads")
}

model LeadPriceHistory {
  id         String   @id @default(cuid())
  leadId     String   @map("lead_id")
  price      Decimal  @db.Decimal(12, 2)
  currency   String   @default("EUR")
  observedAt DateTime @map("observed_at")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  lead SourcingLead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId, observedAt])
  @@map("lead_price_history")
}

model LeadTag {
  id        String   @id @default(cuid())
  leadId    String   @map("lead_id")
  tag       String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  lead SourcingLead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@unique([leadId, tag])
  @@map("lead_tags")
}

model Alert {
  id          String    @id @default(cuid())
  orgId       String    @map("org_id")
  type        String
  severity    String    @default("info")
  entityType  String?   @map("entity_type")
  entityId    String?   @map("entity_id")
  message     String
  payload     Json?
  resolvedAt  DateTime? @map("resolved_at")
  dismissedAt DateTime? @map("dismissed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([orgId, type, resolvedAt])
  @@map("alerts")
}

model CaptureRun {
  id           String    @id @default(cuid())
  orgId        String    @map("org_id")
  portal       String?
  url          String
  htmlBytes    Int       @map("html_bytes")
  itemsParsed  Int       @default(0) @map("items_parsed")
  itemsNew     Int       @default(0) @map("items_new")
  status       String
  error        String?
  capturedAt   DateTime  @map("captured_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@index([orgId, createdAt])
  @@index([orgId, status])
  @@map("capture_runs")
}
```

- [ ] **Step 2: Generate the migration**

```bash
cd web
npx prisma migrate dev --name add_sourcing_tables
```

- [ ] **Step 3: Add the duplicate-clustering view as an empty migration**

Prisma does not model views, so it goes in hand-written SQL:

```bash
cd web
npx prisma migrate dev --create-only --name add_duplicate_groups_view
```

Then put this in the generated migration's `migration.sql`:

```sql
-- Non-destructive duplicate clustering (D13). Groups obvious cross-portal
-- relistings without modifying or merging any row. Price alone is too
-- fragile: agencies list the same flat at slightly different prices per
-- portal, so we bucket price to 5k and area to 5 m2.
CREATE VIEW v_lead_duplicate_groups AS
SELECT
    id                AS lead_id,
    org_id,
    md5(
        coalesce(area_id, 'no-area') || '|' ||
        coalesce(typology::text, 'no-typ') || '|' ||
        coalesce((round(area_sqm_gross / 5) * 5)::text, 'no-area-sqm') || '|' ||
        coalesce((round(price / 5000) * 5000)::text, 'no-price')
    )                 AS group_key
FROM sourcing_leads
WHERE area_id IS NOT NULL
  AND price IS NOT NULL
  AND area_sqm_gross IS NOT NULL;
```

- [ ] **Step 4: Apply it**

```bash
npx prisma migrate dev
```

- [ ] **Step 5: Verify the view returns rows without error**

```bash
docker compose exec db psql -U houseflip -d houseflip -c "SELECT count(*) FROM v_lead_duplicate_groups;"
```

Expected: `0` (no leads yet), no error.

- [ ] **Step 6: Add trigram indexes for search**

Create another `--create-only` migration named `add_trgm_indexes` with:

```sql
CREATE INDEX sourcing_leads_description_trgm
    ON sourcing_leads USING gin (description gin_trgm_ops);
CREATE INDEX sourcing_leads_title_trgm
    ON sourcing_leads USING gin (title gin_trgm_ops);
CREATE INDEX sourcing_leads_raw_location_trgm
    ON sourcing_leads USING gin (raw_location_text gin_trgm_ops);
```

Apply with `npx prisma migrate dev`.

- [ ] **Step 7: Commit**

```bash
git add web/prisma
git commit -m "feat: add sourcing tables, duplicate view and trigram indexes"
```

---

### Task 4: Seed orgs, user, areas, settings and keywords

**Files:**
- Create: `web/prisma/seed.ts`, `web/tsconfig.json`
- Modify: `web/package.json`

**Interfaces:**
- Produces: one `Org` (id available via `DEFAULT_ORG_ID` env or lookup by name `"Default"`), one admin `User`, ~100 `Area` rows seeded from `config.json`, one `Settings` row, and the disqualification keyword set lifted from `server.py:41-55`.

- [ ] **Step 1: Install seed dependencies**

```bash
cd web
npm install --save-dev tsx typescript @types/node
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

Add to `web/package.json`:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 2: Write the seed script**

`web/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** "São Domingos de Rana" -> "sao-domingos-de-rana" */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Strip combining diacritical marks. Uses a Unicode property escape
    // rather than a literal character range, which does not survive
    // copy-paste between editors reliably.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * config.json keys are freguesia names, sometimes with the municipality
 * embedded ("Cascais e Estoril") and sometimes bare ("Benfica"). We store
 * the raw key as the primary alias so existing CSV rows match on import.
 */
function aliasesFor(name: string): string[] {
  const set = new Set<string>([name, slugify(name)]);
  // Split compound freguesia names: "Algés, Linda-a-Velha e Cruz Quebrada"
  for (const part of name.split(/,| e /)) {
    const trimmed = part.trim();
    if (trimmed.length > 2) {
      set.add(trimmed);
      set.add(slugify(trimmed));
    }
  }
  return [...set];
}

const RENTED_KEYWORDS = [
  "arrendado", "arrendada", "com inquilino", "com arrendatario",
  "ocupado com", "contrato de arrendamento", "rendimento garantido",
  "investimento arrendado", "yield garantido", "retorno garantido",
  "com rendimento", "em regime de arrendamento", "inquilino atual",
];

const NO_LICENCE_KEYWORDS = [
  "sem licenca de habitacao", "sem licenca habitacao",
  "sem alvara", "nao tem licenca", "nao possui licenca",
  "licenca em processo", "licenca a regularizar",
  "a aguardar licenca", "processo de licenciamento",
  "licenca de utilizacao pendente", "licenca de utilizacao em falta",
  "edificio nao licenciado",
];

async function main() {
  const org = await prisma.org.upsert({
    where: { id: "default-org" },
    update: {},
    create: { id: "default-org", name: "Default" },
  });

  const email = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "changeme";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      orgId: org.id,
      email,
      name: "Admin",
      role: "admin",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await prisma.settings.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });

  const config = JSON.parse(
    readFileSync(join(__dirname, "../../config.json"), "utf-8"),
  );
  const areaNames: string[] = Object.keys(config.locations_avg_price_m2)
    .filter((n) => n !== "AML (Geral)");

  for (const name of areaNames) {
    const slug = slugify(name);
    await prisma.area.upsert({
      where: { slug },
      update: { aliases: aliasesFor(name) },
      create: {
        name,
        slug,
        municipality: name,
        aliases: aliasesFor(name),
      },
    });
  }

  for (const [category, keywords] of [
    ["rented", RENTED_KEYWORDS],
    ["no_licence", NO_LICENCE_KEYWORDS],
  ] as const) {
    for (const keyword of keywords) {
      await prisma.disqualifyKeyword.upsert({
        where: { orgId_keyword: { orgId: org.id, keyword } },
        update: { category },
        create: { orgId: org.id, category, keyword },
      });
    }
  }

  console.log(
    `Seeded org=${org.id} areas=${areaNames.length} ` +
    `keywords=${RENTED_KEYWORDS.length + NO_LICENCE_KEYWORDS.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Note `municipality` is seeded to the area name as a placeholder — `config.json` has no municipality field. Correcting it is an admin-UI task in Plan 3, not a blocker here.

- [ ] **Step 3: Run the seed**

```bash
cd web
npx prisma db seed
```

Expected output of the form `Seeded org=default-org areas=<N> keywords=25`.

`keywords=25` is exact (13 rented + 12 no-licence). `<N>` must equal the
number of keys in `config.json`'s `locations_avg_price_m2` minus one for
`AML (Geral)`. Verify rather than assume:

```bash
docker compose exec db psql -U houseflip -d houseflip -c "SELECT count(*) FROM areas;"
```

Cross-check that count against the config file; if they differ, the
slugify collapse has merged two distinct freguesias onto one slug and
must be fixed before continuing.

- [ ] **Step 4: Verify area aliases landed**

```bash
docker compose exec db psql -U houseflip -d houseflip \
  -c "SELECT name, aliases FROM areas WHERE slug = 'campo-de-ourique';"
```

Expected: aliases array contains `Campo de Ourique` and `campo-de-ourique`.

- [ ] **Step 5: Commit**

```bash
git add web/prisma/seed.ts web/package.json web/tsconfig.json
git commit -m "feat: seed org, admin user, areas from config.json and keywords"
```

---

### Task 5: Python ingest package skeleton — config, DB pool, shared-secret auth

**Files:**
- Create: `ingest/__init__.py`, `ingest/config.py`, `ingest/db.py`, `ingest/auth.py`, `tests/conftest.py`
- Modify: `requirements.txt`
- Test: `tests/test_auth.py`

**Interfaces:**
- Produces:
  - `ingest.config.Config` with `.database_url: str`, `.shared_secret: str`, `.port: int`, `.healthcheck_ping_url: str | None`, and classmethod `Config.from_env() -> Config`
  - `ingest.db.get_pool() -> psycopg_pool.ConnectionPool` and context manager `ingest.db.connection()`
  - `ingest.auth.require_secret(fn)` — Flask decorator returning 401 and logging on failure

- [ ] **Step 1: Add dependencies**

Append to `requirements.txt`:

```
psycopg[binary,pool]==3.2.3
pytest==8.3.4
```

Install: `pip install -r requirements.txt`

- [ ] **Step 2: Write the failing auth test**

`tests/test_auth.py`:

```python
import pytest
from flask import Flask
from ingest.auth import require_secret


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("INGEST_SHARED_SECRET", "s3cret")
    app = Flask(__name__)

    @app.post("/guarded")
    @require_secret
    def guarded():
        return {"ok": True}

    return app


def test_rejects_missing_secret(app):
    res = app.test_client().post("/guarded")
    assert res.status_code == 401


def test_rejects_wrong_secret(app):
    res = app.test_client().post("/guarded", headers={"X-Ingest-Secret": "nope"})
    assert res.status_code == 401


def test_accepts_correct_secret(app):
    res = app.test_client().post("/guarded", headers={"X-Ingest-Secret": "s3cret"})
    assert res.status_code == 200
    assert res.get_json() == {"ok": True}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pytest tests/test_auth.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest'`

- [ ] **Step 4: Write `ingest/config.py`**

```python
import os
from dataclasses import dataclass
from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    database_url: str
    shared_secret: str
    port: int
    healthcheck_ping_url: str | None

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")
        shared_secret = os.environ.get("INGEST_SHARED_SECRET")
        if not shared_secret:
            raise RuntimeError("INGEST_SHARED_SECRET is not set")
        ping = os.environ.get("HEALTHCHECK_PING_URL") or None
        return cls(
            database_url=database_url,
            shared_secret=shared_secret,
            port=int(os.environ.get("INGEST_PORT", "5000")),
            healthcheck_ping_url=ping,
        )
```

- [ ] **Step 5: Write `ingest/auth.py`**

```python
import hmac
import logging
import os
from functools import wraps
from flask import request, jsonify

logger = logging.getLogger("ingest.auth")

SECRET_HEADER = "X-Ingest-Secret"


def require_secret(fn):
    """Reject requests without the shared secret, and log the rejection.

    Required by build prompt section 6: the ingest service is a separate
    process from the web app, so its endpoints are authenticated.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        expected = os.environ.get("INGEST_SHARED_SECRET", "")
        provided = request.headers.get(SECRET_HEADER, "")
        if not expected or not hmac.compare_digest(expected, provided):
            logger.warning(
                "Rejected %s %s from %s: bad or missing secret",
                request.method,
                request.path,
                request.remote_addr,
            )
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper
```

`hmac.compare_digest` rather than `==` — constant-time comparison avoids leaking the secret through timing.

- [ ] **Step 6: Write `ingest/db.py`**

```python
from contextlib import contextmanager
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from ingest.config import Config

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        cfg = Config.from_env()
        _pool = ConnectionPool(cfg.database_url, min_size=1, max_size=5, open=True)
    return _pool


@contextmanager
def connection():
    """Yield a pooled connection with dict rows. Commits on clean exit."""
    with get_pool().connection() as conn:
        conn.row_factory = dict_row
        yield conn
```

Create an empty `ingest/__init__.py`.

- [ ] **Step 7: Run the auth tests**

```bash
pytest tests/test_auth.py -v
```

Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add ingest/__init__.py ingest/config.py ingest/db.py ingest/auth.py tests/test_auth.py requirements.txt
git commit -m "feat: add ingest package skeleton with config, pool and shared-secret auth"
```

---

### Task 6: Area matching from location strings

**Files:**
- Create: `ingest/area_matcher.py`, `ingest/repositories/__init__.py`, `ingest/repositories/areas.py`
- Test: `tests/test_area_matcher.py`

**Interfaces:**
- Consumes: `ingest.db.connection`
- Produces:
  - `ingest.area_matcher.normalize_text(s: str) -> str` — lowercases, strips diacritics
  - `ingest.area_matcher.match_area(text: str, areas: list[dict]) -> str | None` — returns `area_id` or `None`
  - `ingest.repositories.areas.load_areas(conn) -> list[dict]` — rows of `{id, name, slug, aliases}`
  - `ingest.repositories.areas.get_baseline(conn, area_id, org_id) -> Decimal | None`

- [ ] **Step 1: Write the failing test**

`tests/test_area_matcher.py`:

```python
from ingest.area_matcher import normalize_text, match_area

AREAS = [
    {"id": "a1", "name": "Campo de Ourique",
     "slug": "campo-de-ourique",
     "aliases": ["Campo de Ourique", "campo-de-ourique"]},
    {"id": "a2", "name": "São Domingos de Rana",
     "slug": "sao-domingos-de-rana",
     "aliases": ["São Domingos de Rana", "sao-domingos-de-rana"]},
    {"id": "a3", "name": "Benfica", "slug": "benfica",
     "aliases": ["Benfica", "benfica"]},
]


def test_normalize_strips_diacritics_and_case():
    assert normalize_text("São Vicente") == "sao vicente"
    assert normalize_text("  RUÍNA  ") == "ruina"


def test_matches_exact_name():
    assert match_area("Campo de Ourique", AREAS) == "a1"


def test_matches_ignoring_diacritics():
    assert match_area("Sao Domingos de Rana", AREAS) == "a2"


def test_matches_inside_a_longer_listing_string():
    text = "Apartamento T1 na Rua Maria Pia, Prazeres, Campo de Ourique"
    assert match_area(text, AREAS) == "a1"


def test_prefers_longest_match_when_several_hit():
    # "Benfica" is a substring of "São Domingos de Benfica"; the longer
    # alias must win or leads get filed to the wrong freguesia.
    areas = AREAS + [{
        "id": "a4", "name": "São Domingos de Benfica",
        "slug": "sao-domingos-de-benfica",
        "aliases": ["São Domingos de Benfica", "sao-domingos-de-benfica"],
    }]
    assert match_area("Moradia em São Domingos de Benfica", areas) == "a4"


def test_returns_none_when_nothing_matches():
    assert match_area("Rua Qualquer, Bragança", AREAS) is None
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pytest tests/test_area_matcher.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.area_matcher'`

- [ ] **Step 3: Write `ingest/area_matcher.py`**

```python
import unicodedata


def normalize_text(s: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace.

    Portal text is inconsistent about accents ("Sao" vs "São"), so all
    matching happens in this normalized space.
    """
    if not s:
        return ""
    decomposed = unicodedata.normalize("NFKD", s)
    stripped = decomposed.encode("ASCII", "ignore").decode("utf-8")
    return " ".join(stripped.lower().split())


def match_area(text: str, areas: list[dict]) -> str | None:
    """Return the area_id whose alias best matches `text`, else None.

    Longest alias wins: "Benfica" is a substring of "São Domingos de
    Benfica", and matching the short one would misfile the lead.
    """
    haystack = normalize_text(text)
    if not haystack:
        return None

    best_id: str | None = None
    best_len = 0
    for area in areas:
        for alias in area.get("aliases", []):
            needle = normalize_text(alias)
            if len(needle) > best_len and needle and needle in haystack:
                best_id = area["id"]
                best_len = len(needle)
    return best_id
```

- [ ] **Step 4: Run the tests**

```bash
pytest tests/test_area_matcher.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Write the areas repository**

`ingest/repositories/areas.py`:

```python
from decimal import Decimal


def load_areas(conn) -> list[dict]:
    """All areas with their aliases. Small table (~100 rows); load once
    per request rather than querying per lead."""
    return conn.execute(
        "SELECT id, name, slug, aliases FROM areas"
    ).fetchall()


def get_baseline(conn, area_id: str, org_id: str) -> Decimal | None:
    """Effective asking-price baseline for an area.

    An org-specific override wins over the market figure. Otherwise the
    most recent asking baseline is used. Transaction-metric rows are
    never consulted (D4).
    """
    override = conn.execute(
        "SELECT price_per_sqm FROM org_area_overrides "
        "WHERE org_id = %s AND area_id = %s",
        (org_id, area_id),
    ).fetchone()
    if override:
        return override["price_per_sqm"]

    row = conn.execute(
        "SELECT price_per_sqm FROM area_price_baselines "
        "WHERE area_id = %s AND metric_type = 'asking' "
        "ORDER BY period DESC LIMIT 1",
        (area_id,),
    ).fetchone()
    return row["price_per_sqm"] if row else None
```

Create an empty `ingest/repositories/__init__.py`.

- [ ] **Step 6: Commit**

```bash
git add ingest/area_matcher.py ingest/repositories tests/test_area_matcher.py
git commit -m "feat: match scraped location strings to areas by alias"
```

---

### Task 7: Disqualification filter

**Files:**
- Create: `ingest/disqualify.py`
- Test: `tests/test_disqualify.py`

**Interfaces:**
- Consumes: `ingest.area_matcher.normalize_text`
- Produces: `ingest.disqualify.check(description: str, keywords: list[dict]) -> tuple[bool, str | None, str | None]` returning `(is_disqualified, category, matched_keyword)`; `ingest.disqualify.load_keywords(conn, org_id) -> list[dict]`

- [ ] **Step 1: Write the failing test**

`tests/test_disqualify.py`:

```python
from ingest.disqualify import check

KEYWORDS = [
    {"keyword": "arrendado", "category": "rented"},
    {"keyword": "contrato de arrendamento", "category": "rented"},
    {"keyword": "sem licenca de habitacao", "category": "no_licence"},
]


def test_clean_description_passes():
    ok, category, matched = check("Apartamento para remodelar", KEYWORDS)
    assert ok is False
    assert category is None
    assert matched is None


def test_flags_rented_property():
    ok, category, matched = check("Imóvel arrendado com inquilino", KEYWORDS)
    assert ok is True
    assert category == "rented"
    assert matched == "arrendado"


def test_matches_despite_diacritics_and_case():
    ok, category, _ = check("SEM LICENÇA DE HABITAÇÃO", KEYWORDS)
    assert ok is True
    assert category == "no_licence"


def test_handles_empty_description():
    ok, _, _ = check("", KEYWORDS)
    assert ok is False


def test_handles_none_description():
    ok, _, _ = check(None, KEYWORDS)
    assert ok is False
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pytest tests/test_disqualify.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.disqualify'`

- [ ] **Step 3: Write `ingest/disqualify.py`**

```python
from ingest.area_matcher import normalize_text


def load_keywords(conn, org_id: str) -> list[dict]:
    return conn.execute(
        "SELECT keyword, category FROM disqualify_keywords "
        "WHERE org_id = %s AND enabled = true",
        (org_id,),
    ).fetchall()


def check(
    description: str | None, keywords: list[dict]
) -> tuple[bool, str | None, str | None]:
    """Return (is_disqualified, category, matched_keyword).

    Ported from server.py:57-72, with the keyword lists moved out of
    source and into the disqualify_keywords table so they are editable
    without a deploy.
    """
    haystack = normalize_text(description or "")
    if not haystack:
        return False, None, None

    for entry in keywords:
        needle = normalize_text(entry["keyword"])
        if needle and needle in haystack:
            return True, entry["category"], entry["keyword"]
    return False, None, None
```

- [ ] **Step 4: Run the tests**

```bash
pytest tests/test_disqualify.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add ingest/disqualify.py tests/test_disqualify.py
git commit -m "feat: filter rented and unlicensed listings using DB keywords"
```

---

### Task 8: Evaluation — price per m² and discount against baseline

**Files:**
- Create: `ingest/evaluate.py`
- Test: `tests/test_evaluate.py`

**Interfaces:**
- Produces:
  - `ingest.evaluate.price_per_sqm(price: Decimal | None, area: Decimal | None) -> Decimal | None`
  - `ingest.evaluate.discount_pct(price_per_sqm: Decimal | None, baseline: Decimal | None) -> Decimal | None`
  - `ingest.evaluate.is_hot_lead(discount: Decimal | None, threshold: Decimal) -> bool`

- [ ] **Step 1: Write the failing test**

`tests/test_evaluate.py`:

```python
from decimal import Decimal
import pytest
from ingest.evaluate import price_per_sqm, discount_pct, is_hot_lead


def test_price_per_sqm_basic():
    assert price_per_sqm(Decimal("200000"), Decimal("100")) == Decimal("2000")


def test_price_per_sqm_returns_none_for_zero_area():
    # server.py guarded against this by skipping the listing entirely;
    # we keep the lead and leave the metric null instead.
    assert price_per_sqm(Decimal("200000"), Decimal("0")) is None


def test_price_per_sqm_returns_none_for_missing_inputs():
    assert price_per_sqm(None, Decimal("100")) is None
    assert price_per_sqm(Decimal("200000"), None) is None


def test_discount_pct_below_baseline_is_positive():
    # 2000 vs baseline 2500 is 20% below.
    assert discount_pct(Decimal("2000"), Decimal("2500")) == Decimal("20.00")


def test_discount_pct_above_baseline_is_negative():
    assert discount_pct(Decimal("3000"), Decimal("2500")) == Decimal("-20.00")


def test_discount_pct_none_without_baseline():
    assert discount_pct(Decimal("2000"), None) is None
    assert discount_pct(None, Decimal("2500")) is None
    assert discount_pct(Decimal("2000"), Decimal("0")) is None


def test_is_hot_lead_at_and_above_threshold():
    assert is_hot_lead(Decimal("15.00"), Decimal("15.00")) is True
    assert is_hot_lead(Decimal("22.30"), Decimal("15.00")) is True


def test_is_hot_lead_below_threshold():
    assert is_hot_lead(Decimal("14.99"), Decimal("15.00")) is False


def test_is_hot_lead_false_when_discount_unknown():
    assert is_hot_lead(None, Decimal("15.00")) is False
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pytest tests/test_evaluate.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.evaluate'`

- [ ] **Step 3: Write `ingest/evaluate.py`**

```python
from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")


def price_per_sqm(
    price: Decimal | None, area: Decimal | None
) -> Decimal | None:
    """Price per square metre, or None if it cannot be computed.

    Returns None rather than raising or skipping: a listing with no area
    is still worth keeping, it just cannot be evaluated.
    """
    if price is None or area is None or area <= 0:
        return None
    return (price / area).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def discount_pct(
    value: Decimal | None, baseline: Decimal | None
) -> Decimal | None:
    """Percent below baseline. Positive means cheaper than the area norm."""
    if value is None or baseline is None or baseline <= 0:
        return None
    pct = (Decimal(1) - (value / baseline)) * Decimal(100)
    return pct.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def is_hot_lead(discount: Decimal | None, threshold: Decimal) -> bool:
    """Threshold comes from settings.discount_threshold_pct, never a
    constant (build prompt section 9)."""
    if discount is None:
        return False
    return discount >= threshold
```

- [ ] **Step 4: Run the tests**

```bash
pytest tests/test_evaluate.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add ingest/evaluate.py tests/test_evaluate.py
git commit -m "feat: compute price per sqm and discount against area baseline"
```

---

### Task 9: Portal parsers with real HTML fixtures

**Files:**
- Create: `ingest/parsers/__init__.py`, `ingest/parsers/base.py`, `ingest/parsers/idealista.py`
- Create: `tests/fixtures/idealista_search.html`
- Test: `tests/test_parsers_idealista.py`, `tests/test_parsers_router.py`

**Scope:** Idealista only. imovirtual and olx are Task 13, because the plan
specifies them in prose rather than code and they need their own fixtures.

**Interfaces:**
- Produces:
  - `ingest.parsers.base.ParsedListing` — TypedDict with keys `portal, external_id, url, title, description, price, area_sqm_gross, typology, raw_location_text, image_urls`
  - `ingest.parsers.get_parser(url: str) -> Callable[[str, str], list[ParsedListing]] | None`
  - each module exposes `parse(url: str, html: str) -> list[ParsedListing]`

**Important:** parsers no longer filter by price, typology or location. Filtering was mixed into extraction at `idealista.py:29`, `:42` and `:59`, which silently discarded listings. Extraction now returns everything it finds; filtering and evaluation happen downstream where the outcome is recorded.

- [ ] **Step 1: Create the fixtures**

Copy the already-captured page as the first fixture:

```bash
mkdir -p tests/fixtures
cp debug_page.html tests/fixtures/idealista_search.html
```

If `debug_page.html` turns out not to be an Idealista search page, report
BLOCKED — capturing a fresh one needs a real browser session, which is a
human step. Confirm before proceeding:

```bash
grep -c 'article class="item' tests/fixtures/idealista_search.html
```

Expected: a non-zero count.

- [ ] **Step 2: Write the failing parser test**

`tests/test_parsers_idealista.py`:

```python
from decimal import Decimal
from pathlib import Path
import pytest
from ingest.parsers.idealista import parse

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_search.html"


@pytest.fixture(scope="module")
def listings():
    html = FIXTURE.read_text(encoding="utf-8")
    return parse("https://www.idealista.pt/comprar-casas/lisboa/", html)


def test_extracts_listings(listings):
    assert len(listings) > 0


def test_every_listing_has_the_required_identity_fields(listings):
    for item in listings:
        assert item["portal"] == "idealista"
        assert item["external_id"]
        assert item["url"].startswith("https://www.idealista.pt/")


def test_external_id_is_the_numeric_property_id(listings):
    ids = [i["external_id"] for i in listings]
    assert all(i.isdigit() for i in ids), ids[:5]


def test_prices_are_positive_decimals(listings):
    priced = [i for i in listings if i["price"] is not None]
    assert priced
    for item in priced:
        assert isinstance(item["price"], Decimal)
        assert item["price"] > 0


def test_does_not_filter_by_price_or_typology(listings):
    # Extraction must be lossless; filtering happens downstream.
    # The fixture contains listings above the 250k config limit.
    assert any(
        i["price"] is not None and i["price"] > Decimal("250000")
        for i in listings
    )
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pytest tests/test_parsers_idealista.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.parsers'`

- [ ] **Step 4: Write `ingest/parsers/base.py`**

```python
from typing import TypedDict, NotRequired
from decimal import Decimal


class ParsedListing(TypedDict):
    portal: str
    external_id: str
    url: str
    title: NotRequired[str | None]
    description: NotRequired[str | None]
    price: NotRequired[Decimal | None]
    area_sqm_gross: NotRequired[Decimal | None]
    typology: NotRequired[int | None]
    raw_location_text: NotRequired[str | None]
    image_urls: NotRequired[list[str]]
```

- [ ] **Step 5: Write `ingest/parsers/idealista.py`**

```python
import logging
import re
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup
from ingest.parsers.base import ParsedListing

logger = logging.getLogger("ingest.parsers.idealista")

BASE_URL = "https://www.idealista.pt"
ID_RE = re.compile(r"/imovel/(\d+)")


def _to_decimal(text: str) -> Decimal | None:
    cleaned = (
        text.replace("€", "")
        .replace(".", "")
        .replace("\xa0", "")
        .strip()
    )
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _first_int(text: str) -> int | None:
    m = re.search(r"\d+", text or "")
    return int(m.group()) if m else None


def parse(url: str, html: str) -> list[ParsedListing]:
    """Extract every listing card. No filtering — see Task 9 note."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[ParsedListing] = []

    for article in soup.find_all("article", class_="item"):
        try:
            link_el = article.find("a", class_="item-link")
            if not link_el or not link_el.get("href"):
                continue
            href = link_el["href"]
            id_match = ID_RE.search(href)
            if not id_match:
                continue

            price_el = article.find("span", class_="item-price")
            price = _to_decimal(price_el.text) if price_el else None

            details = article.find_all("span", class_="item-detail")
            typology = _first_int(details[0].text) if details else None
            area = (
                Decimal(str(_first_int(details[1].text)))
                if len(details) > 1 and _first_int(details[1].text)
                else None
            )

            image_urls: list[str] = []
            picture = article.find("picture")
            if picture:
                img = picture.find("img")
                if img and img.get("src"):
                    image_urls.append(img["src"])

            results.append(
                ParsedListing(
                    portal="idealista",
                    external_id=id_match.group(1),
                    url=f"{BASE_URL}{href}",
                    title=link_el.text.strip() or None,
                    description=article.get_text(separator=" ").strip() or None,
                    price=price,
                    area_sqm_gross=area,
                    typology=typology,
                    raw_location_text=link_el.text.strip() or None,
                    image_urls=image_urls,
                )
            )
        except Exception:
            logger.exception("Failed to extract an Idealista card")

    logger.info("Idealista: extracted %d listings from %s", len(results), url)
    return results
```

- [ ] **Step 6: Run the tests**

```bash
pytest tests/test_parsers_idealista.py -v
```

Expected: 5 passed. If `test_does_not_filter_by_price_or_typology` fails because the fixture happens to contain no listing above 250k, replace the fixture with a page that does rather than weakening the assertion.

- [ ] **Step 7: Write the router**

`ingest/parsers/__init__.py`:

```python
from typing import Callable
from ingest.parsers import idealista
from ingest.parsers.base import ParsedListing

Parser = Callable[[str, str], list[ParsedListing]]

# Task 13 registers imovirtual and olx here. Do not add them now — their
# modules do not exist yet and the import would fail.
_ROUTES: list[tuple[str, Parser]] = [
    ("idealista.pt", idealista.parse),
]


def get_parser(url: str) -> Parser | None:
    for domain, parser in _ROUTES:
        if domain in url:
            return parser
    return None
```

`tests/test_parsers_router.py`:

```python
from ingest.parsers import get_parser
from ingest.parsers import idealista


def test_routes_idealista():
    assert get_parser("https://www.idealista.pt/comprar-casas/lisboa/") is idealista.parse


def test_returns_none_for_unknown_portal():
    assert get_parser("https://example.com/whatever") is None
```

- [ ] **Step 8: Run the parser suite**

```bash
pytest tests/test_parsers_idealista.py tests/test_parsers_router.py -v
```

Expected: all pass. imovirtual and olx are Task 13.

- [ ] **Step 9: Commit**

```bash
git add ingest/parsers tests/fixtures tests/test_parsers_*.py
git commit -m "feat: port portal parsers to lossless extraction with fixture tests"
```

---

### Task 10: The `/ingest/listings` endpoint

**Files:**
- Create: `ingest/normalize.py`, `ingest/repositories/leads.py`, `ingest/repositories/captures.py`, `ingest/app.py`, `ingest/health.py`
- Test: `tests/conftest.py`, `tests/test_ingest_listings.py`

**Interfaces:**
- Consumes: everything from Tasks 5–9.
- Produces: `ingest.app.create_app() -> Flask`; `POST /ingest/listings` accepting `{"url": str, "html": str, "captured_at": iso8601}` with header `X-Ingest-Secret`, returning `{"parsed": int, "new": int, "updated": int, "hot_leads": int, "status": str}`.

- [ ] **Step 1: Write `tests/conftest.py`**

```python
import os
import pytest
import psycopg
from psycopg.rows import dict_row

TEST_ORG_ID = "default-org"


@pytest.fixture(scope="session")
def dsn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set")
    return url


@pytest.fixture
def conn(dsn):
    """A connection wrapped in a transaction that is always rolled back,
    so tests never leave rows behind."""
    with psycopg.connect(dsn) as c:
        c.row_factory = dict_row
        yield c
        c.rollback()


@pytest.fixture
def clean_leads(dsn):
    yield
    with psycopg.connect(dsn) as c:
        c.execute("DELETE FROM lead_price_history")
        c.execute("DELETE FROM lead_tags")
        c.execute("DELETE FROM sourcing_leads")
        c.execute("DELETE FROM capture_runs")
        c.execute("DELETE FROM alerts")
        c.commit()


@pytest.fixture
def app(monkeypatch, dsn):
    monkeypatch.setenv("INGEST_SHARED_SECRET", "test-secret")
    monkeypatch.setenv("DATABASE_URL", dsn)
    from ingest.app import create_app
    return create_app()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers():
    return {"X-Ingest-Secret": "test-secret"}
```

- [ ] **Step 2: Write the failing endpoint test**

`tests/test_ingest_listings.py`:

```python
from pathlib import Path
import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_search.html"
URL = "https://www.idealista.pt/comprar-casas/lisboa/"


@pytest.fixture
def payload():
    return {
        "url": URL,
        "html": FIXTURE.read_text(encoding="utf-8"),
        "captured_at": "2026-07-27T12:00:00Z",
    }


def test_requires_secret(client, payload):
    res = client.post("/ingest/listings", json=payload)
    assert res.status_code == 401


def test_ingests_listings(client, auth_headers, payload, clean_leads, conn):
    res = client.post("/ingest/listings", json=payload, headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["parsed"] > 0
    assert body["new"] == body["parsed"]

    count = conn.execute("SELECT count(*) AS n FROM sourcing_leads").fetchone()
    assert count["n"] == body["new"]


def test_is_idempotent_on_repost(client, auth_headers, payload, clean_leads, conn):
    first = client.post("/ingest/listings", json=payload, headers=auth_headers).get_json()
    second = client.post("/ingest/listings", json=payload, headers=auth_headers).get_json()

    assert second["new"] == 0
    assert second["updated"] == first["new"]

    rows = conn.execute("SELECT count(*) AS n FROM sourcing_leads").fetchone()
    assert rows["n"] == first["new"]

    # Unchanged price must not create a second price-history row.
    hist = conn.execute("SELECT count(*) AS n FROM lead_price_history").fetchone()
    assert hist["n"] == first["new"]


def test_records_a_capture_run(client, auth_headers, payload, clean_leads, conn):
    client.post("/ingest/listings", json=payload, headers=auth_headers)
    run = conn.execute(
        "SELECT url, status, items_parsed FROM capture_runs ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    assert run["url"] == URL
    assert run["status"] == "ok"
    assert run["items_parsed"] > 0


def test_empty_parse_raises_parser_health_alert(client, auth_headers, clean_leads, conn):
    res = client.post(
        "/ingest/listings",
        json={"url": URL, "html": "<html><body>nothing here</body></html>",
              "captured_at": "2026-07-27T12:00:00Z"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.get_json()["status"] == "parse_empty"

    alert = conn.execute(
        "SELECT type, severity FROM alerts WHERE type = 'parser_health' LIMIT 1"
    ).fetchone()
    assert alert is not None
    assert alert["severity"] == "warning"


def test_unknown_portal_is_rejected(client, auth_headers):
    res = client.post(
        "/ingest/listings",
        json={"url": "https://example.com/x", "html": "<html></html>",
              "captured_at": "2026-07-27T12:00:00Z"},
        headers=auth_headers,
    )
    assert res.status_code == 400
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pytest tests/test_ingest_listings.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.app'`

- [ ] **Step 4: Write `ingest/normalize.py`**

```python
from datetime import datetime
from ingest.parsers.base import ParsedListing


def to_lead_row(
    item: ParsedListing, org_id: str, area_id: str | None, captured_at: datetime
) -> dict:
    """Map a parsed listing onto sourcing_leads columns."""
    return {
        "org_id": org_id,
        "portal": item["portal"],
        "external_id": item["external_id"],
        "url": item["url"],
        "title": item.get("title"),
        "description": item.get("description"),
        "price": item.get("price"),
        "area_sqm_gross": item.get("area_sqm_gross"),
        "typology": item.get("typology"),
        "area_id": area_id,
        "raw_location_text": item.get("raw_location_text"),
        "image_urls": item.get("image_urls") or [],
        "first_seen_at": captured_at,
        "last_seen_at": captured_at,
    }
```

- [ ] **Step 5: Write `ingest/repositories/leads.py`**

```python
import json
from decimal import Decimal


def upsert_lead(conn, row: dict) -> tuple[str, bool, Decimal | None]:
    """Insert or update a lead on (org_id, portal, external_id).

    Returns (lead_id, was_inserted, previous_price). The previous price
    lets the caller decide whether to write a price-history row.
    """
    existing = conn.execute(
        "SELECT id, price FROM sourcing_leads "
        "WHERE org_id = %s AND portal = %s AND external_id = %s",
        (row["org_id"], row["portal"], row["external_id"]),
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE sourcing_leads SET "
            "url = %s, title = %s, description = %s, price = %s, "
            "area_sqm_gross = %s, typology = %s, area_id = %s, "
            "raw_location_text = %s, image_urls = %s, "
            "last_seen_at = %s, updated_at = now() "
            "WHERE id = %s",
            (
                row["url"], row["title"], row["description"], row["price"],
                row["area_sqm_gross"], row["typology"], row["area_id"],
                row["raw_location_text"], json.dumps(row["image_urls"]),
                row["last_seen_at"], existing["id"],
            ),
        )
        return existing["id"], False, existing["price"]

    inserted = conn.execute(
        "INSERT INTO sourcing_leads "
        "(id, org_id, portal, external_id, url, title, description, price, "
        " area_sqm_gross, typology, area_id, raw_location_text, image_urls, "
        " first_seen_at, last_seen_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
        "        %s, %s, %s, %s, %s, now(), now()) "
        "RETURNING id",
        (
            row["org_id"], row["portal"], row["external_id"], row["url"],
            row["title"], row["description"], row["price"],
            row["area_sqm_gross"], row["typology"], row["area_id"],
            row["raw_location_text"], json.dumps(row["image_urls"]),
            row["first_seen_at"], row["last_seen_at"],
        ),
    ).fetchone()
    return inserted["id"], True, None


def record_price(conn, lead_id: str, price: Decimal, observed_at) -> None:
    conn.execute(
        "INSERT INTO lead_price_history "
        "(id, lead_id, price, observed_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, now(), now())",
        (lead_id, price, observed_at),
    )


def apply_evaluation(
    conn, lead_id: str, price_per_sqm, discount, status: str,
    disqualify_reason: str | None,
) -> None:
    conn.execute(
        "UPDATE sourcing_leads SET "
        "price_per_sqm_gross = %s, discount_pct = %s, status = %s, "
        "disqualified_at = CASE WHEN %s IS NULL THEN NULL ELSE now() END, "
        "disqualify_reason = %s, updated_at = now() "
        "WHERE id = %s",
        (price_per_sqm, discount, status, disqualify_reason,
         disqualify_reason, lead_id),
    )
```

- [ ] **Step 6: Write `ingest/repositories/captures.py`**

```python
def record_run(
    conn, org_id: str, portal: str | None, url: str, html_bytes: int,
    items_parsed: int, items_new: int, status: str, error: str | None,
    captured_at,
) -> str:
    row = conn.execute(
        "INSERT INTO capture_runs "
        "(id, org_id, portal, url, html_bytes, items_parsed, items_new, "
        " status, error, captured_at, created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
        "        now(), now()) RETURNING id",
        (org_id, portal, url, html_bytes, items_parsed, items_new,
         status, error, captured_at),
    ).fetchone()
    return row["id"]


def raise_alert(
    conn, org_id: str, type_: str, severity: str, message: str,
    entity_type: str | None = None, entity_id: str | None = None,
) -> None:
    conn.execute(
        "INSERT INTO alerts "
        "(id, org_id, type, severity, entity_type, entity_id, message, "
        " created_at, updated_at) "
        "VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, now(), now())",
        (org_id, type_, severity, entity_type, entity_id, message),
    )
```

- [ ] **Step 7: Write `ingest/health.py`**

```python
import logging
import urllib.request
from ingest.config import Config

logger = logging.getLogger("ingest.health")


def ping_deadman(config: Config) -> None:
    """Tell the external monitor this run succeeded (D12).

    Never raises: a monitoring failure must not fail an ingest that
    otherwise worked. Silence is what the monitor alerts on, so a missed
    ping is a false alarm at worst, never lost data.
    """
    if not config.healthcheck_ping_url:
        return
    try:
        urllib.request.urlopen(config.healthcheck_ping_url, timeout=5).close()
    except Exception as exc:
        logger.warning("Dead-man ping failed: %s", exc)
```

- [ ] **Step 8: Write `ingest/app.py`**

```python
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS

from ingest.auth import require_secret
from ingest.config import Config
from ingest.db import connection
from ingest.disqualify import check as disqualify_check, load_keywords
from ingest.evaluate import price_per_sqm, discount_pct, is_hot_lead
from ingest.health import ping_deadman
from ingest.normalize import to_lead_row
from ingest.parsers import get_parser
from ingest.repositories import areas as areas_repo
from ingest.repositories import captures as captures_repo
from ingest.repositories import leads as leads_repo

logger = logging.getLogger("ingest.app")

DEFAULT_ORG_ID = "default-org"


def _parse_captured_at(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def create_app() -> Flask:
    logging.basicConfig(level=logging.INFO)
    app = Flask(__name__)
    CORS(app)
    config = Config.from_env()

    @app.post("/ingest/listings")
    @require_secret
    def ingest_listings():
        body = request.get_json(silent=True) or {}
        url = body.get("url")
        html = body.get("html")
        if not url or not html:
            return jsonify({"error": "url and html are required"}), 400

        parser = get_parser(url)
        if parser is None:
            return jsonify({"error": "unsupported portal"}), 400

        captured_at = _parse_captured_at(body.get("captured_at"))
        items = parser(url, html)
        org_id = DEFAULT_ORG_ID

        if not items:
            with connection() as conn:
                captures_repo.record_run(
                    conn, org_id, None, url, len(html), 0, 0,
                    "parse_empty", None, captured_at,
                )
                captures_repo.raise_alert(
                    conn, org_id, "parser_health", "warning",
                    f"Parsed 0 listings from {url}",
                )
                conn.commit()
            logger.warning("Parsed 0 listings from %s", url)
            return jsonify({
                "parsed": 0, "new": 0, "updated": 0,
                "hot_leads": 0, "status": "parse_empty",
            })

        new_count = updated_count = hot_count = 0

        with connection() as conn:
            settings = conn.execute(
                "SELECT discount_threshold_pct FROM settings WHERE org_id = %s",
                (org_id,),
            ).fetchone()
            threshold = settings["discount_threshold_pct"]
            all_areas = areas_repo.load_areas(conn)
            keywords = load_keywords(conn, org_id)

            from ingest.area_matcher import match_area

            for item in items:
                text = " ".join(filter(None, [
                    item.get("raw_location_text"), item.get("title"),
                ]))
                area_id = match_area(text, all_areas)
                row = to_lead_row(item, org_id, area_id, captured_at)

                lead_id, inserted, previous_price = leads_repo.upsert_lead(conn, row)
                if inserted:
                    new_count += 1
                else:
                    updated_count += 1

                price = row["price"]
                if price is not None and (inserted or previous_price != price):
                    leads_repo.record_price(conn, lead_id, price, captured_at)

                disqualified, category, matched = disqualify_check(
                    row["description"], keywords,
                )
                reason = f"{category}:{matched}" if disqualified else None

                ppsqm = price_per_sqm(price, row["area_sqm_gross"])
                baseline = (
                    areas_repo.get_baseline(conn, area_id, org_id)
                    if area_id else None
                )
                discount = discount_pct(ppsqm, baseline)

                if disqualified:
                    status = "rejected"
                elif is_hot_lead(discount, threshold):
                    status = "hot_lead"
                    hot_count += 1
                    captures_repo.raise_alert(
                        conn, org_id, "hot_lead", "high",
                        f"{discount}% below area baseline: {row['url']}",
                        "sourcing_lead", lead_id,
                    )
                else:
                    status = "evaluating"

                leads_repo.apply_evaluation(
                    conn, lead_id, ppsqm, discount, status, reason,
                )

            captures_repo.record_run(
                conn, org_id, items[0]["portal"], url, len(html),
                len(items), new_count, "ok", None, captured_at,
            )
            conn.commit()

        ping_deadman(config)
        return jsonify({
            "parsed": len(items), "new": new_count, "updated": updated_count,
            "hot_leads": hot_count, "status": "ok",
        })

    return app


if __name__ == "__main__":
    cfg = Config.from_env()
    create_app().run(port=cfg.port)
```

- [ ] **Step 9: Run the endpoint tests**

```bash
pytest tests/test_ingest_listings.py -v
```

Expected: 6 passed.

- [ ] **Step 10: Run the whole suite**

```bash
pytest -v
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add ingest tests/conftest.py tests/test_ingest_listings.py
git commit -m "feat: add /ingest/listings endpoint with evaluation and alerts"
```

---

### Task 11: Migrate the 731 historical listings

**Files:**
- Create: `scripts/migrate_csv.py`
- Test: `tests/test_migrate_csv.py`

**Interfaces:**
- Consumes: `ingest.area_matcher.match_area`, `ingest.repositories.leads.upsert_lead`
- Produces: `scripts.migrate_csv.migrate(csv_path: str, conn, org_id: str) -> dict` returning `{"total": int, "imported": int, "skipped": int, "unmatched_area": int}`

- [ ] **Step 1: Write the failing test**

`tests/test_migrate_csv.py`:

```python
import csv
from pathlib import Path
import pytest
from scripts.migrate_csv import migrate, external_id_from_link

SAMPLE = [
    {
        "portal": "Idealista", "price": "239000.0", "location": "Campo de Ourique",
        "typology": "1", "area_m2": "37.0",
        "link": "https://www.idealista.pt/imovel/34720232/",
        "date": "N/A", "description": "T1 a estrear", "image_url": "http://img/1.jpg",
        "price_per_m2": "6459.0", "avg_zone_price": "6500",
        "discount_pct": "0.6", "is_opportunity": "False",
    },
    {
        "portal": "Idealista", "price": "199500.0", "location": "Sítio Inexistente",
        "typology": "3", "area_m2": "90.0",
        "link": "https://www.idealista.pt/imovel/34873197/",
        "date": "N/A", "description": "Moradia para remodelação total",
        "image_url": "", "price_per_m2": "2217.0", "avg_zone_price": "3000",
        "discount_pct": "26.1", "is_opportunity": "True",
    },
]


@pytest.fixture
def csv_file(tmp_path):
    path = tmp_path / "imoveis.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(SAMPLE[0]), delimiter=";")
        writer.writeheader()
        writer.writerows(SAMPLE)
    return path


def test_external_id_extracted_from_link():
    assert external_id_from_link(
        "https://www.idealista.pt/imovel/34720232/"
    ) == "34720232"


def test_external_id_none_for_unparseable_link():
    assert external_id_from_link("https://mock/1") is None


def test_imports_rows(csv_file, conn, clean_leads):
    result = migrate(str(csv_file), conn, "default-org")
    assert result["total"] == 2
    assert result["imported"] == 2


def test_unmatched_area_is_kept_not_dropped(csv_file, conn, clean_leads):
    migrate(str(csv_file), conn, "default-org")
    row = conn.execute(
        "SELECT area_id, raw_location_text FROM sourcing_leads "
        "WHERE external_id = '34873197'"
    ).fetchone()
    assert row is not None
    assert row["area_id"] is None
    assert row["raw_location_text"] == "Sítio Inexistente"


def test_rerunning_is_idempotent(csv_file, conn, clean_leads):
    migrate(str(csv_file), conn, "default-org")
    migrate(str(csv_file), conn, "default-org")
    count = conn.execute("SELECT count(*) AS n FROM sourcing_leads").fetchone()
    assert count["n"] == 2
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pytest tests/test_migrate_csv.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.migrate_csv'`

- [ ] **Step 3: Write `scripts/migrate_csv.py`**

```python
"""Import the CSV written by the pre-Postgres prototype.

Deliberately does NOT trust the stored price_per_m2 / discount_pct: those
were computed against the hardcoded config.json baselines, which the new
system replaces. They are recomputed once real baselines land.
"""
import argparse
import csv
import logging
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from ingest.area_matcher import match_area
from ingest.db import connection
from ingest.repositories import areas as areas_repo
from ingest.repositories import leads as leads_repo

logger = logging.getLogger("migrate_csv")

ID_RE = re.compile(r"/imovel/(\d+)")
EPOCH = datetime(2020, 1, 1, tzinfo=timezone.utc)


def external_id_from_link(link: str) -> str | None:
    m = ID_RE.search(link or "")
    return m.group(1) if m else None


def _decimal(value: str) -> Decimal | None:
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return None


def migrate(csv_path: str, conn, org_id: str) -> dict:
    all_areas = areas_repo.load_areas(conn)
    total = imported = skipped = unmatched = 0

    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        for record in csv.DictReader(fh, delimiter=";"):
            total += 1
            external_id = external_id_from_link(record.get("link", ""))
            if not external_id:
                skipped += 1
                continue

            location = (record.get("location") or "").strip()
            area_id = match_area(location, all_areas)
            if area_id is None:
                unmatched += 1

            typology = record.get("typology")
            leads_repo.upsert_lead(conn, {
                "org_id": org_id,
                "portal": (record.get("portal") or "").strip().lower(),
                "external_id": external_id,
                "url": record["link"],
                "title": None,
                "description": record.get("description"),
                "price": _decimal(record.get("price", "")),
                "area_sqm_gross": _decimal(record.get("area_m2", "")),
                "typology": int(float(typology)) if typology else None,
                "area_id": area_id,
                "raw_location_text": location or None,
                "image_urls": [record["image_url"]] if record.get("image_url") else [],
                "first_seen_at": EPOCH,
                "last_seen_at": EPOCH,
            })
            imported += 1

    return {
        "total": total, "imported": imported,
        "skipped": skipped, "unmatched_area": unmatched,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/imoveis_extraidos.csv")
    ap.add_argument("--org-id", default="default-org")
    args = ap.parse_args()

    with connection() as conn:
        result = migrate(args.csv, conn, args.org_id)
        conn.commit()
    logger.info(
        "total=%(total)d imported=%(imported)d skipped=%(skipped)d "
        "unmatched_area=%(unmatched_area)d", result,
    )
```

Create an empty `scripts/__init__.py`.

- [ ] **Step 4: Run the tests**

```bash
pytest tests/test_migrate_csv.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Run the real migration**

```bash
python -m scripts.migrate_csv --csv data/imoveis_extraidos.csv
```

Expected: `total=731` with `imported` close to it. Record the `unmatched_area` count — those leads await manual area assignment in the Plan 3 review queue.

- [ ] **Step 6: Sanity-check the result**

```bash
docker compose exec db psql -U houseflip -d houseflip -c \
  "SELECT count(*) total, count(area_id) matched, count(*) - count(area_id) unmatched FROM sourcing_leads;"
```

- [ ] **Step 7: Commit**

```bash
git add scripts tests/test_migrate_csv.py
git commit -m "feat: migrate historical CSV listings into Postgres"
```

---

### Task 12: README and developer setup

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Cover, in this order: prerequisites (Docker Desktop needs VT-x in BIOS plus `wsl --install`; the native `postgresql-x64-18` service must be stopped); `docker compose up -d db`; copying `.env.example` to `.env` and setting `INGEST_SHARED_SECRET`; `cd web && npx prisma migrate deploy && npx prisma db seed`; `pip install -r requirements.txt`; `python -m ingest.app`; `pytest`; and running the CSV migration.

Include a note that `HEALTHCHECK_PING_URL` is optional but strongly recommended, since it is the only mechanism that detects the machine being asleep.

- [ ] **Step 2: Verify from scratch**

```bash
docker compose down -v
docker compose up -d db
cd web && npx prisma migrate deploy && npx prisma db seed && cd ..
pytest -v
```

Expected: clean database, migrations apply, seed runs, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add local setup instructions"
```

---

### Task 13: Imovirtual and OLX parsers

**Files:**
- Create: `ingest/parsers/imovirtual.py`, `ingest/parsers/olx.py`
- Create: `tests/fixtures/imovirtual_search.html`, `tests/fixtures/olx_search.html`
- Modify: `ingest/parsers/__init__.py`
- Test: `tests/test_parsers_imovirtual.py`, `tests/test_parsers_olx.py`

**Interfaces:**
- Consumes: `ingest.parsers.base.ParsedListing`, the `_ROUTES` table in `ingest/parsers/__init__.py`
- Produces: `imovirtual.parse(url, html) -> list[ParsedListing]`, `olx.parse(url, html) -> list[ParsedListing]`

**Why this is separate:** unlike Idealista, the plan does not carry finished
code for these. The implementer derives selectors from the existing
`scrapers/imovirtual.py` and `scrapers/olx.py` and from the fixtures. This
is judgment work, not transcription.

**Reference material:** `scrapers/imovirtual.py` and `scrapers/olx.py` hold
the working selectors from the current system. Note that Imovirtual is a
React app that ships its data in a `__NEXT_DATA__` script tag — parsing that
JSON is likely more robust than DOM selectors. `debug.py` and `debug_pw.py`
record what was already learned about both sites.

**Prerequisite (human step):** fixtures must exist before this task runs.
Capture one search-results page from each portal with the existing
extension or by saving the page from the browser, to
`tests/fixtures/imovirtual_search.html` and `tests/fixtures/olx_search.html`.
If either is missing, report BLOCKED rather than inventing a fixture.

- [ ] **Step 1: Verify both fixtures exist and are non-trivial**

```bash
wc -c tests/fixtures/imovirtual_search.html tests/fixtures/olx_search.html
```

Expected: both well over 10,000 bytes. If either is missing or tiny,
report BLOCKED.

- [ ] **Step 2: Write the failing tests**

Create `tests/test_parsers_imovirtual.py` and `tests/test_parsers_olx.py`,
each mirroring the five assertions in `tests/test_parsers_idealista.py`:
extracts listings; every listing has portal/external_id/url; external_id
is stable and derived from the listing URL; prices are positive `Decimal`s;
and extraction is lossless (no filtering by price or typology).

Set `portal` to `"imovirtual"` and `"olx"` respectively, and assert the URL
prefix matches each portal's domain.

- [ ] **Step 3: Run them and watch them fail**

```bash
pytest tests/test_parsers_imovirtual.py tests/test_parsers_olx.py -v
```

Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement both parsers**

Follow the exact shape of `ingest/parsers/idealista.py`: module-level
`logger`, a `_to_decimal` helper, `parse(url, html) -> list[ParsedListing]`,
a `try`/`except` around each card with `logger.exception`, and a final
`logger.info` reporting the count. **No filtering by price, typology or
location** — extraction is lossless, exactly as in Task 9.

- [ ] **Step 5: Run the tests**

```bash
pytest tests/test_parsers_imovirtual.py tests/test_parsers_olx.py -v
```

Expected: all pass.

- [ ] **Step 6: Register both in the router**

In `ingest/parsers/__init__.py`, import the two modules and add
`("imovirtual.com", imovirtual.parse)` and `("olx.pt", olx.parse)` to
`_ROUTES`. Extend `tests/test_parsers_router.py` with a routing assertion
for each.

- [ ] **Step 7: Run the whole suite**

```bash
pytest -v
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add ingest/parsers tests/fixtures tests/test_parsers_imovirtual.py tests/test_parsers_olx.py tests/test_parsers_router.py
git commit -m "feat: add Imovirtual and OLX parsers"
```

---

## Plan Self-Review

**Spec coverage:**

| Spec element | Task |
|---|---|
| D6 Docker Postgres, native service disabled | 1 |
| D7 Prisma owns DDL | 2, 3 |
| D9 global areas/baselines | 2 |
| D13 duplicate view | 3 |
| pg_trgm indexes | 1, 3 |
| Configurable thresholds | 2, 4, 8 |
| Keywords out of source | 4, 7 |
| Shared secret + reject logging | 5 |
| Area alias matching | 6 |
| Lossless extraction | 9 |
| `(portal, external_id)` dedupe | 10 |
| `lead_price_history` | 10 |
| parser_health alert | 10 |
| D12 dead-man's-switch | 10 |
| CSV migration, unmatched kept | 11 |
| README | 12 |

**Deferred to Plans 2 and 3, by design:** `capture_queue`, `lead_photos`, `/ingest/detail`, `/ingest/baselines`, `saved_searches` API, extension automation, the staleness alert job, and all UI.

**Known gap:** with no `area_price_baselines` rows until Plan 2 ingests idealista reports, `get_baseline` returns `None`, so `discount_pct` is `None` and nothing is flagged hot. This is correct — the old hardcoded numbers are deliberately not carried over — but it means hot-lead detection is inert until Plan 2 or a manual `org_area_overrides` row exists. Task 10's tests do not depend on baselines being present.
