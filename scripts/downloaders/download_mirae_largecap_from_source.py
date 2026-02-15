"""
Download Mirae Asset Large Cap Fund portfolio files.

URL pattern: https://www.miraeassetmf.co.in/docs/default-source/portfolios/miiof-{month}{year}.xlsx
Example: miiof-dec2025.xlsx

miiof = Mirae India Opportunities Fund (Large Cap)
"""

from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path
import requests

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "mirae"
BASE_URL = "https://www.miraeassetmf.co.in/docs/default-source/portfolios"

MONTH_ABBREV = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

def get_target_months(count: int) -> list[tuple[int, int, str]]:
    """Generate last N months.
    Returns: [(year, month, month_abbrev), ...]
    """
    today = date.today()
    months = []
    for i in range(1, count + 1):
        d = date(today.year, today.month, 1) - relativedelta(months=i)
        months.append((d.year, d.month, MONTH_ABBREV[d.month - 1]))
    return months

def get_month_end_date(year: int, month: int) -> str:
    """Get month end date in YYYY-MM-DD format."""
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = next_month - relativedelta(days=1)
    return last_day.strftime("%Y-%m-%d")

def download_files():
    """Download Large Cap Fund files for last 13 months."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    target_months = get_target_months(13)
    print("Target months:")
    for year, month, month_abbrev in target_months:
        print(f"  {year}-{month:02d} ({month_abbrev})")
    print("=" * 80)

    results = []

    for year, month, month_abbrev in target_months:
        print(f"\n{month_abbrev.title()} {year}:")

        # Build URL: miiof-dec2025.xlsx
        url = f"{BASE_URL}/miiof-{month_abbrev}{year}.xlsx"
        print(f"  URL: {url}")

        # Output filename with month-end date
        month_end = get_month_end_date(year, month)
        output_filename = f"mirae_largecap_{month_end}.xlsx"
        output_path = OUTPUT_DIR / output_filename

        if output_path.exists():
            print(f"  -> [SKIP] Already exists: {output_filename}")
            results.append({"month": f"{month_abbrev} {year}", "success": True, "skipped": True})
            continue

        try:
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                content = response.content
                # Verify it's a valid xlsx file by checking ZIP signature (PK)
                # xlsx files are ZIP archives starting with PK (0x504B)
                is_valid_xlsx = len(content) > 100 and content[:2] == b'PK'

                if is_valid_xlsx:
                    output_path.write_bytes(content)
                    size_kb = len(content) / 1024
                    print(f"  -> [OK] Downloaded {size_kb:.1f} KB")
                    results.append({"month": f"{month_abbrev} {year}", "success": True})
                else:
                    # Check if it's HTML (error page)
                    if content[:20].lower().startswith(b'<!doctype') or b'<html' in content[:100].lower():
                        print(f"  -> [SKIP] File not available (HTML error page)")
                    else:
                        print(f"  -> [FAIL] Invalid file format")
                    results.append({"month": f"{month_abbrev} {year}", "success": False})
            else:
                print(f"  -> [FAIL] HTTP {response.status_code}")
                results.append({"month": f"{month_abbrev} {year}", "success": False})

        except requests.RequestException as e:
            print(f"  -> [FAIL] Request error: {str(e)[:50]}")
            results.append({"month": f"{month_abbrev} {year}", "success": False})

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
