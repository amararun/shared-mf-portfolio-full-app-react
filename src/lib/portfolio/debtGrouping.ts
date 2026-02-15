/**
 * Debt Instrument Grouping
 * Consolidates CDs, CPs, G-Secs, and T-Bills into a single virtual row
 * in the comparison table, with drill-down via a dedicated modal.
 */

import type { ComparisonCompany } from './aggregation';

export const DEBT_GROUP_ISIN = '__DEBT_GROUP__';
export const DEBT_GROUP_NAME = 'Debt & Money Market';

/**
 * Instrument type categories for debt grouping
 */
export type DebtType = 'cd' | 'cp' | 'tbill' | 'gsec';

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  cd: 'Certificates of Deposit (CDs)',
  cp: 'Commercial Papers (CPs)',
  tbill: 'Treasury Bills',
  gsec: 'Government Securities',
};

/**
 * Classify a company name into a debt type, or null if it's not debt
 */
export function getDebtType(name: string): DebtType | null {
  if (name.endsWith(' CD')) return 'cd';
  if (name.endsWith(' CP')) return 'cp';
  if (name === 'GOI T-BILL' || name.includes('T-BILL')) return 'tbill';
  if (name === 'GOI G-SEC' || name.includes('G-SEC')) return 'gsec';
  return null;
}

/**
 * Check if a company is a debt instrument
 */
export function isDebtInstrument(name: string): boolean {
  return getDebtType(name) !== null;
}

/**
 * Check if a ComparisonCompany is the virtual debt group row
 */
export function isDebtGroupRow(company: ComparisonCompany): boolean {
  return company.isin === DEBT_GROUP_ISIN;
}

export interface DebtGroupResult {
  /** Data with debt items replaced by one virtual group row */
  groupedData: ComparisonCompany[];
  /** The original individual debt items */
  debtItems: ComparisonCompany[];
  /** The virtual group row (null if no debt items found) */
  debtGroupRow: ComparisonCompany | null;
}

/**
 * Groups debt instruments (CDs, CPs, G-Secs, T-Bills) into a single
 * virtual row. Returns the modified data array and the original items.
 */
export function groupDebtInstruments(data: ComparisonCompany[]): DebtGroupResult {
  const debtItems: ComparisonCompany[] = [];
  const regularItems: ComparisonCompany[] = [];

  for (const item of data) {
    if (isDebtInstrument(item.name)) {
      debtItems.push(item);
    } else {
      regularItems.push(item);
    }
  }

  if (debtItems.length === 0) {
    return { groupedData: data, debtItems: [], debtGroupRow: null };
  }

  // Aggregate values across all debt items
  const totalP1Mv = debtItems.reduce((s, d) => s + d.mktvalp1, 0);
  const totalP2Mv = debtItems.reduce((s, d) => s + d.mktvalp2, 0);
  const totalP1Pct = debtItems.reduce((s, d) => s + d['mktvalp1%'], 0);
  const totalP2Pct = debtItems.reduce((s, d) => s + d['mktvalp2%'], 0);
  const totalP1Qty = debtItems.reduce((s, d) => s + d.qtyp1, 0);
  const totalP2Qty = debtItems.reduce((s, d) => s + d.qtyp2, 0);

  const mvChange = totalP1Mv > 0 ? (totalP2Mv - totalP1Mv) / totalP1Mv : null;
  const qtyChange = totalP1Qty > 0 ? (totalP2Qty - totalP1Qty) / totalP1Qty : null;

  const debtGroupRow: ComparisonCompany = {
    isin: DEBT_GROUP_ISIN,
    name: DEBT_GROUP_NAME,
    nseSymbol: '',
    comment: `${debtItems.length} instruments`,
    mktvalp1: totalP1Mv,
    mktvalp2: totalP2Mv,
    'mktvalp1%': totalP1Pct,
    'mktvalp2%': totalP2Pct,
    qtyp1: totalP1Qty,
    qtyp2: totalP2Qty,
    numofmfp1mv: 0,
    numofmfp1qty: 0,
    numofmfp2mv: 0,
    numofmfp2qty: 0,
    'mv%change': mvChange,
    'qty%change': qtyChange,
    // Tagged with ISN badge via mappingDetails presence
    mappingDetailsP1: [{ isinOriginal: '', isinMapped: DEBT_GROUP_ISIN, category: 'DEBT_GROUP', reason: `Consolidated ${debtItems.length} debt instruments`, originalName: '', marketValue: 0, schemeName: '' }],
  };

  return {
    groupedData: [debtGroupRow, ...regularItems],
    debtItems,
    debtGroupRow,
  };
}
