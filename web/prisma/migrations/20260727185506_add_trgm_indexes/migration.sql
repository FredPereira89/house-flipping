-- GIN trigram indexes for fuzzy text search on sourcing_leads.
-- Requires pg_trgm extension (created in db/init/01-extensions.sql).
CREATE INDEX sourcing_leads_description_trgm
    ON sourcing_leads USING gin (description gin_trgm_ops);
CREATE INDEX sourcing_leads_title_trgm
    ON sourcing_leads USING gin (title gin_trgm_ops);
CREATE INDEX sourcing_leads_raw_location_trgm
    ON sourcing_leads USING gin (raw_location_text gin_trgm_ops);