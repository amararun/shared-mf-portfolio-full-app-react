/**
 * Portfolio Aggregation Logic
 * Aggregates raw holdings data into comparison format for dashboard.
 */

import type { HoldingRecord } from '@/services/portfolioDb';

/**
 * Mapping detail for a single original ISIN that was mapped
 */
export interface MappingDetail {
  isinOriginal: string;        // Original ISIN before mapping
  isinMapped: string;          // Mapped ISIN
  category: string;            // CORPORATE_ACTION, CD_AGGREGATE, etc.
  reason: string;              // Human-readable reason
  originalName: string;        // Original instrument name
  marketValue: number;         // Market value contribution
  schemeName: string;          // Mutual fund scheme name
}

/**
 * Aggregated company data for comparison
 */
export interface ComparisonCompany {
  name: string;
  isin: string;
  nseSymbol: string;
  comment: string;
  // Period 1 values
  mktvalp1: number;          // Market value in lakhs
  'mktvalp1%': number;       // Market value as percentage of total (decimal)
  qtyp1: number;             // Quantity
  numofmfp1mv: number;       // Number of MFs with market value > 0
  numofmfp1qty: number;      // Number of MFs with quantity > 0
  // Period 2 values
  mktvalp2: number;
  'mktvalp2%': number;
  qtyp2: number;
  numofmfp2mv: number;
  numofmfp2qty: number;
  // Change metrics
  'mv%change': number | null;   // (mktvalp2 - mktvalp1) / mktvalp1
  'qty%change': number | null;  // (qtyp2 - qtyp1) / qtyp1
  // Mapping metadata for ISN badge
  mappingDetailsP1?: MappingDetail[];  // Mapping details for period 1
  mappingDetailsP2?: MappingDetail[];  // Mapping details for period 2
}

/**
 * Summary metrics for dashboard cards
 */
export interface ComparisonMetrics {
  companyCounts: {
    p1: number;
    p2: number;
    newEntries: number;
    exits: number;
    continuing: number;
  };
  aum: {
    p1: number;           // in crores
    p2: number;
    change: number;
    changePct: number;
  };
  majorEntries: {
    count: number;
    totalAUM: number;
    companies: ComparisonCompany[];
  };
  majorExits: {
    count: number;
    totalAUM: number;
    companies: ComparisonCompany[];
  };
  mfTrends: {
    gaining: number;
    losing: number;
  };
  concentration: {
    p1: number;
    p2: number;
    change: number;
  };
}

/**
 * Aggregate holdings by ISIN for a single period
 */
function aggregateByIsin(holdings: HoldingRecord[]): Map<string, {
  name: string;
  isin: string;
  nseSymbol: string;
  totalMv: number;
  totalQty: number;
  fundCountMv: number;
  fundCountQty: number;
  mappingDetails: MappingDetail[];
}> {
  const byIsin = new Map<string, {
    name: string;
    isin: string;
    nseSymbol: string;
    totalMv: number;
    totalQty: number;
    fundsWithMv: Set<string>;
    fundsWithQty: Set<string>;
    mappingDetails: MappingDetail[];
  }>();

  for (const h of holdings) {
    // Use isin_mapped for grouping (handles corporate actions, CD/CP aggregation)
    const isin = h.isin_mapped || h.isin_assigned;
    let entry = byIsin.get(isin);

    if (!entry) {
      entry = {
        // Use name_mapped for display (e.g., "[AGGREGATED] HDFC BANK CD")
        name: h.name_mapped || h.name_final || h.name_nsdl || h.instrument_name || '',
        isin,
        nseSymbol: h.nse_symbol || '',
        totalMv: 0,
        totalQty: 0,
        fundsWithMv: new Set(),
        fundsWithQty: new Set(),
        mappingDetails: [],
      };
      byIsin.set(isin, entry);
    }

    entry.totalMv += h.market_value || 0;
    entry.totalQty += h.quantity || 0;

    if (h.market_value > 0) {
      entry.fundsWithMv.add(h.scheme_name);
    }
    if (h.quantity > 0) {
      entry.fundsWithQty.add(h.scheme_name);
    }

    // Track mapping details if this row has a mapping category
    if (h.mapping_category) {
      entry.mappingDetails.push({
        isinOriginal: h.isin_original || '',
        isinMapped: h.isin_mapped,
        category: h.mapping_category,
        reason: h.mapping_reason || '',
        originalName: h.instrument_name || h.name_nsdl || '',
        marketValue: h.market_value || 0,
        schemeName: h.scheme_name,
      });
    }

    // Use name_mapped if available (mapped display name)
    if (h.name_mapped && !entry.name) {
      entry.name = h.name_mapped;
    } else if (h.name_final && !entry.name) {
      entry.name = h.name_final;
    }
    if (h.nse_symbol && !entry.nseSymbol) {
      entry.nseSymbol = h.nse_symbol;
    }
  }

  // Convert to final format
  const result = new Map<string, {
    name: string;
    isin: string;
    nseSymbol: string;
    totalMv: number;
    totalQty: number;
    fundCountMv: number;
    fundCountQty: number;
    mappingDetails: MappingDetail[];
  }>();

  for (const [isin, entry] of byIsin) {
    result.set(isin, {
      name: entry.name,
      isin: entry.isin,
      nseSymbol: entry.nseSymbol,
      totalMv: entry.totalMv,
      totalQty: entry.totalQty,
      fundCountMv: entry.fundsWithMv.size,
      fundCountQty: entry.fundsWithQty.size,
      mappingDetails: entry.mappingDetails,
    });
  }

  return result;
}

