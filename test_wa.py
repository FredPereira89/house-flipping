import requests
import urllib.parse

phone = "351965737310"
apikey = "1193119"
text = "Teste direto de mensagem!"
encoded = urllib.parse.quote(text)

url1 = f"https://api.callmebot.com/whatsapp.php?phone={phone}&text={encoded}&apikey={apikey}"
url2 = f"https://api.callmebot.com/whatsapp.php?phone=+{phone}&text={encoded}&apikey={apikey}"

print("Testing without + :")
r1 = requests.get(url1)
print(r1.status_code, r1.text)

print("\nTesting with + :")
r2 = requests.get(url2)
print(r2.status_code, r2.text)
