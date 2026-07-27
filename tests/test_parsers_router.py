from ingest.parsers import get_parser
from ingest.parsers import idealista


def test_routes_idealista():
    assert get_parser("https://www.idealista.pt/comprar-casas/lisboa/") is idealista.parse


def test_returns_none_for_unknown_portal():
    assert get_parser("https://example.com/whatever") is None
