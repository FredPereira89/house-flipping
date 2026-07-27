import cloudscraper
import json
from bs4 import BeautifulSoup

def test_imovirtual_data():
    scraper = cloudscraper.create_scraper()
    url = "https://www.imovirtual.com/pt/comprar/apartamento/lisboa/?search%5Bfilter_float_price%3Ato%5D=230000"
    r = scraper.get(url)
    soup = BeautifulSoup(r.text, 'html.parser')
    script = soup.find('script', id='__NEXT_DATA__')
    if script:
        data = json.loads(script.text)
        try:
            # Let's see the keys of initial state
            initialState = data.get('props', {}).get('pageProps', {}).get('initialState', {})
            print("Initial state keys:", initialState.keys())
            search = initialState.get('search', {})
            print("Search keys:", search.keys())
            searchAds = search.get('searchAds', {})
            print("searchAds keys:", searchAds.keys())
            items = searchAds.get('list', [])
            print(f"Found {len(items)} items in Imovirtual list")
            if items:
                print("First item keys:", items[0].keys())
        except Exception as e:
            print("Error parsing JSON structure:", e)

def test_olx_html():
    scraper = cloudscraper.create_scraper()
    url = "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/?search%5Bfilter_float_price%3Ato%5D=230000"
    r = scraper.get(url)
    soup = BeautifulSoup(r.text, 'html.parser')
    
    # Try finding typical OLX link structure for ads
    links = soup.find_all('a', href=lambda href: href and ('/d/anuncio/' in href))
    print(f"Found {len(links)} links with /d/anuncio/")
    if links:
        parent_div = links[0].parent.parent.parent
        print("Classes of a parent div:", parent_div.get('class'))
        print("Data attributes of parent div:", {k:v for k,v in parent_div.attrs.items() if k.startswith('data-')})

test_imovirtual_data()
test_olx_html()
