"""
Validate Conversions - Compare database totals with Excel grand totals

Creates validation_log.csv with results for each fund-month.
Run after conversions to verify data integrity.

Usage:
    python validate_conversions.py              # Validate all funds in database
    python validate_conversions.py --fund HDFCFLEXICAP --month 2025-12-31  # Validate specific
    python validate_conversions.py --show       # Show current validation log

Output files:
    - validation_log.csv: Full results with manual review comments
    - public/data/validation_log.csv: Copy for frontend display

Manual Review Comments:
    Edit validation_comments.json to add explanations for expected failures.
    Format: {"FUNDCODE_YYYY-MM-DD": "explanation"}
"""

import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime
import argparse
import csv
import json
import sys
import shutil

sys.path.insert(0, str(Path(__file__).parent))
from convert_mf_portfolio import FUND_CONFIG, get_file_path, detect_excel_engine, find_grand_total, detect_schema

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
DB_PATH = PROJECT_DIR / 'database' / 'mf_portfolio.db'
DATA_RAW = PROJECT_DIR.parent.parent / 'data' / 'raw'
LOG_PATH = PROJECT_DIR / 'database' / 'validation_log.csv'
RESULTS_PATH = PROJECT_DIR / 'database' / 'validation_results.txt'
COMMENTS_PATH = SCRIPT_DIR / 'validation_comments.json'
PUBLIC_LOG_PATH = PROJECT_DIR.parent.parent / 'public' / 'data' / 'validation_log.csv'

# Validation threshold (as ratio, 0.0001 = 0.01%)
DIFF_THRESHOLD_PCT = 0.0001  # 0.01% = acceptable rounding difference


