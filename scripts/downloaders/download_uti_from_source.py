"""
Download UTI MF consolidated portfolio files using their API.

UTI has an API endpoint that returns download URLs:
GET https://www.utimf.com/api/get-consolidate-portfolio-disclosure?year=YYYY&month=MonthName

Response format:
{
  "rows": [{
    "doc": "https://d3ce1o48hc5oli.cloudfront.net/s3fs-public/...",
    "name": "Consolidated Portfolio August 2025",
    ...
  }]
}

Requires: requests
"""

import requests
from datetime import date
from dateutil.relativedelta import relativedelta
from pathlib import Path

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "uti"
API_URL = "https://www.utimf.com/api/get-consolidate-portfolio-disclosure"

MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December']

def get_target_months(count: int) -> list[tuple[int, int, str]]:
    """Generate last N months as (year, month, month_name) tuples."""
    today = date.today()
    months = []
    for i in range(1, count + 1):
        d = date(today.year, today.month, 1) - relativedelta(months=i)
        months.append((d.year, d.month, MONTH_NAMES[d.month - 1]))
    return months

def download_files(count: int = 13):
    """Download UTI consolidated portfolio files."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    target_months = get_target_months(count)
    print(f"Target: {len(target_months)} months")
    print("=" * 80)

    results = []
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.utimf.com/downloads/consolidate-all-portfolio-disclosure'
    })

    for year, month, month_name in target_months:
        print(f"\n{month_name} {year}:", end=" ", flush=True)

        # Check if already exists
        filename = f"uti_{year}-{month_name[:3]}.zip"
        output_path = OUTPUT_DIR / filename
        if output_path.exists():
            print(f"[SKIP] exists")
            results.append({"month": f"{month_name} {year}", "success": True})
            continue

        try:
            # Call API to get download URL
            api_response = session.get(
                API_URL,
                params={"year": year, "month": month_name},
                timeout=30
            )

            if api_response.status_code != 200:
                print(f"[FAIL] API {api_response.status_code}")
                results.append({"month": f"{month_name} {year}", "success": False})
                continue

            data = api_response.json()
            rows = data.get("rows", [])

            if not rows:
                print(f"[FAIL] no data")
                results.append({"month": f"{month_name} {year}", "success": False})
                continue

            download_url = rows[0].get("doc") or rows[0].get("url")
            if not download_url:
                print(f"[FAIL] no URL")
                results.append({"month": f"{month_name} {year}", "success": False})
                continue

            # Download the ZIP file
            download_response = session.get(download_url, timeout=60)

            if download_response.status_code != 200:
                print(f"[FAIL] download {download_response.status_code}")
                results.append({"month": f"{month_name} {year}", "success": False})
                continue

            content = download_response.content

            # Verify ZIP magic bytes
            if content[:4] == b'PK\x03\x04':
                output_path.write_bytes(content)
                size_kb = len(content) / 1024
                print(f"[OK] {size_kb:.0f} KB")
                results.append({"month": f"{month_name} {year}", "success": True})
            else:
                print(f"[FAIL] not ZIP")
                results.append({"month": f"{month_name} {year}", "success": False})

        except Exception as e:
            print(f"[FAIL] {str(e)[:40]}")
            results.append({"month": f"{month_name} {year}", "success": False})

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
