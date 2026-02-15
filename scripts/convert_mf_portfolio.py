"""
MF Portfolio Converter - ISIN Mapping Script
Converts mutual fund portfolio disclosure Excel files to SQLite database.
Keeps all raw rows with isin_original and isin_assigned columns.

Usage:
    python convert_mf_portfolio.py <excel_file> <sheet_name> <scheme_name> <month_end> [--csv]

Options:
    --csv    Also output CSV file (disabled by default)

Example:
    python convert_mf_portfolio.py ../../../data/raw/axis/axis_2025-12-31.xlsx AXISMCF AXISMCF 2025-12-31
"""

import pandas as pd
import sqlite3
import sys
import re
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


# ============================================================================
# Excel Format Detection (handles mismatched file extensions)
# ============================================================================
def detect_excel_engine(file_path: Path) -> str:
    """Detect actual Excel format from file header, regardless of extension.

    AMC websites often serve files with wrong extensions:
    - .xlsx file that's actually OLE/XLS format
    - .xls file that's actually OOXML/XLSX format

    Returns: 'openpyxl' for XLSX, 'xlrd' for XLS
    """
    with open(file_path, 'rb') as f:
        header = f.read(8)

    if header[:2] == b'PK':
        # ZIP signature = OOXML format (xlsx)
        return 'openpyxl'
    elif header[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        # OLE2 signature = Binary format (xls)
        return 'xlrd'
    else:
        # Unknown - let pandas guess
        return None


def read_excel_auto(file_path: Path, sheet_name: str) -> pd.DataFrame:
    """Read Excel file with auto-detected engine."""
    engine = detect_excel_engine(file_path)
    if engine:
        print(f"  Auto-detected format: {engine}")
        return pd.read_excel(str(file_path), sheet_name=sheet_name, header=None, engine=engine)
    else:
        return pd.read_excel(str(file_path), sheet_name=sheet_name, header=None)


# ============================================================================
# Configuration
# ============================================================================
OUTPUT_CSV = False  # Set to True to enable CSV output by default
DB_NAME = 'mf_portfolio.db'
FRONTEND_DB_NAME = 'mf_portfolio.db'  # Same name, different location

# ISIN Assignment Code for non-standard items (Cash, Futures, CBLO, Net Receivables, etc.)
ISIN_OTHER = 'IN9999999999'           # Single code for all non-standard items
ISIN_OTHER_DISPLAY_NAME = 'Cash & Other Assets'  # Display name for name_final when no name_nsdl

# ============================================================================
# Fund Mapping Configuration
# ============================================================================
# Each fund has: scheme_name (DB key), display_name, amc_folder, sheet_name, category
# File pattern: {amc_folder}/{amc_folder}_{month_end}.xlsx (or .xls)

FUND_CONFIG = {
    # Midcap Funds
    'AXISMCF': {
        'display_name': 'Axis Midcap Fund',
        'amc_folder': 'axis',
        'sheet_name': 'AXISMCF',
        'category': 'midcap'
    },
    'HDFCMIDCAP': {
        'display_name': 'HDFC Mid-Cap Opportunities Fund',
        'amc_folder': 'hdfc',
        'sheet_name': 'MIDCAP',
        'category': 'midcap',
        'file_pattern': 'hdfc_midcap_{month_end}.xlsx'
    },
    'MOTILALMIDCAP': {
        'display_name': 'Motilal Oswal Midcap Fund',
        'amc_folder': 'motilal',
        'sheet_name': 'YO07',
        'category': 'midcap'
    },
    'KOTAKMIDCAP': {
        'display_name': 'Kotak Emerging Equity Fund',
        'amc_folder': 'kotak',
        'sheet_name': 'EME',
        'category': 'midcap',
        # Schema override: Kotak has name in col C, ISIN in col D, quantity in G, market_value in H
        'schema_override': {
            'name_col': 2,  # C
            'isin_col': 3,  # D
            'quantity_col': 6,  # G
            'market_value_col': 7  # H
        }
    },
    'NIPPONMIDCAP': {
        'display_name': 'Nippon India Growth Fund',
        'amc_folder': 'nippon',
        'sheet_name': 'GF',
        'category': 'midcap',
        'file_pattern': 'nippon_{month_short}.xls'  # Custom pattern: nippon_2025-Dec.xls
    },
    # Smallcap Funds
    'NIPPONSMALLCAP': {
        'display_name': 'Nippon India Small Cap Fund',
        'amc_folder': 'nippon',
        'sheet_name': 'SC',
        'category': 'smallcap',
        'file_pattern': 'nippon_{month_short}.xls'
    },
    'SBISMALLCAP': {
        'display_name': 'SBI Small Cap Fund',
        'amc_folder': 'sbi',
        'sheet_name': 'SSCF',
        'category': 'smallcap'
    },
    'AXISSMALLCAP': {
        'display_name': 'Axis Small Cap Fund',
        'amc_folder': 'axis',
        'sheet_name': 'AXISSCF',
        'category': 'smallcap'
    },

    # Flexicap Funds
    'PPFASFLEXICAP': {
        'display_name': 'Parag Parikh Flexi Cap Fund',
        'amc_folder': 'ppfas',
        'sheet_name': 'PPFCF',
        'category': 'flexicap'
    },
    'KOTAKFLEXICAP': {
        'display_name': 'Kotak Flexicap Fund',
        'amc_folder': 'kotak',
        'sheet_name': 'SEF',
        'category': 'flexicap',
        # Kotak has name in col C, ISIN in col D, quantity in G, market_value in H
        'schema_override': {
            'name_col': 2,  # C
            'isin_col': 3,  # D
            'quantity_col': 6,  # G
            'market_value_col': 7  # H
        }
    },
    'HDFCFLEXICAP': {
        'display_name': 'HDFC Flexi Cap Fund',
        'amc_folder': 'hdfc',
        'sheet_name': 'HDFCEQ',
        'category': 'flexicap',
        'file_pattern': 'hdfc_flexicap_{month_end}.xlsx'
    },

    # Large Cap Funds
    'ICICILARGECAP': {
        'display_name': 'ICICI Pru Large Cap Fund',
        'amc_folder': 'icici',
        'sheet_name': 'BLUECHIP',
        'category': 'largecap',
        'file_pattern': 'icici_largecap_{month_short}.xlsx'
    },
    'SBILARGECAP': {
        'display_name': 'SBI Blue Chip Fund',
        'amc_folder': 'sbi',
        'sheet_name': 'SBLUECHIP',
        'category': 'largecap'
    },
    'NIPPONLARGECAP': {
        'display_name': 'Nippon India Large Cap Fund',
        'amc_folder': 'nippon',
        'sheet_name': 'EA',
        'category': 'largecap',
        'file_pattern': 'nippon_{month_short}.xls'
    },
    'MIRAELARGECAP': {
        'display_name': 'Mirae Asset Large Cap Fund',
        'amc_folder': 'mirae',
        'sheet_name': 'MIIOF',
        'category': 'largecap',
        'file_pattern': 'mirae_largecap_{month_end}.xlsx'
    },
    'HDFCLARGECAP': {
        'display_name': 'HDFC Large Cap Fund',
        'amc_folder': 'hdfc',
        'sheet_name': 'HDFCT2',
        'category': 'largecap',
        'file_pattern': 'hdfc_largecap_{month_end}.xlsx'
    },

    # Focused Funds
    'SBIFOCUSED': {
        'display_name': 'SBI Focused Equity Fund',
        'amc_folder': 'sbi',
        'sheet_name': 'SFEF',
        'category': 'focused'
    },
    'ICICIFOCUSED': {
        'display_name': 'ICICI Pru Focused Equity Fund',
        'amc_folder': 'icici',
        'sheet_name': 'FOCUSED',
        'category': 'focused',
        'file_pattern': 'icici_focused_{month_short}.xlsx'
    },
    'HDFCFOCUSED': {
        'display_name': 'HDFC Focused Fund',
        'amc_folder': 'hdfc',
        'sheet_name': 'HDFCCS',
        'category': 'focused',
        'file_pattern': 'hdfc_focused_{month_end}.xlsx'
    },
    'FRANKLINFOCUSED': {
        'display_name': 'Franklin India Focused Equity Fund',
        'amc_folder': 'franklin',
        'sheet_name': 'FIFEF',
        'category': 'focused',
        'file_pattern': 'franklin_{year_month}.xlsx'  # franklin_2025-09.xlsx
    },
    'AXISFOCUSED': {
        'display_name': 'Axis Focused Fund',
        'amc_folder': 'axis',
        'sheet_name': 'AXISF25',
        'category': 'focused'
    },
}

def get_funds_by_category(category: str) -> list:
    """Get list of fund codes by category."""
    return [code for code, config in FUND_CONFIG.items() if config['category'] == category]

def get_file_path(fund_code: str, month_end: str, base_path: Path) -> Path:
    """Get the Excel file path for a fund and month."""
    config = FUND_CONFIG[fund_code]
    amc_folder = config['amc_folder']

    # Check for custom file pattern
    if 'file_pattern' in config:
        from datetime import datetime
        dt = datetime.strptime(month_end, '%Y-%m-%d')
        month_short = dt.strftime('%Y-%b')  # 2025-Dec
        year_month = dt.strftime('%Y-%m')   # 2025-09
        filename = config['file_pattern']
        filename = filename.replace('{month_short}', month_short)
        filename = filename.replace('{month_end}', month_end)
        filename = filename.replace('{year_month}', year_month)
    else:
        # Default pattern: {amc}_{month_end}.xlsx
        filename = f"{amc_folder}_{month_end}.xlsx"

    file_path = base_path / amc_folder / filename

    # Try .xls if .xlsx doesn't exist
    if not file_path.exists() and file_path.suffix == '.xlsx':
        xls_path = file_path.with_suffix('.xls')
        if xls_path.exists():
            return xls_path

    return file_path


@dataclass
class Schema:
    """Schema definition for a sheet."""
    data_start_row: int  # 1-indexed (Excel row number)
    isin_col: int        # 0-indexed column
    name_col: int        # 0-indexed column
    market_value_col: int  # 0-indexed column
    quantity_col: int    # 0-indexed column
    grand_total_row: Optional[int] = None  # 1-indexed, if known
    grand_total: Optional[float] = None


@dataclass
class ProcessedRow:
    """A single processed row."""
    isin_original: str      # Original ISIN from Excel (could be empty)
    isin_assigned: str      # Assigned/validated ISIN
    instrument_name: str
    market_value: float
    quantity: float
    nse_symbol: str = ''
    name_nsdl: str = ''     # Raw name from NSDL master (empty if not found)
    name_final: str = ''    # Display name: name_nsdl || fallback (for dashboard)
    isin_mapped: str = ''   # Mapped ISIN after validation (for aggregation)
    name_mapped: str = ''   # Mapped name after validation (for display)
    mapping_category: str = ''  # Category of mapping: CORPORATE_ACTION, CD_AGGREGATE, etc.
    mapping_reason: str = ''    # Reason for mapping (human-readable explanation)


def load_isin_master(db_path: str) -> dict:
    """Load ISIN master data from SQLite database."""
    mapping = {}
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT isin, name_nsdl, nse_symbol FROM isin_master')
        for row in cursor.fetchall():
            isin, name_nsdl, nse_symbol = row
            mapping[isin] = {
                'name_nsdl': name_nsdl or '',
                'nse_symbol': nse_symbol or '',
            }
        conn.close()
        print(f"Loaded {len(mapping):,} ISINs from isin_master table")
    except Exception as e:
        print(f"Warning: Could not load ISIN master: {e}")
        print("Run 'python download_isin_master.py' to populate the isin_master table")
    return mapping


def load_isin_validation_mapping(mapping_file: Path) -> dict:
    """
    Load ISIN validation mapping from isin_mapping_final.txt.
    Returns dict: {isin_original: {'isin_mapped': ..., 'name_mapped': ..., 'category': ..., 'reason': ...}}
    """
    mapping = {}
    if not mapping_file.exists():
        print(f"Note: No ISIN validation mapping file found at {mapping_file}")
        print("  Run isin_validation_mapping.py --both to generate it")
        return mapping

    try:
        with open(mapping_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Skip header
        for line in lines[1:]:
            parts = line.strip().split('\t')
            if len(parts) >= 3:
                isin_original = parts[0]
                isin_mapped = parts[1]
                name_mapped = parts[2]
                # Extract category and reason if available (columns 4 and 5)
                category = parts[3] if len(parts) >= 4 else ''
                reason = parts[4] if len(parts) >= 5 else ''
                mapping[isin_original] = {
                    'isin_mapped': isin_mapped,
                    'name_mapped': name_mapped,
                    'category': category,
                    'reason': reason,
                }

        print(f"Loaded {len(mapping)} ISIN validation mappings")
    except Exception as e:
        print(f"Warning: Could not load ISIN validation mapping: {e}")

    return mapping


def find_grand_total(df: pd.DataFrame, market_value_col: int) -> tuple[Optional[int], Optional[float]]:
    """
    Find Grand Total row and value in the sheet.
    Handles multiple patterns:
    - "Grand Total" (most AMCs)
    - "Total Net Assets" (ICICI)
    - "Total" exact match (Franklin)
    """
    for idx, row in df.iterrows():
        row_str = ' '.join([str(v) for v in row if pd.notna(v)]).lower()

        # Pattern 1: "Grand Total" (most common)
        if 'grand total' in row_str:
            try:
                value = float(row.iloc[market_value_col])
                return idx + 1, value  # Return 1-indexed row
            except (ValueError, TypeError):
                pass

        # Pattern 2: "Total Net Assets" (ICICI)
        if 'total net assets' in row_str:
            # Find first large numeric value in row
            for cell in row:
                if pd.notna(cell):
                    try:
                        val = float(cell)
                        if val > 10000:  # Must be reasonably large (not percentage)
                            return idx + 1, val
                    except (ValueError, TypeError):
                        pass

        # Pattern 3: Exact "Total" (Franklin) - avoid "Sub Total"
        first_cell = str(row.iloc[0]).strip().lower() if pd.notna(row.iloc[0]) else ''
        if first_cell == 'total':
            # Find first large numeric value in row
            for cell in row:
                if pd.notna(cell):
                    try:
                        val = float(cell)
                        if val > 10000:  # Must be reasonably large
                            return idx + 1, val
                    except (ValueError, TypeError):
                        pass

    return None, None


def detect_schema(df: pd.DataFrame) -> Schema:
    """
    Auto-detect schema from sheet data.
    Finds first row where ISIN starts with 'IN' and identifies columns.
    """
    # Find header row by looking for ISIN column
    header_row = None
    for idx, row in df.iterrows():
        row_values = [str(v).lower() if pd.notna(v) else '' for v in row]
        for col_idx, val in enumerate(row_values):
            if 'isin' in val:
                header_row = idx
                break
        if header_row is not None:
            break

    if header_row is None:
        raise ValueError("Could not find header row with ISIN column")

    # Get column positions from header
    header = df.iloc[header_row]
    isin_col = None
    name_col = None
    market_value_col = None
    quantity_col = None

    for col_idx, val in enumerate(header):
        val_lower = str(val).lower() if pd.notna(val) else ''
        if 'isin' in val_lower and isin_col is None:
            isin_col = col_idx
        elif any(term in val_lower for term in ['instrument', 'name of', 'security', 'company']) and name_col is None:
            name_col = col_idx
        elif any(term in val_lower for term in ['market', 'fair value', 'nav', 'value']) and 'net' not in val_lower and market_value_col is None:
            market_value_col = col_idx
        elif any(term in val_lower for term in ['quantity', 'qty', 'units', 'nos']) and quantity_col is None:
            quantity_col = col_idx

    # Find first data row (first row after header with ISIN starting with 'IN')
    data_start_row = None
    for idx in range(header_row + 1, len(df)):
        if isin_col is not None:
            isin_val = str(df.iloc[idx, isin_col]) if pd.notna(df.iloc[idx, isin_col]) else ''
            if isin_val.strip().startswith('IN'):
                data_start_row = idx + 1  # 1-indexed
                break

    # Find grand total
    grand_total_row, grand_total = find_grand_total(df, market_value_col)

    return Schema(
        data_start_row=data_start_row,
        isin_col=isin_col,
        name_col=name_col,
        market_value_col=market_value_col,
        quantity_col=quantity_col,
        grand_total_row=grand_total_row,
        grand_total=grand_total
    )


def is_valid_isin(isin: str) -> bool:
    """Check if ISIN is valid (starts with IN and has proper format)."""
    if not isin:
        return False
    # Indian ISIN format: INE + 6 alphanumeric + 5 digits (12 chars total)
    # But some may have variations, so just check starts with IN and length >= 12
    return isin.startswith('IN') and len(isin) >= 12


def is_aggregation_row(name: str, isin: str, full_row_text: str = '') -> bool:
    """Check if row is an aggregation row (Sub Total, Total, Grand Total) or section header."""
    name_lower = name.lower().strip()
    isin_lower = isin.lower().strip()
    row_lower = full_row_text.lower() if full_row_text else ''

    # Skip patterns for totals
    skip_patterns = ['sub total', 'subtotal', 'grand total', 'grandtotal']

    # Section headers that are subtotals (ICICI-style) - these have values but are category headers
    # Note: "TREPS", "Cash Margin", "Net Current Assets" are actual cash items (NOT subtotals)
    # "Others" is a subtotal that typically equals its child "Cash Margin - Derivatives"
    # "Reverse Repo" (exact) is a subtotal when followed by dated items; dated items have "(date)" suffix
    section_headers = [
        'treasury bills', 'treasury bill',
        'money market instruments', 'money market',
        'debt instruments', 'debt',
        'equity & equity related', 'equity and equity',
        'listed / awaiting', 'listed/awaiting',
        'privately placed', 'unlisted',
        'certificate of deposit', 'commercial paper',
        'government securities', 'government security',
        'corporate debt', 'corporate bond',
        'securitised debt', 'pass through',
        'units of real estate', 'reits',
        'units of an alternative', 'aif',
        'zero coupon bonds', 'deep discount bonds',
        'others',  # subtotal that includes "Cash Margin - Derivatives"
    ]

    # Check if name or isin contains skip patterns
    for pattern in skip_patterns:
        if pattern in name_lower or pattern in isin_lower:
            return True

    # Check for section headers (only when no valid ISIN)
    if not isin_lower.startswith('in') or len(isin_lower) != 12:
        for header in section_headers:
            if name_lower == header or name_lower.startswith(header):
                return True

    # Check if name is exactly "Total" (case insensitive)
    if name_lower == 'total' or isin_lower == 'total':
        return True

    # Check full row text for standalone "total" (e.g., in Industry column for Kotak)
    # Must be a standalone word to avoid matching "Net Total Assets" etc incorrectly
    if row_lower:
        import re
        # Match standalone "total" or "total" followed by non-letter (e.g., "Total ")
        if re.search(r'\btotal\b', row_lower) and not 'net' in row_lower:
            return True

    return False


def assign_isin(isin_original: str, instrument_name: str) -> str:
    """
    Assign ISIN based on original value.
    Returns the original ISIN if valid, otherwise IN9999999999 for all non-standard items
    (Cash, Futures, CBLO, Net Receivables, TREPS, etc.)
    """
    # If valid ISIN, use it
    if is_valid_isin(isin_original):
        return isin_original

    # All non-standard items get the same code
    return ISIN_OTHER


def process_sheet(df: pd.DataFrame, schema: Schema, isin_mapping: dict,
                   validation_mapping: dict = None) -> tuple[list[ProcessedRow], float, list[tuple[str, str]]]:
    """
    Process sheet data according to schema.
    Returns: (processed_rows, calculated_total, unmapped_isins)

    Args:
        df: DataFrame from Excel
        schema: Detected schema
        isin_mapping: ISIN master data (name_nsdl, nse_symbol)
        validation_mapping: ISIN validation mapping (isin_mapped, name_mapped)
    """
    if validation_mapping is None:
        validation_mapping = {}
    rows = []
    unmapped = []

    # Start from data_start_row (convert to 0-indexed)
    start_idx = schema.data_start_row - 1

    for idx in range(start_idx, len(df)):
        row_data = df.iloc[idx]

        # Get ISIN (original)
        isin_original = str(row_data.iloc[schema.isin_col]).strip() if pd.notna(row_data.iloc[schema.isin_col]) else ''

        # Get instrument name
        name = str(row_data.iloc[schema.name_col]).strip() if pd.notna(row_data.iloc[schema.name_col]) else ''

        # Build full row text for aggregation check (catches "Total" in any column)
        full_row_text = ' '.join([str(v) for v in row_data if pd.notna(v)])
        full_row_lower = full_row_text.lower()

        # STOP processing at Grand Total variants - everything after is notes/derivatives disclosure
        # Pattern 1: "Grand Total" (most AMCs)
        if 'grand total' in full_row_lower:
            break
        # Pattern 2: "Total Net Assets" (ICICI)
        if 'total net assets' in full_row_lower:
            break
        # Pattern 3: Exact "Total" in first column (Franklin) - avoid "Sub Total"
        first_cell = str(row_data.iloc[0]).strip().lower() if pd.notna(row_data.iloc[0]) else ''
        if first_cell == 'total':
            break

        # Skip aggregation rows (Sub Total, Total)
        if is_aggregation_row(name, isin_original, full_row_text):
            continue

        # "Reverse Repo" look-ahead: skip if it's a subtotal (followed by dated children like "Reverse Repo (date)")
        # but include if it's standalone data (ICICI Sep, HDFC Midcap pattern)
        if name.lower().strip() == 'reverse repo' and not is_valid_isin(isin_original):
            is_subtotal = False
            for j in range(idx + 1, len(df)):
                next_row = df.iloc[j]
                next_name = str(next_row.iloc[schema.name_col]).strip() if pd.notna(next_row.iloc[schema.name_col]) else ''
                try:
                    next_mv = float(next_row.iloc[schema.market_value_col]) if pd.notna(next_row.iloc[schema.market_value_col]) else 0
                except (ValueError, TypeError):
                    next_mv = 0
                if next_mv == 0:
                    continue  # Skip empty/header rows
                # If next data row starts with "Reverse Repo" but has more detail (date), this is a subtotal
                if next_name.lower().startswith('reverse repo') and next_name.lower().strip() != 'reverse repo':
                    is_subtotal = True
                break  # Only check the first non-empty row after
            if is_subtotal:
                continue

        # Get market value
        try:
            market_value = float(row_data.iloc[schema.market_value_col]) if pd.notna(row_data.iloc[schema.market_value_col]) else 0
        except (ValueError, TypeError):
            market_value = 0

        # Skip rows with no market value
        if market_value == 0:
            continue

        # Get quantity
        try:
            quantity = float(row_data.iloc[schema.quantity_col]) if pd.notna(row_data.iloc[schema.quantity_col]) else 0
        except (ValueError, TypeError):
            quantity = 0

        # Assign ISIN
        isin_assigned = assign_isin(isin_original, name)

        # Get mapping (using assigned ISIN)
        mapping = isin_mapping.get(isin_assigned, {})

        # Get name_nsdl from mapping (keep it pure - only from NSDL source)
        name_nsdl = mapping.get('name_nsdl', '')

        # Compute name_final: name_nsdl first, then fallback for display
        if name_nsdl:
            name_final = name_nsdl
        elif isin_assigned == ISIN_OTHER:
            name_final = ISIN_OTHER_DISPLAY_NAME
        else:
            name_final = name  # fallback to instrument_name from Excel

        # Apply validation mapping (isin_mapped, name_mapped, category, reason)
        val_mapping = validation_mapping.get(isin_assigned, {})
        isin_mapped = val_mapping.get('isin_mapped', isin_assigned)  # Default to isin_assigned
        name_mapped = val_mapping.get('name_mapped', name_final)     # Default to name_final
        mapping_category = val_mapping.get('category', '')           # Empty if no mapping
        mapping_reason = val_mapping.get('reason', '')               # Empty if no mapping

        # Set CASH_AGGREGATE for synthetic ISIN items (cash, TREPS, repos, futures, etc.)
        if isin_assigned == ISIN_OTHER and not mapping_category:
            mapping_category = 'CASH_AGGREGATE'
            mapping_reason = 'Cash, TREPS, repos, futures, and other non-ISIN items consolidated under synthetic ISIN'

        processed = ProcessedRow(
            isin_original=isin_original,
            isin_assigned=isin_assigned,
            instrument_name=name,
            market_value=market_value,
            quantity=quantity,
            nse_symbol=mapping.get('nse_symbol', ''),
            name_nsdl=name_nsdl,
            name_final=name_final,
            isin_mapped=isin_mapped,
            name_mapped=name_mapped,
            mapping_category=mapping_category,
            mapping_reason=mapping_reason,
        )
        rows.append(processed)

        if not mapping and is_valid_isin(isin_assigned):
            unmapped.append((isin_assigned, name))

    calculated_total = sum(r.market_value for r in rows)
    return rows, calculated_total, unmapped


def init_database(db_path: Path) -> sqlite3.Connection:
    """Initialize SQLite database with schema."""
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create holdings table (idempotent)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scheme_name TEXT NOT NULL,
            month_end TEXT NOT NULL,
            isin_original TEXT,
            isin_assigned TEXT NOT NULL,
            instrument_name TEXT,
            market_value REAL,
            quantity REAL,
            nse_symbol TEXT,
            name_nsdl TEXT,
            name_final TEXT,
            isin_mapped TEXT,
            name_mapped TEXT,
            mapping_category TEXT,
            mapping_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add isin_mapped and name_mapped columns if they don't exist (for migration)
    try:
        cursor.execute('ALTER TABLE holdings ADD COLUMN isin_mapped TEXT')
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        cursor.execute('ALTER TABLE holdings ADD COLUMN name_mapped TEXT')
    except sqlite3.OperationalError:
        pass  # Column already exists
    # Add mapping_category and mapping_reason columns if they don't exist (for migration)
    try:
        cursor.execute('ALTER TABLE holdings ADD COLUMN mapping_category TEXT')
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        cursor.execute('ALTER TABLE holdings ADD COLUMN mapping_reason TEXT')
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Create funds table for fund metadata (idempotent)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS funds (
            scheme_name TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            category TEXT NOT NULL
        )
    ''')

    # Create indexes for common queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_holdings_scheme ON holdings(scheme_name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_holdings_month ON holdings(month_end)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_holdings_isin_assigned ON holdings(isin_assigned)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_holdings_isin_original ON holdings(isin_original)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_holdings_scheme_month ON holdings(scheme_name, month_end)')

    conn.commit()
    return conn


def create_frontend_database(source_db: Path, project_root: Path) -> bool:
    """Create minimal frontend database with only holdings and funds tables.

    Frontend DB is much smaller (~1MB vs 82MB) as it excludes isin_master table.
    This is the final step in the pipeline - creates the DB that gets deployed.

    Args:
        source_db: Path to working database (projects/isin-mapping/database/mf_portfolio.db)
        project_root: Path to project root (MF_PORTFOLIO_FULL_APP_REACT/)

    Returns:
        True if successful, False otherwise
    """
    frontend_db = project_root / 'public' / 'data' / FRONTEND_DB_NAME

    print(f"\n{'='*60}")
    print("Creating frontend database...")
    print(f"  Source: {source_db}")
    print(f"  Target: {frontend_db}")

    if not source_db.exists():
        print(f"  ERROR: Source database not found")
        return False

    # Connect to source
    conn_src = sqlite3.connect(str(source_db))
    cursor_src = conn_src.cursor()

    # Create frontend database
    frontend_db.parent.mkdir(parents=True, exist_ok=True)
    if frontend_db.exists():
        frontend_db.unlink()

    conn_dst = sqlite3.connect(str(frontend_db))
    cursor_dst = conn_dst.cursor()

    # Copy holdings table
    cursor_src.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='holdings'")
    result = cursor_src.fetchone()
    if result:
        cursor_dst.execute(result[0])
        cursor_src.execute('SELECT * FROM holdings')
        holdings_data = cursor_src.fetchall()
        cursor_src.execute('PRAGMA table_info(holdings)')
        cols_count = len(cursor_src.fetchall())
        placeholders = ','.join(['?' for _ in range(cols_count)])
        cursor_dst.executemany(f'INSERT INTO holdings VALUES ({placeholders})', holdings_data)
        print(f"  holdings: {len(holdings_data):,} rows copied")

    # Copy funds table
    cursor_src.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='funds'")
    result = cursor_src.fetchone()
    if result:
        cursor_dst.execute(result[0])
        cursor_src.execute('SELECT * FROM funds')
        funds_data = cursor_src.fetchall()
        cursor_src.execute('PRAGMA table_info(funds)')
        cols_count = len(cursor_src.fetchall())
        placeholders = ','.join(['?' for _ in range(cols_count)])
        cursor_dst.executemany(f'INSERT INTO funds VALUES ({placeholders})', funds_data)
        print(f"  funds: {len(funds_data):,} rows copied")

    # Create indexes
    cursor_dst.execute('CREATE INDEX IF NOT EXISTS idx_holdings_scheme ON holdings(scheme_name)')
    cursor_dst.execute('CREATE INDEX IF NOT EXISTS idx_holdings_month ON holdings(month_end)')
    cursor_dst.execute('CREATE INDEX IF NOT EXISTS idx_holdings_scheme_month ON holdings(scheme_name, month_end)')

    conn_dst.commit()
    conn_src.close()
    conn_dst.close()

    # Report sizes
    src_size = source_db.stat().st_size / 1024 / 1024
    dst_size = frontend_db.stat().st_size / 1024
    print(f"  Size: {dst_size:.0f} KB (vs {src_size:.1f} MB working DB)")
    print(f"Frontend database ready: {frontend_db}")

    return True


def insert_to_database(conn: sqlite3.Connection, rows: list[ProcessedRow],
                       scheme_name: str, month_end: str) -> int:
    """Insert processed rows into database. Returns number of rows inserted."""
    cursor = conn.cursor()

    # Delete existing data for this scheme/month (upsert behavior)
    cursor.execute(
        'DELETE FROM holdings WHERE scheme_name = ? AND month_end = ?',
        (scheme_name.upper(), month_end)
    )

    # Insert data rows
    inserted = 0
    for row in rows:
        cursor.execute('''
            INSERT INTO holdings (scheme_name, month_end, isin_original, isin_assigned, instrument_name,
                                  market_value, quantity, nse_symbol, name_nsdl, name_final,
                                  isin_mapped, name_mapped, mapping_category, mapping_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            scheme_name.upper(),
            month_end,
            row.isin_original,
            row.isin_assigned,
            row.instrument_name,
            row.market_value,
            row.quantity,
            row.nse_symbol,
            row.name_nsdl,
            row.name_final,
            row.isin_mapped,
            row.name_mapped,
            row.mapping_category,
            row.mapping_reason,
        ))
        inserted += 1

    conn.commit()
    return inserted


def update_funds_table(conn: sqlite3.Connection, fund_code: str) -> None:
    """Upsert fund metadata from FUND_CONFIG into funds table."""
    if fund_code not in FUND_CONFIG:
        return
    config = FUND_CONFIG[fund_code]
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO funds (scheme_name, display_name, category)
        VALUES (?, ?, ?)
    ''', (fund_code.upper(), config['display_name'], config['category']))
    conn.commit()


def generate_csv(rows: list[ProcessedRow], scheme_name: str, month_end: str,
                 delimiter: str = '|') -> str:
    """Generate CSV content from processed rows."""

    # Header
    headers = [
        'SCHEME_NAME', 'MONTH_END', 'ISIN_ORIGINAL', 'ISIN_ASSIGNED', 'INSTRUMENT_NAME',
        'MARKET_VALUE', 'QUANTITY', 'NSE_SYMBOL', 'NAME_NSDL', 'NAME_FINAL',
        'ISIN_MAPPED', 'NAME_MAPPED', 'MAPPING_CATEGORY', 'MAPPING_REASON'
    ]
    lines = [delimiter.join(headers)]

    # Data rows
    for row in rows:
        line = delimiter.join([
            scheme_name.upper(),
            month_end,
            row.isin_original,
            row.isin_assigned,
            row.instrument_name,
            str(row.market_value),
            str(int(row.quantity)) if row.quantity == int(row.quantity) else str(row.quantity),
            row.nse_symbol,
            row.name_nsdl,
            row.name_final,
            row.isin_mapped,
            row.name_mapped,
            row.mapping_category,
            row.mapping_reason,
        ])
        lines.append(line)

    return '\n'.join(lines)


def process_fund(fund_code: str, month_end: str, isin_mapping: dict,
                  db_path: Path, isin_project_dir: Path, data_raw_path: Path,
                  output_csv: bool = False, validation_mapping: dict = None) -> bool:
    """Process a single fund. Returns True if successful."""
    if fund_code not in FUND_CONFIG:
        print(f"Error: Unknown fund code '{fund_code}'")
        print(f"Available funds: {', '.join(FUND_CONFIG.keys())}")
        return False

    config = FUND_CONFIG[fund_code]
    excel_path = get_file_path(fund_code, month_end, data_raw_path)
    sheet_name = config['sheet_name']

    if not excel_path.exists():
        print(f"Error: File not found: {excel_path}")
        return False

    print(f"\n{'='*60}")
    print(f"Processing: {config['display_name']}")
    print(f"File: {excel_path}")
    print(f"Sheet: {sheet_name}")
    print(f"Scheme: {fund_code}")
    print(f"Month End: {month_end}")
    print()

    # Read Excel (auto-detect format for mismatched extensions)
    df = read_excel_auto(excel_path, sheet_name)
    print(f"Sheet rows: {len(df)}")

    # Detect schema
    print("\nDetecting schema...")
    schema = detect_schema(df)

    # Apply schema overrides if specified in config
    if 'schema_override' in config:
        override = config['schema_override']
        if 'name_col' in override:
            schema.name_col = override['name_col']
        if 'isin_col' in override:
            schema.isin_col = override['isin_col']
        if 'quantity_col' in override:
            schema.quantity_col = override['quantity_col']
        if 'market_value_col' in override:
            schema.market_value_col = override['market_value_col']
        print("  (Using schema override from config)")

    print(f"  Data start row: {schema.data_start_row}")
    print(f"  ISIN column: {chr(65 + schema.isin_col)}")
    print(f"  Name column: {chr(65 + schema.name_col)}")
    print(f"  Market Value column: {chr(65 + schema.market_value_col)}")
    print(f"  Quantity column: {chr(65 + schema.quantity_col)}")
    print(f"  Grand Total: {schema.grand_total:,.2f}" if schema.grand_total else "  Grand Total: Not found")

    # Process data
    print("\nProcessing data...")
    rows, calculated_total, unmapped = process_sheet(df, schema, isin_mapping, validation_mapping)

    # Count by ISIN type
    valid_isin_count = sum(1 for r in rows if is_valid_isin(r.isin_assigned))
    assigned_count = len(rows) - valid_isin_count

    print(f"  Total rows: {len(rows)}")
    print(f"  - Valid ISINs: {valid_isin_count}")
    print(f"  - Assigned ISINs: {assigned_count}")
    print(f"  Calculated total: {calculated_total:,.2f}")
    if schema.grand_total:
        difference = schema.grand_total - calculated_total
        print(f"  Grand Total (Excel): {schema.grand_total:,.2f}")
        print(f"  Difference: {difference:,.2f}")
    print(f"  Unmapped valid ISINs: {len(unmapped)}")

    # Show assigned ISIN breakdown
    assigned_breakdown = {}
    for row in rows:
        if not is_valid_isin(row.isin_original):
            key = row.isin_assigned
            if key not in assigned_breakdown:
                assigned_breakdown[key] = {'count': 0, 'total_mv': 0, 'names': []}
            assigned_breakdown[key]['count'] += 1
            assigned_breakdown[key]['total_mv'] += row.market_value
            if len(assigned_breakdown[key]['names']) < 3:
                assigned_breakdown[key]['names'].append(row.instrument_name[:40])

    if assigned_breakdown:
        print("\n  Assigned ISIN breakdown:")
        for isin, data in sorted(assigned_breakdown.items()):
            print(f"    {isin}: {data['count']} rows, MV={data['total_mv']:,.2f}")
            for name in data['names']:
                print(f"      - {name}")

    if unmapped:
        print("\n  Unmapped valid ISINs:")
        for isin, name in unmapped[:10]:
            print(f"    {isin} | {name[:40]}")
        if len(unmapped) > 10:
            print(f"    ... and {len(unmapped) - 10} more")

    # Insert into SQLite database
    print(f"\nInserting into database: {db_path}")
    db_path.parent.mkdir(exist_ok=True)
    conn = init_database(db_path)
    inserted = insert_to_database(conn, rows, fund_code, month_end)
    print(f"  Inserted {inserted} rows into holdings table")
    # Update funds metadata table
    update_funds_table(conn, fund_code)
    print(f"  Updated funds table with {fund_code} metadata")
    conn.close()

    # Output CSV if enabled
    if output_csv:
        csv_content = generate_csv(rows, fund_code, month_end)
        output_dir = isin_project_dir / 'output'
        output_dir.mkdir(exist_ok=True)
        output_file = output_dir / f"{fund_code}_{month_end}.csv"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        print(f"\nCSV written to: {output_file}")

    return True


def main():
    # Paths
    script_dir = Path(__file__).parent  # projects/isin-mapping/scripts/_primary/
    isin_project_dir = script_dir.parent.parent  # projects/isin-mapping/
    project_root = isin_project_dir.parent.parent  # MF_PORTFOLIO_FULL_APP_REACT/
    db_path = isin_project_dir / 'database' / DB_NAME
    data_raw_path = project_root / 'data' / 'raw'

    # Parse arguments
    args = sys.argv[1:]
    output_csv = OUTPUT_CSV or '--csv' in args

    # Check for new-style arguments
    fund_code = None
    category = None
    month_end = None

    i = 0
    positional_args = []
    while i < len(args):
        if args[i] == '--fund' and i + 1 < len(args):
            fund_code = args[i + 1]
            i += 2
        elif args[i] == '--category' and i + 1 < len(args):
            category = args[i + 1]
            i += 2
        elif args[i] == '--month' and i + 1 < len(args):
            month_end = args[i + 1]
            i += 2
        elif args[i] == '--csv':
            i += 1
        elif args[i] == '--list':
            # List available funds
            print("Available funds:\n")
            for cat in ['midcap', 'smallcap', 'flexicap', 'largecap', 'focused']:
                funds = get_funds_by_category(cat)
                if funds:
                    print(f"  {cat.upper()}:")
                    for code in funds:
                        cfg = FUND_CONFIG[code]
                        print(f"    {code}: {cfg['display_name']} (sheet: {cfg['sheet_name']})")
                    print()
            sys.exit(0)
        elif args[i] == '--sync-funds':
            # Populate funds table from FUND_CONFIG without processing holdings
            print("Syncing funds table from FUND_CONFIG...")
            db_path.parent.mkdir(exist_ok=True)
            conn = init_database(db_path)
            for code in FUND_CONFIG:
                update_funds_table(conn, code)
                print(f"  Added: {code} ({FUND_CONFIG[code]['category']})")
            conn.close()
            print(f"\nFunds table synced with {len(FUND_CONFIG)} funds")
            sys.exit(0)
        elif not args[i].startswith('--'):
            positional_args.append(args[i])
            i += 1
        else:
            i += 1

    # Load ISIN master from SQLite
    isin_mapping = load_isin_master(str(db_path))

    # Load ISIN validation mapping
    validation_mapping_file = isin_project_dir / 'output' / 'validations' / 'isin_mapping_final.txt'
    validation_mapping = load_isin_validation_mapping(validation_mapping_file)

    # New-style: --fund or --category
    if fund_code or category:
        if not month_end:
            print("Error: --month is required with --fund or --category")
            print("Example: python convert_mf_portfolio.py --fund KOTAKMIDCAP --month 2025-12-31")
            sys.exit(1)

        if fund_code:
            # Process single fund
            success = process_fund(fund_code, month_end, isin_mapping, db_path,
                                   isin_project_dir, data_raw_path, output_csv,
                                   validation_mapping)
            if not success:
                sys.exit(1)
        else:
            # Process all funds in category
            funds = get_funds_by_category(category)
            if not funds:
                print(f"Error: No funds found for category '{category}'")
                print("Available categories: midcap, smallcap, flexicap")
                sys.exit(1)
            print(f"Processing {len(funds)} {category} funds for {month_end}...")
            for code in funds:
                process_fund(code, month_end, isin_mapping, db_path,
                            isin_project_dir, data_raw_path, output_csv,
                            validation_mapping)

        # Show final database stats
        conn = init_database(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM holdings')
        total_rows = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(DISTINCT scheme_name) FROM holdings')
        total_schemes = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(DISTINCT month_end) FROM holdings')
        total_months = cursor.fetchone()[0]
        print(f"\n{'='*60}")
        print(f"Database totals: {total_rows} rows, {total_schemes} schemes, {total_months} months")
        conn.close()

        # Create frontend database (final step)
        create_frontend_database(db_path, project_root)
        return

    # Old-style: positional arguments
    if len(positional_args) < 4:
        print(__doc__)
        print("\nNew usage (recommended):")
        print("  python convert_mf_portfolio.py --fund FUNDCODE --month YYYY-MM-DD [--csv]")
        print("  python convert_mf_portfolio.py --category midcap --month YYYY-MM-DD [--csv]")
        print("  python convert_mf_portfolio.py --list")
        print("\nOld usage (still supported):")
        print("  python convert_mf_portfolio.py <excel_file> <sheet_name> <scheme_name> <month_end> [--csv]")
        sys.exit(1)

    excel_file = positional_args[0]
    sheet_name = positional_args[1]
    scheme_name = positional_args[2]
    month_end = positional_args[3]

    # Resolve paths
    excel_path = Path(excel_file)
    if not excel_path.is_absolute():
        excel_path = script_dir / excel_path

    print(f"Processing: {excel_path}")
    print(f"Sheet: {sheet_name}")
    print(f"Scheme: {scheme_name}")
    print(f"Month End: {month_end}")
    print()

    # isin_mapping and validation_mapping already loaded above

    # Read Excel (auto-detect format for mismatched extensions)
    df = read_excel_auto(excel_path, sheet_name)
    print(f"Sheet rows: {len(df)}")

    # Detect schema
    print("\nDetecting schema...")
    schema = detect_schema(df)
    print(f"  Data start row: {schema.data_start_row}")
    print(f"  ISIN column: {chr(65 + schema.isin_col)}")
    print(f"  Name column: {chr(65 + schema.name_col)}")
    print(f"  Market Value column: {chr(65 + schema.market_value_col)}")
    print(f"  Quantity column: {chr(65 + schema.quantity_col)}")
    print(f"  Grand Total: {schema.grand_total:,.2f}" if schema.grand_total else "  Grand Total: Not found")

    # Process data
    print("\nProcessing data...")
    rows, calculated_total, unmapped = process_sheet(df, schema, isin_mapping, validation_mapping)

    # Count by ISIN type
    valid_isin_count = sum(1 for r in rows if is_valid_isin(r.isin_assigned))
    assigned_count = len(rows) - valid_isin_count

    print(f"  Total rows: {len(rows)}")
    print(f"  - Valid ISINs: {valid_isin_count}")
    print(f"  - Assigned ISINs: {assigned_count}")
    print(f"  Calculated total: {calculated_total:,.2f}")
    if schema.grand_total:
        difference = schema.grand_total - calculated_total
        print(f"  Grand Total (Excel): {schema.grand_total:,.2f}")
        print(f"  Difference: {difference:,.2f}")
    print(f"  Unmapped valid ISINs: {len(unmapped)}")

    # Show assigned ISIN breakdown
    assigned_breakdown = {}
    for row in rows:
        if not is_valid_isin(row.isin_original):
            key = row.isin_assigned
            if key not in assigned_breakdown:
                assigned_breakdown[key] = {'count': 0, 'total_mv': 0, 'names': []}
            assigned_breakdown[key]['count'] += 1
            assigned_breakdown[key]['total_mv'] += row.market_value
            if len(assigned_breakdown[key]['names']) < 3:
                assigned_breakdown[key]['names'].append(row.instrument_name[:40])

    if assigned_breakdown:
        print("\n  Assigned ISIN breakdown:")
        for isin, data in sorted(assigned_breakdown.items()):
            print(f"    {isin}: {data['count']} rows, MV={data['total_mv']:,.2f}")
            for name in data['names']:
                print(f"      - {name}")

    if unmapped:
        print("\n  Unmapped valid ISINs:")
        for isin, name in unmapped[:10]:
            print(f"    {isin} | {name[:40]}")
        if len(unmapped) > 10:
            print(f"    ... and {len(unmapped) - 10} more")

    # Insert into SQLite database
    print(f"\nInserting into database: {db_path}")
    db_path.parent.mkdir(exist_ok=True)
    conn = init_database(db_path)
    inserted = insert_to_database(conn, rows, scheme_name, month_end)
    print(f"  Inserted {inserted} rows into holdings table")

    # Show database stats
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM holdings')
    total_rows = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(DISTINCT scheme_name) FROM holdings')
    total_schemes = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(DISTINCT month_end) FROM holdings')
    total_months = cursor.fetchone()[0]
    print(f"  Database totals: {total_rows} rows, {total_schemes} schemes, {total_months} months")
    conn.close()

    # Output CSV if enabled
    if output_csv:
        csv_content = generate_csv(rows, scheme_name, month_end)
        output_dir = isin_project_dir / 'output'
        output_dir.mkdir(exist_ok=True)
        output_file = output_dir / f"{scheme_name}_{month_end}.csv"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        print(f"\nCSV written to: {output_file}")
        print(f"  Total lines: {len(csv_content.splitlines())}")


if __name__ == '__main__':
    main()
