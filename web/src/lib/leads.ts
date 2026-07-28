const TITLE_FALLBACK_LENGTH = 80;

/** Some sources (the historical CSV migration) never had a distinct title
 * field, only a raw scraped description blob. Falling back to a truncated
 * description is more useful than a bare "Untitled listing" placeholder,
 * and it's still real captured text, not a fabricated title. */
export function displayTitle(lead: {
  title: string | null;
  description: string | null;
}) {
  if (lead.title) return lead.title;
  if (lead.description) {
    const normalized = lead.description.replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized.length > TITLE_FALLBACK_LENGTH
        ? `${normalized.slice(0, TITLE_FALLBACK_LENGTH)}…`
        : normalized;
    }
  }
  return "Untitled listing";
}