/**
 * Build comparison data from two periods
 */
export function buildComparisonData(
  holdingsP1: HoldingRecord[],
  holdingsP2: HoldingRecord[]
): ComparisonCompany[] {
  // Aggregate each period
  const p1Data = aggregateByIsin(holdingsP1);
  const p2Data = aggregateByIsin(holdingsP2);

  // Calculate totals for percentage calculations
  const totalMvP1 = Array.from(p1Data.values()).reduce((sum, c) => sum + c.totalMv, 0);
  const totalMvP2 = Array.from(p2Data.values()).reduce((sum, c) => sum + c.totalMv, 0);

  // Collect all unique ISINs
  const allIsins = new Set([...p1Data.keys(), ...p2Data.keys()]);

  // Build comparison records
  const result: ComparisonCompany[] = [];

  for (const isin of allIsins) {
    const p1 = p1Data.get(isin);
    const p2 = p2Data.get(isin);

    const mktvalp1 = p1?.totalMv || 0;
    const mktvalp2 = p2?.totalMv || 0;
    const qtyp1 = p1?.totalQty || 0;
    const qtyp2 = p2?.totalQty || 0;

    // Calculate percentages (as decimal, will be multiplied by 100 for display)
    const mktvalp1Pct = totalMvP1 > 0 ? mktvalp1 / totalMvP1 : 0;
    const mktvalp2Pct = totalMvP2 > 0 ? mktvalp2 / totalMvP2 : 0;

    // Calculate changes
    let mvChange: number | null = null;
    if (mktvalp1 > 0) {
      mvChange = (mktvalp2 - mktvalp1) / mktvalp1;
    } else if (mktvalp2 > 0) {
      mvChange = 1; // 100% increase (new entry)
    }

    let qtyChange: number | null = null;
    if (qtyp1 > 0) {
      qtyChange = (qtyp2 - qtyp1) / qtyp1;
    } else if (qtyp2 > 0) {
      qtyChange = 1; // 100% increase (new entry)
    }

    // Get name - prefer P2 data (more recent), fall back to P1
    const name = p2?.name || p1?.name || isin;
    const nseSymbol = p2?.nseSymbol || p1?.nseSymbol || '';

    result.push({
      name,
      isin,
      nseSymbol,
      comment: '',
      mktvalp1,
      'mktvalp1%': mktvalp1Pct,
      qtyp1,
      numofmfp1mv: p1?.fundCountMv || 0,
      numofmfp1qty: p1?.fundCountQty || 0,
      mktvalp2,
      'mktvalp2%': mktvalp2Pct,
      qtyp2,
      numofmfp2mv: p2?.fundCountMv || 0,
      numofmfp2qty: p2?.fundCountQty || 0,
      'mv%change': mvChange,
      'qty%change': qtyChange,
      // Include mapping details for ISN badge
      mappingDetailsP1: p1?.mappingDetails && p1.mappingDetails.length > 0 ? p1.mappingDetails : undefined,
      mappingDetailsP2: p2?.mappingDetails && p2.mappingDetails.length > 0 ? p2.mappingDetails : undefined,
    });
  }

  // Sort by P2 market value percentage (descending)
  result.sort((a, b) => (b['mktvalp2%'] || 0) - (a['mktvalp2%'] || 0));

  return result;
}

