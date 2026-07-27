from bs4 import BeautifulSoup
with open('tests/fixtures/imovirtual_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
art = soup.find('article')
print(art.prettify()[:1500])
