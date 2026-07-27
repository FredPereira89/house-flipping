from bs4 import BeautifulSoup

def analyze():
    with open('debug_page.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    
    articles = soup.find_all('article', class_='item')
    print(f"Found {len(articles)} articles with class 'item'")
    
    if articles:
        first = articles[0]
        print(f"--- First article structure ---")
        
        # find price
        price = first.find('span', class_='item-price')
        print(f"Has item-price: {price is not None}")
        
        if not price:
            print("All spans in article:")
            for s in first.find_all('span'):
                print(f"Span classes: {s.get('class')}, text: {s.text.strip()}")
                
        # find link
        link = first.find('a', class_='item-link')
        print(f"\nHas item-link: {link is not None}")
        
        if not link:
            print("All links in article:")
            for a in first.find_all('a'):
                print(f"Link classes: {a.get('class')}, href: {a.get('href')}, text: {a.text.strip()}")

if __name__ == "__main__":
    analyze()
