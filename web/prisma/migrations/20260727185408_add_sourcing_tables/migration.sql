-- CreateTable
CREATE TABLE "sourcing_leads" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "area_sqm_gross" DECIMAL(10,2),
    "area_sqm_useful" DECIMAL(10,2),
    "land_area_sqm" DECIMAL(10,2),
    "typology" INTEGER,
    "area_id" TEXT,
    "raw_location_text" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "price_per_sqm_gross" DECIMAL(12,2),
    "price_per_sqm_useful" DECIMAL(12,2),
    "discount_pct" DECIMAL(6,2),
    "status" TEXT NOT NULL DEFAULT 'evaluating',
    "disqualified_at" TIMESTAMP(3),
    "disqualify_reason" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sourcing_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_price_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "observed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tags" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "resolved_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "portal" TEXT,
    "url" TEXT NOT NULL,
    "html_bytes" INTEGER NOT NULL,
    "items_parsed" INTEGER NOT NULL DEFAULT 0,
    "items_new" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sourcing_leads_org_id_status_idx" ON "sourcing_leads"("org_id", "status");

-- CreateIndex
CREATE INDEX "sourcing_leads_org_id_area_id_idx" ON "sourcing_leads"("org_id", "area_id");

-- CreateIndex
CREATE INDEX "sourcing_leads_area_id_idx" ON "sourcing_leads"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "sourcing_leads_org_id_portal_external_id_key" ON "sourcing_leads"("org_id", "portal", "external_id");

-- CreateIndex
CREATE INDEX "lead_price_history_lead_id_observed_at_idx" ON "lead_price_history"("lead_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_tags_lead_id_tag_key" ON "lead_tags"("lead_id", "tag");

-- CreateIndex
CREATE INDEX "alerts_org_id_type_resolved_at_idx" ON "alerts"("org_id", "type", "resolved_at");

-- CreateIndex
CREATE INDEX "capture_runs_org_id_created_at_idx" ON "capture_runs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "capture_runs_org_id_status_idx" ON "capture_runs"("org_id", "status");

-- AddForeignKey
ALTER TABLE "sourcing_leads" ADD CONSTRAINT "sourcing_leads_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_price_history" ADD CONSTRAINT "lead_price_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "sourcing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "sourcing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
