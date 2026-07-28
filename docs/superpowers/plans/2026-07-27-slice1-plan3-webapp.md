# Slice 1, Plan 3: Next.js Web App (Leads, Triage, Admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js front-end for the House Flipping Pipeline. This provides a UI to authenticate, triage property leads, resolve missing areas, review hot leads, manage saved searches, and configure org settings.

**Spec:** `docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md`

## AMENDMENT (Claude review, 2026-07-28)

Reviewed against the design spec (`docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md`)
and `web/prisma/schema.prisma`. Approved to proceed with the following
corrections folded in — these are real defects/gaps, not style
preferences, so implementers should treat them as part of the task spec:

1. **Org-scoping is not optional and is missing from every task below.**
   The spec is explicit: "every tenant-owned table carries `org_id`,
   enforced at the Prisma query layer" (design spec §5). `SourcingLead`,
   `SavedSearch`, `Settings`, `DisqualifyKeyword`, `LeadPhoto` (via its
   lead), `LeadPriceHistory` (via its lead) are all tenant-owned. Every
   Prisma query in Tasks 2–4 MUST filter by `session.user.orgId` (or join
   through a relation that does), even though there is only one org today.
   `Area`/`AreaPriceBaseline` remain global per D9 — do not scope those.
   Add `orgId` to the session/JWT callback in Task 1 so it's available to
   every server component/route without a second DB round-trip.

2. **Task 3 Step 1's "use the AI image generation tool to create realistic
   mockups" for missing photos is struck.** No such tool is available in
   this environment, and more importantly it violates this project's own
   synthetic-fixture convention (§9 of HANDOFF.md / the `_synthetic.html`
   fixture naming rule established in Plan 2): a photorealistic fake
   property photo generated to look real is exactly the kind of thing that
   gets mistaken for genuine captured data later. Use a plain, obviously-a-
   placeholder graphic (e.g. a flat "no photo available" SVG/icon) when a
   lead has zero `LeadPhoto` rows. Never fabricate photos that could pass
   as real listing photos.

3. **Photo-serving path resolution (Task 3 Step 1).** `ingest/routes_detail.py`
   writes `LeadPhoto.localPath` as `data/photos/{leadId}/{idx}.jpg` relative
   to the repo root (where the Python ingest service runs from), NOT
   relative to `web/`. A Next.js API route resolving this path needs to
   join it against the repo root explicitly (e.g. `path.join(process.cwd(),
   "..", "data", "photos", ...)` from `web/`, or better, a single
   `DATA_DIR` constant computed once) — a naive relative read will silently
   404 or resolve to the wrong directory. Also: build the path from the
   `leadId` + `position` looked up via Prisma (scoped to the session's org
   through the lead), never from a raw path segment taken directly off the
   request, to avoid path traversal.

4. **Auth secret.** Auth.js/NextAuth needs an `AUTH_SECRET` (or
   `NEXTAUTH_SECRET`) env var. Per the standing project rule, no agent may
   create or read `.env*` files. Task 1's implementer should tell the user
   what key to add to `web/.env` and let the user add it themselves, not
   attempt to write it.

---

## File Structure Additions

```text
web/src/app/layout.tsx                  Global layout & navigation sidebar
web/src/app/page.tsx                    Dashboard / Leads List (default view)
web/src/app/leads/[id]/page.tsx         Property detail view (photos, history)
web/src/app/triage/page.tsx             Review Queue (area_id IS NULL)
web/src/app/admin/settings/page.tsx     Settings & Disqualify Keywords
web/src/app/admin/searches/page.tsx     Saved Searches CRUD
web/src/app/api/auth/[...nextauth]/route.ts Auth.js endpoints
web/src/components/ui/*                 Reusable UI components (Tailwind)
```

---

### Task 0: Scaffold Next.js App & Dependencies

**Files:** 
- Modify: `web/package.json`
- Create: `web/next.config.js`, `web/src/app/globals.css`

**Goal:** Initialize the Next.js app (App Router) in the `web` directory. Use **Vanilla CSS** instead of Tailwind, leveraging modern CSS features (CSS Nesting, `oklch` colors, Container Queries) to ensure maximum flexibility and performance.

- [ ] **Step 1: Install Dependencies**
  Run `npm install next react react-dom next-auth @prisma/client` and `npm install -D typescript @types/node @types/react`. Do NOT install Tailwind.
- [ ] **Step 2: Setup Vanilla CSS Base & Design System**
  Create `web/src/app/globals.css` and define your core design tokens. Use modern CSS features like CSS custom properties, Oklch colors, and CSS nesting.
  **Design Requirements:** Include a modern typography font (e.g. Inter, Roboto, or Outfit from Google Fonts). Define curated, harmonious color palettes including a sleek dark mode. Integrate smooth gradients, glassmorphism, and micro-animations to achieve a premium, dynamic feel.
- [ ] **Step 3: Setup Prisma Client**
  Generate the client: `npx prisma generate` inside `web/`.
- [ ] **Step 4: Commit**
  `git commit -m "chore: scaffold next.js app with vanilla css and prisma client"`

---

### Task 1: Authentication & Layout Foundation

**Files:**
- Create: `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/lib/auth.ts`, `web/src/app/layout.tsx`, `web/src/components/Sidebar.tsx`

**Goal:** Implement NextAuth using the Prisma Adapter (tables already exist) and build a global authenticated layout with a sidebar.

