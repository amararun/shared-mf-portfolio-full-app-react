"""
Download ICICI Prudential MF portfolio files using Playwright.

ICICI uses an API for file metadata. This script clicks on download links
directly in the browser to trigger downloads.

Requires: playwright (pip install playwright && playwright install chromium)
"""

import json
import re
from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "icici"
BASE_URL = "https://www.icicipruamc.com"
DOWNLOADS_PAGE = f"{BASE_URL}/media-center/downloads?currentTabFilter=OtherSchemeDisclosures&&subCatTabFilter=Monthly%20Portfolio%20Disclosures"

def get_target_months(count: int) -> list[str]:
    """Generate last N months in 'Month YYYY' format."""
    today = date.today()
    months = []
    for i in range(1, count + 1):
        first_of_month = date(today.year, today.month, 1) - relativedelta(months=i)
        months.append(first_of_month.strftime("%B %Y"))  # e.g., "December 2025"
    return months

def download_files_with_playwright():
    """Use Playwright to click download links directly in the browser."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    target_months = get_target_months(13)
    print(f"Target months: {target_months}")
    print("=" * 80)

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print(f"\nNavigating to: {DOWNLOADS_PAGE}")
        page.goto(DOWNLOADS_PAGE, timeout=60000)
        page.wait_for_timeout(5000)  # Wait for JS to render

        # Get page HTML for debugging
        html = page.content()
        print(f"Page loaded, HTML length: {len(html)}")

        # Look for download links on the page
        for target_month in target_months:
            print(f"\n{target_month}:")

            month_name = target_month.split()[0]  # "December"
            year = target_month.split()[1]  # "2025"

            # Page structure: h1 with title, then div.link containing button.button-link with "Download" text
            # Find the h1 containing the month, then find the Download button in the same card
            try:
                # Find all cards with "Monthly Portfolio Disclosure" heading
                # The structure is: h1 > div.link > div.link > button.button-link
                heading_text = f"Monthly Portfolio Disclosure {target_month}"

                # Use XPath to find the heading and then navigate to the Download button
                # Find h1 with exact text, then find sibling div with Download button
                card_selector = f'h1:has-text("{heading_text}")'
                card = page.locator(card_selector).first

                if card.count() == 0:
                    print(f"  -> [FAIL] Could not find card with heading: {heading_text}")
                    results.append({"month": target_month, "success": False})
                    continue

                print(f"  Found card: {heading_text}")

                # Find the Download button - it's a sibling of the h1
                # Navigate up to parent container and then find button with "Download" text
                download_btn = page.locator(f'h1:has-text("{heading_text}") + div button:has-text("Download")').first

                if download_btn.count() == 0:
                    # Try alternative: find by getting the parent and then the button
                    download_btn = page.locator(f'h1:has-text("{heading_text}") ~ div button.button-link').first

                if download_btn.count() == 0:
                    print(f"  -> [FAIL] Could not find Download button")
                    results.append({"month": target_month, "success": False})
                    continue

                print(f"  Found Download button")

                # Click and handle download
                try:
                    with page.expect_download(timeout=30000) as download_info:
                        download_btn.click()
                    download = download_info.value

                    # Save file
                    month_short = month_name[:3]
                    filename = f"icici_{year}-{month_short}.zip"
                    output_path = OUTPUT_DIR / filename
                    download.save_as(output_path)

                    # Verify it's a ZIP
                    with open(output_path, "rb") as f:
                        magic = f.read(4)
                    if magic == b'PK\x03\x04':
                        size_kb = output_path.stat().st_size / 1024
                        print(f"  -> [OK] Downloaded {size_kb:.1f} KB")
                        results.append({"month": target_month, "success": True})
                    else:
                        print(f"  -> [FAIL] Not a valid ZIP file")
                        output_path.unlink()
                        results.append({"month": target_month, "success": False})

                except PlaywrightTimeoutError:
                    print(f"  -> [FAIL] Click did not trigger download")
                    results.append({"month": target_month, "success": False})

            except Exception as e:
                print(f"  -> [FAIL] Error: {str(e)[:100]}")
                results.append({"month": target_month, "success": False})

        browser.close()

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
    download_files_with_playwright()
