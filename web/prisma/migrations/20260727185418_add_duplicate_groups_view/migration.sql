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