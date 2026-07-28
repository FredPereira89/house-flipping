import logging
import re
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup
from ingest.parsers.base import ParsedListing

logger = logging.getLogger("ingest.parsers.olx")

ID_RE = re.compile(r"-ID([a-zA-Z0-9]+)\.html")


def _to_decimal(text: str) -> Decimal | None:
    cleaned = (
        text.replace("€", "")
        .replace(".", "")
        .replace(",", ".")
        .replace("\xa0", "")
        .replace(" ", "")
        .strip()
    )
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _first_int(text: str) -> int | None:
    m = re.search(r"\d+", text or "")
    return int(m.group()) if m else None


def parse(url: str, html: str) -> list[ParsedListing]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[ParsedListing] = []

    for card in soup.find_all("div", {"data-cy": "l-card"}):
        try:
            link_el = card.find("a")
            if not link_el or not link_el.get("href"):
                continue
            href = link_el["href"]
            
            # Fix URL prefix if relative
            full_url = href if href.startswith("http") else f"https://www.olx.pt{href}"

            id_match = ID_RE.search(href)
            if not id_match:
                continue

            external_id = id_match.group(1)

            title_el = card.find("h4")
            title = title_el.text.strip() if title_el else None

            price_el = card.find("p", {"data-testid": "ad-price"})
            price = _to_decimal(price_el.text) if price_el else None

            loc_el = card.find("p", {"data-testid": "location-date"})
            location = loc_el.text.strip() if loc_el else None
            
            # Try to get typology from title
            typology = None
            if title:
                typ_match = re.search(r"(?i)\bt(\d+)\b", title)
                if typ_match:
                    typology = int(typ_match.group(1))

            description = card.get_text(separator=" ").strip()

            area_sqm_gross = None
            area_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m\^2)", description, re.IGNORECASE)
            if area_match:
                area_sqm_gross = _to_decimal(area_match.group(1))

            image_urls = []
            img = card.find("img")
            if img and img.get("src"):
                image_urls.append(img["src"])

            results.append(
                ParsedListing(
                    portal="olx",
                    external_id=external_id,
                    url=full_url,
                    title=title,
                    description=description,
                    price=price,
                    area_sqm_gross=area_sqm_gross,
                    typology=typology,
                    raw_location_text=location,
                    image_urls=image_urls,
                )
            )
        except Exception:
            logger.exception("Failed to extract an OLX card")

    logger.info("OLX: extracted %d listings from %s", len(results), url)
    return results
