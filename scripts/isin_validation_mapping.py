"""
ISIN Validation and Mapping Module v2

This module handles:
1. Detection of potential ISIN duplicates using 7-char name truncation
2. Categorization using deterministic rules (ISIN structure analysis)
3. Generation of validation file for manual review
4. Creation of ISIN mapping file after validation approval

ISIN Structure Reference:
  Position 1-2:   Country (IN)
  Position 3:     Issuer Type (E=Company, F=MF)
  Position 4-7:   Issuer Code (unique company identifier)
  Position 8-9:   Security Type (01=Equity, 16/D6=CD, 14=CP)
  Position 10-11: Serial Number
  Position 12:    Check Digit

Categories:
  CORPORATE_ACTION - Same issuer, same security type, only serial differs
                     (bonus/rights/split) -> Map old to new ISIN
  CD_AGGREGATE     - Same issuer, CDs -> Aggregate to synthetic ISIN
  CP_AGGREGATE     - Same issuer, Commercial Papers -> Aggregate to synthetic ISIN
  TBILL_AGGREGATE  - Government of India T-Bills -> Aggregate to synthetic ISIN
  GSEC_AGGREGATE   - Government of India G-Secs (bonds) -> Aggregate to synthetic ISIN
  NO_ACTION        - Different companies or legitimate different securities

Synthetic ISIN Format:
  SYN{IssuerCode}CD{seq} = 11 chars for CDs
  SYN{IssuerCode}CP{seq} = 11 chars for CPs
  SYNGOITBILL01 = GOI T-Bills (all tenures)
  SYNGOIGSEC01 = GOI G-Secs (dated government bonds)

Usage:
  python isin_validation_mapping.py --validate     # Generate validation file
  python isin_validation_mapping.py --create-map   # Create mapping after review
  python isin_validation_mapping.py --both         # Both at once
"""

import sqlite3
import re
import sys
import shutil
from pathlib import Path
from datetime import datetime
from collections import defaultdict


# Configuration
NAME_CUT_LENGTH = 7
SYNTHETIC_PREFIX = "SYN"


def standardize_name(name: str) -> str:
    """Standardize name: lowercase, remove special chars."""
    if not name:
        return ""
    s = str(name).lower().strip()
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def extract_company_name(full_name: str) -> str:
    """
    Extract base company name from full instrument name.
    E.g., "AXIS BANK LIMITED CD 08JAN26" -> "AXIS BANK"
    """
    if not full_name:
        return ""

    # Common suffixes to remove
    suffixes = [
        r'\s+LIMITED.*$',
        r'\s+LTD\.?.*$',
        r'\s+BANK\s+.*$',  # Keep "BANK" but remove what follows
        r'\s+EQ\s.*$',
        r'\s+CD\s.*$',
        r'\s+CP\s.*$',
        r'\s+NCD\s.*$',
        r'\s+\d+D\s.*$',  # e.g., "365D CP"
    ]

    name = full_name.upper().strip()

    # Special handling for banks - keep "BANK" in the name
    bank_match = re.match(r'^(.+?\s+BANK)\b', name)
    if bank_match:
        return bank_match.group(1)

    # For non-banks, try to extract company name
    for suffix in suffixes:
        name = re.sub(suffix, '', name, flags=re.IGNORECASE)

    # Clean up
    name = re.sub(r'\s+', ' ', name).strip()

    # If name is too short, use first 3 words of original
    if len(name) < 5:
        words = full_name.upper().split()[:3]
        name = ' '.join(words)

    return name


def parse_isin(isin: str) -> dict:
    """Parse ISIN into components."""
    if not isin or len(isin) < 12:
        return None
    return {
        'isin': isin,
        'country': isin[:2],
        'issuer_type': isin[2],
        'issuer_code': isin[3:7],
        'security_type': isin[7:9],
        'serial': isin[9:11],
        'check': isin[11] if len(isin) > 11 else '',
        'base_9': isin[:9],
    }


def get_security_category(sec_type: str) -> str:
    """Categorize security type."""
    if sec_type == '01':
        return 'EQUITY'
    elif sec_type in ['16', 'D6']:
        return 'CD'
    elif sec_type == '14':
        return 'CP'
    elif sec_type in ['07', '08']:
        return 'NCD'
    else:
        return 'OTHER'


