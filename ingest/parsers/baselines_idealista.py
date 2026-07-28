import logging
import re
import unicodedata
from decimal import Decimal, InvalidOperation

from bs4 import BeautifulSoup

logger = logging.getLogger("ingest.parsers.baselines_idealista")

# The current-price item is the one whose <span> label starts with "Preço"
# ("Preço do m2, <area> a <month>"); the other .current-values-list__item
# siblings on the same page are month-over-month/year-over-year evolution
# percentages ("Evolução em relação a <month>"), not the price. Matching by
# label rather than taking the first .current-values-list__item strong
# (document order) matters because both shapes are '<strong>' tags inside
# the same repeated card structure -- relying on order would silently start
# reading an evolution percentage as the price if Idealista ever reorders
# the cards.
_PRICE_LABEL_PREFIX = "preco"

# Sentinel returned when the page parsed cleanly but showed "N/A" for this
# area (a successful capture with no data to insert) -- distinct from the
# parse-failure `None`. Imported by routes_baselines.py rather than
# duplicated so the two modules can't drift on what the sentinel value is.
NO_DATA_SENTINEL = Decimal("-1")


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).strip().lower()


def parse_baselines(url: str, html: str) -> Decimal | None:
    """Extract the asking-price-per-sqm figure from an Idealista market
    "relatorios-preco-habitacao" (price-report) page.

    Selector verified against a real captured page
    (tests/fixtures/real_idealista_baseline.html, captured from
    https://www.idealista.pt/media/relatorios-preco-habitacao/venda/lisboa/lisboa/):
    the page repeats the same `.current-values-list__item` card shape for
    the current price AND for several evolution percentages, so the price
    card is identified by its `<span>` label ("Preço do m2, ...") rather
    than by position.

    The number-extraction below is anchored to the leading numeric run of
    the tag's text rather than stripping non-digit characters from the
    whole tag text, which avoids a reproducible corruption bug (a trailing
    unit suffix like a literal "m2" could bleed a digit into the parsed
    price, e.g. "3.000,00 EUR/m2" -> "3000.002" instead of "3000.00").
    """
    soup = BeautifulSoup(html, "html.parser")

    price_tag = None
    for item in soup.select(".current-values-list__item"):
        label = item.select_one("span")
        if label and _normalize(label.get_text()).startswith(_PRICE_LABEL_PREFIX):
            price_tag = item.select_one("strong")
            break

    if not price_tag:
        logger.warning(
            "Baseline parse found no '.current-values-list__item' with a "
            "'Preço' label for %s", url
        )
        return None

    # Idealista renders euro amounts with '.' as a thousands separator and
    # ',' as the decimal separator (e.g. "2.345,67 EUR/m2"). Anchor to the
    # LEADING numeric run (digits/dots/commas from the start of the trimmed
    # text) rather than stripping non-digit characters from the whole tag
    # text: trailing currency/unit text can itself contain a bare ASCII
    # digit (e.g. a literal "m2" instead of the superscript "m²"),
    # which a whole-text strip would silently fold into the parsed number
    # (e.g. "3.000,00 EUR/m2" -> "3000.002" instead of "3000.00"). Anchoring
    # to the leading run assumes the number leads the tag's text, which
    # holds for the real captured page this parser is verified against.
    stripped_text = price_tag.text.strip()
    if stripped_text.upper() == "N/A":
        return NO_DATA_SENTINEL

    leading_number = re.match(r"[\d.,]+", stripped_text)
    if not leading_number:
        logger.warning(
            "Baseline parse found a price element with no "
            "leading numeric text for %s: %r", url, stripped_text,
        )
        return None

    # Within that leading run, the thousands dot is dropped and the
    # decimal comma is converted to a dot so Decimal() parses it correctly.
    price_text = re.sub(r"[^\d,]", "", leading_number.group(0)).replace(",", ".")
    if not price_text:
        logger.warning(
            "Baseline parse found a price element with no "
            "usable digits for %s: %r", url, stripped_text,
        )
        return None

    try:
        return Decimal(price_text)
    except InvalidOperation:
        logger.warning(
            "Baseline parse could not convert %r to a Decimal for %s",
            price_text, url,
        )
        return None
