from bs4 import BeautifulSoup
with open('tests/fixtures/olx_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
for i, el in enumerate(soup.find_all('div', {'data-cy': 'l-card'})[:1]):
    print(el.prettify())
