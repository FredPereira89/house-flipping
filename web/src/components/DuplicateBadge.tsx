/**
 * Read-only surfacing of the `v_lead_duplicate_groups` SQL view (D13). This
 * badge only informs a human reviewer that another lead in the same org
 * looks like the same property listed elsewhere (same area/typology/area
 * bucket/price bucket) — it never merges, hides, or mutates any row. Any
 * dedup action stays a manual decision outside this component.
 */
export default function DuplicateBadge() {
  return (
    <span
      className="badge badge--duplicate"
      title="Another lead in your pipeline looks like the same property (matched by area, typology, size, and price). Nothing has been merged — review manually."
    >
      Possible duplicate
    </span>
  );
}
