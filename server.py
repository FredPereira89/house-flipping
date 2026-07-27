from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import logging
import pandas as pd
from dotenv import load_dotenv
from scrapers.idealista import IdealistaScraper
from scrapers.imovirtual import ImovirtualScraper
from scrapers.olx import OlxScraper
from utils.notifier import Notifier
import os
import unicodedata

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Servidor")

app = Flask(__name__)
CORS(app)

seen_links = set()

def load_seen_links():
    global seen_links
    csv_file = 'data/imoveis_extraidos.csv'
    if os.path.isfile(csv_file):
        try:
            df = pd.read_csv(csv_file, sep=None, engine='python')
            if 'link' in df.columns:
                seen_links.update(df['link'].tolist())
                logger.info(f"Carregados {len(seen_links)} imóveis únicos do histórico.")
        except Exception as e:
            logger.error(f"Erro ao carregar histórico: {e}")

load_seen_links()

def load_config():
    with open('config.json', 'r', encoding='utf-8') as f:
        return json.load(f)

DISQUALIFY_KEYWORDS_RENTED = [
    'arrendado', 'arrendada', 'com inquilino', 'com arrendatario',
    'ocupado com', 'contrato de arrendamento', 'rendimento garantido',
    'investimento arrendado', 'yield garantido', 'retorno garantido',
    'com rendimento', 'em regime de arrendamento', 'inquilino atual',
]

DISQUALIFY_KEYWORDS_NO_LICENSE = [
    'sem licenca de habitacao', 'sem licenca habitacao',
    'sem alvara', 'nao tem licenca', 'nao possui licenca',
    'licenca em processo', 'licenca a regularizar',
    'a aguardar licenca', 'processo de licenciamento',
    'licenca de utilizacao pendente', 'licenca de utilizacao em falta',
    'edificio nao licenciado',
]

def is_disqualified(prop):
    """Verifica se o imóvel deve ser excluído por estar arrendado ou sem licença.
    Retorna (True, motivo) se deve ser excluído, (False, None) caso contrário.
    """
    description = prop.get('description', '') or ''
    desc_norm = unicodedata.normalize('NFKD', description).encode('ASCII', 'ignore').decode('utf-8').lower()

    for kw in DISQUALIFY_KEYWORDS_RENTED:
        if kw in desc_norm:
            return True, f"Arrendado ('{kw}')"

    for kw in DISQUALIFY_KEYWORDS_NO_LICENSE:
        if kw in desc_norm:
            return True, f"Sem Licença ('{kw}')"

    return False, None

def evaluate_property(prop, config):
    if prop['area_m2'] <= 0:
        return False, 0, 0, 0
        
    price = prop['price']
    area = prop['area_m2']
    location = prop['location']
    
    avg_zone_price = config['locations_avg_price_m2'].get(location, config['locations_avg_price_m2'].get('AML (Geral)'))
    price_per_m2 = price / area
    discount_pct = (1 - (price_per_m2 / avg_zone_price)) * 100 if avg_zone_price > 0 else 0
    
    is_opportunity = discount_pct >= config['business_logic']['discount_threshold_min'] * 100
    
    return is_opportunity, price_per_m2, avg_zone_price, discount_pct

@app.route('/analyze', methods=['POST'])
def analyze_page():
    data = request.json
    url = data.get('url', '')
    html_content = data.get('html', '')
    
    if not url or not html_content:
        return jsonify({'error': 'URL or HTML missing'}), 400
        
    load_dotenv()
    config = load_config()
    notifier = Notifier()
    
    all_properties = []
    
    # Determinar qual portal foi enviado
    if 'idealista.pt' in url:
        scraper = IdealistaScraper(config)
    elif 'imovirtual.com' in url:
        scraper = ImovirtualScraper(config)
    elif 'olx.pt' in url:
        scraper = OlxScraper(config)
    else:
        return jsonify({'error': 'Portal não suportado'}), 400
        
    logger.info(f"Recebida página do {scraper.__class__.__name__} ({len(html_content)} bytes)")
    
    props = scraper.parse_html(url, html_content)
    
    if not props:
        logger.warning(f"0 imóveis extraídos de {url}. A guardar HTML em 'debug_page.html' para análise...")
        with open('debug_page.html', 'w', encoding='utf-8') as f:
            f.write(html_content)
            
    # Filtrar imóveis disqualificados (arrendados ou sem licença)
    eligible_props = []
    for prop in props:
        disq, reason = is_disqualified(prop)
        if disq:
            logger.info(f"Excluído: {prop.get('link', 'N/A')} | Motivo: {reason}")
        else:
            eligible_props.append(prop)

    # Deduplicação (só nos elegíveis para não bloquear links que virão correctos)
    global seen_links
    new_properties = []
    
    for prop in eligible_props:
        link = prop.get('link')
        if link and link not in seen_links:
            new_properties.append(prop)
            seen_links.add(link)
            
    all_properties.extend(new_properties)
    
    opportunities = []
    
    for prop in all_properties:
        is_opp, price_per_m2, avg_zone_price, discount_pct = evaluate_property(prop, config)
        
        prop['price_per_m2'] = round(price_per_m2, 0)
        prop['avg_zone_price'] = avg_zone_price
        prop['discount_pct'] = round(discount_pct, 1)
        prop['is_opportunity'] = is_opp
        
        if is_opp:
            opportunities.append(prop)
            
    # Notificar com um único resumo por página (evita rate limit do WhatsApp)
    if opportunities:
        notifier.send_page_summary(opportunities, url)
        logger.info(f"Resumo de {len(opportunities)} oportunidades enviado via WhatsApp.")
            
    # Remover quebras de linha das descrições para não partir o Excel
    for prop in all_properties:
        if 'description' in prop and isinstance(prop['description'], str):
            prop['description'] = prop['description'].replace('\n', ' ').replace('\r', ' ').strip()
            
    # Guardar no CSV (append)
    if all_properties:
        df = pd.DataFrame(all_properties)
        os.makedirs('data', exist_ok=True)
        csv_file = 'data/imoveis_extraidos.csv'
        
        # Append without headers if file exists
        if os.path.isfile(csv_file):
            df.to_csv(csv_file, mode='a', header=False, index=False, encoding='utf-8-sig', sep=';')
        else:
            df.to_csv(csv_file, index=False, encoding='utf-8-sig', sep=';')
            
        logger.info(f"Foram guardados {len(df)} NOVOS imóveis. {len(opportunities)} oportunidades.")
    else:
        logger.info(f"0 novos imóveis encontrados nesta página (foram extraídos {len(props)} repetidos).")
        
    # Condição de paragem do Autopilot desativada a pedido do utilizador: ver todas as páginas
    stop_autopilot = False
        
    return jsonify({
        'status': 'success',
        'properties_extracted': len(props),
        'new_properties': len(new_properties),
        'opportunities_found': len(opportunities),
        'stop_autopilot': stop_autopilot
    })

if __name__ == '__main__':
    logger.info("Servidor Local de House Flipping iniciado na porta 5000!")
    app.run(port=5000)
