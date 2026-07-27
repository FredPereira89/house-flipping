from ingest.disqualify import check

KEYWORDS = [
    {"keyword": "arrendado", "category": "rented"},
    {"keyword": "contrato de arrendamento", "category": "rented"},
    {"keyword": "sem licenca de habitacao", "category": "no_licence"},
]


def test_clean_description_passes():
    ok, category, matched = check("Apartamento para remodelar", KEYWORDS)
    assert ok is False
    assert category is None
    assert matched is None


def test_flags_rented_property():
    ok, category, matched = check("Imóvel arrendado com inquilino", KEYWORDS)
    assert ok is True
    assert category == "rented"
    assert matched == "arrendado"


def test_matches_despite_diacritics_and_case():
    ok, category, _ = check("SEM LICENÇA DE HABITAÇÃO", KEYWORDS)
    assert ok is True
    assert category == "no_licence"


def test_handles_empty_description():
    ok, _, _ = check("", KEYWORDS)
    assert ok is False


def test_handles_none_description():
    ok, _, _ = check(None, KEYWORDS)
    assert ok is False
