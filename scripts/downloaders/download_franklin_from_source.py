"""
Download Franklin Templeton portfolio files by scraping page source.

Franklin URLs contain dynamic UUIDs like:
https://www.franklintempletonindia.com/download/en-in/monthly-portfolio-dsclr/fc48653f-92d2-41a0-ac9c-c04149ac7cde/Monthly-Portfolio-ISIN-31-Dec-2025.xlsx

Process:
1. Fetch page source HTML (may need Playwright if JS-rendered)
2. Extract Excel URLs with regex
3. Download files
"""

import requests
import re
from pathlib import Path

PAGE_URL = "https://www.franklintempletonindia.com/reports"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "franklin"
TEMP_DIR = Path(__file__).parent.parent / "temp"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def fetch_page_source():
    """Fetch and save the page source HTML."""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Fetching: {PAGE_URL}")
    response = requests.get(PAGE_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()

    html_path = TEMP_DIR / "franklin_reports_page.html"
    html_path.write_text(response.text, encoding='utf-8')
    print(f"Saved HTML source to: {html_path}")
    print(f"HTML size: {len(response.text):,} characters")

    return response.text


def extract_portfolio_urls(html_content):
    """Extract portfolio Excel file URLs from HTML content."""
    # Pattern: /download/en-in/monthly-portfolio-dsclr/{UUID}/Monthly-Portfolio-ISIN-{date}.xlsx
    pattern = r'https://www\.franklintempletonindia\.com/download/en-in/monthly-portfolio-dsclr/[a-f0-9-]+/Monthly-Portfolio-ISIN-[^"\'>\s]+\.xlsx'

    urls = re.findall(pattern, html_content, re.IGNORECASE)
    unique_urls = list(set(urls))

    print(f"\nFound {len(unique_urls)} unique portfolio URLs")

    # Also try broader pattern
    if not unique_urls:
        print("Trying broader pattern...")
        pattern2 = r'/download/[^"\'>\s]+\.xlsx'
        urls2 = re.findall(pattern2, html_content, re.IGNORECASE)
        print(f"Found {len(urls2)} xlsx download links")
        for u in urls2[:10]:
            print(f"  {u}")

    return unique_urls


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    # Step 1: Fetch page source
    html_content = fetch_page_source()

    # Step 2: Check if page is JS-rendered
    if 'loading' in html_content.lower() and len(html_content) < 50000:
        print("\n[!] Page appears to be JavaScript-rendered!")
        print("The static HTML doesn't contain the portfolio links.")
        print("Need to use Playwright/Selenium to render the page first.")

        # Search for any useful patterns anyway
        print("\nSearching for any download patterns in static HTML...")

    # Step 3: Extract portfolio URLs
    portfolio_urls = extract_portfolio_urls(html_content)

    if not portfolio_urls:
        print("\n" + "=" * 80)
        print("NO PORTFOLIO URLs FOUND IN STATIC HTML")
        print("=" * 80)
        print("\nOptions:")
        print("1. Use browser DevTools Network tab to capture actual URLs")
        print("2. Use Playwright to render the JS and extract links")
        print("3. Check if there's an API endpoint")

        # Try to find any API endpoints in the HTML
        api_patterns = re.findall(r'api[^"\'>\s]*', html_content, re.IGNORECASE)
        if api_patterns:
            print(f"\nPossible API patterns found: {set(api_patterns)}")


if __name__ == "__main__":
    main()
