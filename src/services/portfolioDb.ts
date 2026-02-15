/**
 * Portfolio Database Service
 * Uses sql.js to load and query the SQLite database in the browser.
 */

import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

// Database file path - will be served from public folder
const DB_PATH = '/data/mf_portfolio.db';

/**
 * Initialize the database connection
 */
export async function initDatabase(): Promise<Database> {
  if (db) return db;

  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    console.log('Initializing sql.js...');

    // Initialize sql.js with the WASM file
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    console.log(`Loading database from ${DB_PATH}...`);

    // Fetch the database file
    const response = await fetch(DB_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load database: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));

    console.log('Database loaded successfully');
    return db;
  })();

  return dbPromise;
}

/**
 * Get available periods (months) from the database
 */
export async function getAvailablePeriods(): Promise<string[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT DISTINCT month_end
    FROM holdings
    ORDER BY month_end DESC
  `);

  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}

/**
 * Fund metadata from the funds table
 */
export interface FundInfo {
  code: string;
  displayName: string;
  category: string;
}

/**
 * Get available funds from the database (reads from funds table)
 */
export async function getAvailableFunds(): Promise<Array<{ code: string; displayName: string }>> {
  const funds = await getFundsWithCategory();
  return funds.map(f => ({ code: f.code, displayName: f.displayName }));
}

/**
 * Get funds with category information from the funds table
 */
export async function getFundsWithCategory(): Promise<FundInfo[]> {
  const database = await initDatabase();

  // First get funds that have holdings data
  const holdingsResult = database.exec(`
    SELECT DISTINCT scheme_name FROM holdings
  `);
  const fundsWithHoldings = new Set(
    holdingsResult.length > 0
      ? holdingsResult[0].values.map(row => row[0] as string)
      : []
  );

  // Get fund metadata from funds table
  const result = database.exec(`
    SELECT scheme_name, display_name, category
    FROM funds
    ORDER BY category, display_name
  `);

  if (result.length === 0) return [];

  // Return funds that have holdings data
  return result[0].values
    .filter(row => fundsWithHoldings.has(row[0] as string))
    .map(row => ({
      code: row[0] as string,
      displayName: row[1] as string,
      category: row[2] as string,
    }));
}

/**
 * Get funds grouped by category
 */
export async function getFundsByCategory(): Promise<Record<string, FundInfo[]>> {
  const funds = await getFundsWithCategory();
  const grouped: Record<string, FundInfo[]> = {};

  for (const fund of funds) {
    if (!grouped[fund.category]) {
      grouped[fund.category] = [];
    }
    grouped[fund.category].push(fund);
  }

  return grouped;
}

/**
 * Get funds available for a specific period
 */
export async function getFundsForPeriod(monthEnd: string): Promise<string[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT DISTINCT scheme_name
    FROM holdings
    WHERE month_end = '${monthEnd}'
    ORDER BY scheme_name
  `);

  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}

/**
 * Raw holding record from database
 */
export interface HoldingRecord {
  scheme_name: string;
  month_end: string;
  isin_original: string | null;
  isin_assigned: string;
  instrument_name: string;
  market_value: number;
  quantity: number;
  nse_symbol: string | null;
  name_nsdl: string | null;
  name_final: string | null;  // Computed display name: name_nsdl || fallback
  isin_mapped: string;        // Mapped ISIN for grouping (handles corporate actions, CD/CP aggregation)
  name_mapped: string | null; // Mapped display name (e.g., "[AGGREGATED] HDFC BANK CD")
  mapping_category: string | null;  // Mapping category: CORPORATE_ACTION, CD_AGGREGATE, CP_AGGREGATE, etc.
  mapping_reason: string | null;    // Human-readable reason for mapping
}

/**
 * Fetch holdings for given funds and period
 */
