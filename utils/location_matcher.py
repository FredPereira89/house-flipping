import re
import unicodedata
import logging

logger = logging.getLogger("LocationMatcher")

def normalize(text):
    """Lowercase and remove accents for robust comparison."""
    return unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8').lower().strip()


# Explicit alias map: maps every known alias/variant -> canonical zone key in config.json
# This is ordered from MOST SPECIFIC to LEAST SPECIFIC.
# A match only succeeds if the alias appears in the text AS A WHOLE WORD (not substring of another word).
LOCATION_ALIASES = {
    # === LISBOA - Parishes ===
    "santo antonio": "Santo António",
    "avenidas novas": "Avenidas Novas",
    "misericordia": "Misericórdia",
    "estrela": "Estrela",
    "parque das nacoes": "Parque das Nações",
    "parque nacoes": "Parque das Nações",
    "santa maria maior": "Santa Maria Maior",
    "belem": "Belém",
    "campo de ourique": "Campo de Ourique",
    "alvalade": "Alvalade",
    "areeiro": "Areeiro",
    "arroios": "Arroios",
    "campolide": "Campolide",
    "lumiar": "Lumiar",
    "sao vicente": "São Vicente",
    "penha de franca": "Penha de França",
    "sao domingos de benfica": "São Domingos de Benfica",
    # "benfica" MUST come AFTER "sao domingos de benfica"
    "carnide": "Carnide",
    "marvila": "Marvila",
    "beato": "Beato",
    "olivais": "Olivais",
    "santa clara": "Santa Clara",

    # === CASCAIS ===
    "cascais e estoril": "Cascais e Estoril",
    "estoril": "Cascais e Estoril",
    "carcavelos": "Carcavelos e Parede",
    "parede": "Carcavelos e Parede",
    "alcabideche": "Alcabideche",
    "sao domingos de rana": "São Domingos de Rana",

    # === OEIRAS ===
    "oeiras e sao juliao": "Oeiras e São Julião da Barra, Paço de Arcos e Caxias",
    "paco de arcos": "Oeiras e São Julião da Barra, Paço de Arcos e Caxias",
    "caxias": "Oeiras e São Julião da Barra, Paço de Arcos e Caxias",
    "alges": "Algés, Linda-a-Velha e Cruz Quebrada-Dafundo",
    "linda-a-velha": "Algés, Linda-a-Velha e Cruz Quebrada-Dafundo",
    "linda a velha": "Algés, Linda-a-Velha e Cruz Quebrada-Dafundo",
    "cruz quebrada": "Algés, Linda-a-Velha e Cruz Quebrada-Dafundo",
    "carnaxide": "Carnaxide e Queijas",
    "queijas": "Carnaxide e Queijas",
    "porto salvo": "Porto Salvo",
    "barcarena": "Barcarena",

    # === SINTRA ===
    "colares": "Colares",
    "queluz": "Queluz e Belas",
    "belas": "Queluz e Belas",
    "massama": "Massamá e Monte Abraão",
    "monte abrao": "Massamá e Monte Abraão",
    "mem martins": "Algirão-Mem Martins",
    "rio de mouro": "Rio de Mouro",
    "agualva": "Agualva e Mira-Sintra",
    "mira-sintra": "Agualva e Mira-Sintra",
    "cacem": "Cacém e São Marcos",
    "sao marcos": "Cacém e São Marcos",
    "sao joao das lampas": "São João das Lampas e Terrugem",
    "terrugem": "São João das Lampas e Terrugem",
    "almargem do bispo": "Almargem do Bispo, Pêro Pinheiro e Montelavar",
    "pero pinheiro": "Almargem do Bispo, Pêro Pinheiro e Montelavar",
    "montelavar": "Almargem do Bispo, Pêro Pinheiro e Montelavar",
    # Nota: 'portela de sintra' deve vir ANTES de 'portela' (que aponta a Moscavide/Loures)
    "portela de sintra": "Sintra",

    # === AMADORA ===
    "alfragide": "Alfragide",
    "aguas livres": "Águas Livres",
    "venteira": "Venteira",
    "encosta do sol": "Encosta do Sol",
    "falagueira": "Falagueira-Venda Nova",
    "venda nova": "Falagueira-Venda Nova",
    "mina de agua": "Mina de Água",

    # === ODIVELAS ===
    "pontinha": "Pontinha e Famões",
    "famoes": "Pontinha e Famões",
    "povoa de santo adriao": "Póvoa de Santo Adrião e Olival Basto",
    "olival basto": "Póvoa de Santo Adrião e Olival Basto",
    "ramada": "Ramada e Caneças",
    "canecas": "Ramada e Caneças",

    # === LOURES ===
    "moscavide": "Moscavide e Portela",
    "portela": "Moscavide e Portela",
    "sacavem": "Sacavém e Prior Velho",
    "prior velho": "Sacavém e Prior Velho",
    "santo antonio dos cavaleiros": "Santo António dos Cavaleiros e Frielas",
    "frielas": "Santo António dos Cavaleiros e Frielas",
    "santa iria de azoia": "Santa Iria de Azoia, São João da Talha e Bobadela",
    "sao joao da talha": "Santa Iria de Azoia, São João da Talha e Bobadela",
    "bobadela": "Santa Iria de Azoia, São João da Talha e Bobadela",
    "camarate": "Camarate, Unhos e Apelação",
    "unhos": "Camarate, Unhos e Apelação",
    "apelacao": "Camarate, Unhos e Apelação",
    "povoa de santa iria": "Póvoa de Santa Iria e Forte da Casa",
    "forte da casa": "Póvoa de Santa Iria e Forte da Casa",
    "alverca do ribatejo": "Alverca do Ribatejo e Sobralinho",
    "sobralinho": "Alverca do Ribatejo e Sobralinho",

    # === ALMADA ===
    "costa da caparica": "Costa da Caparica",
    "cova da piedade": "Almada, Cova da Piedade, Pragal e Cacilhas",
    "pragal": "Almada, Cova da Piedade, Pragal e Cacilhas",
    "cacilhas": "Almada, Cova da Piedade, Pragal e Cacilhas",
    "charneca de caparica": "Charneca de Caparica e Sobreda",
    "sobreda": "Charneca de Caparica e Sobreda",
    "caparica": "Caparica e Trafaria",
    "trafaria": "Caparica e Trafaria",
    "laranjeiro": "Laranjeiro e Feijó",
    "feijo": "Laranjeiro e Feijó",

    # === SEIXAL ===
    "fernao ferro": "Fernão Ferro",
    "corroios": "Corroios",
    "arrentela": "Seixal, Arrentela e Aldeia de Paio Pires",
    "aldeia de paio pires": "Seixal, Arrentela e Aldeia de Paio Pires",
    "amora": "Amora",

    # === BARREIRO ===
    "lavradio": "Barreiro e Lavradio",
    "alto do seixalinho": "Alto do Seixalinho, Santo André e Verderena",
    "santo andre": "Alto do Seixalinho, Santo André e Verderena",
    "verderena": "Alto do Seixalinho, Santo André e Verderena",

    # === SETÚBAL ===
    "azeitao": "Azeitão (São Lourenço e São Simão)",
    "quinta do conde": "Quinta do Conde",
    "sesimbra": "Sesimbra",
    "palmela": "Palmela",
    "moita": "Moita",
    "montijo": "Montijo",
    "alcochete": "Alcochete",

    # === MAFRA / V.F. XIRA ===
    "mafra": "Mafra",
    "vila franca de xira": "Vila Franca de Xira",
    "alverca": "Alverca do Ribatejo e Sobralinho",

    # === GENERIC — must be LAST, checked only if nothing more specific matched ===
    # These need municipality context so we require a secondary keyword check
    "benfica": "Benfica",          # risk: Benfica is used across the country
    "seixal": "Seixal",
    "barreiro": "Barreiro",
    "almada": "Almada",
    "amadora": "Amadora",
    "odivelas": "Odivelas",
    "loures": "Loures",
    "cascais": "Cascais",
    "oeiras": "Oeiras",
    "sintra": "Sintra",
    "setubal": "Setúbal",
    "santiago": "Santiago",        # risk: very generic
    "castelo": "Castelo",          # risk: very generic
    "lisboa": "Lisboa",
}

