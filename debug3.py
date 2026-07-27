import cloudscraper

def check_html():
    scraper = cloudscraper.create_scraper()
    url_olx = "https://www.olx.pt/imoveis/apartamentos-casas-a-venda/lisboa/"
    r_olx = scraper.get(url_olx)
    print("OLX HTML SNIPPET:")
    print(r_olx.text[:500])
    if "captcha" in r_olx.text.lower() or "challenge" in r_olx.text.lower() or "datadome" in r_olx.text.lower():
        print("OLX IS BLOCKING US.")

    url_imo = "https://www.imovirtual.com/pt/comprar/apartamento/lisboa/"
    r_imo = scraper.get(url_imo)
    print("\nIMOVIRTUAL HTML SNIPPET:")
    print(r_imo.text[:500])
    if "captcha" in r_imo.text.lower() or "challenge" in r_imo.text.lower() or "datadome" in r_imo.text.lower():
        print("IMOVIRTUAL IS BLOCKING US.")

check_html()
