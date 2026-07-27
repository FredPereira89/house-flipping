from decimal import Decimal
from pathlib import Path
import pytest
from ingest.parsers.idealista import parse

FIXTURE = Path(__file__).parent / "fixtures" / "idealista_search.html"


@pytest.fixture(scope="module")
def listings():
    html = FIXTURE.read_text(encoding="utf-8")
    return parse("https://www.idealista.pt/comprar-casas/lisboa/", html)


def test_extracts_listings(listings):
    assert len(listings) > 0


def test_every_listing_has_the_required_identity_fields(listings):
    for item in listings:
        assert item["portal"] == "idealista"
        assert item["external_id"]
        assert item["url"].startswith("https://www.idealista.pt/")


def test_external_id_is_the_numeric_property_id(listings):
    ids = [i["external_id"] for i in listings]
    assert all(i.isdigit() for i in ids), ids[:5]


def test_prices_are_positive_decimals(listings):
    priced = [i for i in listings if i.get("price") is not None]
    assert priced
    for item in priced:
        assert isinstance(item["price"], Decimal)
        assert item["price"] > 0


def test_does_not_filter_by_price_or_typology(listings):
    # Extraction must be lossless; filtering happens downstream.
    # The fixture contains listings above the 250k config limit.
    assert any(
        i.get("price") is not None and i["price"] > Decimal("250000")
        for i in listings
    )
