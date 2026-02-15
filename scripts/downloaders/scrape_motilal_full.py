"""
Scrape Motilal Oswal portfolio page with filter interactions using Playwright.
"""

import re
import time
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.motilaloswalmf.com/CMS/assets/uploads/Documents"

def main():
    print("Starting Playwright browser...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Navigate to the scheme portfolio details page
        url = "https://www.motilaloswalmf.com/download/scheme-portfolio-details"
        print(f"Navigating to: {url}")
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(5000)

        all_urls = set()
        patterns = [
            r'[a-z0-9]{5}-scheme-portfolio-details-[a-z]+-\d{4}\.xlsx',
            r'[a-z0-9]{5}-month-end-portfolio-[a-z]+-\d{4}\.xlsx',
        ]

        # Get initial URLs
        html = page.content()
        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            all_urls.update(matches)
        print(f"Initial page: Found {len(all_urls)} URLs")

        # Find and click on the Year dropdown
        print("\n" + "=" * 60)
        print("INTERACTING WITH YEAR FILTER")
        print("=" * 60)

        try:
            # Click on "Select Year" dropdown
            year_dropdown = page.locator("text=Select Year").first
            if year_dropdown.is_visible():
                print("Clicking on Year dropdown...")
                year_dropdown.click()
                page.wait_for_timeout(1500)

                # Take screenshot to see what options appear
                # page.screenshot(path="temp/year_dropdown.png")

                # Look for year options
                year_options = page.locator("text=2024, text=2023, text=2022").all()
                print(f"Found year options visible after click")

                # Try clicking on 2024
                try:
                    option_2024 = page.locator("li:has-text('2024'), div:has-text('2024')").first
                    if option_2024.is_visible():
                        print("Clicking on 2024...")
                        option_2024.click()
                        page.wait_for_timeout(3000)

                        # Extract new URLs
                        html = page.content()
                        for pattern in patterns:
                            matches = re.findall(pattern, html, re.IGNORECASE)
                            all_urls.update(matches)
                        print(f"After 2024: Total {len(all_urls)} URLs")
                except Exception as e:
                    print(f"Could not select 2024: {e}")

        except Exception as e:
            print(f"Year dropdown error: {e}")

        # Try different approach - look for the actual dropdown container
        print("\n" + "=" * 60)
        print("ALTERNATIVE APPROACH - CLICK BASED FILTER")
        print("=" * 60)

        # Find elements that might be clickable year selectors
        clickables = page.locator("[class*='select'], [class*='dropdown'], [class*='filter']").all()
        print(f"Found {len(clickables)} potential dropdown elements")

        for elem in clickables:
            try:
                text = elem.text_content()
                if text and ('Year' in text or 'year' in text):
                    print(f"Found Year element: {text[:50]}")
                    elem.click()
                    page.wait_for_timeout(1000)

                    # Look for 2024 option
                    page.locator("text=2024").first.click()
                    page.wait_for_timeout(2000)

                    html = page.content()
                    for pattern in patterns:
                        matches = re.findall(pattern, html, re.IGNORECASE)
                        all_urls.update(matches)
                    print(f"After filter: {len(all_urls)} URLs")
                    break
            except Exception as e:
                pass

        # Try pagination if available
        print("\n" + "=" * 60)
        print("CHECKING PAGINATION")
        print("=" * 60)

        for page_num in range(2, 10):
            try:
                page_btn = page.locator(f"text='{page_num}'").first
                if page_btn.is_visible():
                    print(f"Clicking page {page_num}...")
                    page_btn.click()
                    page.wait_for_timeout(2000)

                    html = page.content()
                    before = len(all_urls)
                    for pattern in patterns:
                        matches = re.findall(pattern, html, re.IGNORECASE)
                        all_urls.update(matches)
                    after = len(all_urls)
                    if after > before:
                        print(f"  Found {after - before} new URLs on page {page_num}")
                else:
                    break
            except:
                break

        # Final results
        print("\n" + "=" * 60)
        print("FINAL RESULTS")
        print("=" * 60)

        print(f"\nTotal unique portfolio URLs found: {len(all_urls)}")
        for url in sorted(all_urls):
            print(f"  {url}")

        # Analyze coverage
        print("\n2025 Coverage:")
        months = ['january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december']
        for month in months:
            found = any(month in u.lower() and '2025' in u for u in all_urls)
            if not found:
                found = any(month[:3] in u.lower() and '2025' in u for u in all_urls)
            status = "OK" if found else "MISSING"
            print(f"  {month.title()}: {status}")

        print("\n2024 Coverage:")
        for month in months:
            found = any(month in u.lower() and '2024' in u for u in all_urls)
            if found:
                print(f"  {month.title()}: OK")

        # Wait for manual inspection
        print("\nBrowser open for 20 seconds...")
        page.wait_for_timeout(20000)

        browser.close()

if __name__ == "__main__":
    main()
