import cloudscraper
import re

scraper = cloudscraper.create_scraper()
url_olx = "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/?search%5Bfilter_float_price%3Ato%5D=230000"
r_olx = scraper.get(url_olx)
print("Looking for JSON state in OLX...")
match = re.search(r'window\.__PRERENDERED_STATE__\s*=\s*(\{.*?\});', r_olx.text)
if match:
    print("Found PRERENDERED_STATE!")
else:
    print("Not found. Searching for any large JSON...")
    scripts = re.findall(r'<script.*?>(\{.*?\})</script>', r_olx.text)
    print(f"Found {len(scripts)} scripts with JSON.")
    for s in scripts:
        if len(s) > 1000:
            print("Large script preview:", s[:100])
