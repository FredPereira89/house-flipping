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


def test_matches_regardless_of_hyphen_spacing():
    # Idealista itself is inconsistent: some compound freguesia names use a
    # bare hyphen, others a spaced one, on the same site. A stored alias
    # with one spacing must still match ad text using the other.
    assert normalize_text("Algueirão - Mem Martins") == normalize_text("Algueirão-Mem Martins")
    areas = [{"id": "a4", "name": "Algirão-Mem Martins",
              "aliases": ["Algirão-Mem Martins", "Algueirão-Mem Martins"]}]
    assert match_area("Apartamento em Algueirão - Mem Martins", areas) == "a4"


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


def test_prefers_a_long_specific_alias_over_a_short_unrelated_ones_prefix():
    # Real bug: "Sao Vicente - Sao Joao - Alferrarede" (an Abrantes union
    # parish, real Idealista ad text) was matching Lisboa's own "Sao
    # Vicente" (a short, unrelated, much more famous freguesia) because
    # the Abrantes area's only aliases were DICOFRE's bureaucratic name
    # ("Uniao das freguesias de Abrantes (Sao Vicente e Sao Joao) e
    # Alferrarede") and a wrongly-unwrapped hyphenated variant that still
    # had "Abrantes (" / ")" in it -- neither matched the real ad text, so
    # the only alias that did match anything (Lisboa's short "Sao
    # Vicente") won by default. The longer, correctly-unwrapped alias must
    # win once it exists.
    areas = [
        {"id": "lisboa-sao-vicente", "name": "São Vicente",
         "municipality": "Lisboa",
         "aliases": ["São Vicente", "sao-vicente"]},
        {"id": "abrantes-sao-vicente", "name": "União das freguesias de Abrantes (São Vicente e São João) e Alferrarede, Abrantes, Santarém",
         "municipality": "Abrantes",
         "aliases": [
             "União das freguesias de Abrantes (São Vicente e São João) e Alferrarede",
             "São Vicente - São João - Alferrarede",
         ]},
    ]
    assert match_area("Apartamento em São Vicente - São João - Alferrarede", areas) == "abrantes-sao-vicente"


def test_prefers_the_last_comma_segment_over_a_longer_street_name_match():
    # Real bug: "Moradia em banda na Rua de Santo António, 6, Riachos"
    # matched Lisboa's "Santo António" (13 normalized chars, found inside
    # the STREET NAME "Rua de Santo António") over "Riachos" (7 chars),
    # the correct freguesia and the actual last comma-segment. Idealista's
    # own card text is consistently "{street details}, {freguesia}" --
    # position must win over raw length here.
    areas = [
        {"id": "lisboa-santo-antonio", "name": "Santo António",
         "municipality": "Lisboa",
         "aliases": ["Santo António", "santo-antonio"]},
        {"id": "riachos", "name": "Riachos, Torres Novas, Santarém",
         "municipality": "Torres Novas",
         "aliases": ["Riachos"]},
    ]
    text = "Moradia em banda na Rua de Santo António, 6, Riachos"
    assert match_area(text, areas) == "riachos"


def test_returns_none_rather_than_a_wrong_guess_when_the_last_segment_is_out_of_scope():
    # Real bug: "Moradia independente na Rua de São Vicente, a dos Francos"
    # is a real Caldas da Rainha (Leiria district) address -- a district
    # this project has never seeded any area for. There is no correct
    # match. Falling back to whole-text search (an earlier version of this
    # fix did that) just re-finds "São Vicente" as a coincidental street-
    # name substring again, exactly the failure mode this fix exists to
    # avoid -- the fix must not defeat itself on a last-segment miss. A
    # last segment matching nothing IS the answer: unmatched, not a guess.
    areas = [
        {"id": "lisboa-sao-vicente", "name": "São Vicente",
         "municipality": "Lisboa",
         "aliases": ["São Vicente", "sao-vicente"]},
    ]
    text = "Moradia independente na Rua de São Vicente, a dos Francos"
    assert match_area(text, areas) is None


def test_matches_a_compound_freguesia_using_the_literal_connector_word():
    # Real bug: Idealista's own search-card text for this exact freguesia
    # sometimes has NO comma at all ("Andar de moradia em São Miguel do
    # Rio Torto e Rossio ao Sul do Tejo") and uses the literal word "e"
    # between the two parish names, not a hyphen -- neither the full
    # bureaucratic alias nor a hyphenated variant matches that; only a
    # bare, prefix-stripped, connector-preserved alias does.
    areas = [
        {"id": "sao-miguel-rio-torto", "name": "União das freguesias de São Miguel do Rio Torto e Rossio ao Sul do Tejo, Abrantes, Santarém",
         "municipality": "Abrantes",
         "aliases": [
             "União das freguesias de São Miguel do Rio Torto e Rossio ao Sul do Tejo",
             "São Miguel do Rio Torto - Rossio ao Sul do Tejo",
             "São Miguel do Rio Torto e Rossio ao Sul do Tejo",
         ]},
    ]
    text = "Andar de moradia em São Miguel do Rio Torto e Rossio ao Sul do Tejo"
    assert match_area(text, areas) == "sao-miguel-rio-torto"
