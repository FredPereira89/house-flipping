from bs4 import BeautifulSoup
import re
with open('tests/fixtures/imovirtual_search.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
art = soup.find('article')
for elem in art.find_all(True):
    if elem.string and elem.string.strip():
        print(f"Tag: {elem.name}, Class: {elem.get('class')}, Text: {elem.string.strip()[:100]}")
