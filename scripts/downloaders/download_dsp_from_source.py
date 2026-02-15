"""
Download DSP Mutual Fund portfolio files by scraping page source.

DSP URLs contain dynamic UUIDs like:
https://www.dspim.com/media/pages/mandatory-disclosures/portfolio-disclosures/0e5f7b1d70-1769155730/monthend-portfolio-november-2025.zip

Process:
1. Fetch page source HTML
2. Extract ZIP URLs with regex
3. Download ZIPs
4. Extract equity Excel file from each ZIP
"""

import requests
import re
import zipfile
import io
from pathlib import Path

PAGE_URL = "https://www.dspim.com/mandatory-disclosures/portfolio-disclosures"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "dsp"
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

    html_path = TEMP_DIR / "dsp_portfolio_page.html"
    html_path.write_text(response.text, encoding='utf-8')
    print(f"Saved HTML source to: {html_path}")
    print(f"HTML size: {len(response.text):,} characters")

    return response.text


def extract_zip_urls(html_content):
    """Extract ZIP file URLs from HTML content."""
    # Pattern: /media/pages/mandatory-disclosures/portfolio-disclosures/{UUID}/monthend-portfolio-{description}.zip
    pattern = r'https://www\.dspim\.com/media/pages/mandatory-disclosures/portfolio-disclosures/[a-z0-9-]+/monthend-portfolio-[a-z0-9-]+\.zip'

    urls = re.findall(pattern, html_content, re.IGNORECASE)
    unique_urls = list(set(urls))

    print(f"\nFound {len(unique_urls)} unique ZIP URLs")
    return unique_urls


def parse_date_from_url(url):
    """Extract month and year from URL for sorting/naming."""
    # Pattern like: monthend-portfolio-november-2025.zip or monthend-portfolio-december-31-2025.zip
    match = re.search(r'monthend-portfolio-([a-z]+)(?:-\d+)?-(\d{4})\.zip', url, re.IGNORECASE)
    if match:
        month_name = match.group(1).lower()
        year = match.group(2)

        month_map = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
        }
        month_num = month_map.get(month_name, '00')
        return f"{year}-{month_num}"
    return None


def download_and_extract_equity(url, output_dir):
    """Download ZIP, extract equity Excel file."""
    try:
        print(f"  Downloading ZIP...")
        response = requests.get(url, headers=HEADERS, timeout=60)
        response.raise_for_status()

        # Open ZIP from memory
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            file_list = zf.namelist()
            print(f"  ZIP contains {len(file_list)} files")

            # Find equity file (case insensitive)
            equity_file = None
            for f in file_list:
                if 'equity' in f.lower() and (f.endswith('.xlsx') or f.endswith('.xls')):
                    equity_file = f
                    break

            if not equity_file:
                print(f"  Files in ZIP: {file_list}")
                return False, "No equity file found in ZIP"

            print(f"  Found equity file: {equity_file}")

            # Extract date for output filename
            date_prefix = parse_date_from_url(url) or "unknown"
            ext = Path(equity_file).suffix
            output_path = output_dir / f"dsp_{date_prefix}{ext}"

            # Extract the file
            content = zf.read(equity_file)
            output_path.write_bytes(content)
            size_kb = len(content) / 1024

            return True, f"Saved {output_path.name} ({size_kb:.1f} KB)"

    except requests.RequestException as e:
        return False, f"Download error: {e}"
    except zipfile.BadZipFile as e:
        return False, f"Invalid ZIP: {e}"
    except Exception as e:
        return False, f"Error: {e}"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 80)

    # Step 1: Fetch page source
    html_content = fetch_page_source()

    # Step 2: Extract ZIP URLs
    zip_urls = extract_zip_urls(html_content)

    if not zip_urls:
        print("\nNo ZIP URLs found. Check the HTML source for patterns.")
        print(f"HTML saved at: {TEMP_DIR / 'dsp_portfolio_page.html'}")
        return

    # Sort by date (most recent first)
    zip_urls_with_dates = [(url, parse_date_from_url(url)) for url in zip_urls]
    zip_urls_with_dates.sort(key=lambda x: x[1] or "", reverse=True)

    print("\nZIP URLs found:")
    for url, date in zip_urls_with_dates:
        print(f"  {date}: {url.split('/')[-1]}")

    # Step 3: Download and extract
    print("\n" + "=" * 80)
    print("DOWNLOADING AND EXTRACTING")
    print("=" * 80)

    results = []
    for url, date in zip_urls_with_dates:
        output_path = OUTPUT_DIR / f"dsp_{date}.xlsx"
        if output_path.exists() or (OUTPUT_DIR / f"dsp_{date}.xls").exists():
            print(f"\n{date}: Already exists, skipping")
            results.append({"date": date, "success": True, "skipped": True})
            continue

        print(f"\n{date}:")
        print(f"  URL: {url}")

        success, message = download_and_extract_equity(url, OUTPUT_DIR)
        status = "OK" if success else "FAIL"
        print(f"  -> [{status}] {message}")

        results.append({"date": date, "success": success, "message": message})

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
