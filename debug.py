import cloudscraper
import requests
from bs4 import BeautifulSoup

def test_imovirtual():
    print("Testing Imovirtual...")
    scraper = cloudscraper.create_scraper()
    url = "https://www.imovirtual.com/pt/comprar/apartamento/lisboa/"
    try:
        r = scraper.get(url)
        print("Imovirtual status:", r.status_code)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            script = soup.find('script', id='__NEXT_DATA__')
            if script:
                print("Found __NEXT_DATA__ script!")
            else:
                print("No __NEXT_DATA__ found. Here are some tags:")
                print([tag.name for tag in soup.find_all()][:20])
    except Exception as e:
        print("Error:", e)

def test_olx():
    print("\nTesting OLX...")
    scraper = cloudscraper.create_scraper()
    url = "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/"
    try:
        r = scraper.get(url)
        print("OLX status:", r.status_code)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            cards = soup.find_all('div', {'data-cy': 'l-card'})
            print(f"Found {len(cards)} cards using data-cy='l-card'")
            if len(cards) == 0:
                print("Trying other selectors for cards...")
                articles = soup.find_all('div', {'data-testid': 'l-card'})
                print(f"Found {len(articles)} cards using data-testid='l-card'")
    except Exception as e:
        print("Error:", e)

def test_idealista():
    print("\nTesting Idealista...")
    scraper = cloudscraper.create_scraper()
    url = "https://www.idealista.pt/comprar-casas/lisboa-distrito/"
    try:
        r = scraper.get(url)
        print("Idealista status:", r.status_code)
        if r.status_code == 403:
            print("Blocked by Cloudflare/Datadome.")
        elif r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            items = soup.find_all('article', class_='item')
            print(f"Found {len(items)} items on Idealista.")
    except Exception as e:
        print("Error:", e)

test_imovirtual()
test_olx()
test_idealista()
