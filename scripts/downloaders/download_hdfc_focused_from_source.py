"""
Download HDFC Focused Fund portfolio files using Playwright.

HDFC page has year/month dropdowns to filter data.
This script navigates through each month to extract Focused Fund URLs.

Target: 13 months (Dec 2024 - Dec 2025)
"""

from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path
from urllib.parse import unquote
import re
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "hdfc"
PAGE_URL = "https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio"

MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December']

def get_fiscal_year(year: int, month: int) -> str:
    """Get HDFC fiscal year string for given calendar year/month.
    Fiscal year runs Apr-Mar: Apr 2025 - Mar 2026 = 2025-2026
    """
    if month >= 4:  # Apr-Dec belongs to current year fiscal
        return f"{year}-{year+1}"
    else:  # Jan-Mar belongs to previous year fiscal
        return f"{year-1}-{year}"

def get_target_months(count: int) -> list[tuple[int, int, str, str]]:
    """Generate last N months with fiscal year info.
    Returns: [(year, month, month_name, fiscal_year), ...]
    """
    today = date.today()
    months = []
    for i in range(1, count + 1):
        d = date(today.year, today.month, 1) - relativedelta(months=i)
        fiscal = get_fiscal_year(d.year, d.month)
        months.append((d.year, d.month, MONTH_NAMES[d.month - 1], fiscal))
    return months

def parse_date_from_filename(filename: str) -> str | None:
    """Extract date (YYYY-MM-DD) from filename like 'Monthly HDFC Focused Fund - 30 September 2025.xlsx'."""
    match = re.search(
        r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
        filename, re.IGNORECASE
    )
    if match:
        day, month_name, year = match.groups()
        month_num = MONTH_NAMES.index(month_name.title()) + 1
        return f"{year}-{month_num:02d}-{int(day):02d}"
    return None

def extract_focused_url(page) -> str | None:
    """Extract Focused Fund URL from current page view.

    Fund name: "HDFC Focused Fund" (previously "HDFC Focused 30 Fund")
    """
    links = page.evaluate('''() => {
        const links = [];
        document.querySelectorAll('a').forEach(a => {
            const href = a.href || a.getAttribute('href');
            if (href && href.includes('.xlsx')) {
                const decoded = decodeURIComponent(href);
                // Match "Focused Fund" or "Focused 30 Fund"
                const hasTarget = (
                    decoded.includes('Focused Fund') ||
                    decoded.includes('Focused 30 Fund')
                );
                const excluded = decoded.toUpperCase().includes('NIFTY');
                if (hasTarget && !excluded) {
                    links.push(href);
                }
            }
        });
        return links;
    }''')
    return links[0] if links else None

def download_files():
    """Download Focused Fund files for last 13 months."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    target_months = get_target_months(13)
    print("Target months:")
    for year, month, month_name, fiscal in target_months:
        print(f"  {year}-{month:02d} ({month_name}) -> Fiscal {fiscal}")
    print("=" * 80)

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        for year, month, month_name, fiscal_year in target_months:
            print(f"\n{month_name} {year} (Fiscal: {fiscal_year}):")

            # Navigate to page fresh for each month
            page.goto(PAGE_URL, timeout=60000)
            page.wait_for_timeout(3000)

            try:
                # Step 1: Click year input to open dropdown
                year_input = page.locator('input[name="yearInput"]')
                year_input.click()
                page.wait_for_timeout(500)

                # Select fiscal year from dropdown
                page.locator(f'ul[name="year"] li:has-text("{fiscal_year}")').click()
                page.wait_for_timeout(1000)

                # Step 2: Click month input to open dropdown
                month_input = page.locator('input[name="monthInput"]')
                month_input.click()
                page.wait_for_timeout(500)

                # Select month from dropdown
                page.locator(f'ul[name="month"] li:has-text("{month_name}")').click()
                page.wait_for_timeout(2000)

            except Exception as e:
                print(f"  Dropdown navigation failed: {str(e)[:50]}")
                # Continue anyway - try to extract whatever is visible

            # Step 3: Extract Focused Fund URL
            focused_url = extract_focused_url(page)

            if not focused_url:
                print(f"  -> [FAIL] No Focused Fund file found")
                results.append({"month": f"{month_name} {year}", "success": False})
                continue

            filename = unquote(focused_url.split('/')[-1])
            file_date = parse_date_from_filename(filename)
            print(f"  Found: {filename[:60]}...")
            print(f"  Date: {file_date}")

            # Verify date matches target
            expected_prefix = f"{year}-{month:02d}"
            if file_date and not file_date.startswith(expected_prefix):
                print(f"  -> [WARN] Date mismatch: expected {expected_prefix}, got {file_date}")

            # Step 4: Download the file
            output_filename = f"hdfc_focused_{file_date or f'{year}-{month:02d}'}.xlsx"
            output_path = OUTPUT_DIR / output_filename

            if output_path.exists():
                print(f"  -> [SKIP] Already exists: {output_filename}")
                results.append({"month": f"{month_name} {year}", "success": True, "skipped": True})
                continue

            try:
                with page.expect_download(timeout=60000) as download_info:
                    # Create a temporary link and click it
                    page.evaluate('''(url) => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = '';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }''', focused_url)

                download = download_info.value
                download.save_as(output_path)

                size_kb = output_path.stat().st_size / 1024
                print(f"  -> [OK] Downloaded {size_kb:.1f} KB")
                results.append({"month": f"{month_name} {year}", "success": True})

            except PlaywrightTimeoutError:
                print(f"  -> [FAIL] Download timed out")
                results.append({"month": f"{month_name} {year}", "success": False})

            except Exception as e:
                print(f"  -> [FAIL] Download error: {str(e)[:50]}")
                results.append({"month": f"{month_name} {year}", "success": False})

        browser.close()

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    successful = [r for r in results if r.get("success")]
    failed = [r for r in results if not r.get("success")]

    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")

    if failed:
        print(f"\nFailed months: {[r['month'] for r in failed]}")

if __name__ == "__main__":
    download_files()
