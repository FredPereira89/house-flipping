import pytest
from decimal import Decimal
from ingest.parsers import olx

def test_parses_olx_search_results():
    with open("tests/fixtures/olx_search.html", "r", encoding="utf-8") as f:
        html = f.read()

    results = olx.parse("https://www.olx.pt/imoveis/casas-apartamentos-para-arrendar-vender/apartamentos-venda/lisboa/", html)

    assert len(results) > 0

    first = results[0]
    assert first["portal"] == "olx"
    assert first["external_id"] == "JtAiq"
    assert "olx.pt" in first["url"]
    assert first["title"] == "Apartamento de Luxo, T3, inserido no Edifício E-VOLUTION"
    assert first["price"] == Decimal("590000")
    assert first["area_sqm_gross"] is None  # OLX search doesn't have area
    assert "São Mamede" in (first["raw_location_text"] or "")
