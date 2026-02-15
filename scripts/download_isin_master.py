"""
ISIN Master Downloader
Downloads and merges ISIN mapping data from multiple public sources.

Sources:
1. NSDL (via GitHub) - Complete ISIN database (361K+ records, all security types)
2. NSE EQUITY_L.csv - NSE listed equities with symbols (2K+ records)

Merge Strategy:
- NSDL is the base (superset of all ISINs)
- LEFT JOIN with NSE to add symbol and NSE name for listed equities

Output columns:
- isin: Primary key (indexed)
- name_nsdl: Name from NSDL (master source)
- security_type: EQUITY SHARES, BOND, MUTUAL FUND, etc.
- status: ACTIVE, DELETED, SUSPENDED
- issuer: Issuer/Company name from NSDL
- nse_symbol: NSE trading symbol (only for NSE-listed)
- name_nse: Clean name from NSE (only for NSE-listed)
- face_value: Face value from NSE (only for NSE-listed)

Usage:
    python download_isin_master.py           # Download and import to SQLite
    python download_isin_master.py --csv     # Also keep CSV backup

Output:
    ../database/mf_portfolio.db (isin_master table)
    ../database/ISIN_MASTER.csv (if --csv flag)
"""

import requests
import pandas as pd
import sqlite3
from io import StringIO
from pathlib import Path
from datetime import datetime

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / 'database'
OUTPUT_FILE = OUTPUT_DIR / 'ISIN_MASTER.csv'
DB_FILE = OUTPUT_DIR / 'mf_portfolio.db'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

TIMEOUT = 90  # seconds


def download_nsdl_full():
    """Download complete NSDL ISIN database from GitHub."""
    url = "https://raw.githubusercontent.com/captn3m0/india-isin-data/main/ISIN.csv"
    print(f"Downloading NSDL ISIN data from GitHub...")
    print(f"   URL: {url}")

    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()

        df = pd.read_csv(StringIO(r.text))

        # Rename columns
        df = df.rename(columns={
            'ISIN': 'isin',
            'Description': 'name_nsdl',
            'Issuer': 'issuer',
            'Type': 'security_type',
            'Status': 'status'
        })

        print(f"   Downloaded {len(df):,} ISINs")
        print(f"   Security types: {df['security_type'].nunique()}")
        print(f"   Active: {(df['status'] == 'ACTIVE').sum():,}")
        return df
    except Exception as e:
        print(f"   Error: {e}")
        return pd.DataFrame()


def download_nse_equity():
    """Download NSE equity master list."""
    url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
    print(f"\nDownloading NSE Equity Master...")
    print(f"   URL: {url}")

    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()

        df = pd.read_csv(StringIO(r.text))
        # Clean column names (remove leading spaces)
        df.columns = df.columns.str.strip()

        # Rename columns for merge
        df = df.rename(columns={
            'ISIN NUMBER': 'isin',
            'SYMBOL': 'nse_symbol',
            'NAME OF COMPANY': 'name_nse',
            'FACE VALUE': 'face_value'
        })

        # Select relevant columns
        df = df[['isin', 'nse_symbol', 'name_nse', 'face_value']]

        print(f"   Downloaded {len(df):,} NSE equities")
        return df
    except Exception as e:
        print(f"   Error: {e}")
        return pd.DataFrame()


def merge_sources(nsdl_df, nse_df):
    """
    Merge NSDL (base) with NSE data.
    NSDL is the superset - NSE adds symbol and clean name for listed equities.
    """
    print("\nMerging sources...")

    if nsdl_df.empty:
        print("   Error: NSDL data is empty!")
        return pd.DataFrame()

    # Start with NSDL as base
    merged = nsdl_df.copy()

    if not nse_df.empty:
        # LEFT JOIN with NSE
        merged = merged.merge(nse_df, on='isin', how='left')
        nse_matched = merged['nse_symbol'].notna().sum()
        print(f"   NSDL records: {len(nsdl_df):,}")
        print(f"   NSE records: {len(nse_df):,}")
        print(f"   Matched with NSE symbol: {nse_matched:,}")
    else:
        # Add empty NSE columns
        merged['nse_symbol'] = None
        merged['name_nse'] = None
        merged['face_value'] = None

    # Reorder columns
    column_order = ['isin', 'name_nsdl', 'security_type', 'status', 'issuer',
                    'nse_symbol', 'name_nse', 'face_value']
    merged = merged[column_order]

    print(f"   Total merged: {len(merged):,}")
    return merged


