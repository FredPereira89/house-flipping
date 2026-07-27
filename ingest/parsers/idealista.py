import logging
import re
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup
from ingest.parsers.base import ParsedListing

logger = logging.getLogger("ingest.parsers.idealista")

BASE_URL = "https://www.idealista.pt"
ID_RE = re.compile(r"/imovel/(\d+)")


def _to_decimal(text: str) -> Decimal | None:
    cleaned = (
        text.replace("€", "")
        .replace(".", "")
        .replace("\xa0", "")
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
    """Extract every listing card. No filtering — see Task 9 note."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[ParsedListing] = []

    for article in soup.find_all("article", class_="item"):
        try:
            link_el = article.find("a", class_="item-link")
            if not link_el or not link_el.get("href"):
                continue
            href = link_el["href"]
            id_match = ID_RE.search(href)
            if not id_match:
                continue

            price_el = article.find("span", class_="item-price")
            price = _to_decimal(price_el.text) if price_el else None

            details = article.find_all("span", class_="item-detail")
            typology = _first_int(details[0].text) if details else None
            area = (
                Decimal(str(_first_int(details[1].text)))
                if len(details) > 1 and _first_int(details[1].text)
                else None
            )

            image_urls: list[str] = []
            picture = article.find("picture")
            if picture:
                img = picture.find("img")
                if img and img.get("src"):
                    image_urls.append(img["src"])

            results.append(
                ParsedListing(
                    portal="idealista",
                    external_id=id_match.group(1),
                    url=href if href.startswith("http") else f"{BASE_URL}{href}",
                    title=link_el.text.strip() if link_el.text else None,
                    description=article.get_text(separator=" ").strip() or None,
                    price=price,
                    area_sqm_gross=area,
                    typology=typology,
                    raw_location_text=link_el.text.strip() if link_el.text else None,
                    image_urls=image_urls,
                )
            )
        except Exception:
            logger.exception("Failed to extract an Idealista card")

    logger.info("Idealista: extracted %d listings from %s", len(results), url)
    return results
