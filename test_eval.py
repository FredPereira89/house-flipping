from server import evaluate_property
import json

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

properties = [
    {'portal': 'Idealista', 'price': 185000.0, 'location': 'Santa Maria Maior', 'typology': 2, 'area_m2': 60.0, 'link': 'https://www.idealista.pt/imovel/34947121/', 'date': 'N/A'},
    {'portal': 'Idealista', 'price': 215000.0, 'location': 'São Sebastião', 'typology': 2, 'area_m2': 78.0, 'link': 'https://www.idealista.pt/imovel/34547280/', 'date': 'N/A'}
]

for p in properties:
    is_opp, m2_price, expected = evaluate_property(p, config)
    print(f"Prop: {p['price']} | {p['location']} | {p['area_m2']} m2 -> is_opp={is_opp}")
    print(f"Price/m2: {m2_price}, Expected: {expected}")
