import logging
import re
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup
from ingest.parsers.base import ParsedListing

logger = logging.getLogger("ingest.parsers.imovirtual")

ID_RE = re.compile(r"-ID([a-zA-Z0-9]+)(?:\.html)?")

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
    
    for article in soup.find_all("article"):
        try:
            link_el = article.find("a")
            if not link_el or not link_el.get("href"):
                continue
            href = link_el["href"]
            id_match = ID_RE.search(href)
            if not id_match:
                continue
                
            external_id = id_match.group(1)
            
            # Imovirtual prices are usually in a span next to the title or in the grid
            # Let's extract from all text fields
            price: Decimal | None = None
            price_spans = article.find_all("span")
            for span in price_spans:
                if "€" in span.text:
                    parsed = _to_decimal(span.text)
                    if parsed and (price is None or parsed > price):
                        price = parsed
            
            # Title
            title: str | None = None
            for p in article.find_all("p"):
                text = p.text.strip()
                if text and not re.match(r"^\d+\s*/\s*\d+$", text):
                    if not title:
                        title = text
                    elif "-" in text and "," in text:
                        # Probably location
                        pass
            
            # Find the dd/dt list for typology and area
            typology: int | None = None
            area: Decimal | None = None
            for dt, dd in zip(article.find_all("dt"), article.find_all("dd")):
                dt_text = dt.text.lower()
                if "tipologia" in dt_text:
                    typology = _first_int(dd.text)
                elif "área" in dt_text or "area" in dt_text or "metro quadrado" in dt_text:
                    if "m²" in dd.text:
                        area = Decimal(str(_first_int(dd.text))) if _first_int(dd.text) else None
                        
            # If area is still None but there's a span with m²
            if not area:
                for span in price_spans:
                    if "m²" in span.text and "€" not in span.text:
                        area = Decimal(str(_first_int(span.text))) if _first_int(span.text) else None
                        break
            
            # Description is the full text of the article
            description = article.get_text(separator=" ").strip()
            
            # Location is typically a paragraph with specific styling, let's grab it or fallback
            location = title
            for p in article.find_all("p"):
                if "-" in p.text and "," in p.text:
                    location = p.text.strip()
                    break
            
            image_urls = []
            img = article.find("img")
            if img and img.get("src"):
                image_urls.append(img["src"])
                
            results.append(
                ParsedListing(
                    portal="imovirtual",
                    external_id=external_id,
                    url=href,
                    title=title,
                    description=description,
                    price=price,
                    area_sqm_gross=area,
                    typology=typology,
                    raw_location_text=location,
                    image_urls=image_urls,
                )
            )
        except Exception:
            logger.exception("Failed to extract an Imovirtual card")

    logger.info("Imovirtual: extracted %d listings from %s", len(results), url)
    return results
