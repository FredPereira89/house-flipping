from typing import Callable
from ingest.parsers import idealista, imovirtual, olx
from ingest.parsers.base import ParsedListing

Parser = Callable[[str, str], list[ParsedListing]]

_ROUTES: list[tuple[str, Parser]] = [
    ("idealista.pt", idealista.parse),
    ("imovirtual.com", imovirtual.parse),
    ("olx.pt", olx.parse),
]


def get_parser(url: str) -> Parser | None:
    for domain, parser in _ROUTES:
        if domain in url:
            return parser
    return None
