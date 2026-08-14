import unicodedata

# The 18 municípios of the Área Metropolitana de Lisboa -- this tool's
# actual sourcing/flipping scope. Areas outside AML only exist to supply
# comparison baseline prices (see HANDOFF.md §4d) and were seeded from a
# nationwide administrative dataset whose freguesia names collide with
# AML ones (e.g. "Alvalade" exists in both Lisboa and Santiago do Cacém).
# Portal listing text never states the concelho, so an alias tie can't be
# broken from context -- we break it by preferring the AML area, since
# that's overwhelmingly where real listings for this tool come from.
# Keep in sync with AML_MUNICIPALITIES in
# web/scripts/seed_regional_baseline_areas.js.
AML_MUNICIPALITIES = {
    "Alcochete", "Almada", "Amadora", "Barreiro", "Cascais", "Lisboa",
    "Loures", "Mafra", "Moita", "Montijo", "Odivelas", "Oeiras", "Palmela",
    "Seixal", "Sesimbra", "Setúbal", "Sintra", "Vila Franca de Xira",
}


def normalize_text(s: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace, collapse hyphen
    spacing.

    Portal text is inconsistent about accents ("Sao" vs "São"), so all
    matching happens in this normalized space. It's also inconsistent about
    hyphen spacing for compound freguesia names -- the same real Idealista
    page uses a bare hyphen for some names ("Algirão-Mem Martins" in this
    project's own stored alias, from config.json) and a spaced hyphen for
    others ("Algueirão - Mem Martins", confirmed live on Idealista's own
    Sintra freguesia list) -- and there's no reliable way to know in
    advance which one a given stored alias or a given ad's text will use.
    Collapsing " - " to "-" here makes both sides equivalent regardless.
    """
    if not s:
        return ""
    decomposed = unicodedata.normalize("NFKD", s)
    stripped = decomposed.encode("ASCII", "ignore").decode("utf-8")
    normalized = " ".join(stripped.lower().split())
    return normalized.replace(" - ", "-")


def _best_match_in(haystack: str, areas: list[dict]) -> str | None:
    """Longest-alias-wins search within a single haystack string. Shared
    core of match_area() -- see there for the tie-break rationale."""
    best_id: str | None = None
    best_len = 0
    best_is_aml = False
    for area in areas:
        is_aml = area.get("municipality") in AML_MUNICIPALITIES
        for alias in area.get("aliases", []):
            needle = normalize_text(alias)
            if not needle or needle not in haystack:
                continue
            if len(needle) > best_len or (
                len(needle) == best_len and is_aml and not best_is_aml
            ):
                best_id = area["id"]
                best_len = len(needle)
                best_is_aml = is_aml
    return best_id


def match_area(text: str, areas: list[dict]) -> str | None:
    """Return the area_id whose alias best matches `text`, else None.

    Longest alias wins: "Benfica" is a substring of "São Domingos de
    Benfica", and matching the short one would misfile the lead. On a
    length tie between two areas with the identical freguesia name in
    different concelhos (e.g. "São Sebastião" in both Setúbal and Rio
    Maior), the AML area wins -- see AML_MUNICIPALITIES above.

    Idealista's own card/address text is consistently
    "{street/neighbourhood details}, {freguesia}" -- the real freguesia is
    reliably the LAST comma-separated segment (confirmed across many real
    captures: "...Prazeres, Estrela" -> Estrela; "...Centro Histórico, São
    Sebastião" -> São Sebastião). "Longest alias wins" alone breaks when a
    STREET NAME earlier in the text coincidentally contains a longer,
    unrelated area's alias than the real (shorter) freguesia at the end --
    real bug: "Rua de Santo António, 6, Riachos" matched Lisboa's
    "Santo António" (13 chars) over the correct, shorter "Riachos" (7
    chars), which is right there in the text.

    So: when a comma is present, match ONLY within the last segment --
    and trust that completely, including when it finds nothing. A second
    real bug is why this does NOT fall back to whole-text matching on a
    miss: "Rua de São Vicente, a dos Francos" is a real Caldas da Rainha
    (Leiria) address, a district this project has never seeded any area
    data for at all -- there is no correct match, full stop. Falling back
    to whole-text search in that case doesn't recover anything; it just
    re-finds the same kind of coincidental street-name substring
    ("São Vicente", from "Rua de São Vicente") that this whole fix exists
    to avoid trusting. A last segment that doesn't match anything is
    itself the signal that this listing is out of this project's known
    area coverage -- returning None (unmatched, no baseline, never a
    false hot_lead) is the correct, safe outcome, not a guess.
    """
    haystack = normalize_text(text)
    if not haystack:
        return None

    if "," in haystack:
        last_segment = haystack.rsplit(",", 1)[1].strip()
        return _best_match_in(last_segment, areas) if last_segment else None

    return _best_match_in(haystack, areas)
