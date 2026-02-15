"""
Fix Excel File Extensions

Detects files where the extension doesn't match the actual format and creates
correctly-named copies. Also optionally uploads fixed files to GitHub Release.

Usage:
    python fix_excel_extensions.py              # Check and fix all files
    python fix_excel_extensions.py --check      # Only check, don't fix
    python fix_excel_extensions.py --upload     # Fix and upload to GitHub

AMC websites often serve files with wrong extensions:
- .xls files that are actually xlsx format (ZIP/OOXML)
- .xlsx files that are actually xls format (OLE/Binary)
"""

import argparse
import shutil
import subprocess
from pathlib import Path


# Configuration
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.parent  # MF_PORTFOLIO_FULL_APP_REACT
DATA_RAW_DIR = PROJECT_ROOT / 'data' / 'raw'
GITHUB_REPO = 'amararun/datasets'
GITHUB_RELEASE = 'mf-portfolio-v1'


def detect_format(file_path: Path) -> str:
    """Detect actual Excel format from file header bytes."""
    with open(file_path, 'rb') as f:
        header = f.read(8)

    if header[:2] == b'PK':
        return 'xlsx'  # ZIP signature = OOXML format
    elif header[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        return 'xls'   # OLE2 signature = Binary format
    else:
        return 'unknown'


def scan_files() -> list[dict]:
    """Scan all Excel files and detect mismatches."""
    results = []

    for excel_file in DATA_RAW_DIR.rglob('*.xls'):
        if excel_file.suffix == '.xls':
            actual = detect_format(excel_file)
            if actual == 'xlsx':
                results.append({
                    'path': excel_file,
                    'current_ext': '.xls',
                    'actual_format': 'xlsx',
                    'correct_ext': '.xlsx',
                    'status': 'MISMATCH'
                })
            elif actual == 'xls':
                results.append({
                    'path': excel_file,
                    'current_ext': '.xls',
                    'actual_format': 'xls',
                    'correct_ext': '.xls',
                    'status': 'OK'
                })

    for excel_file in DATA_RAW_DIR.rglob('*.xlsx'):
        if excel_file.suffix == '.xlsx':
            actual = detect_format(excel_file)
            if actual == 'xls':
                results.append({
                    'path': excel_file,
                    'current_ext': '.xlsx',
                    'actual_format': 'xls',
                    'correct_ext': '.xls',
                    'status': 'MISMATCH'
                })
            elif actual == 'xlsx':
                results.append({
                    'path': excel_file,
                    'current_ext': '.xlsx',
                    'actual_format': 'xlsx',
                    'correct_ext': '.xlsx',
                    'status': 'OK'
                })

    return results


def fix_files(results: list[dict], dry_run: bool = False) -> list[Path]:
    """Create correctly-named copies for mismatched files."""
    fixed_files = []

    for item in results:
        if item['status'] != 'MISMATCH':
            continue

        src_path = item['path']
        new_name = src_path.stem + item['correct_ext']
        dst_path = src_path.parent / new_name

        if dry_run:
            print(f"  Would create: {dst_path.name}")
        else:
            if not dst_path.exists() or dst_path.stat().st_mtime < src_path.stat().st_mtime:
                shutil.copy2(src_path, dst_path)
                print(f"  Created: {dst_path.name}")
                fixed_files.append(dst_path)
            else:
                print(f"  Already exists: {dst_path.name}")
                fixed_files.append(dst_path)

    return fixed_files


def upload_to_github(files: list[Path]) -> bool:
    """Upload files to GitHub Release."""
    if not files:
        print("No files to upload")
        return True

    print(f"\nUploading {len(files)} files to GitHub Release {GITHUB_RELEASE}...")

    cmd = ['gh', 'release', 'upload', GITHUB_RELEASE, '--repo', GITHUB_REPO, '--clobber']
    cmd.extend([str(f) for f in files])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print("Upload successful!")
            return True
        else:
            print(f"Upload failed: {result.stderr}")
            return False
    except FileNotFoundError:
        print("Error: 'gh' CLI not found. Install GitHub CLI to upload.")
        return False


def main():
    parser = argparse.ArgumentParser(description='Fix Excel file extension mismatches')
    parser.add_argument('--check', action='store_true', help='Only check, do not fix')
    parser.add_argument('--upload', action='store_true', help='Upload fixed files to GitHub Release')
    args = parser.parse_args()

    print("=" * 60)
    print("Excel Extension Fixer")
    print("=" * 60)
    print(f"Scanning: {DATA_RAW_DIR}")
    print()

    # Scan all files
    results = scan_files()

    # Group by status
    mismatches = [r for r in results if r['status'] == 'MISMATCH']
    ok_files = [r for r in results if r['status'] == 'OK']

    print(f"Total files scanned: {len(results)}")
    print(f"  OK: {len(ok_files)}")
    print(f"  Mismatched: {len(mismatches)}")
    print()

    if mismatches:
        print("Files with extension mismatches:")
        for item in sorted(mismatches, key=lambda x: str(x['path'])):
            rel_path = item['path'].relative_to(DATA_RAW_DIR)
            print(f"  {rel_path}")
            print(f"    Current: {item['current_ext']} -> Should be: {item['correct_ext']} (actual format: {item['actual_format']})")
        print()

        if args.check:
            print("Check mode - no changes made")
        else:
            print("Creating correctly-named copies...")
            fixed_files = fix_files(mismatches, dry_run=False)
            print(f"\nFixed {len(fixed_files)} files")

            if args.upload and fixed_files:
                upload_to_github(fixed_files)
    else:
        print("All files have correct extensions!")

    print()
    print("=" * 60)
    print("Done")
    print("=" * 60)


if __name__ == '__main__':
    main()
