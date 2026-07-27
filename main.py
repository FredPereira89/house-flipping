import json
import logging
import pandas as pd
from dotenv import load_dotenv
from scrapers.idealista import IdealistaScraper
from scrapers.imovirtual import ImovirtualScraper
from scrapers.olx import OlxScraper
from utils.notifier import Notifier
import os

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Orquestrador")

def load_config():
    with open('config.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def evaluate_property(prop, config):
    """
    Avalia a propriedade baseada na lógica de negócio de House Flipping.
    Calcula o preço/m2 e verifica se o desconto está entre 10-15% (ou mais) face à zona.
    """
    if prop['area_m2'] <= 0:
        return False, 0, 0
        
    price_per_m2 = prop['price'] / prop['area_m2']
    location = prop['location']
    avg_zone_price = config['locations_avg_price_m2'].get(location, config['locations_avg_price_m2'].get('AML (Geral)'))
    
    # Exemplo: Se preço é 4000 e média é 5000, desconto é 1 - (4000/5000) = 0.20 (20%)
    discount = 1 - (price_per_m2 / avg_zone_price)
    
    min_discount = config['business_logic']['discount_threshold_min']
    
    is_opportunity = discount >= min_discount
    
    return is_opportunity, price_per_m2, avg_zone_price, discount * 100

def main():
    load_dotenv()
    config = load_config()
    notifier = Notifier()
    
    scrapers = [
        IdealistaScraper(config),
        ImovirtualScraper(config),
        OlxScraper(config)
    ]
    
    all_properties = []
    
    for scraper in scrapers:
        logger.info(f"Iniciando scraping: {scraper.__class__.__name__}")
        props = scraper.fetch_properties()
        all_properties.extend(props)
        
    if not all_properties:
        logger.warning("Nenhum imóvel extraído. Os portais estão a bloquear o script com Datadome/Cloudflare. A gerar dados de teste para demonstrar a lógica...")
        # Fallback Mock Data
        all_properties = [
            {'portal': 'Idealista (Mock)', 'price': 220000, 'location': 'Odivelas', 'typology': 2, 'area_m2': 100, 'link': 'https://mock/1', 'date': 'Hoje'},
            {'portal': 'Imovirtual (Mock)', 'price': 180000, 'location': 'Amadora', 'typology': 1, 'area_m2': 60, 'link': 'https://mock/2', 'date': 'Hoje'},
            {'portal': 'OLX (Mock)', 'price': 210000, 'location': 'Sintra', 'typology': 2, 'area_m2': 110, 'link': 'https://mock/3', 'date': 'Hoje'},
            # Este não deve ser oportunidade (preço normal)
            {'portal': 'Idealista (Mock)', 'price': 250000, 'location': 'Cascais', 'typology': 1, 'area_m2': 50, 'link': 'https://mock/4', 'date': 'Hoje'}
        ]

    opportunities = []
    
    for prop in all_properties:
        is_opp, price_per_m2, avg_zone_price, discount_pct = evaluate_property(prop, config)
        
        prop['price_per_m2'] = price_per_m2
        prop['avg_zone_price'] = avg_zone_price
        prop['discount_percentage'] = discount_pct
        prop['is_opportunity'] = is_opp
        
        if is_opp:
            opportunities.append(prop)
            notifier.send_opportunity(prop)

    # Limpar descrições
    for prop in all_properties:
        if 'description' in prop and isinstance(prop['description'], str):
            prop['description'] = prop['description'].replace('\n', ' ').replace('\r', ' ').strip()
            
    # Guardar tudo num CSV
    df = pd.DataFrame(all_properties)
    os.makedirs('data', exist_ok=True)
    df.to_csv('data/imoveis_extraidos.csv', index=False, encoding='utf-8-sig', sep=';')
    logger.info(f"Dados guardados em data/imoveis_extraidos.csv. Total imóveis: {len(df)}, Oportunidades: {len(opportunities)}")

if __name__ == "__main__":
    main()
