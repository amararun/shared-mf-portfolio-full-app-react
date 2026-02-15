"""
Scrape JM Financial portfolio files using Playwright.

JM Financial has a JS-rendered React app with separate files per fund.
This script navigates the page, selects "Monthly Portfolio of Schemes",
and extracts all portfolio file URLs by paginating through the list.

Page structure:
- Select 0: Category (Forms, Factsheet, Portfolio Disclosure, etc.)
- Select 1: SubCategory (Fortnightly/Monthly/Half Yearly Portfolio)
- Select 2: Year filter (All Year, 2025-2026, etc.)
- Pagination: rc-pagination React component
"""

import asyncio
import re
from pathlib import Path
from playwright.async_api import async_playwright
import requests
import time
import json

PAGE_URL = "https://www.jmfinancialmf.com/downloads/Portfolio-Disclosure"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "jm_financial"
TEMP_DIR = Path(__file__).parent.parent / "temp"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}


async def scrape_monthly_portfolio_urls():
    """Use Playwright to scrape monthly portfolio file URLs from JM Financial."""

    async with async_playwright() as p:
        print("Launching browser...")
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await context.new_page()

        print(f"Navigating to: {PAGE_URL}")
        await page.goto(PAGE_URL, wait_until="networkidle")
        await page.wait_for_timeout(3000)

        print("\n=== Selecting Monthly Portfolio of Schemes ===")

        # Find all select elements
        selects = await page.query_selector_all('select')
        print(f"Found {len(selects)} select elements")

        # Select 1 is the subcategory dropdown
        if len(selects) >= 2:
            subcategory_select = selects[1]

            # Get current options
            options = await subcategory_select.query_selector_all('option')
            for opt in options:
                text = await opt.inner_text()
                value = await opt.get_attribute('value')
                print(f"  Option: {text} (value={value})")

            # Select "Monthly Portfolio of Schemes"
            print("\nSelecting 'Monthly Portfolio of Schemes'...")
            await subcategory_select.select_option(label="Monthly Portfolio of Schemes")
            await page.wait_for_timeout(3000)  # Wait for data to load

        # Now extract all file URLs by paginating
        all_urls = []
        seen_urls = set()

        async def extract_current_page_links():
            """Extract Excel file links from current page view."""
            links = await page.evaluate('''() => {
                const links = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || a.getAttribute('href');
                    if (href && (href.toLowerCase().includes('.xlsx') || href.toLowerCase().includes('.xls'))) {
                        const fullUrl = href.startsWith('http') ? href :
                                       href.startsWith('/') ? window.location.origin + href :
                                       window.location.origin + '/' + href;
                        // Get row text for context
                        const row = a.closest('tr');
                        const text = row ? row.innerText.trim() : a.innerText.trim();
                        links.push({
                            url: fullUrl,
                            text: text.substring(0, 300)
                        });
                    }
                });
                return links;
            }''')
            return links

        # Get links from first page
        current_links = await extract_current_page_links()
        for link in current_links:
            if link['url'] not in seen_urls:
                seen_urls.add(link['url'])
                all_urls.append(link)

        print(f"Page 1: Found {len(current_links)} Excel links (Unique: {len(all_urls)})")

        # Navigate through pagination using rc-pagination
        page_num = 1
        max_pages = 250

        while page_num < max_pages:
            # Find the "Next" button in rc-pagination
            next_btn = await page.query_selector('.rc-pagination-next:not(.rc-pagination-disabled)')

            if not next_btn:
                print("No more pages (Next button disabled or not found)")
                break

            # Click next
            await next_btn.click()
            await page.wait_for_timeout(1500)  # Wait for content to load
            page_num += 1

            # Extract links from new page
            current_links = await extract_current_page_links()
            new_count = 0
            for link in current_links:
                if link['url'] not in seen_urls:
                    seen_urls.add(link['url'])
                    all_urls.append(link)
                    new_count += 1

            if new_count == 0:
                # No new links found, might be last page
                print(f"Page {page_num}: No new links found")
                break

            print(f"Page {page_num}: Found {len(current_links)} links, {new_count} new (Total: {len(all_urls)})")

            # Safety check - stop if we're getting duplicates repeatedly
            if len(current_links) == 0:
                break

        print(f"\n=== Total unique Excel links extracted: {len(all_urls)} ===")

        # Save all URLs to a file for review
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        with open(TEMP_DIR / "jm_financial_urls.json", 'w', encoding='utf-8') as f:
            json.dump(all_urls, f, indent=2, ensure_ascii=False)
        print(f"Saved URLs to temp/jm_financial_urls.json")

        # Take a screenshot
        await page.screenshot(path=str(TEMP_DIR / "jm_financial_final.png"))

        await browser.close()

        return all_urls


def parse_date_from_filename(filename: str) -> str:
    """Extract date from JM Financial filename patterns."""
    from urllib.parse import unquote

    # URL decode the filename first
    filename = unquote(filename)

    MONTH_MAP = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
    }

    # Pattern: "December 31, 2025" or "December 31 2025" (full month name)
    match = re.search(
        r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})',
        filename, re.IGNORECASE
    )
    if match:
        month_name, day, year = match.groups()
        month = MONTH_MAP.get(month_name.lower(), '01')
        return f"{year}-{month}-{int(day):02d}"

    return None


