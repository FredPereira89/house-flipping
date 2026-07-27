from bs4 import BeautifulSoup
import sys

def analyze():
    with open('debug_page.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    
    print(f"Total HTML length: {len(html)}")
    
    # Let's find any text containing '€'
    prices = soup.find_all(text=lambda text: text and '€' in text)
    print(f"Found {len(prices)} elements containing €")
    
    for i, p in enumerate(prices[:5]):
        parent = p.parent
        print(f"--- Price {i} ---")
        print(f"Text: {p.strip()}")
        print(f"Parent Tag: {parent.name}")
        print(f"Parent Classes: {parent.get('class')}")
        
        # Go up a few levels to see the container
        container = parent
        for _ in range(4):
            if container.parent:
                container = container.parent
        print(f"Container (4 levels up) classes: {container.get('class')}")
        print(f"Container name: {container.name}")
        print()

if __name__ == "__main__":
    analyze()
