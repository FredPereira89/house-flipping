from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
from bs4 import BeautifulSoup
import time

def test_pw():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        stealth_sync(page)
        
        url = "https://www.idealista.pt/comprar-casas/lisboa-distrito/"
        print("Navigating to Idealista...")
        page.goto(url)
        time.sleep(3)
        html = page.content()
        soup = BeautifulSoup(html, 'html.parser')
        items = soup.find_all('article', class_='item')
        print(f"Idealista items found: {len(items)}")
        
        url2 = "https://www.imovirtual.com/pt/comprar/apartamento/lisboa/"
        print("Navigating to Imovirtual...")
        page.goto(url2)
        time.sleep(3)
        html2 = page.content()
        soup2 = BeautifulSoup(html2, 'html.parser')
        # Imovirtual loads react app now
        cards = soup2.find_all('article')
        print(f"Imovirtual articles found: {len(cards)}")
        
        url3 = "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/"
        print("Navigating to OLX...")
        page.goto(url3)
        time.sleep(3)
        html3 = page.content()
        soup3 = BeautifulSoup(html3, 'html.parser')
        # OLX cards
        cards3 = soup3.find_all('div', {'data-cy': 'l-card'})
        print(f"OLX cards found: {len(cards3)}")
        
        browser.close()

if __name__ == "__main__":
    test_pw()