# These ambiguous aliases REQUIRE one of these secondary keywords to be present
# to confirm the property really is in the intended municipality
AMBIGUOUS_REQUIRES_CONTEXT = {
    "benfica": ["lisboa", "amadora"],
    "santiago": ["setubal", "setúbal", "sado"],
    "castelo": ["setubal", "setúbal", "sado", "lisboa"],
    "seixal": ["seixal", "margem sul", "setubal"],
    "barreiro": ["barreiro", "margem sul"],
    "almada": ["almada", "margem sul"],
    "sintra": ["sintra"],
    "oeiras": ["oeiras"],
    "cascais": ["cascais"],
    "loures": ["loures"],
    "odivelas": ["odivelas"],
    "amadora": ["amadora"],
    "setubal": ["setubal", "setúbal"],
}


def match_location(text, config):
    """
    Attempts to match a location from text (title, full_location string, etc.)
    using the alias table. Returns the canonical zone key or None.

    Uses word-boundary matching to prevent e.g. 'portela' matching 'portela de sintra'.
    """
    norm_text = normalize(text)

    for alias, canonical in LOCATION_ALIASES.items():
        # Use word-boundary regex: \b only works on ASCII word chars, so we use
        # a pattern that checks for non-word (or start/end of string) around the phrase.
        pattern = r'(?<![\w])' + re.escape(alias) + r'(?![\w])'
        if not re.search(pattern, norm_text):
            continue

        # Extra context check for ambiguous aliases
        if alias in AMBIGUOUS_REQUIRES_CONTEXT:
            required = AMBIGUOUS_REQUIRES_CONTEXT[alias]
            if not any(ctx in norm_text for ctx in required):
                logger.debug(f"Alias '{alias}' found in '{text[:60]}' but missing context {required} — skipped.")
                continue

        # Verify the canonical zone is in the config
        if canonical in config['locations_avg_price_m2']:
            return canonical

    return None
