from bs4 import BeautifulSoup
with open('tests/fixtures/imovirtual_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
art = soup.find('article')
for dt, dd in zip(art.find_all('dt'), art.find_all('dd')):
    print(dt.text, ':', dd.text)
