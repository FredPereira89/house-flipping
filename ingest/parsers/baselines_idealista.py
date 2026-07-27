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
    """
    soup = BeautifulSoup(html, "html.parser")
    price_tag = soup.select_one(".price-evolution .price")
    if not price_tag:
        logger.warning(
            "Baseline parse found no '.price-evolution .price' element for %s", url
        )
        return None

    # Idealista renders euro amounts with '.' as a thousands separator and
    # ',' as the decimal separator (e.g. "2.345,67 EUR/m2"). Stripping
    # everything but digits and commas removes the thousands dot and any
    # currency/unit text, then the remaining comma is swapped for a dot so
    # Decimal() parses it correctly.
    price_text = re.sub(r"[^\d,]", "", price_tag.text).replace(",", ".")
    if not price_text:
        logger.warning(
            "Baseline parse found a '.price-evolution .price' element with no "
            "usable digits for %s: %r", url, price_tag.text,
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
