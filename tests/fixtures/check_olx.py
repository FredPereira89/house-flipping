from bs4 import BeautifulSoup
with open('tests/fixtures/olx_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
for i, el in enumerate(soup.find_all('div', {'data-cy': 'l-card'})[:3]):
    print(f'--- OLX Card {i} ---')
    a = el.find('a')
    if a: print('Href:', a.get('href'))
    for text_el in el.find_all(True):
        if text_el.string and text_el.string.strip():
            print(text_el.string.strip()[:100])