/**
 * Calculate dashboard metrics from comparison data
 */
export function calculateMetrics(
  data: ComparisonCompany[],
  majorThresholdPct: number = 0.001  // 0.1%
): ComparisonMetrics {
  // Company counts
  const p1Companies = data.filter(c => c.mktvalp1 > 0);
  const p2Companies = data.filter(c => c.mktvalp2 > 0);
  const newEntries = data.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0);
  const exits = data.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0);
  const continuing = data.filter(c => c.mktvalp1 > 0 && c.mktvalp2 > 0);

  // AUM (convert lakhs to crores by dividing by 100)
  const aumP1 = data.reduce((sum, c) => sum + c.mktvalp1, 0) / 100;
  const aumP2 = data.reduce((sum, c) => sum + c.mktvalp2, 0) / 100;
  const aumChange = aumP2 - aumP1;
  const aumChangePct = aumP1 > 0 ? (aumChange / aumP1) * 100 : 0;

  // Major entries (0% in P1, >= threshold in P2)
  const majorEntriesCompanies = data.filter(
    c => c['mktvalp1%'] === 0 && c['mktvalp2%'] >= majorThresholdPct
  );
  const majorEntriesAUM = majorEntriesCompanies.reduce((sum, c) => sum + c.mktvalp2, 0) / 100;

  // Major exits (>= threshold in P1, 0% in P2)
  const majorExitsCompanies = data.filter(
    c => c['mktvalp1%'] >= majorThresholdPct && c['mktvalp2%'] === 0
  );
  const majorExitsAUM = majorExitsCompanies.reduce((sum, c) => sum + c.mktvalp1, 0) / 100;

  // MF interest trends (only continuing holdings - exclude new entries/exits)
  const gaining = data.filter(c => c.numofmfp2mv > c.numofmfp1mv && c.mktvalp1 > 0 && c.mktvalp2 > 0).length;
  const losing = data.filter(c => c.numofmfp2mv < c.numofmfp1mv && c.mktvalp1 > 0 && c.mktvalp2 > 0).length;

  // Concentration (top 10)
  const sortedByP1 = [...data].sort((a, b) => b['mktvalp1%'] - a['mktvalp1%']);
  const sortedByP2 = [...data].sort((a, b) => b['mktvalp2%'] - a['mktvalp2%']);
  const concentrationP1 = sortedByP1.slice(0, 10).reduce((sum, c) => sum + c['mktvalp1%'] * 100, 0);
  const concentrationP2 = sortedByP2.slice(0, 10).reduce((sum, c) => sum + c['mktvalp2%'] * 100, 0);

  return {
    companyCounts: {
      p1: p1Companies.length,
      p2: p2Companies.length,
      newEntries: newEntries.length,
      exits: exits.length,
      continuing: continuing.length,
    },
    aum: {
      p1: aumP1,
      p2: aumP2,
      change: aumChange,
      changePct: aumChangePct,
    },
    majorEntries: {
      count: majorEntriesCompanies.length,
      totalAUM: majorEntriesAUM,
      companies: majorEntriesCompanies,
    },
    majorExits: {
      count: majorExitsCompanies.length,
      totalAUM: majorExitsAUM,
      companies: majorExitsCompanies,
    },
    mfTrends: {
      gaining,
      losing,
    },
    concentration: {
      p1: concentrationP1,
      p2: concentrationP2,
      change: concentrationP2 - concentrationP1,
    },
  };
}

/**
 * Get top N holdings by market value percentage
 */
export function getTopHoldings(
  data: ComparisonCompany[],
  period: 'p1' | 'p2',
  n: number = 10
): ComparisonCompany[] {
  const field = period === 'p2' ? 'mktvalp2%' : 'mktvalp1%';

  return [...data]
    .filter(c => c[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, n);
}

/**
 * Format helpers
 */
export const formatCrores = (value: number): string => {
  return `₹${Math.round(value).toLocaleString('en-IN')} Cr`;
};

export const formatLakhs = (value: number): string => {
  return `₹${Math.round(value).toLocaleString('en-IN')} L`;
};

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

export const formatPercentChange = (value: number | null, decimals: number = 1): string => {
  if (value === null) return 'N/A';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(decimals)}%`;
};

export const formatCount = (value: number): string => {
  return value.toLocaleString('en-IN');
};
