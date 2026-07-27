import json
from utils.location_matcher import match_location

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

tests = [
    # O caso que falhou
    "Moradia geminada na Rua Projectada à Avenida Doutor Álvaro de Vasconcelos, Centro de Sintra - Portela de Sintra",
    # Casos que devem funcionar
    "Apartamento T2 em Portela, Loures",
    "Apartamento T2 em Moscavide",
    "T3 em Cascais",
    "Moradia em Parede, Cascais",
    "Apartamento T1 no Parque das Nações, Lisboa",
    "T2 em Algés",
    "Moradia em Colares, Sintra",
    "T3 em São Domingos de Benfica",
    "Apartamento em Benfica, Lisboa",
    "T2 em Almada",
    "Moradia T4 em Queluz, Sintra",
]

for text in tests:
    result = match_location(text, config)
    print(f"  '{text[:70]}'\n   -> {result}\n")
