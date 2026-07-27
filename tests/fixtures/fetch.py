import urllib.request
import os

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

urls = {
    'idealista_search.html': 'https://www.idealista.pt/comprar-casas/lisboa/',
    'imovirtual_search.html': 'https://www.imovirtual.com/pt/comprar/apartamento/lisboa/',
    'olx_search.html': 'https://www.olx.pt/imoveis/casas-apartamentos-para-arrendar-vender/apartamentos-venda/lisboa/'
}

os.makedirs('tests/fixtures', exist_ok=True)

for filename, url in urls.items():
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            html = response.read()
            with open(f'tests/fixtures/{filename}', 'wb') as f:
                f.write(html)
            print(f'Successfully downloaded {filename} ({len(html)} bytes)')
    except Exception as e:
        print(f'Failed to download {filename}: {e}')
