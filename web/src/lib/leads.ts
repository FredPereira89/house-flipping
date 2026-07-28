const TITLE_FALLBACK_LENGTH = 80;

// Idealista's scraped card template always leads with a photo counter
// ("1/ 20"), sometimes followed by a generic map disclaimer ("Localização
// aproximada.") before any listing-specific text -- the two don't always
// both appear, so they're stripped independently. Harmless no-op for any
// description that doesn't start with either.
const PHOTO_COUNTER_RE = /^\d+\s*\/\s*\d+\s*/;
const MAP_DISCLAIMER_RE = /^localiza[çc][ãa]o aproximada\.\s*/i;

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
    const normalized = lead.description
      .replace(/\s+/g, " ")
      .trim()
      .replace(PHOTO_COUNTER_RE, "")
      .replace(MAP_DISCLAIMER_RE, "");
    if (normalized) {
      return normalized.length > TITLE_FALLBACK_LENGTH
        ? `${normalized.slice(0, TITLE_FALLBACK_LENGTH)}…`
        : normalized;
    }
  }
  return "Untitled listing";
}
