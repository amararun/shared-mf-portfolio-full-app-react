"""
Download Franklin Templeton portfolio files.

Franklin uses a constant UUID in the path - no scraping needed.
Pattern: /download/en-in/monthly-portfolio-dsclr/{UUID}/Monthly-Portfolio-ISIN-{DD}-{Mon}-{YYYY}.xlsx
"""

import requests
from pathlib import Path
from datetime import date
import time

UUID = "fc48653f-92d2-41a0-ac9c-c04149ac7cde"
BASE_URL = f"https://www.franklintempletonindia.com/download/en-in/monthly-portfolio-dsclr/{UUID}"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "franklin"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

# Month-end dates for 2024-2025
DATES = [
    # 2025
    (2025, 12, 31), (2025, 11, 30), (2025, 10, 31), (2025, 9, 30),
    (2025, 8, 31), (2025, 7, 31), (2025, 6, 30), (2025, 5, 31),
    (2025, 4, 30), (2025, 3, 31), (2025, 2, 28), (2025, 1, 31),
    # 2024
    (2024, 12, 31), (2024, 11, 30), (2024, 10, 31), (2024, 9, 30),
    (2024, 8, 31), (2024, 7, 31), (2024, 6, 30), (2024, 5, 31),
    (2024, 4, 30), (2024, 3, 31), (2024, 2, 29), (2024, 1, 31),
]

MONTH_ABBREV = {
    1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
}


def build_url(year, month, day):
    """Build download URL for a given date."""
    mon = MONTH_ABBREV[month]
    filename = f"Monthly-Portfolio-ISIN-{day}-{mon}-{year}.xlsx"
    return f"{BASE_URL}/{filename}"


def download_file(url, output_path):
    """Download file from URL. Returns (success, message)."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=60)

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


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"UUID: {UUID}")
    print("=" * 80)

    results = []
    for year, month, day in DATES:
        date_str = f"{year}-{month:02d}-{day:02d}"
        output_path = OUTPUT_DIR / f"franklin_{year}-{month:02d}.xlsx"

        # Skip if already exists
        if output_path.exists():
            print(f"{date_str}: Already exists")
            results.append({"date": date_str, "success": True, "skipped": True})
            continue

        url = build_url(year, month, day)
        print(f"\n{date_str}:")
        print(f"  URL: {url.split('/')[-1]}")

        success, message = download_file(url, output_path)
        status = "OK" if success else "FAIL"
        print(f"  -> [{status}] {message}")

        results.append({"date": date_str, "success": success, "message": message})
        time.sleep(0.3)

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
