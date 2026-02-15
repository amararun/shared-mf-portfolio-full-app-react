"""Fetch JM Financial page source."""
import requests
from pathlib import Path

URL = "https://www.jmfinancialmf.com/downloads/Portfolio-Disclosure"
TEMP_DIR = Path(__file__).parent.parent / "temp"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

TEMP_DIR.mkdir(parents=True, exist_ok=True)

print(f"Fetching: {URL}")
response = requests.get(URL, headers=HEADERS, timeout=30)
print(f"Status: {response.status_code}")
print(f"Size: {len(response.text):,} chars")

html_path = TEMP_DIR / "jm_financial_page.html"
html_path.write_text(response.text, encoding='utf-8')
print(f"Saved to: {html_path}")

# Search for xlsx/xls patterns
import re
xlsx_links = re.findall(r'[^"\'>\s]*\.xlsx?', response.text, re.IGNORECASE)
print(f"\nFound {len(xlsx_links)} xlsx/xls links:")
for link in xlsx_links[:20]:
    print(f"  {link}")
