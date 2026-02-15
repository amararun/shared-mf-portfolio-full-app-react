"""
Download ABSL portfolio files by scraping their portfolio page.

ABSL has highly inconsistent URL naming - cannot use predictable patterns.
Must scrape https://mutualfund.adityabirlacapital.com/forms-and-downloads/portfolio
to get actual URLs.

Requires: playwright (pip install playwright && playwright install chromium)
"""

import requests
import re
from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "absl"
BASE_URL = "https://mutualfund.adityabirlacapital.com"
PORTFOLIO_PAGE = f"{BASE_URL}/forms-and-downloads/portfolio"

def get_month_end_dates(count: int) -> list[date]:
    """Generate last N month-end dates."""
    today = date.today()
    dates = []
    for i in range(1, count + 1):
        first_of_month = date(today.year, today.month, 1) - relativedelta(months=i)
        last_day = (first_of_month + relativedelta(months=1)) - relativedelta(days=1)
        dates.append(last_day)
    return dates

def scrape_portfolio_urls() -> list[str]:
    """Use Playwright to render the page and extract portfolio URLs."""
    print(f"Scraping: {PORTFOLIO_PAGE}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(PORTFOLIO_PAGE, timeout=60000)
        page.wait_for_timeout(5000)  # Wait for JS to render

        html = page.content()
        browser.close()

    # Extract portfolio ZIP URLs
    pattern = r'/-/media/bsl/files/resources/monthly-portfolio/[^"\'<>]*\.zip'
    urls = re.findall(pattern, html, re.IGNORECASE)
    unique_urls = sorted(set(urls))

    print(f"Found {len(unique_urls)} unique portfolio URLs")
    return unique_urls

def parse_date_from_url(url: str) -> date | None:
    """Try to extract date from URL filename."""
    filename = url.split('/')[-1].lower()

    # Try various patterns
    # Pattern: -DD-mon-YYYY or -DD-month-YYYY
    month_map = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
        'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
        'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    }

    # Match patterns like -31-dec-2025 or -30-november-2025
    for month_name, month_num in month_map.items():
        pattern = rf'-(\d{{1,2}})-{month_name}-(\d{{4}})'
        match = re.search(pattern, filename)
        if match:
            day = int(match.group(1))
            year = int(match.group(2))
            try:
                return date(year, month_num, day)
            except ValueError:
                continue

    return None

def download_file(url: str, output_path: Path) -> tuple[bool, str]:
    """Download file from URL."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, timeout=30, headers=headers)

        if response.status_code == 200:
            if response.content[:4] == b'PK\x03\x04':
                output_path.write_bytes(response.content)
                return True, f"Downloaded {len(response.content)/1024:.1f} KB"
            else:
                return False, "Not a valid ZIP file"
        else:
            return False, f"HTTP {response.status_code}"
    except Exception as e:
        return False, str(e)

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    # Get target dates (last 13 months)
    target_dates = get_month_end_dates(13)
    target_dates_set = set(target_dates)

    print(f"\nTarget months: {[d.strftime('%b %Y') for d in target_dates]}")
    print("=" * 80)

    # Scrape portfolio page for URLs
    all_urls = scrape_portfolio_urls()

    # Map URLs to dates
    url_date_map = {}
    for url in all_urls:
        parsed_date = parse_date_from_url(url)
        if parsed_date:
            url_date_map[parsed_date] = url

    print(f"\nParsed {len(url_date_map)} URLs with valid dates")
    print("=" * 80)

    # Download files for target dates
    results = []
    for target_date in target_dates:
        label = target_date.strftime("%b %Y")

        if target_date in url_date_map:
            url = BASE_URL + url_date_map[target_date]
            filename = f"absl_{target_date.strftime('%Y-%m-%d')}.zip"
            output_path = OUTPUT_DIR / filename

            print(f"\n{label}:")
            print(f"  URL: {url_date_map[target_date]}")

            success, message = download_file(url, output_path)
            status = "OK" if success else "FAIL"
            print(f"  -> [{status}] {message}")

            results.append({"month": label, "success": success})
        else:
            print(f"\n{label}:")
            print(f"  -> [FAIL] No URL found for this date")
            results.append({"month": label, "success": False})

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")

if __name__ == "__main__":
    main()
