import json
from scrapers.idealista import IdealistaScraper

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

with open('debug_page.html', 'r', encoding='utf-8') as f:
    html = f.read()

scraper = IdealistaScraper(config)
properties = scraper.parse_html('test', html)
print(f"Extracted {len(properties)} properties using the scraper.")
for p in properties[:5]:
    print(p)