def download_file(url: str, output_path: Path) -> tuple[bool, str]:
    """Download file from URL. Returns (success, message)."""
    try:
        response = requests.get(url, timeout=60, headers=HEADERS, allow_redirects=True)

        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'html' in content_type.lower():
                return False, "Got HTML response (likely 404 page)"

            output_path.write_bytes(response.content)
            size_kb = len(response.content) / 1024
            return True, f"Downloaded {size_kb:.1f} KB"
        else:
            return False, f"HTTP {response.status_code}"
    except requests.RequestException as e:
        return False, str(e)


def download_from_urls_file(target_month: str = None):
    """
    Download files from previously scraped URLs.

    Args:
        target_month: Optional YYYY-MM to filter (e.g., "2025-12")
    """
    from urllib.parse import unquote

    urls_file = TEMP_DIR / "jm_financial_urls.json"
    if not urls_file.exists():
        print("No URLs file found. Run scraper first.")
        return

    with open(urls_file, 'r', encoding='utf-8') as f:
        all_urls = json.load(f)

    # Filter for Monthly Portfolio files only
    monthly_urls = []
    for url_info in all_urls:
        filename = unquote(url_info['url'].split('/')[-1])
        if 'monthly' in filename.lower() and 'portfolio' in filename.lower():
            date = parse_date_from_filename(filename)
            if date:
                if target_month is None or date.startswith(target_month):
                    monthly_urls.append({
                        'url': url_info['url'],
                        'filename': filename,
                        'date': date
                    })

    print(f"Found {len(monthly_urls)} Monthly Portfolio files to download")
    if target_month:
        print(f"Filtered to month: {target_month}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for i, item in enumerate(monthly_urls):
        # Create output filename
        safe_filename = item['filename'].replace(' ', '_').replace(',', '')
        output_path = OUTPUT_DIR / f"jm_{item['date']}_{safe_filename}"

        if output_path.exists():
            print(f"[{i+1}/{len(monthly_urls)}] Skip (exists): {safe_filename[:50]}...")
            results.append({'success': True, 'skipped': True})
            continue

        print(f"[{i+1}/{len(monthly_urls)}] Downloading: {safe_filename[:50]}...")

        success, message = download_file(item['url'], output_path)
        results.append({'success': success, 'message': message, 'file': safe_filename})

        if success:
            print(f"  -> OK: {message}")
        else:
            print(f"  -> FAIL: {message}")

        time.sleep(0.3)

    # Summary
    successful = [r for r in results if r['success']]
    failed = [r for r in results if not r['success']]
    print(f"\nDownload complete: {len(successful)}/{len(results)} successful")

    if failed:
        print("Failed downloads:")
        for r in failed:
            print(f"  - {r.get('file', 'Unknown')}: {r.get('message', 'Unknown')}")


async def main():
    import sys

    print("=" * 80)
    print("JM Financial Monthly Portfolio Scraper")
    print("=" * 80)

    # Check for command line args
    if len(sys.argv) > 1:
        if sys.argv[1] == "download":
            # Download mode - use existing URLs
            target_month = sys.argv[2] if len(sys.argv) > 2 else None
            download_from_urls_file(target_month)
            return
        elif sys.argv[1] == "scrape":
            pass  # Continue to scraping
        else:
            print("Usage:")
            print("  python scrape_jm_financial.py          # Scrape URLs only")
            print("  python scrape_jm_financial.py scrape   # Scrape URLs only")
            print("  python scrape_jm_financial.py download # Download all files")
            print("  python scrape_jm_financial.py download 2025-12  # Download specific month")
            return

    # Scrape mode
    urls = await scrape_monthly_portfolio_urls()

    print("\n" + "=" * 80)
    print("RESULTS SUMMARY")
    print("=" * 80)
    print(f"Total URLs found: {len(urls)}")

    if urls:
        from urllib.parse import unquote

        # Filter for monthly portfolio only
        monthly_files = []
        for url_info in urls:
            filename = unquote(url_info['url'].split('/')[-1])
            if 'monthly' in filename.lower() and 'portfolio' in filename.lower():
                date = parse_date_from_filename(filename)
                monthly_files.append({'filename': filename, 'date': date})

        print(f"Monthly Portfolio files: {len(monthly_files)}")

        # Group by year-month
        by_month = {}
        for f in monthly_files:
            if f['date']:
                ym = f['date'][:7]
                if ym not in by_month:
                    by_month[ym] = []
                by_month[ym].append(f['filename'])

        print(f"\nFiles by month (unique months: {len(by_month)}):")
        for ym in sorted(by_month.keys(), reverse=True)[:12]:
            print(f"  {ym}: {len(by_month[ym])} files")

        print("\nTo download files, run:")
        print("  python scrape_jm_financial.py download        # All files")
        print("  python scrape_jm_financial.py download 2025-12 # Specific month")


if __name__ == "__main__":
    asyncio.run(main())
