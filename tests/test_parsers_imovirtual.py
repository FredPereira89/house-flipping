import pytest
from decimal import Decimal
from ingest.parsers import imovirtual

def test_parses_imovirtual_search_results():
    with open("tests/fixtures/imovirtual_search.html", "r", encoding="utf-8") as f:
        html = f.read()

    results = imovirtual.parse("https://www.imovirtual.com/pt/resultados", html)

    assert len(results) > 0

    first = results[0]
    assert first["portal"] == "imovirtual"
    assert first["external_id"] == "1iARZ"
    assert "imovirtual.com" in first["url"]
    assert first["title"] == "Apartamento T2 Com Terraço e Parqueamento"
    assert first["price"] == Decimal("350000")
    assert first["typology"] == 2
    assert "Sintra" in (first["raw_location_text"] or "")