def generate_synthetic_isin(issuer_code: str, category: str, seq: int) -> str:
    """
    Generate synthetic ISIN for aggregation.
    Format: SYN{IssuerCode}{Category}{Seq} = 11 chars
    """
    return f"{SYNTHETIC_PREFIX}{issuer_code}{category}{seq:02d}"


def generate_aggregated_name(items: list, category: str) -> str:
    """
    Generate standardized aggregated name.
    E.g., "AXIS BANK CD" or "BAJAJ FINANCE 365D CP"
    Note: ISN badge in UI now indicates aggregation, no prefix needed.
    """
    if not items:
        return ""

    # Get base company name from first item
    first_name = items[0].get('name', '')
    base_name = extract_company_name(first_name)

    if category == 'CD':
        return f"{base_name} CD"
    elif category == 'CP':
        # Check if it's 365D CP or similar
        if '365D' in first_name.upper():
            return f"{base_name} 365D CP"
        else:
            return f"{base_name} CP"
    else:
        return f"{base_name} {category}"


def detect_goi_security(name: str) -> str:
    """
    Detect GOI T-Bills and G-Secs from name.
    Returns: 'TBILL', 'GSEC', or None

    GOI T-Bills have names like:
      "GOVERNMENT OF INDIA 35138 364 DAYS TBILL 06NV25 FV RS 100"

    GOI G-Secs (dated bonds) have names like:
      "GOVERNMENT OF INDIA 31719 GOI 20JU27 7.38 FV RS 100"
    """
    if not name:
        return None

    name_upper = name.upper()

    # Must contain "GOVERNMENT OF INDIA" or "GOI"
    if 'GOVERNMENT OF INDIA' not in name_upper and 'GOI' not in name_upper:
        return None

    # Check for T-Bill patterns
    if 'TBILL' in name_upper or 'T-BILL' in name_upper or 'T BILL' in name_upper:
        return 'TBILL'

    # If it has a coupon rate pattern (e.g., "7.38" or "7.37") it's a G-Sec
    # G-Secs have names like "GOI 20JU27 7.38 FV RS 100"
    if re.search(r'\d+\.\d+\s*(FV|%)', name_upper):
        return 'GSEC'

    # Check for dated maturity pattern without TBILL (e.g., "GOI 20JU27")
    if re.search(r'GOI\s+\d{2}[A-Z]{2}\d{2}', name_upper):
        return 'GSEC'

    return None


