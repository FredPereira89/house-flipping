from typing import Callable
from ingest.parsers import idealista
from ingest.parsers.base import ParsedListing

Parser = Callable[[str, str], list[ParsedListing]]

# Task 13 registers imovirtual and olx here. Do not add them now — their
# modules do not exist yet and the import would fail.
_ROUTES: list[tuple[str, Parser]] = [
    ("idealista.pt", idealista.parse),
]


def get_parser(url: str) -> Parser | None:
    for domain, parser in _ROUTES:
        if domain in url:
            return parser
    return None
