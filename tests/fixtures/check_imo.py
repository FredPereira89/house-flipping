from bs4 import BeautifulSoup
with open('tests/fixtures/imovirtual_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
for i, art in enumerate(soup.find_all('article')[:3]):
    print(f'--- Article {i} ---')
    print(art.attrs)
    a = art.find('a')
    if a: print('Href:', a.get('href'))