- [ ] **Step 1: NextAuth Configuration**
  Create `web/src/lib/auth.ts` configuring NextAuth with `PrismaAdapter`. Use a simple Credentials provider for MVP (validating against `User.passwordHash`) or standard email/magic-link if preferred.
- [ ] **Step 2: Global Layout, Sidebar & SEO**
  Create `web/src/components/Sidebar.tsx` with links to "Dashboard/Leads", "Triage (Missing Areas)", "Saved Searches", and "Settings". Ensure the layout and pages include proper Title Tags, Meta Descriptions, and semantic HTML5 elements. All interactive elements must have unique, descriptive IDs for browser testing.
- [ ] **Step 3: Auth Guard**
  Ensure that all routes under `/` require a valid session, redirecting to `/api/auth/signin` otherwise.
- [ ] **Step 4: Commit**
  `git commit -m "feat: setup nextauth and global layout with sidebar"`

---

### Task 2: The Leads Dashboard & Triage UI

**Files:**
- Create: `web/src/app/page.tsx`, `web/src/app/triage/page.tsx`, `web/src/components/LeadCard.tsx`, `web/src/components/DuplicateBadge.tsx`

**Goal:** A read-mostly view of `sourcing_leads`. Filter by `status` (hot_lead vs evaluating). Implement the triage view for unmatched areas.

- [ ] **Step 1: Main Leads List**
  In `web/src/app/page.tsx`, fetch `SourcingLead` from Prisma. Display as a grid/list. 
  *Highlight `hot_lead`s visually.* Include Price, €/m², Discount %, and Area. Ensure hover effects and interactive micro-animations are used on the `LeadCard` to make the UI feel alive and responsive. Avoid generic colors.
- [ ] **Step 2: Duplicate Clustering Badge**
  Query the `v_lead_duplicate_groups` SQL view. If a lead belongs to a group with >1 entry, render a `<DuplicateBadge />` on the `LeadCard`.
- [ ] **Step 3: Triage UI (Missing Areas)**
  In `web/src/app/triage/page.tsx`, fetch leads where `areaId IS NULL`. Provide a native `<dialog>` or use the HTML **Popover API** (`popover` / `popovertarget`) to render the manual assignment dropdown without heavy JS state. When assigned, an API route should update the lead AND append the `rawLocationText` to the `Area.aliases` array to "learn" it.
- [ ] **Step 4: Commit**
  `git commit -m "feat: implement leads dashboard and missing area triage ui"`

---

### Task 3: Property Details View

**Files:**
- Create: `web/src/app/leads/[id]/page.tsx`, `web/src/components/PhotoCarousel.tsx`, `web/src/components/PriceHistoryGraph.tsx`

**Goal:** A deep-dive page for a single lead, showing high-res photos, full description, and price history.

- [ ] **Step 1: Lead Data & Photos**
  Fetch the `SourcingLead` along with its `LeadPhoto` relation (ordered by `position`). Render a `PhotoCarousel`. **Do not use a heavy JS carousel library**; implement this using native **CSS Scroll Snapping** (`scroll-snap-type: x mandatory`). Serve images from `/data/photos/` via a Next.js API route. Use the **View Transitions API** to create a seamless transition from the lead thumbnail in the dashboard to the large photo in the detail view. **Never use placeholder images;** if real images are missing during development, use the AI image generation tool (`generate_image`) to create realistic mockups.
- [ ] **Step 2: Price History**
  Fetch the `LeadPriceHistory` relation. Render a simple line graph showing price changes over time.
- [ ] **Step 3: Baseline Comparison**
  Show the lead's `pricePerSqm` against the `AreaPriceBaseline` for its area and month.
- [ ] **Step 4: Commit**
  `git commit -m "feat: property details page with photos and price history"`

---

### Task 4: Settings, Admin, and Alerts

**Files:**
- Create: `web/src/app/admin/settings/page.tsx`, `web/src/app/admin/searches/page.tsx`, `web/src/app/alerts/page.tsx`

**Goal:** CRUD interfaces for the system's driving configuration.

- [ ] **Step 1: Settings & Keywords**
  In `web/src/app/admin/settings/page.tsx`, create a form to update `Settings` (discount threshold, max price, min typology, staleness threshold). Add a list manager to add/remove `DisqualifyKeyword`s. Use native HTML form validation and the CSS `:user-invalid` pseudo-class for validation feedback.
- [ ] **Step 2: Saved Searches CRUD**
  In `web/src/app/admin/searches/page.tsx`, allow adding new Idealista/Imovirtual URLs to `SavedSearch`. Use the **Native Popover API** (`popover` / `popovertarget`) or `<dialog>` element (with declarative `closedby` and light-dismiss features) for the "Add New Search" modal.
- [ ] **Step 3: Alerts View**
  In `web/src/app/alerts/page.tsx`, fetch and display the `Alert` table (e.g., `parser_health`, `staleness`). Allow marking them as resolved/dismissed.
- [ ] **Step 4: Commit**
  `git commit -m "feat: admin ui for settings, searches, keywords, and alerts"`

---

### Open Questions (For User / Next Phase)
- **Image Serving:** Since `lead_photos` are saved locally outside of `web/public`, should we set up a dedicated static file server, or just stream them through a Next.js API route (`/api/photos/[leadId]/[idx]`)?
- **AI Triage Integration:** When the AI evaluates photos for renovation condition (Module B), where should that score live on the Details UI?
- **Auth Seed:** Do we need a script to seed the first `User` with a password hash so we can log in, or will we rely on a magic link/OAuth setup?
