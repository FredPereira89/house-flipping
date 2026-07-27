import logging
import re
from decimal import Decimal, InvalidOperation

from bs4 import BeautifulSoup

logger = logging.getLogger("ingest.parsers.baselines_idealista")


def parse_baselines(url: str, html: str) -> Decimal | None:
    """Extract the asking-price-per-sqm figure from an Idealista market
    "estatisticas-imobiliarias" (price-report) page.

    UNVERIFIED SELECTOR -- ``.price-evolution .price`` is the best guess
    available from the Plan 2 brief, not a value confirmed against a real
    capture. Nobody on this project has ever captured a genuine Idealista
    price-report page: tests/fixtures/idealista_search.html is a real
    capture, but of a *search-results* page, which tells us nothing about
    this page type's DOM. This is the same class of mistake this project
    hit before with debug_page.html being assumed to be a page it wasn't.
    Check this selector against a real captured price-report page before
    trusting this endpoint in production (see task-4-report.md).

    The number-extraction below is anchored to the leading numeric run of
    the tag's text (fix round 1, see task-4-report.md) rather than
    stripping non-digit characters from the whole tag text, which fixes a
    reproducible corruption bug (a trailing unit suffix like a literal
    "m2" could bleed a digit into the parsed price) -- but this still only
    narrows how the number is read out of whatever text is there. It does
    NOT verify that real Idealista markup actually puts the number where
    this function assumes it is; that remains unconfirmed along with the
    selector itself.
    """
    soup = BeautifulSoup(html, "html.parser")
    price_tag = soup.select_one(".price-evolution .price")
    if not price_tag:
        logger.warning(
            "Baseline parse found no '.price-evolution .price' element for %s", url
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
    # to the leading run assumes the number leads the tag's text -- no more
    # of an assumption about the real (still unverified -- see the
    # docstring above) Idealista markup than the original whole-text
    # approach already made.
    stripped_text = price_tag.text.strip()
    leading_number = re.match(r"[\d.,]+", stripped_text)
    if not leading_number:
        logger.warning(
            "Baseline parse found a '.price-evolution .price' element with no "
            "leading numeric text for %s: %r", url, stripped_text,
        )
        return None

    # Within that leading run, the thousands dot is dropped and the
    # decimal comma is converted to a dot so Decimal() parses it correctly.
    price_text = re.sub(r"[^\d,]", "", leading_number.group(0)).replace(",", ".")
    if not price_text:
        logger.warning(
            "Baseline parse found a '.price-evolution .price' element with no "
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
