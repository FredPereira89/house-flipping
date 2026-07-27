import curl_cffi.requests as requests

def test_cffi():
    urls = [
        "https://www.idealista.pt/",
        "https://www.imovirtual.com/pt/comprar/apartamento/lisboa/",
        "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/"
    ]
    for url in urls:
        print(f"Testing {url}...")
        try:
            r = requests.get(url, impersonate="chrome120", timeout=15)
            print(f"Status: {r.status_code}")
            if "datadome" in r.text.lower() or "challenge" in r.text.lower():
                print("-> Blocked by Datadome/Cloudflare")
            else:
                print("-> Passed!")
                if "olx" in url:
                    if 'data-cy="l-card"' in r.text:
                        print("-> Found l-card on OLX")
                elif "imovirtual" in url:
                    if '__NEXT_DATA__' in r.text:
                        print("-> Found __NEXT_DATA__ on Imovirtual")
        except Exception as e:
            print("Error:", e)

test_cffi()
