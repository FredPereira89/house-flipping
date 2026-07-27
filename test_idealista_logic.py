import json
from bs4 import BeautifulSoup
from scrapers.idealista import IdealistaScraper

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

with open('debug_page.html', 'r', encoding='utf-8') as f:
    html = f.read()

scraper = IdealistaScraper(config)
# Replicate the logic to print debug info
soup = BeautifulSoup(html, 'html.parser')
articles = soup.find_all('article', class_='item')

print(f"Total articles: {len(articles)}")

for idx, article in enumerate(articles):
    price_element = article.find('span', class_='item-price')
    if not price_element:
        print(f"{idx}: No price_element")
        continue
    
    price_text = price_element.text.replace('€', '').replace('.', '').strip()
    price = float(price_text)
    
    if price > config['filters']['max_price']:
        print(f"{idx}: Skipped because price {price} > {config['filters']['max_price']}")
        continue

    link_element = article.find('a', class_='item-link')
    link = f"https://www.idealista.pt{link_element['href']}" if link_element else ""
    title = link_element.text.strip() if link_element else ""
    
    details = article.find_all('span', class_='item-detail')
    typology_text = details[0].text if len(details) > 0 else "0"
    typology = int(''.join(filter(str.isdigit, typology_text))) if any(char.isdigit() for char in typology_text) else 0
    
    if typology < config['filters']['min_typology']:
        print(f"{idx}: Skipped because typology {typology} < {config['filters']['min_typology']}. Title: {title}. details[0]: {typology_text}")
        continue

    area_text = details[1].text if len(details) > 1 else "0"
    area_m2 = float(''.join(filter(str.isdigit, area_text))) if any(char.isdigit() for char in area_text) else 0
    
    if area_m2 == 0:
        print(f"{idx}: Skipped because area_m2 == 0. details[1]: {area_text}")
        continue

    print(f"{idx}: Kept! Price: {price}, Typology: {typology}, Area: {area_m2}, Title: {title}")

