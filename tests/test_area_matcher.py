from ingest.area_matcher import normalize_text, match_area

AREAS = [
    {"id": "a1", "name": "Campo de Ourique",
     "slug": "campo-de-ourique",
     "aliases": ["Campo de Ourique", "campo-de-ourique"]},
    {"id": "a2", "name": "São Domingos de Rana",
     "slug": "sao-domingos-de-rana",
     "aliases": ["São Domingos de Rana", "sao-domingos-de-rana"]},
    {"id": "a3", "name": "Benfica", "slug": "benfica",
     "aliases": ["Benfica", "benfica"]},
]


def test_normalize_strips_diacritics_and_case():
    assert normalize_text("São Vicente") == "sao vicente"
    assert normalize_text("  RUÍNA  ") == "ruina"


def test_matches_exact_name():
    assert match_area("Campo de Ourique", AREAS) == "a1"


def test_matches_ignoring_diacritics():
    assert match_area("Sao Domingos de Rana", AREAS) == "a2"


def test_matches_inside_a_longer_listing_string():
    text = "Apartamento T1 na Rua Maria Pia, Prazeres, Campo de Ourique"
    assert match_area(text, AREAS) == "a1"


def test_prefers_longest_match_when_several_hit():
    # "Benfica" is a substring of "São Domingos de Benfica"; the longer
    # alias must win or leads get filed to the wrong freguesia.
    areas = AREAS + [{
        "id": "a4", "name": "São Domingos de Benfica",
        "slug": "sao-domingos-de-benfica",
        "aliases": ["São Domingos de Benfica", "sao-domingos-de-benfica"],
    }]
    assert match_area("Moradia em São Domingos de Benfica", areas) == "a4"


def test_returns_none_when_nothing_matches():
    assert match_area("Rua Qualquer, Bragança", AREAS) is None


def test_prefers_aml_area_on_alias_tie_with_a_same_name_freguesia():
    # "Alvalade" exists in both Lisboa (AML) and Santiago do Cacém (not
    # AML). Portal listing text never states the concelho, so this is a
    # genuine, irreducible tie on alias text alone -- resolve it toward
    # the area this tool actually sources leads in.
    areas = [
        {"id": "lisboa-alvalade", "name": "Alvalade",
         "municipality": "Lisboa",
         "aliases": ["Alvalade", "alvalade"]},
        {"id": "cacem-alvalade", "name": "Alvalade, Santiago do Cacém, Setúbal",
         "municipality": "Santiago do Cacém",
         "aliases": ["Alvalade"]},
    ]
    assert match_area("Alvalade", areas) == "lisboa-alvalade"
    # Order in the list must not matter.
    assert match_area("Alvalade", list(reversed(areas))) == "lisboa-alvalade"
