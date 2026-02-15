"""
Download Motilal Oswal files using URLs extracted from page source.
"""

import requests
from pathlib import Path
import time

BASE_URL = "https://www.motilaloswalmf.com/CMS/assets/uploads/Documents"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "motilal"

# URLs extracted from page source (view source of their downloads page)
# Two naming patterns found:
# - scheme-portfolio-details-{month}-{year}.xlsx (Jul-Dec 2025)
# - month-end-portfolio-{month}-{year}.xlsx (Jan-Jun 2025)
URLS = [
    ("2025-12-31", "db566-scheme-portfolio-details-december-2025.xlsx"),
    ("2025-11-30", "966d5-scheme-portfolio-details-november-2025.xlsx"),
    ("2025-10-31", "9ec4e-scheme-portfolio-details-october-2025.xlsx"),  # Real October data
    ("2025-09-30", "6abd7-scheme-portfolio-details-october-2025.xlsx"),  # Mislabeled! Contains September data
    ("2025-08-31", "deebc-scheme-portfolio-details-aug-2025.xlsx"),  # Note: 'aug' not 'august'
    ("2025-07-31", "09555-scheme-portfolio-details-july-2025.xlsx"),
    ("2025-06-30", "bc9a7-month-end-portfolio-june-2025.xlsx"),
    ("2025-05-31", "27945-month-end-portfolio-may-2025.xlsx"),
    ("2025-04-30", "32d91-month-end-portfolio-april-2025.xlsx"),
    ("2025-03-31", "3a234-month-end-portfolio-march-2025.xls"),  # Note: .xls not .xlsx
    ("2025-02-28", "5a466-month-end-portfolio-february-2025.xlsx"),
    ("2025-01-31", "b1185-month-end-portfolio-january-2025.xlsx"),
    ("2024-01-31", "e73a3-month-end-portfolio-january-2024.xlsx"),
]

def download_file(url: str, output_path: Path) -> tuple[bool, str]:
    """Download file from URL. Returns (success, message)."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }

        response = requests.get(url, timeout=30, headers=headers)

        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'html' in content_type.lower():
                return False, f"Got HTML response (likely 404 page)"

            output_path.write_bytes(response.content)
            size_kb = len(response.content) / 1024
            return True, f"Downloaded {size_kb:.1f} KB"
        else:
            return False, f"HTTP {response.status_code}"
    except requests.RequestException as e:
        return False, str(e)

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    results = []
    for date_str, filename in URLS:
        url = f"{BASE_URL}/{filename}"
        output_path = OUTPUT_DIR / f"motilal_{date_str}.xlsx"

        # Skip if already exists
        if output_path.exists():
            print(f"\n{date_str}: Already exists")
            results.append({"date": date_str, "success": True, "skipped": True})
            continue

        print(f"\n{date_str}:")
        print(f"  URL: {url}")

        success, message = download_file(url, output_path)

        status = "OK" if success else "FAIL"
        print(f"  -> [{status}] {message}")

        results.append({"date": date_str, "success": success, "message": message})
        time.sleep(0.5)

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")

    if failed:
        print("\nFailed downloads:")
        for r in failed:
            print(f"  - {r['date']}: {r.get('message', 'Unknown')}")

if __name__ == "__main__":
    main()
