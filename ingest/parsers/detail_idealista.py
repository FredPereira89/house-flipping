import logging

from bs4 import BeautifulSoup

logger = logging.getLogger("ingest.parsers.detail_idealista")


def parse_detail(url: str, html: str) -> dict:
    """Extract the full description and full-resolution photo URLs from an
    Idealista detail page.

    Lossless, like the search-result parsers (see HANDOFF.md §9): every
    matching image URL is returned, unfiltered -- deciding which photos are
    worth keeping is a downstream concern, not this parser's job.
    """
    soup = BeautifulSoup(html, "html.parser")

    desc_tag = soup.select_one(".comment p")
    description = desc_tag.get_text(separator="\n").strip() if desc_tag else ""

    # Idealista detail pages serve photos through <picture><img> with the
    # real (often larger) URL in data-src and a low-res placeholder in src.
    image_urls: list[str] = []
    for pic in soup.select("picture img"):
        src = pic.get("data-src") or pic.get("src")
        if src and "idealista.pt" in src:
            image_urls.append(src)

    if not description and not image_urls:
        # Same "silence is the dangerous failure" convention as the search
        # parsers: a page that yields nothing at all is far more likely a
        # broken selector (portal changed markup) than a truly empty page,
        # so it must leave a trace instead of quietly returning zero.
        logger.warning("Detail parse found neither description nor photos for %s", url)

    return {"description": description, "image_urls": image_urls}