export async function getHoldings(
  funds: string[],
  monthEnd: string
): Promise<HoldingRecord[]> {
  if (funds.length === 0) return [];

  const database = await initDatabase();
  const fundList = funds.map(f => `'${f}'`).join(',');

  const result = database.exec(`
    SELECT
      scheme_name,
      month_end,
      isin_original,
      isin_assigned,
      instrument_name,
      market_value,
      quantity,
      nse_symbol,
      name_nsdl,
      name_final,
      isin_mapped,
      name_mapped,
      mapping_category,
      mapping_reason
    FROM holdings
    WHERE scheme_name IN (${fundList})
      AND month_end = '${monthEnd}'
  `);

  if (result.length === 0) return [];

  const columns = result[0].columns;
  return result[0].values.map(row => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      record[col] = row[idx];
    });
    return record as unknown as HoldingRecord;
  });
}

/**
 * Get database stats
 */
export async function getDatabaseStats(): Promise<{
  totalHoldings: number;
  totalFunds: number;
  totalPeriods: number;
  isinMasterCount: number;
}> {
  const database = await initDatabase();

  const holdingsResult = database.exec('SELECT COUNT(*) FROM holdings');
  const fundsResult = database.exec('SELECT COUNT(DISTINCT scheme_name) FROM holdings');
  const periodsResult = database.exec('SELECT COUNT(DISTINCT month_end) FROM holdings');

  let isinMasterCount = 0;
  try {
    const isinResult = database.exec('SELECT COUNT(*) FROM isin_master');
    isinMasterCount = isinResult[0]?.values[0]?.[0] as number || 0;
  } catch {
    // isin_master table might not exist
  }

  return {
    totalHoldings: holdingsResult[0]?.values[0]?.[0] as number || 0,
    totalFunds: fundsResult[0]?.values[0]?.[0] as number || 0,
    totalPeriods: periodsResult[0]?.values[0]?.[0] as number || 0,
    isinMasterCount,
  };
}

// =============================================================================
// ISIN Mapping Queries - For ISIN Remaps tab
// =============================================================================

/**
 * ISIN Remap mapping record (distinct mappings)
 */
export interface ISINRemapMapping {
  isin_original: string;
  isin_mapped: string;
  name_mapped: string;
  mapping_category: string;
  mapping_reason: string;
}

/**
 * ISIN Remap holding record (with fund, month, market value)
 */
export interface ISINRemapHolding {
  isin_original: string;
  isin_mapped: string;
  name_mapped: string;
  mapping_category: string;
  mapping_reason: string;
  scheme_name: string;
  month_end: string;
  market_value: number;
}

/**
 * Get distinct ISIN remappings (corporate actions, CD/CP/T-Bill/G-Sec aggregations)
 */
export async function getISINRemapsMappings(): Promise<ISINRemapMapping[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT DISTINCT
      isin_original,
      isin_mapped,
      name_mapped,
      mapping_category,
      mapping_reason
    FROM holdings
    WHERE mapping_category IS NOT NULL
      AND mapping_category != ''
      AND mapping_category != 'CASH_AGGREGATE'
    ORDER BY mapping_category, name_mapped
  `);

  if (result.length === 0) return [];

  return result[0].values.map(row => ({
    isin_original: (row[0] as string) || '',
    isin_mapped: (row[1] as string) || '',
    name_mapped: (row[2] as string) || '',
    mapping_category: (row[3] as string) || '',
    mapping_reason: (row[4] as string) || '',
  }));
}

/**
 * Get ISIN remap holdings with fund, month, market value (for detail view)
 */
export async function getISINRemapsHoldings(): Promise<ISINRemapHolding[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT
      isin_original,
      isin_mapped,
      name_mapped,
      mapping_category,
      mapping_reason,
      scheme_name,
      month_end,
      market_value
    FROM holdings
    WHERE mapping_category IS NOT NULL
      AND mapping_category != ''
      AND mapping_category != 'CASH_AGGREGATE'
    ORDER BY market_value DESC
  `);

  if (result.length === 0) return [];

  return result[0].values.map(row => ({
    isin_original: (row[0] as string) || '',
    isin_mapped: (row[1] as string) || '',
    name_mapped: (row[2] as string) || '',
    mapping_category: (row[3] as string) || '',
    mapping_reason: (row[4] as string) || '',
    scheme_name: (row[5] as string) || '',
    month_end: (row[6] as string) || '',
    market_value: (row[7] as number) || 0,
  }));
}

