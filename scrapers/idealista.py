import re
from bs4 import BeautifulSoup
import logging
from scrapers.base_scraper import BaseScraper
from utils.location_matcher import match_location

class IdealistaScraper(BaseScraper):
    def __init__(self, config):
        super().__init__(config)
        self.base_url = "https://www.idealista.pt"

    def parse_html(self, url, html_content):
        properties = []
        logging.info("Idealista: A analisar HTML recebido da extensão...")
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            articles = soup.find_all('article', class_='item')
            
            for article in articles:
                try:
                    price_element = article.find('span', class_='item-price')
                    if not price_element:
                        continue
                    
                    price_text = price_element.text.replace('€', '').replace('.', '').strip()
                    price = float(price_text)
                    
                    if price > self.config['filters']['max_price']:
                        continue

                    link_element = article.find('a', class_='item-link')
                    link = f"{self.base_url}{link_element['href']}" if link_element else ""
                    title = link_element.text.strip() if link_element else ""
                    
                    details = article.find_all('span', class_='item-detail')
                    typology_text = details[0].text if len(details) > 0 else "0"
                    
                    typology_match = re.search(r'\d+', typology_text)
                    typology = int(typology_match.group()) if typology_match else 0
                    
                    if typology < self.config['filters']['min_typology']:
                        continue

                    area_text = details[1].text if len(details) > 1 else "0"
                    area_match = re.search(r'\d+', area_text)
                    area_m2 = float(area_match.group()) if area_match else 0
                    
                    if area_m2 == 0:
                        continue

                    # Use the title + any location breadcrumb visible in the article text
                    location_hint = article.find('span', class_='item-detail-char')
                    location_text = title
                    if location_hint:
                        location_text += ' ' + location_hint.get_text()
                    location = match_location(location_text, self.config)

                    if not location:
                        continue

                    image_elem = article.find('picture')
                    image_url = ""
                    if image_elem:
                        img_tag = image_elem.find('img')
                        if img_tag and 'src' in img_tag.attrs:
                            image_url = img_tag['src']
                            
                    properties.append({
                        'portal': 'Idealista',
                        'price': price,
                        'location': location,
                        'typology': typology,
                        'area_m2': area_m2,
                        'link': link,
                        'date': 'N/A',
                        'description': article.get_text(separator=' ').strip(),
                        'image_url': image_url
                    })
                except Exception as e:
                    logging.debug(f"Idealista: Erro ao extrair item: {e}")
                    
        except Exception as e:
            logging.error(f"Idealista: Falha no parsing: {e}")

        return properties