def load_holdings_data(db_path: str) -> list:
    """Load all holdings data with ISIN details."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            isin_assigned,
            name_final,
            instrument_name,
            SUM(market_value) as total_mv,
            COUNT(DISTINCT scheme_name) as num_funds,
            GROUP_CONCAT(DISTINCT month_end) as months
        FROM holdings
        WHERE isin_assigned != 'IN9999999999'
          AND LENGTH(isin_assigned) >= 12
        GROUP BY isin_assigned
        ORDER BY isin_assigned
    ''')

    rows = cursor.fetchall()
    conn.close()

    data = []
    for isin, name_final, instrument_name, mv, funds, months in rows:
        parsed = parse_isin(isin)
        if parsed:
            display_name = name_final or instrument_name or ''
            parsed['name'] = display_name
            parsed['name_std'] = standardize_name(display_name)
            parsed['name_cut'] = parsed['name_std'][:NAME_CUT_LENGTH]
            parsed['mv'] = mv or 0
            parsed['funds'] = funds
            parsed['months'] = months
            parsed['sec_category'] = get_security_category(parsed['security_type'])
            data.append(parsed)

    return data


def detect_and_categorize(data: list) -> dict:
    """
    Detect potential duplicates and categorize them.

    Returns dict with:
      - corporate_action: Same base_9 + equity -> merge
      - cd_aggregate: Same issuer + CDs -> aggregate
      - cp_aggregate: Same issuer + CPs -> aggregate
      - tbill_aggregate: GOI T-Bills -> aggregate
      - gsec_aggregate: GOI G-Secs -> aggregate
      - no_action: Different companies or valid separate securities
    """
    results = {
        'corporate_action': [],
        'cd_aggregate': [],
        'cp_aggregate': [],
        'tbill_aggregate': [],
        'gsec_aggregate': [],
        'no_action': [],
        'validation_rows': []
    }

    processed_isins = set()

    # Pre-Step: Handle GOI T-Bills and G-Secs (name-based detection)
    # These need special handling because they don't follow corporate ISIN structure
    goi_tbills = []
    goi_gsecs = []

    for item in data:
        goi_type = detect_goi_security(item['name'])
        if goi_type == 'TBILL':
            goi_tbills.append(item)
            processed_isins.add(item['isin'])
        elif goi_type == 'GSEC':
            goi_gsecs.append(item)
            processed_isins.add(item['isin'])

    # Aggregate GOI T-Bills
    if len(goi_tbills) >= 1:
        synthetic_isin = 'SYNGOITBILL01'
        aggregated_name = 'GOI T-BILL'

        for item in goi_tbills:
            row = {
                'name_cut': 'governm',
                'category': 'TBILL_AGGREGATE',
                'action': 'AGGREGATE',
                'reason': 'GOI T-Bill, aggregate to synthetic',
                'isin_original': item['isin'],
                'isin_mapped': synthetic_isin,
                'name_original': item['name'][:60],
                'name_mapped': aggregated_name,
                'mv': item['mv'],
                'issuer_code': 'GOI',
                'is_target': False,
            }
            results['tbill_aggregate'].append(row)
            results['validation_rows'].append(row)

    # Aggregate GOI G-Secs
    if len(goi_gsecs) >= 1:
        synthetic_isin = 'SYNGOIGSEC01'
        aggregated_name = 'GOI G-SEC'

        for item in goi_gsecs:
            row = {
                'name_cut': 'governm',
                'category': 'GSEC_AGGREGATE',
                'action': 'AGGREGATE',
                'reason': 'GOI G-Sec (dated bond), aggregate to synthetic',
                'isin_original': item['isin'],
                'isin_mapped': synthetic_isin,
                'name_original': item['name'][:60],
                'name_mapped': aggregated_name,
                'mv': item['mv'],
                'issuer_code': 'GOI',
                'is_target': False,
            }
            results['gsec_aggregate'].append(row)
            results['validation_rows'].append(row)

    # Step 1: Group by name_cut (7 chars) to find potential duplicates
    name_groups = defaultdict(list)
    for item in data:
        if item['name_cut'] and item['isin'] not in processed_isins:
            name_groups[item['name_cut']].append(item)

    # Step 2: Analyze each group with multiple ISINs
    for name_cut, items in sorted(name_groups.items()):
        if len(items) < 2:
            continue

        unique_isins = list(set(item['isin'] for item in items))
        if len(unique_isins) < 2:
            continue

        # Group by issuer code
        by_issuer = defaultdict(list)
        for item in items:
            by_issuer[item['issuer_code']].append(item)

        for issuer_code, issuer_items in by_issuer.items():
            unique_issuer_isins = list(set(i['isin'] for i in issuer_items))

            if len(unique_issuer_isins) < 2:
                continue

            # Check for corporate action (same base_9, equity)
            by_base9 = defaultdict(list)
            for item in issuer_items:
                by_base9[item['base_9']].append(item)

            for base9, base9_items in by_base9.items():
                unique_base9_isins = [i for i in base9_items if i['isin'] not in processed_isins]

                if len(unique_base9_isins) >= 2 and unique_base9_isins[0]['security_type'] == '01':
                    # CORPORATE ACTION: Same base_9, equity, only serial differs
                    sorted_items = sorted(unique_base9_isins, key=lambda x: x['serial'])
                    newest = sorted_items[-1]

                    # Get the name to use for all (from newest ISIN)
                    name_mapped = newest['name'][:60]

                    # Add ALL records (both old and new) for visibility
                    for item in sorted_items:
                        is_target = (item['isin'] == newest['isin'])
                        row = {
                            'name_cut': name_cut,
                            'category': 'CORPORATE_ACTION',
                            'action': 'TARGET' if is_target else 'MAP',
                            'reason': f"Same issuer {issuer_code}, equity, serial {item['serial']}" +
                                     (f" (TARGET - newest)" if is_target else f" -> {newest['serial']}"),
                            'isin_original': item['isin'],
                            'isin_mapped': newest['isin'],
                            'name_original': item['name'][:60],
                            'name_mapped': name_mapped,
                            'mv': item['mv'],
                            'issuer_code': issuer_code,
                            'is_target': is_target,
                        }
                        results['corporate_action'].append(row)
                        results['validation_rows'].append(row)
                        processed_isins.add(item['isin'])

            # Check for CD aggregation (same issuer, multiple CDs)
            cds = [i for i in issuer_items if i['sec_category'] == 'CD' and i['isin'] not in processed_isins]
            if len(cds) >= 2:
                synthetic_isin = generate_synthetic_isin(issuer_code, 'CD', 1)
                aggregated_name = generate_aggregated_name(cds, 'CD')

                for cd_item in cds:
                    row = {
                        'name_cut': name_cut,
                        'category': 'CD_AGGREGATE',
                        'action': 'AGGREGATE',
                        'reason': f"CD for issuer {issuer_code}, aggregate to synthetic",
                        'isin_original': cd_item['isin'],
                        'isin_mapped': synthetic_isin,
                        'name_original': cd_item['name'][:60],
                        'name_mapped': aggregated_name,
                        'mv': cd_item['mv'],
                        'issuer_code': issuer_code,
                        'is_target': False,
                    }
                    results['cd_aggregate'].append(row)
                    results['validation_rows'].append(row)
                    processed_isins.add(cd_item['isin'])

            # Check for CP aggregation (same issuer, multiple CPs)
            cps = [i for i in issuer_items if i['sec_category'] == 'CP' and i['isin'] not in processed_isins]
            if len(cps) >= 2:
                synthetic_isin = generate_synthetic_isin(issuer_code, 'CP', 1)
                aggregated_name = generate_aggregated_name(cps, 'CP')

                for cp_item in cps:
                    row = {
                        'name_cut': name_cut,
                        'category': 'CP_AGGREGATE',
                        'action': 'AGGREGATE',
                        'reason': f"CP for issuer {issuer_code}, aggregate to synthetic",
                        'isin_original': cp_item['isin'],
                        'isin_mapped': synthetic_isin,
                        'name_original': cp_item['name'][:60],
                        'name_mapped': aggregated_name,
                        'mv': cp_item['mv'],
                        'issuer_code': issuer_code,
                        'is_target': False,
                    }
                    results['cp_aggregate'].append(row)
                    results['validation_rows'].append(row)
                    processed_isins.add(cp_item['isin'])

        # Check for NO_ACTION cases (different issuers with similar names)
        if len(by_issuer) > 1:
            for issuer_code, issuer_items in by_issuer.items():
                for item in issuer_items:
                    if item['isin'] not in processed_isins:
                        row = {
                            'name_cut': name_cut,
                            'category': 'NO_ACTION',
                            'action': 'NONE',
                            'reason': f"Different issuer {issuer_code}, valid separate company",
                            'isin_original': item['isin'],
                            'isin_mapped': item['isin'],  # No change
                            'name_original': item['name'][:60],
                            'name_mapped': item['name'][:60],  # No change
                            'mv': item['mv'],
                            'issuer_code': issuer_code,
                            'is_target': False,
                        }
                        results['no_action'].append(row)
                        results['validation_rows'].append(row)
                        processed_isins.add(item['isin'])

    return results


def write_validation_file(results: dict, output_path: Path) -> Path:
    """Write validation file for manual review."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = output_path / f'isin_validation_{timestamp}.txt'

    headers = [
        'name_cut', 'category', 'action', 'reason',
        'isin_original', 'isin_mapped', 'name_original', 'name_mapped',
        'mv', 'issuer_code'
    ]

    lines = ['\t'.join(headers)]

    # Sort by category, then name_cut, then isin
    sorted_rows = sorted(results['validation_rows'],
                        key=lambda x: (x['category'], x['name_cut'], x['isin_original']))

    for row in sorted_rows:
        line = '\t'.join([
            row['name_cut'],
            row['category'],
            row['action'],
            row['reason'],
            row['isin_original'],
            row['isin_mapped'],
            row['name_original'],
            row['name_mapped'],
            f"{row['mv']:.2f}",
            row['issuer_code'],
        ])
        lines.append(line)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    return output_file


