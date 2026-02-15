"""
Download Nippon India MF portfolio files by scraping the downloads page.

Nippon has inconsistent filename patterns, so we scrape the actual URLs from the page.

Pattern variations found:
- NIMF-MONTHLY-PORTFOLIO-31-Dec-25.xls (DD-Mon-YY)
- NIMF-MONTHLY-PORTFOLIO-Nov-25.xls (Mon-YY, no day)
- NIMF-MONTHLY-PORTFOLIO-30-June-25.xls (full month name)
- NIMF-MONTHLY-PORTFOLIO-31-July-25.xls (full month name)
- NIMF-MONTHLY-PORTFOLIO-30-April-25.xls (full month name)

Requires: playwright, requests
"""

import re
import requests
from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "nippon"
BASE_URL = "https://mf.nipponindiaim.com"
DOWNLOADS_PAGE = f"{BASE_URL}/investor-service/downloads/factsheet-portfolio-and-other-disclosures"

# Month name mappings for parsing filenames
MONTH_MAP = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12,
}

def get_target_months(count: int) -> list[tuple[int, int]]:
    """Generate last N months as (year, month) tuples."""
    today = date.today()
    months = []
    for i in range(1, count + 1):
        d = date(today.year, today.month, 1) - relativedelta(months=i)
        months.append((d.year, d.month))
    return months

def parse_month_from_filename(filename: str) -> tuple[int, int] | None:
    """Extract (year, month) from filename."""
    filename_lower = filename.lower()

    # Try pattern: DD-Mon-YY or DD-Month-YY
    match = re.search(r'(\d{1,2})-([a-z]+)-(\d{2,4})', filename_lower)
    if match:
        month_str = match.group(2)
        year_str = match.group(3)
        if month_str in MONTH_MAP:
            year = int(year_str)
            if year < 100:
                year = 2000 + year
            return (year, MONTH_MAP[month_str])

    # Try pattern: Mon-YY or Month-YY (no day)
    match = re.search(r'portfolio-([a-z]+)-(\d{2,4})\.xls', filename_lower)
    if match:
        month_str = match.group(1)
        year_str = match.group(2)
        if month_str in MONTH_MAP:
            year = int(year_str)
            if year < 100:
                year = 2000 + year
            return (year, MONTH_MAP[month_str])

    # Try pattern: MONTH-YYYY (all caps)
    match = re.search(r'portfolio-([a-z]+)-(\d{4})\.xls', filename_lower)
    if match:
        month_str = match.group(1)
        year_str = match.group(2)
        if month_str in MONTH_MAP:
            return (int(year_str), MONTH_MAP[month_str])

    return None

def scrape_portfolio_urls() -> dict[tuple[int, int], str]:
    """Scrape the downloads page for monthly portfolio URLs."""
    print(f"Scraping: {DOWNLOADS_PAGE}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(DOWNLOADS_PAGE, timeout=60000)
        page.wait_for_timeout(5000)
        html = page.content()
        browser.close()

    print(f"Page loaded, HTML length: {len(html)}")

    # Extract all monthly portfolio URLs
    pattern = r'href="([^"]*NIMF-MONTHLY-PORTFOLIO[^"]+\.xls)"'
    urls = re.findall(pattern, html, re.IGNORECASE)

    # Map URLs to months
    month_urls = {}
    for url in urls:
        filename = url.split('/')[-1]
        parsed = parse_month_from_filename(filename)
        if parsed:
            # Keep the most specific URL (prefer with day over without day)
            if parsed not in month_urls or len(url) > len(month_urls[parsed]):
                month_urls[parsed] = url

    return month_urls

def download_files():
    """Download portfolio files for the last 13 months."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    target_months = get_target_months(13)
    print(f"Target months: {[(y, m) for y, m in target_months]}")
    print("=" * 80)

    # Scrape URLs from page
    month_urls = scrape_portfolio_urls()
    print(f"\nFound URLs for {len(month_urls)} months")

    results = []
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    for year, month in target_months:
        month_name = date(year, month, 1).strftime("%B %Y")
        print(f"\n{month_name}:")

        if (year, month) not in month_urls:
            print(f"  -> [FAIL] No URL found for this month")
            results.append({"month": month_name, "success": False})
            continue

        url_path = month_urls[(year, month)]
        full_url = BASE_URL + url_path if url_path.startswith('/') else url_path
        filename_on_server = url_path.split('/')[-1]

        print(f"  URL: {url_path}")

        try:
            response = session.get(full_url, timeout=60)

            if response.status_code == 200:
                content = response.content

                # Check if it's an Excel file (XLS magic bytes or content type)
                is_excel = (
                    content[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1' or  # OLE2 (XLS)
                    content[:4] == b'PK\x03\x04' or  # ZIP (XLSX)
                    'application' in response.headers.get('Content-Type', '')
                )

                if is_excel:
                    # Save with standardized name
                    month_short = date(year, month, 1).strftime("%b")
                    filename = f"nippon_{year}-{month_short}.xls"
                    output_path = OUTPUT_DIR / filename
                    output_path.write_bytes(content)

                    size_kb = len(content) / 1024
                    print(f"  -> [OK] Downloaded {size_kb:.1f} KB")
                    results.append({"month": month_name, "success": True})
                else:
                    print(f"  -> [FAIL] Not an Excel file")
                    print(f"            Content-Type: {response.headers.get('Content-Type')}")
                    results.append({"month": month_name, "success": False})
            else:
                print(f"  -> [FAIL] HTTP {response.status_code}")
                results.append({"month": month_name, "success": False})

        except Exception as e:
            print(f"  -> [FAIL] Error: {str(e)[:100]}")
            results.append({"month": month_name, "success": False})

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")

    if failed:
        print(f"\nFailed months: {[r['month'] for r in failed]}")

if __name__ == "__main__":
    download_files()
