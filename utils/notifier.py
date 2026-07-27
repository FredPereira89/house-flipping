import os
import requests
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.parse

class Notifier:
    def __init__(self):
        self.method = os.getenv("NOTIFICATION_METHOD", "none").lower()
        
        # Email config
        self.smtp_email = os.getenv("SMTP_EMAIL")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.receiver_email = os.getenv("RECEIVER_EMAIL")
        
        # WhatsApp config
        self.wa_phone = os.getenv("WHATSAPP_PHONE")
        self.wa_api_key = os.getenv("WHATSAPP_API_KEY")
        
        if self.method not in ["email", "whatsapp", "both"]:
            logging.warning("Nenhum método de notificação válido configurado.")
            self.enabled = False
        else:
            self.enabled = True

    def send_page_summary(self, opportunities, page_url):
        """Sends a single batched summary message for all opportunities found on a page."""
        if not self.enabled or not opportunities:
            return

        portal = page_url.split('/')[2] if '/' in page_url else page_url

        lines = [f"🏠 *{len(opportunities)} OPORTUNIDADE(S) ENCONTRADA(S)* — {portal}\n"]

        for i, p in enumerate(opportunities, 1):
            lines.append(
                f"*{i}.* T{p['typology']} | {p['location']}\n"
                f"   💰 {p['price']:,.0f}€ ({p['price_per_m2']:,.0f}€/m² vs média {p['avg_zone_price']:,.0f}€/m²)\n"
                f"   📉 -{p.get('discount_pct', 0):.1f}% abaixo da média\n"
                f"   🔗 {p['link']}\n"
            )

        message = "\n".join(lines)

        if self.method in ["whatsapp", "both"]:
            self._send_whatsapp(message, portal)

        if self.method in ["email", "both"]:
            for p in opportunities:
                self._send_email(p, message)
            

    def _send_whatsapp(self, text, link):
        if not self.wa_phone or not self.wa_api_key:
            logging.error("Credenciais WhatsApp em falta.")
            return
            
        try:
            encoded_text = urllib.parse.quote(text)
            url = f"https://api.callmebot.com/whatsapp.php?phone={self.wa_phone}&text={encoded_text}&apikey={self.wa_api_key}"
            response = requests.get(url)
            response.raise_for_status()
            logging.info(f"Notificação WhatsApp enviada: {link}")
        except Exception as e:
            logging.error(f"Erro ao enviar notificação WhatsApp: {e}")

    def _send_email(self, property_data, text_content):
        if not self.smtp_email or not self.smtp_password or not self.receiver_email:
            logging.error("Credenciais Email em falta.")
            return
            
        try:
            msg = MIMEMultipart()
            msg['From'] = self.smtp_email
            msg['To'] = self.receiver_email
            msg['Subject'] = f"House Flipping: T{property_data['typology']} em {property_data['location']} ({property_data['price']} €)"
            
            # Limpar formatação markdown para texto plano do email (ou poderíamos enviar HTML)
            clean_text = text_content.replace('*', '')
            msg.attach(MIMEText(clean_text, 'plain'))
            
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(self.smtp_email, self.smtp_password)
            text = msg.as_string()
            server.sendmail(self.smtp_email, self.receiver_email, text)
            server.quit()
            
            logging.info(f"Notificação Email enviada: {property_data['link']}")
        except Exception as e:
            logging.error(f"Erro ao enviar notificação Email: {e}")