def load_comments() -> dict:
    """Load manual review comments from JSON file."""
    if COMMENTS_PATH.exists():
        try:
            with open(COMMENTS_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Could not load comments file: {e}")
    return {}


def get_comment(fund_code: str, month_end: str, comments: dict) -> str:
    """Get manual review comment for a fund-month."""
    key = f"{fund_code}_{month_end}"
    return comments.get(key, "")


def get_db_total(fund_code: str, month_end: str) -> tuple[float, int]:
    """Get total market value and row count from database."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        SELECT SUM(market_value), COUNT(*)
        FROM holdings
        WHERE scheme_name = ? AND month_end = ?
    ''', (fund_code, month_end))
    result = cur.fetchone()
    conn.close()
    return (result[0] or 0, result[1] or 0)


def get_excel_grand_total(fund_code: str, month_end: str) -> float | None:
    """Get grand total from Excel file."""
    if fund_code not in FUND_CONFIG:
        return None

    config = FUND_CONFIG[fund_code]
    file_path = get_file_path(fund_code, month_end, DATA_RAW)

    if not file_path or not file_path.exists():
        return None

    try:
        engine = detect_excel_engine(file_path)
        df = pd.read_excel(file_path, sheet_name=config['sheet_name'], header=None, engine=engine)
        schema = detect_schema(df)
        return schema.grand_total
    except Exception as e:
        print(f"  Error reading {file_path.name}: {e}")
        return None


def validate_fund(fund_code: str, month_end: str, comments: dict = None) -> dict:
    """Validate a single fund-month combination."""
    db_total, row_count = get_db_total(fund_code, month_end)
    excel_total = get_excel_grand_total(fund_code, month_end)

    # Get manual review comment if available
    comment = get_comment(fund_code, month_end, comments or {})

    result = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'fund_code': fund_code,
        'month_end': month_end,
        'excel_grand_total': excel_total,
        'db_total': db_total,
        'difference': None,
        'diff_pct': None,
        'rows': row_count,
        'status': 'UNKNOWN',
        'manual_review': comment
    }

    if excel_total is None:
        result['status'] = 'NO_EXCEL_TOTAL'
    elif excel_total == 0:
        result['status'] = 'ZERO_EXCEL_TOTAL'
    else:
        diff = abs(db_total - excel_total)
        diff_pct = diff / excel_total  # Ratio: 0.0019 = 0.19%, frontend does *100 for display
        result['difference'] = diff
        result['diff_pct'] = diff_pct

        if diff_pct <= DIFF_THRESHOLD_PCT:
            result['status'] = 'PASS'
        else:
            result['status'] = 'FAIL'

    return result


def get_all_fund_months() -> list[tuple[str, str]]:
    """Get all fund-month combinations from database."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        SELECT DISTINCT scheme_name, month_end
        FROM holdings
        ORDER BY scheme_name, month_end
    ''')
    results = cur.fetchall()
    conn.close()
    return results


def write_validation_files(results: list[dict], pass_count: int, fail_count: int, unknown_count: int):
    """Write validation results to CSV and TXT files, copy to public folder."""
    fieldnames = ['fund_code', 'month_end', 'excel_grand_total',
                  'db_total', 'difference', 'diff_pct', 'status', 'manual_review']

    # Write CSV (overwrite with latest results)
    with open(LOG_PATH, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            # Write only relevant fields
            row = {k: r.get(k, '') for k in fieldnames}
            writer.writerow(row)

    # Write human-readable TXT
    with open(RESULTS_PATH, 'w') as f:
        f.write("=" * 80 + "\n")
        f.write("CONVERSION VALIDATION\n")
        f.write("=" * 80 + "\n")
        f.write(f"Database: {DB_PATH}\n")
        f.write(f"Data dir: {DATA_RAW}\n")
        f.write(f"Threshold: {DIFF_THRESHOLD_PCT}%\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"Validating {len(results)} fund-month combinations...\n\n")
        f.write(f"{'Fund':<20} {'Month':<12} {'Excel Total':>15} {'DB Total':>15} {'Diff':>12} {'Diff%':>8} {'Status':<10}\n")
        f.write("-" * 100 + "\n")

        for r in results:
            excel_str = f"{r['excel_grand_total']:,.2f}" if r['excel_grand_total'] else "N/A"
            db_str = f"{r['db_total']:,.2f}"
            diff_str = f"{r['difference']:,.2f}" if r['difference'] is not None else "N/A"
            pct_str = f"{r['diff_pct'] * 100:.4f}%" if r['diff_pct'] is not None else "N/A"
            status_marker = "[OK]" if r['status'] == 'PASS' else "[!!]" if r['status'] == 'FAIL' else "[??]"
            f.write(f"{r['fund_code']:<20} {r['month_end']:<12} {excel_str:>15} {db_str:>15} {diff_str:>12} {pct_str:>8} {status_marker} {r['status']:<10}\n")

        f.write("-" * 100 + "\n")
        f.write(f"\nSummary: {pass_count} PASS, {fail_count} FAIL, {unknown_count} UNKNOWN\n")

    # Copy to public folder for frontend
    PUBLIC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(LOG_PATH, PUBLIC_LOG_PATH)

    print(f"\nResults written to:")
    print(f"  - {LOG_PATH}")
    print(f"  - {RESULTS_PATH}")
    print(f"  - {PUBLIC_LOG_PATH} (for frontend)")


def show_log():
    """Display current validation log."""
    if not LOG_PATH.exists():
        print("No validation log found. Run validation first.")
        return

    df = pd.read_csv(LOG_PATH)
    print("\n" + "=" * 100)
    print("VALIDATION LOG")
    print("=" * 100)
    print(f"Log file: {LOG_PATH}")
    print(f"Total entries: {len(df)}")
    print()

    # Show summary by status
    print("Summary by status:")
    print(df['status'].value_counts().to_string())
    print()

    # Show recent entries
    print("Recent validations:")
    print("-" * 100)
    print(df.tail(20).to_string(index=False))


def main():
    parser = argparse.ArgumentParser(description='Validate conversion totals against Excel')
    parser.add_argument('--fund', help='Specific fund code to validate')
    parser.add_argument('--month', help='Specific month (YYYY-MM-DD)')
    parser.add_argument('--show', action='store_true', help='Show validation log')
    parser.add_argument('--no-log', action='store_true', help='Do not write to log file')
    args = parser.parse_args()

    if args.show:
        show_log()
        return

    print("=" * 80)
    print("CONVERSION VALIDATION")
    print("=" * 80)
    print(f"Database: {DB_PATH}")
    print(f"Data dir: {DATA_RAW}")
    print(f"Threshold: {DIFF_THRESHOLD_PCT}%")

    # Load manual review comments
    comments = load_comments()
    if comments:
        print(f"Comments: {len(comments)} manual review entries loaded")
    print()

    # Determine what to validate
    if args.fund and args.month:
        fund_months = [(args.fund, args.month)]
    elif args.fund:
        fund_months = [(fm[0], fm[1]) for fm in get_all_fund_months() if fm[0] == args.fund]
    else:
        fund_months = get_all_fund_months()

    print(f"Validating {len(fund_months)} fund-month combinations...")
    print()

    results = []
    pass_count = 0
    fail_count = 0
    unknown_count = 0

    print(f"{'Fund':<20} {'Month':<12} {'Excel Total':>15} {'DB Total':>15} {'Diff':>12} {'Diff%':>8} {'Status':<10}")
    print("-" * 100)

    for fund_code, month_end in fund_months:
        result = validate_fund(fund_code, month_end, comments)
        results.append(result)

        excel_str = f"{result['excel_grand_total']:,.2f}" if result['excel_grand_total'] else "N/A"
        db_str = f"{result['db_total']:,.2f}"
        diff_str = f"{result['difference']:,.2f}" if result['difference'] is not None else "N/A"
        pct_str = f"{result['diff_pct'] * 100:.4f}%" if result['diff_pct'] is not None else "N/A"

        status_marker = "[OK]" if result['status'] == 'PASS' else "[!!]" if result['status'] == 'FAIL' else "[??]"
        print(f"{fund_code:<20} {month_end:<12} {excel_str:>15} {db_str:>15} {diff_str:>12} {pct_str:>8} {status_marker} {result['status']:<10}")

        if result['status'] == 'PASS':
            pass_count += 1
        elif result['status'] == 'FAIL':
            fail_count += 1
        else:
            unknown_count += 1

    print("-" * 100)
    print(f"\nSummary: {pass_count} PASS, {fail_count} FAIL, {unknown_count} UNKNOWN")

    # Write validation files
    if not args.no_log:
        write_validation_files(results, pass_count, fail_count, unknown_count)


if __name__ == '__main__':
    main()
