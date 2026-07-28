const TITLE_FALLBACK_LENGTH = 80;

// Idealista's scraped card template always leads with a photo counter
// ("1/ 20"), sometimes followed by a generic map disclaimer ("Localização
// aproximada.") before any listing-specific text -- the two don't always
// both appear, so they're stripped independently. Harmless no-op for any
// description that doesn't start with either.
const PHOTO_COUNTER_RE = /^\d+\s*\/\s*\d+\s*/;
const MAP_DISCLAIMER_RE = /^localiza[çc][ãa]o aproximada\.\s*/i;
const TRAILING_NUMERIC_FRAGMENT_RE = /(?:\s+[\d.,€$]+)+$/;

// Idealista's scraped card also carries its own action-button row
// ("Contactar Ligar Ver telefone Excluir Guardar" -- Contact/Call/See
// phone/Delete/Save) glued onto the end of the description text. These are
// unambiguously UI controls, never listing content, so they're stripped
// wherever they appear as this exact trailing sequence; anything else in
// the description (including a genuine "Para investimento" tag just before
// it) is left untouched.
const TRAILING_CTA_ROW_RE =
  /\s*Contactar\s+Ligar\s+Ver telefone\s+Excluir\s+Guardar\s*$/i;

/** A hard character-count cutoff regularly landed mid-number or mid-word
 * (e.g. "...Campo de Ourique 239.00…") -- reads as corrupted data rather
 * than a truncated one. Cuts at the last whitespace boundary within the
 * limit instead, then also drops a trailing numeric-only fragment (a lone
 * cut-off price/area number is still confusing even at a word boundary). */
function truncateAtWordBoundary(text: string, limit: number): string {
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const atWordBoundary = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return atWordBoundary.replace(TRAILING_NUMERIC_FRAGMENT_RE, "").trimEnd();
}

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
        ? `${truncateAtWordBoundary(normalized, TITLE_FALLBACK_LENGTH)}…`
        : normalized;
    }
  }
  return "Untitled listing";
}

/** Presentation-only cleanup for the Description section on the lead
 * detail page. Collapses runs of spaces/tabs (the CSV migration's raw
 * scraped text carries irregular multi-space gaps that `white-space:
 * pre-wrap` renders literally) without touching real newlines, so
 * multi-paragraph descriptions parsed live from a detail page keep their
 * blank-line structure. Strips the trailing action-button row. Never
 * mutates the stored `description` -- same raw-in/clean-display split as
 * `displayTitle()` above. */
export function cleanDescription(description: string): string {
  return description
    .replace(/[ \t]+/g, " ")
    .replace(TRAILING_CTA_ROW_RE, "")
    .trim();
}