def write_mapping_file(results: dict, output_path: Path) -> Path:
    """
    Write final ISIN mapping file.
    Only includes rows where action is MAP or AGGREGATE (not TARGET or NONE).
    """
    output_file = output_path / 'isin_mapping_final.txt'

    headers = ['isin_original', 'isin_mapped', 'name_mapped', 'category', 'reason']
    lines = ['\t'.join(headers)]

    # Corporate action mappings (only MAP, not TARGET)
    for row in results['corporate_action']:
        if row['action'] == 'MAP':
            lines.append('\t'.join([
                row['isin_original'],
                row['isin_mapped'],
                row['name_mapped'],
                'CORPORATE_ACTION',
                row['reason']
            ]))

    # CD aggregation mappings
    for row in results['cd_aggregate']:
        lines.append('\t'.join([
            row['isin_original'],
            row['isin_mapped'],
            row['name_mapped'],
            'CD_AGGREGATE',
            row['reason']
        ]))

    # CP aggregation mappings
    for row in results['cp_aggregate']:
        lines.append('\t'.join([
            row['isin_original'],
            row['isin_mapped'],
            row['name_mapped'],
            'CP_AGGREGATE',
            row['reason']
        ]))

    # T-Bill aggregation mappings
    for row in results['tbill_aggregate']:
        lines.append('\t'.join([
            row['isin_original'],
            row['isin_mapped'],
            row['name_mapped'],
            'TBILL_AGGREGATE',
            row['reason']
        ]))

    # G-Sec aggregation mappings
    for row in results['gsec_aggregate']:
        lines.append('\t'.join([
            row['isin_original'],
            row['isin_mapped'],
            row['name_mapped'],
            'GSEC_AGGREGATE',
            row['reason']
        ]))

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    # NOTE: Frontend reads mapping data directly from the database (holdings table).
    # This txt file is used as input by the converter script, not by the frontend.

    return output_file


