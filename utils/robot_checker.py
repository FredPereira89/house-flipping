import urllib.robotparser
from urllib.parse import urlparse
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class RobotChecker:
    def __init__(self, user_agent='*'):
        self.user_agent = user_agent
        self.parsers = {}

    def is_allowed(self, url):
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        if base_url not in self.parsers:
            robots_url = f"{base_url}/robots.txt"
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)
            try:
                parser.read()
                self.parsers[base_url] = parser
            except Exception as e:
                logging.warning(f"Could not read robots.txt for {base_url}: {e}")
                # If we can't read robots.txt, we assume it's allowed (or we could assume forbidden to be safe)
                return True

        parser = self.parsers[base_url]
        allowed = parser.can_fetch(self.user_agent, url)
        if not allowed:
            logging.warning(f"Scraping {url} is forbidden by robots.txt")
        return allowed