def import_to_sqlite(df: pd.DataFrame) -> int:
    """Import ISIN master data into SQLite database."""
    print(f"\nImporting to SQLite: {DB_FILE}")

    conn = sqlite3.connect(str(DB_FILE))
    cursor = conn.cursor()

    # Drop and recreate isin_master table
    cursor.execute('DROP TABLE IF EXISTS isin_master')
    cursor.execute('''
        CREATE TABLE isin_master (
            isin TEXT PRIMARY KEY,
            name_nsdl TEXT,
            security_type TEXT,
            status TEXT,
            issuer TEXT,
            nse_symbol TEXT,
            name_nse TEXT,
            face_value REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create indexes for fast lookups
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_isin_master_status ON isin_master(status)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_isin_master_type ON isin_master(security_type)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_isin_master_nse_symbol ON isin_master(nse_symbol)')

    # Insert data
    inserted = 0
    for _, row in df.iterrows():
        cursor.execute('''
            INSERT INTO isin_master (isin, name_nsdl, security_type, status, issuer, nse_symbol, name_nse, face_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            row['isin'],
            row['name_nsdl'] if pd.notna(row['name_nsdl']) else None,
            row['security_type'] if pd.notna(row['security_type']) else None,
            row['status'] if pd.notna(row['status']) else None,
            row['issuer'] if pd.notna(row['issuer']) else None,
            row['nse_symbol'] if pd.notna(row['nse_symbol']) else None,
            row['name_nse'] if pd.notna(row['name_nse']) else None,
            float(row['face_value']) if pd.notna(row['face_value']) else None
        ))
        inserted += 1
        if inserted % 50000 == 0:
            print(f"   Inserted {inserted:,} rows...")
            conn.commit()

    conn.commit()
    conn.close()

    print(f"   Inserted {inserted:,} rows into isin_master table")
    return inserted


def main():
    import sys
    save_csv = '--csv' in sys.argv

    print("=" * 70)
    print("ISIN MASTER DOWNLOADER v2")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # Download from sources
    nsdl_df = download_nsdl_full()
    nse_df = download_nse_equity()

    # Merge
    merged_df = merge_sources(nsdl_df, nse_df)

    if merged_df.empty:
        print("\nNo data downloaded. Check network connection.")
        return

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Import to SQLite (always)
    import_to_sqlite(merged_df)

    # Save CSV backup (only if --csv flag)
    if save_csv:
        merged_df.to_csv(OUTPUT_FILE, index=False)
        print(f"\nCSV backup: {OUTPUT_FILE}")
        print(f"CSV size: {OUTPUT_FILE.stat().st_size / 1024 / 1024:.1f} MB")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Database: {DB_FILE}")
    print(f"Total ISINs: {len(merged_df):,}")
    print(f"With NSE symbol: {merged_df['nse_symbol'].notna().sum():,}")
    print(f"Active status: {(merged_df['status'] == 'ACTIVE').sum():,}")

    print(f"\nTop security types:")
    for t, cnt in merged_df['security_type'].value_counts().head(10).items():
        print(f"   {t}: {cnt:,}")

    print(f"\nCompleted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Show sample
    print("\n" + "=" * 70)
    print("SAMPLE RECORDS")
    print("=" * 70)
    # Show a few with NSE symbol
    sample = merged_df[merged_df['nse_symbol'].notna()].head(3)
    print("\nWith NSE symbol:")
    for _, row in sample.iterrows():
        print(f"   {row['isin']} | {row['nse_symbol']:<12} | {row['name_nse'][:30]}")

    # Show a few without NSE (bonds, MF, etc.)
    sample = merged_df[
        (merged_df['nse_symbol'].isna()) &
        (merged_df['security_type'] != 'EQUITY SHARES')
    ].head(3)
    print("\nWithout NSE symbol (other securities):")
    for _, row in sample.iterrows():
        print(f"   {row['isin']} | {row['security_type'][:20]:<20} | {str(row['name_nsdl'])[:35]}")


if __name__ == '__main__':
    main()
