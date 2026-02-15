"""
Scrape Motilal Oswal website for portfolio download URLs using Playwright.
"""

import re
from playwright.sync_api import sync_playwright

def main():
    print("Starting Playwright browser...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Visible for debugging
        page = browser.new_page()

        # Navigate to the scheme portfolio details page
        url = "https://www.motilaloswalmf.com/download/scheme-portfolio-details"
        print(f"Navigating to: {url}")
        page.goto(url, wait_until="networkidle", timeout=60000)

        # Wait for content to load
        page.wait_for_timeout(5000)

        # Wait for any dynamic content
        page.wait_for_timeout(3000)

        # Get page source after interactions
        html = page.content()
        print(f"Page loaded, HTML length: {len(html)} chars")

        # Save HTML to file for inspection
        with open("temp/motilal_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Saved HTML to temp/motilal_page.html")

        # Check what links are on the page
        all_links = page.locator("a").all()
        print(f"\nFound {len(all_links)} total links on page")

        # Find links with "portfolio" in href or text
        portfolio_related = []
        for link in all_links:
            try:
                href = link.get_attribute("href") or ""
                text = link.text_content() or ""
                if "portfolio" in href.lower() or "portfolio" in text.lower():
                    portfolio_related.append((href, text[:50]))
            except:
                pass

        print(f"Found {len(portfolio_related)} portfolio-related links:")
        for href, text in portfolio_related[:20]:
            print(f"  {href[:80]} | {text}")

        # Find all portfolio URLs
        patterns = [
            r'[a-z0-9]{5}-scheme-portfolio-details-[a-z]+-\d{4}\.xlsx',
            r'[a-z0-9]{5}-month-end-portfolio-[a-z]+-\d{4}\.xlsx',
        ]

        all_urls = set()
        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            all_urls.update(matches)

        print(f"\nFound {len(all_urls)} portfolio URLs:")
        print("=" * 60)

        # Sort by date (extract month-year)
        sorted_urls = sorted(all_urls)
        for url in sorted_urls:
            print(url)

        browser.close()

        # Check for missing months
        print("\n" + "=" * 60)
        print("CHECKING FOR MISSING MONTHS:")

        months_2025 = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december']
        months_short = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                        'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

        for month in months_2025 + months_short:
            if f"{month}-2025" in str(sorted_urls).lower():
                continue
            # Check if missing
            found = False
            for url in sorted_urls:
                if month in url.lower() and '2025' in url:
                    found = True
                    break
            if not found and month in months_2025:
                print(f"  MISSING: {month.title()} 2025")

if __name__ == "__main__":
    main()