// =============================================================================
// Synthetic ISIN Queries - For items without valid ISINs
// =============================================================================

/**
 * Synthetic ISIN mapping record (distinct items assigned IN9999999999)
 */
export interface SyntheticISINMapping {
  isin_original: string;
  isin_assigned: string;
  instrument_name: string;
  category: string;
}

/**
 * Synthetic ISIN holding record (with fund, month, market value)
 */
export interface SyntheticISINHolding {
  isin_original: string;
  isin_assigned: string;
  instrument_name: string;
  scheme_name: string;
  month_end: string;
  market_value: number;
}

/**
 * Categorize synthetic ISIN items based on instrument name
 */
function categorizeSyntheticItem(isinOriginal: string, instrumentName: string): string {
  const nameLower = instrumentName?.toLowerCase() || '';

  // Foreign stocks (US ISINs)
  if (isinOriginal && isinOriginal.startsWith('US')) return 'FOREIGN_STOCK';

  // TREPS / Tri-party repo
  if (nameLower.includes('trep') || nameLower.includes('tri-party') || nameLower.includes('triparty')) return 'TREPS';

  // CCIL / Clearing Corporation
  if (nameLower.includes('ccil') || nameLower.includes('clearing corporation')) return 'CCIL';

  // Reverse Repo
  if (nameLower.includes('reverse repo')) return 'REVERSE_REPO';

  // CBLO
  if (nameLower.includes('cblo') || nameLower.includes('collateralized borrowing')) return 'CBLO';

  // Futures
  if (nameLower.includes('future')) return 'FUTURES';

  // Options
  if (isinOriginal && (isinOriginal.includes('OPT') || isinOriginal.includes('CE') || isinOriginal.includes('PE'))) return 'OPTIONS';
  if (nameLower.includes('covered call') || nameLower.includes('option')) return 'OPTIONS';

  // Cash margin
  if (nameLower.includes('margin') || nameLower.includes('cash margin')) return 'CASH_MARGIN';

  // Net receivables/payables
  if (nameLower.includes('receivable') || nameLower.includes('payable') || nameLower.includes('net current')) return 'NET_RECEIVABLES';

  // Other foreign ISINs
  if (isinOriginal && !isinOriginal.startsWith('IN')) return 'FOREIGN_OTHER';

  return 'OTHER';
}

/**
 * Get distinct synthetic ISIN assignments (items with IN9999999999)
 */
export async function getSyntheticISINMappings(): Promise<SyntheticISINMapping[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT DISTINCT
      COALESCE(isin_original, '') as isin_original,
      isin_assigned,
      instrument_name
    FROM holdings
    WHERE isin_assigned = 'IN9999999999'
    ORDER BY instrument_name
  `);

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const isinOriginal = (row[0] as string) || '';
    const instrumentName = (row[2] as string) || '';
    return {
      isin_original: isinOriginal || '(blank)',
      isin_assigned: (row[1] as string) || '',
      instrument_name: instrumentName || '(blank)',
      category: categorizeSyntheticItem(isinOriginal, instrumentName),
    };
  });
}

/**
 * Get synthetic ISIN holdings with fund, month, market value (for detail view)
 */
export async function getSyntheticISINHoldings(): Promise<SyntheticISINHolding[]> {
  const database = await initDatabase();
  const result = database.exec(`
    SELECT
      COALESCE(isin_original, '') as isin_original,
      isin_assigned,
      instrument_name,
      scheme_name,
      month_end,
      market_value
    FROM holdings
    WHERE isin_assigned = 'IN9999999999'
    ORDER BY market_value DESC
  `);

  if (result.length === 0) return [];

  return result[0].values.map(row => ({
    isin_original: (row[0] as string) || '(blank)',
    isin_assigned: (row[1] as string) || '',
    instrument_name: (row[2] as string) || '(blank)',
    scheme_name: (row[3] as string) || '',
    month_end: (row[4] as string) || '',
    market_value: (row[5] as number) || 0,
  }));
}
