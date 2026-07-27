from bs4 import BeautifulSoup
import logging
import json
from scrapers.base_scraper import BaseScraper
from utils.location_matcher import match_location

class ImovirtualScraper(BaseScraper):
    def __init__(self, config):
        super().__init__(config)
        self.base_url = "https://www.imovirtual.com"

    def parse_html(self, url, html_content):
        properties = []
        logging.info("Imovirtual: A analisar HTML recebido da extensão...")
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            script_data = soup.find('script', id='__NEXT_DATA__')
            
            if script_data:
                data = json.loads(script_data.text)
                try:
                    items = data['props']['pageProps']['initialState']['search']['searchAds']['list']
                    for item in items:
                        price = float(item.get('totalPrice', {}).get('value', 0))
                        
                        if price > self.config['filters']['max_price'] or price == 0:
                            continue
                            
                        link = f"{self.base_url}{item.get('url')}"
                        area_m2 = float(item.get('areaInSquareMeters', 0))
                        
                        rooms = item.get('roomsNumber', 0)
                        typology = int(rooms) if str(rooms).isdigit() else 0
                        
                        if typology < self.config['filters']['min_typology'] or area_m2 == 0:
                            continue
                            
                        location_details = item.get('location', {}).get('reverseGeocoding', {})
                        full_location = location_details.get('locations', [{}])[-1].get('fullName', 'AML (Geral)')
                        
                        # Imovirtual gives us a structured location string — use it directly
                        found_location = match_location(full_location, self.config)

                        if not found_location:
                            continue

                        image_url = ""
                        images = item.get('images', [])
                        if images and len(images) > 0:
                            image_url = images[0].get('url', '')

                        properties.append({
                            'portal': 'Imovirtual',
                            'price': price,
                            'location': found_location,
                            'typology': typology,
                            'area_m2': area_m2,
                            'link': link,
                            'date': item.get('dateCreated', 'N/A'),
                            'description': item.get('title', ''),
                            'image_url': image_url
                        })
                except KeyError as e:
                    logging.debug(f"Imovirtual: Estrutura JSON alterada, chave não encontrada: {e}")
            else:
                logging.warning(f"Imovirtual: Script __NEXT_DATA__ não encontrado. A página pode ter carregado de forma diferente na extensão.")
                # Tentar encontrar articles caso a estrutura tenha mudado (fallback simples)
                articles = soup.find_all('article')
                if articles:
                    logging.info(f"Imovirtual: Encontrados {len(articles)} artigos como fallback, mas o parser de fallback não está totalmente implementado.")
                    
        except Exception as e:
            logging.error(f"Imovirtual: Falha no parsing: {e}")

        return properties
