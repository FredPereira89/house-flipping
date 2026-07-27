from abc import ABC, abstractmethod

class BaseScraper(ABC):
    def __init__(self, config):
        self.config = config

    @abstractmethod
    def parse_html(self, url, html_content):
        """
        Deve retornar uma lista de dicionários com as propriedades extraídas do HTML.
        """
        pass