def print_summary(results: dict):
    """Print summary of detection results."""
    print()
    print("=" * 80)
    print("ISIN VALIDATION SUMMARY")
    print("=" * 80)
    print()

    print("CORPORATE_ACTION (equity with changed ISIN due to bonus/split):")
    print("-" * 60)
    if results['corporate_action']:
        # Group by name_cut to show related records together
        by_name_cut = defaultdict(list)
        for row in results['corporate_action']:
            by_name_cut[row['name_cut']].append(row)

        for name_cut, rows in sorted(by_name_cut.items()):
            print(f"\n  [{name_cut}] - {len(rows)} ISINs:")
            for row in sorted(rows, key=lambda x: x['isin_original']):
                marker = "  (TARGET)" if row['is_target'] else "  -> maps to target"
                print(f"    {row['isin_original']} | {row['name_original'][:40]}{marker}")
            # Show the mapped name
            target = [r for r in rows if r['is_target']][0] if any(r['is_target'] for r in rows) else rows[0]
            print(f"    Name mapped: {target['name_mapped']}")
    else:
        print("  None found")
    print()

    print("CD_AGGREGATE (Certificates of Deposit to be aggregated):")
    print("-" * 60)
    if results['cd_aggregate']:
        by_synthetic = defaultdict(list)
        for row in results['cd_aggregate']:
            by_synthetic[row['isin_mapped']].append(row)

        for synthetic, items in sorted(by_synthetic.items()):
            total_mv = sum(row['mv'] for row in items)
            print(f"\n  {synthetic} <- {len(items)} CDs, Total MV: {total_mv:,.0f}")
            print(f"  Name mapped: {items[0]['name_mapped']}")
            for row in items[:3]:
                print(f"    - {row['isin_original']} | {row['name_original'][:40]}")
            if len(items) > 3:
                print(f"    ... and {len(items) - 3} more")
    else:
        print("  None found")
    print()

    print("CP_AGGREGATE (Commercial Papers to be aggregated):")
    print("-" * 60)
    if results['cp_aggregate']:
        by_synthetic = defaultdict(list)
        for row in results['cp_aggregate']:
            by_synthetic[row['isin_mapped']].append(row)

        for synthetic, items in sorted(by_synthetic.items()):
            total_mv = sum(row['mv'] for row in items)
            print(f"\n  {synthetic} <- {len(items)} CPs, Total MV: {total_mv:,.0f}")
            print(f"  Name mapped: {items[0]['name_mapped']}")
            for row in items[:3]:
                print(f"    - {row['isin_original']} | {row['name_original'][:40]}")
            if len(items) > 3:
                print(f"    ... and {len(items) - 3} more")
    else:
        print("  None found")
    print()

    print("TBILL_AGGREGATE (GOI T-Bills to be aggregated):")
    print("-" * 60)
    if results['tbill_aggregate']:
        total_mv = sum(row['mv'] for row in results['tbill_aggregate'])
        print(f"\n  SYNGOITBILL01 <- {len(results['tbill_aggregate'])} T-Bills, Total MV: {total_mv:,.0f}")
        print(f"  Name mapped: GOI T-BILL")
        for row in results['tbill_aggregate'][:3]:
            print(f"    - {row['isin_original']} | {row['name_original'][:40]}")
        if len(results['tbill_aggregate']) > 3:
            print(f"    ... and {len(results['tbill_aggregate']) - 3} more")
    else:
        print("  None found")
    print()

    print("GSEC_AGGREGATE (GOI G-Secs/Bonds to be aggregated):")
    print("-" * 60)
    if results['gsec_aggregate']:
        total_mv = sum(row['mv'] for row in results['gsec_aggregate'])
        print(f"\n  SYNGOIGSEC01 <- {len(results['gsec_aggregate'])} G-Secs, Total MV: {total_mv:,.0f}")
        print(f"  Name mapped: GOI G-SEC")
        for row in results['gsec_aggregate'][:3]:
            print(f"    - {row['isin_original']} | {row['name_original'][:40]}")
        if len(results['gsec_aggregate']) > 3:
            print(f"    ... and {len(results['gsec_aggregate']) - 3} more")
    else:
        print("  None found")
    print()

    print("NO_ACTION (different companies, no mapping needed):")
    print("-" * 60)
    print(f"  {len(results['no_action'])} records - different issuers with similar name prefixes")
    print()

    print("TOTALS:")
    print("-" * 60)
    corp_map_count = len([r for r in results['corporate_action'] if r['action'] == 'MAP'])
    corp_target_count = len([r for r in results['corporate_action'] if r['action'] == 'TARGET'])
    print(f"  Corporate Action: {corp_map_count} mappings + {corp_target_count} targets = {len(results['corporate_action'])} records")
    print(f"  CD Aggregations: {len(results['cd_aggregate'])}")
    print(f"  CP Aggregations: {len(results['cp_aggregate'])}")
    print(f"  T-Bill Aggregations: {len(results['tbill_aggregate'])}")
    print(f"  G-Sec Aggregations: {len(results['gsec_aggregate'])}")
    print(f"  No Action: {len(results['no_action'])}")
    print(f"  Total validation rows: {len(results['validation_rows'])}")
    print()


