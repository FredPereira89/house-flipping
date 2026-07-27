from bs4 import BeautifulSoup
import logging
from scrapers.base_scraper import BaseScraper
from utils.location_matcher import match_location

class OlxScraper(BaseScraper):
    def __init__(self, config):
        super().__init__(config)
        self.base_url = "https://www.olx.pt"

    def parse_html(self, url, html_content):
        properties = []
        logging.info("OLX: A analisar HTML recebido da extensão...")
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            cards = soup.find_all('div', {'data-cy': 'l-card'})
            
            for card in cards:
                try:
                    price_elem = card.find('p', {'data-testid': 'ad-price'})
                    if not price_elem:
                        continue
                        
                    price_text = price_elem.text.replace('€', '').replace(' ', '').strip()
                    try:
                        price = float(price_text)
                    except ValueError:
                        continue
                        
                    if price > self.config['filters']['max_price']:
                        continue

                    link_elem = card.find('a')
                    link = link_elem['href'] if link_elem else ""
                    if link.startswith('/d/'):
                        link = f"{self.base_url}{link}"

                    title_elem = card.find('h6')
                    title = title_elem.text.strip() if title_elem else ""
                    
                    typology = 0
                    for t in range(1, 6):
                        if f"T{t}" in title.upper():
                            typology = t
                            break
                            
                    if typology < self.config['filters']['min_typology']:
                        continue
                        
                    area_m2 = 50.0 # Default mock
                    
                    location_elem = card.find('p', {'data-testid': 'location-date'})
                    location_text = location_elem.text if location_elem else ""
                    
                    location_text = location_text + ' ' + title
                    found_location = match_location(location_text, self.config)

                    if not found_location:
                        continue

                    image_elem = card.find('img')
                    image_url = ""
                    if image_elem and 'src' in image_elem.attrs:
                        image_url = image_elem['src']
                        
                    properties.append({
                        'portal': 'OLX',
                        'price': price,
                        'location': found_location,
                        'typology': typology,
                        'area_m2': area_m2,
                        'link': link,
                        'date': location_text.split('-')[-1].strip() if '-' in location_text else 'N/A',
                        'description': card.get_text(separator=' ').strip(),
                        'image_url': image_url
                    })
                except Exception as e:
                    logging.debug(f"OLX: Erro ao processar card: {e}")
                    
        except Exception as e:
            logging.error(f"OLX: Falha no parsing: {e}")

        return properties