def main():
    # Parse arguments
    mode = 'validate'  # Default
    if '--create-map' in sys.argv:
        mode = 'create-map'
    elif '--validate' in sys.argv:
        mode = 'validate'
    elif '--both' in sys.argv:
        mode = 'both'

    # Paths
    script_dir = Path(__file__).parent  # scripts/_primary/
    isin_project_dir = script_dir.parent.parent  # projects/isin-mapping/
    repo_root = isin_project_dir.parent.parent  # MF_PORTFOLIO_FULL_APP_REACT/
    db_path = repo_root / 'public' / 'data' / 'mf_portfolio.db'
    output_dir = isin_project_dir / 'output' / 'validations'
    output_dir.mkdir(parents=True, exist_ok=True)

    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        sys.exit(1)

    print(f"Database: {db_path}")
    print(f"Output directory: {output_dir}")
    print(f"Mode: {mode}")
    print()

    # Load data
    print("Loading holdings data...")
    data = load_holdings_data(str(db_path))
    print(f"Loaded {len(data)} unique ISINs")
    print()

    # Detect and categorize
    print("Detecting and categorizing potential duplicates...")
    results = detect_and_categorize(data)

    # Print summary
    print_summary(results)

    # Write files based on mode
    if mode in ['validate', 'both']:
        validation_file = write_validation_file(results, output_dir)
        print(f"Validation file written to: {validation_file}")
        print("  -> Review this file, then run with --create-map to generate mapping")

    if mode in ['create-map', 'both']:
        mapping_file = write_mapping_file(results, output_dir)
        print(f"Mapping file written to: {mapping_file}")
        print("  -> This file can be used to update the database")


if __name__ == '__main__':
    main()
