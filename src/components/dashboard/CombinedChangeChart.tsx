/**
 * Combined Change Chart Component
 * QPulse-inspired panel: Dark header, table on left (50%), horizontal bar chart on right (50%)
 */

import { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import Plot from 'react-plotly.js';
import { Table2, Download, Info, ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import type { ComparisonCompany, ComparisonMetrics } from '@/lib/portfolio/aggregation';
import { formatCrores, buildComparisonData } from '@/lib/portfolio/aggregation';
import type { HoldingRecord } from '@/services/portfolioDb';
import { StockLinks } from '@/components/common/StockLinks';
import { isDebtGroupRow, groupDebtInstruments } from '@/lib/portfolio/debtGrouping';

type SortColumn = 'composition' | 'mvChange' | 'qtyChange';
type SortDirection = 'asc' | 'desc';

interface CombinedChangeChartProps {
  data: ComparisonCompany[];
  title: string;
  p1Label?: string; // e.g., "Sep 2025" - will be formatted to "Sep-25"
  p2Label?: string; // e.g., "Aug 2025" - will be formatted to "Aug-25"
  // Raw holdings for per-MF breakdown in modal
  rawHoldingsP1?: HoldingRecord[];
  rawHoldingsP2?: HoldingRecord[];
  // Fund display names
  funds?: Array<{ code: string; displayName: string }>;
  // Metrics for sidebar
  metrics?: ComparisonMetrics;
  onAumClick?: () => void;
  onDownloadClick?: () => void;
  onIsinRemapsClick?: () => void;
  // External company selection (e.g., from Table view)
  initialSelectedCompany?: ComparisonCompany | null;
  onCompanyModalClose?: () => void;
  // Debt group row click - opens DebtGroupModal
  onDebtGroupClick?: () => void;
}

type ModalTab = 'overview' | 'byFund' | 'isinMapping';

// CSS Tooltip component - appears below with delay to avoid interfering with clicks
const Tooltip = ({ text, children, delay = false }: { text: string; children: React.ReactNode; delay?: boolean }) => (
  <span className="relative group cursor-default">
    {children}
    <span className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 text-sm text-white bg-slate-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-[100] ${delay ? 'transition-opacity delay-1000' : 'transition-opacity'}`}>
      {text}
    </span>
  </span>
);

// Sortable header component with arrow indicator (single row)
const SortableHeader = ({
  label,
  tooltip,
  column,
  currentColumn,
  direction,
  onClick,
}: {
  label: string;
  tooltip: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
  onClick: (col: SortColumn) => void;
}) => {
  const isActive = column === currentColumn;
  const arrow = isActive ? (direction === 'desc' ? '▼' : '▲') : '';

  return (
    <th
      className="text-right py-2.5 px-1 font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
      onClick={() => onClick(column)}
    >
      <Tooltip text={`${tooltip} (click to sort)`}>
        <span className="inline-flex items-center gap-1">
          {label}
          {arrow && <span className="text-xs text-blue-600">{arrow}</span>}
        </span>
      </Tooltip>
    </th>
  );
};

const ITEMS_PER_PAGE = 10;
const TOP_CHANGES_COUNT = 10;

// Helper to get top movers by absolute MV change magnitude
const getTopMovers = (data: ComparisonCompany[], count: number) => {
  // Separate into categories
  const newEntries = data.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0);
  const exits = data.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0);
  const continuing = data.filter(c => c.mktvalp1 > 0 && c.mktvalp2 > 0);

  // Sort continuing by absolute change magnitude
  const sortedContinuing = [...continuing].sort((a, b) => {
    const aChange = Math.abs(a['mv%change'] || 0);
    const bChange = Math.abs(b['mv%change'] || 0);
    return bChange - aChange;
  });

  // Sort new entries by P2 value
  const sortedNew = [...newEntries].sort((a, b) => b.mktvalp2 - a.mktvalp2);
  // Sort exits by P1 value
  const sortedExits = [...exits].sort((a, b) => b.mktvalp1 - a.mktvalp1);

  // Combine: Top new entries, top exits, top continuing changes
  const combined = [
    ...sortedNew.slice(0, Math.min(3, count)),
    ...sortedExits.slice(0, Math.min(2, count)),
    ...sortedContinuing.slice(0, count),
  ];

  // Return unique by ISIN, up to count
  const seen = new Set<string>();
  const result: ComparisonCompany[] = [];
  for (const item of combined) {
    if (!seen.has(item.isin)) {
      seen.add(item.isin);
      result.push(item);
      if (result.length >= count) break;
    }
  }
  return result;
};

// Format "Sep 2025" to "Sep-25"
const formatPeriodShort = (label: string): string => {
  if (!label) return '';
  const parts = label.split(' ');
  if (parts.length === 2) {
    const month = parts[0].substring(0, 3);
    const year = parts[1].substring(2); // "2025" -> "25"
    return `${month}-${year}`;
  }
  return label;
};

type CompositionBasis = 'p1' | 'p2';

export const CombinedChangeChart = ({
  data,
  title,
  p1Label,
  p2Label,
  rawHoldingsP1 = [],
  rawHoldingsP2 = [],
  funds = [],
  metrics,
  onAumClick,
  onDownloadClick,
  onIsinRemapsClick,
  initialSelectedCompany,
  onCompanyModalClose,
  onDebtGroupClick,
}: CombinedChangeChartProps) => {
  // Sorting and pagination state
  const [sortColumn, setSortColumn] = useState<SortColumn>('composition');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  // Composition grid sort state
  type CompGridSortCol = 'p1' | 'p2' | 'change' | 'mvChange' | 'qtyChange' | 'mfChange';
  const [compGridSortCol, setCompGridSortCol] = useState<CompGridSortCol>('p2');
  const [compGridSortDir, setCompGridSortDir] = useState<SortDirection>('desc');
  // Composition grid pagination state
  const [compGridPage, setCompGridPage] = useState(1);
  // Composition grid filter state (all, new, exits, isin)
  type CompGridFilter = 'all' | 'new' | 'exits' | 'isin';
  const [compGridFilter, setCompGridFilter] = useState<CompGridFilter>('all');
  // Composition grid search state
  const [compGridSearch, setCompGridSearch] = useState('');
  // Which period's composition to use as basis
  const [compositionBasis, setCompositionBasis] = useState<CompositionBasis>('p1');
  // Chart view: composition (side-by-side bars) or delta (change chart)
  type ChartView = 'composition' | 'delta';
  const [chartView, setChartView] = useState<ChartView>('composition');
  // Modal state for company details
  const [selectedCompany, setSelectedCompany] = useState<ComparisonCompany | null>(null);
  // Modal tab state
  const [modalTab, setModalTab] = useState<ModalTab>('overview');
  // Expanded funds in "By Mutual Fund" tab (for ISIN mapping breakdown)
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());
  const toggleFundExpand = (fundCode: string) => {
    setExpandedFunds(prev => {
      const next = new Set(prev);
      if (next.has(fundCode)) next.delete(fundCode);
      else next.add(fundCode);
      return next;
    });
  };
  // Modal "By Mutual Fund" tab sort state
  type MfSortCol = 'fundName' | 'qtyP1' | 'mvP1' | 'compP1' | 'qtyP2' | 'mvP2' | 'compP2' | 'qtyChange' | 'mvChange' | 'compDelta';
  const [mfSortCol, setMfSortCol] = useState<MfSortCol>('mvP2');
  const [mfSortDir, setMfSortDir] = useState<'asc' | 'desc'>('desc');
  const handleMfSort = (col: MfSortCol) => {
    if (mfSortCol === col) {
      setMfSortDir(mfSortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setMfSortCol(col);
      setMfSortDir('desc');
    }
  };
  // Filter info modal state
  const [filterInfoModal, setFilterInfoModal] = useState<'all' | 'new' | 'exits' | 'isin' | null>(null);
  type FilterInfoTab = 'all' | 'new' | 'exits' | 'isin';
  const [filterInfoTab, setFilterInfoTab] = useState<FilterInfoTab>('all');
  // Column definitions modal state
  const [showColumnDefs, setShowColumnDefs] = useState(false);
  // Fund filter state
  const [selectedFundCodes, setSelectedFundCodes] = useState<string[]>([]); // empty = all funds
  const [fundDropdownOpen, setFundDropdownOpen] = useState(false);
  const fundDropdownRef = useRef<HTMLDivElement>(null);

  // Available funds from raw holdings
  const availableFunds = useMemo(() => {
    const fundCodes = new Set<string>();
    for (const h of rawHoldingsP1) fundCodes.add(h.scheme_name);
    for (const h of rawHoldingsP2) fundCodes.add(h.scheme_name);
    return Array.from(fundCodes).map(code => ({
      code,
      displayName: funds.find(f => f.code === code)?.displayName || code,
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rawHoldingsP1, rawHoldingsP2, funds]);

  // Filtered data: rebuild comparison when fund subset is selected
  const { filteredData, filteredHoldingsP1, filteredHoldingsP2 } = useMemo(() => {
    // No filter (all funds selected) - use original data
    if (selectedFundCodes.length === 0) {
      return { filteredData: data, filteredHoldingsP1: rawHoldingsP1, filteredHoldingsP2: rawHoldingsP2 };
    }
    // Filter holdings to selected funds only
    const fP1 = rawHoldingsP1.filter(h => selectedFundCodes.includes(h.scheme_name));
    const fP2 = rawHoldingsP2.filter(h => selectedFundCodes.includes(h.scheme_name));
    // Rebuild comparison from filtered holdings, then re-apply debt grouping
    const rebuilt = buildComparisonData(fP1, fP2);
    const { groupedData } = groupDebtInstruments(rebuilt);
    return { filteredData: groupedData, filteredHoldingsP1: fP1, filteredHoldingsP2: fP2 };
  }, [data, rawHoldingsP1, rawHoldingsP2, selectedFundCodes]);

  // Fund filter helpers
  const isAllFundsSelected = selectedFundCodes.length === 0;
  const toggleFund = (code: string) => {
    setSelectedFundCodes(prev => {
      if (prev.includes(code)) {
        const next = prev.filter(c => c !== code);
        return next; // if empty, means "all"
      } else {
        return [...prev, code];
      }
    });
    setCompGridPage(1);
  };
  const selectAllFunds = () => {
    setSelectedFundCodes([]);
    setCompGridPage(1);
  };

  // Close fund dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fundDropdownRef.current && !fundDropdownRef.current.contains(e.target as Node)) {
        setFundDropdownOpen(false);
      }
    };
    if (fundDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [fundDropdownOpen]);

  // Note: modal tab is set explicitly when opening (overview for name click, isinMapping for ISN badge)

  // Sync with external company selection (e.g., from Table view)
  useEffect(() => {
    if (initialSelectedCompany) {
      if (isDebtGroupRow(initialSelectedCompany)) {
        onDebtGroupClick?.();
        onCompanyModalClose?.();
        return;
      }
      setSelectedCompany(initialSelectedCompany);
      setModalTab('overview');
      setExpandedFunds(new Set());
    }
  }, [initialSelectedCompany]);

  // Close modal handler
  const handleCloseModal = () => {
    setSelectedCompany(null);
    onCompanyModalClose?.();
  };

  // Escape key handler for modals - filter info modal first, then company modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColumnDefs) {
          setShowColumnDefs(false);
        } else if (filterInfoModal) {
          setFilterInfoModal(null);
        } else if (selectedCompany) {
          handleCloseModal();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedCompany, filterInfoModal, showColumnDefs]);

  // Get fund display name
  const getFundDisplayName = (code: string): string => {
    const fund = funds.find(f => f.code === code);
    return fund?.displayName || code;
  };

  // Get per-MF breakdown for selected company
  // Calculate total AUM for each fund (for composition % calculation)
  const fundTotalAum = useMemo(() => {
    const aumP1 = new Map<string, number>();
    const aumP2 = new Map<string, number>();

    // Sum market values for each fund in P1
    for (const h of filteredHoldingsP1) {
      const current = aumP1.get(h.scheme_name) || 0;
      aumP1.set(h.scheme_name, current + (h.market_value || 0));
    }

    // Sum market values for each fund in P2
    for (const h of filteredHoldingsP2) {
      const current = aumP2.get(h.scheme_name) || 0;
      aumP2.set(h.scheme_name, current + (h.market_value || 0));
    }

    return { aumP1, aumP2 };
  }, [filteredHoldingsP1, filteredHoldingsP2]);

  const perMfBreakdown = useMemo(() => {
    if (!selectedCompany) return [];

    const isin = selectedCompany.isin;

    // Get holdings for this ISIN from both periods (use isin_mapped for aggregated items)
    const holdingsP1 = filteredHoldingsP1.filter(h => h.isin_mapped === isin);
    const holdingsP2 = filteredHoldingsP2.filter(h => h.isin_mapped === isin);

    // Get all unique fund codes
    const allFundCodes = new Set([
      ...holdingsP1.map(h => h.scheme_name),
      ...holdingsP2.map(h => h.scheme_name),
    ]);

    // Build breakdown data - aggregate all rows per fund (important for Cash with multiple rows)
    return Array.from(allFundCodes).map(fundCode => {
      const p1Rows = holdingsP1.filter(h => h.scheme_name === fundCode);
      const p2Rows = holdingsP2.filter(h => h.scheme_name === fundCode);

      const qtyP1 = p1Rows.reduce((sum, h) => sum + (h.quantity || 0), 0);
      const qtyP2 = p2Rows.reduce((sum, h) => sum + (h.quantity || 0), 0);
      const mvP1 = p1Rows.reduce((sum, h) => sum + (h.market_value || 0), 0);
      const mvP2 = p2Rows.reduce((sum, h) => sum + (h.market_value || 0), 0);

      const qtyChange = qtyP1 > 0 ? ((qtyP2 - qtyP1) / qtyP1) * 100 : (qtyP2 > 0 ? 100 : 0);
      const mvChange = mvP1 > 0 ? ((mvP2 - mvP1) / mvP1) * 100 : (mvP2 > 0 ? 100 : 0);

      // Calculate composition % for each fund
      const fundAumP1 = fundTotalAum.aumP1.get(fundCode) || 0;
      const fundAumP2 = fundTotalAum.aumP2.get(fundCode) || 0;
      const compP1 = fundAumP1 > 0 ? (mvP1 / fundAumP1) * 100 : 0;
      const compP2 = fundAumP2 > 0 ? (mvP2 / fundAumP2) * 100 : 0;

      return {
        fundCode,
        fundName: getFundDisplayName(fundCode),
        qtyP1,
        qtyP2,
        qtyChange,
        mvP1,
        mvP2,
        mvChange,
        compP1,
        compP2,
        fundAumP1,
        fundAumP2,
        isNew: qtyP1 === 0 && qtyP2 > 0,
        isExit: qtyP1 > 0 && qtyP2 === 0,
      };
    });
  }, [selectedCompany, filteredHoldingsP1, filteredHoldingsP2, funds, fundTotalAum]);

  // Sorted perMfBreakdown based on modal sort state
  const sortedPerMfBreakdown = useMemo(() => {
    const mult = mfSortDir === 'desc' ? -1 : 1;
    return [...perMfBreakdown].sort((a, b) => {
      let aVal: number | string = 0, bVal: number | string = 0;
      switch (mfSortCol) {
        case 'fundName': aVal = a.fundName; bVal = b.fundName; return mult * (aVal < bVal ? -1 : aVal > bVal ? 1 : 0);
        case 'qtyP1': aVal = a.qtyP1; bVal = b.qtyP1; break;
        case 'mvP1': aVal = a.mvP1; bVal = b.mvP1; break;
        case 'compP1': aVal = a.compP1; bVal = b.compP1; break;
        case 'qtyP2': aVal = a.qtyP2; bVal = b.qtyP2; break;
        case 'mvP2': aVal = a.mvP2; bVal = b.mvP2; break;
        case 'compP2': aVal = a.compP2; bVal = b.compP2; break;
        case 'qtyChange': aVal = a.qtyChange; bVal = b.qtyChange; break;
        case 'mvChange': aVal = a.mvChange; bVal = b.mvChange; break;
        case 'compDelta': aVal = a.compP2 - a.compP1; bVal = b.compP2 - b.compP1; break;
      }
      return ((aVal as number) - (bVal as number)) * mult;
    });
  }, [perMfBreakdown, mfSortCol, mfSortDir]);

  // Per-instrument breakdown for expandable fund rows in "By Mutual Fund" tab
  const fundInstrumentBreakdown = useMemo(() => {
    if (!selectedCompany?.mappingDetailsP1 && !selectedCompany?.mappingDetailsP2) return new Map<string, Array<{
      originalName: string; isinOriginal: string;
      qtyP1: number; mvP1: number; compP1: number;
      qtyP2: number; mvP2: number; compP2: number;
    }>>();

    const isin = selectedCompany!.isin;
    const result = new Map<string, Array<{
      originalName: string; isinOriginal: string;
      qtyP1: number; mvP1: number; compP1: number;
      qtyP2: number; mvP2: number; compP2: number;
    }>>();

    for (const fund of perMfBreakdown) {
      const p1 = filteredHoldingsP1.filter(h => h.scheme_name === fund.fundCode && h.isin_mapped === isin);
      const p2 = filteredHoldingsP2.filter(h => h.scheme_name === fund.fundCode && h.isin_mapped === isin);

      // Only expandable if there are multiple original instruments
      if (p1.length <= 1 && p2.length <= 1) continue;

      const byOriginal = new Map<string, { name: string; isin: string; qtyP1: number; mvP1: number; qtyP2: number; mvP2: number }>();

      for (const h of p1) {
        const key = h.isin_original || h.instrument_name || '(unknown)';
        const existing = byOriginal.get(key);
        if (existing) { existing.qtyP1 += h.quantity || 0; existing.mvP1 += h.market_value || 0; }
        else { byOriginal.set(key, { name: h.instrument_name || h.name_nsdl || '', isin: h.isin_original || '', qtyP1: h.quantity || 0, mvP1: h.market_value || 0, qtyP2: 0, mvP2: 0 }); }
      }
      for (const h of p2) {
        const key = h.isin_original || h.instrument_name || '(unknown)';
        const existing = byOriginal.get(key);
        if (existing) { existing.qtyP2 += h.quantity || 0; existing.mvP2 += h.market_value || 0; }
        else { byOriginal.set(key, { name: h.instrument_name || h.name_nsdl || '', isin: h.isin_original || '', qtyP1: 0, mvP1: 0, qtyP2: h.quantity || 0, mvP2: h.market_value || 0 }); }
      }

      const rows = Array.from(byOriginal.values()).map(r => ({
        originalName: r.name,
        isinOriginal: r.isin,
        qtyP1: r.qtyP1, mvP1: r.mvP1, compP1: fund.fundAumP1 > 0 ? (r.mvP1 / fund.fundAumP1) * 100 : 0,
        qtyP2: r.qtyP2, mvP2: r.mvP2, compP2: fund.fundAumP2 > 0 ? (r.mvP2 / fund.fundAumP2) * 100 : 0,
      })).sort((a, b) => Math.max(b.mvP1, b.mvP2) - Math.max(a.mvP1, a.mvP2));

      if (rows.length > 1) result.set(fund.fundCode, rows);
    }

    return result;
  }, [selectedCompany, perMfBreakdown, filteredHoldingsP1, filteredHoldingsP2]);

  // ISIN Mapping tab: build fund groups from mapping details
  const isinFundGroups = useMemo(() => {
    if (!selectedCompany) return [];
    const mappingDetailsP1 = selectedCompany.mappingDetailsP1;
    const mappingDetailsP2 = selectedCompany.mappingDetailsP2;
    if (!mappingDetailsP1?.length && !mappingDetailsP2?.length) return [];

    // Dedupe details within a period: aggregate by isinOriginal + schemeName
    const dedupeDetails = (details: typeof mappingDetailsP1): NonNullable<typeof mappingDetailsP1> => {
      if (!details || details.length === 0) return [];
      const seen = new Map<string, (typeof details)[number]>();
      for (const d of details) {
        const key = `${d.isinOriginal}|${d.schemeName}`;
        const existing = seen.get(key);
        if (existing) {
          seen.set(key, { ...existing, marketValue: existing.marketValue + d.marketValue });
        } else {
          seen.set(key, { ...d });
        }
      }
      return Array.from(seen.values()) as NonNullable<typeof mappingDetailsP1>;
    };

    const p1Details = dedupeDetails(mappingDetailsP1);
    const p2Details = dedupeDetails(mappingDetailsP2);

    const allFundCodes = new Set<string>();
    p1Details.forEach(d => allFundCodes.add(d.schemeName));
    p2Details.forEach(d => allFundCodes.add(d.schemeName));

    const getFundName = (code: string) => funds?.find(f => f.code === code)?.displayName || code;

    const groups: Array<{
      fundCode: string; fundName: string;
      rows: Array<{ isinOriginal: string; originalName: string; category: string; mvP1: number; mvP2: number }>;
      totalP1: number; totalP2: number;
    }> = [];

    for (const fundCode of allFundCodes) {
      const p1ForFund = p1Details.filter(d => d.schemeName === fundCode);
      const p2ForFund = p2Details.filter(d => d.schemeName === fundCode);
      const rowMap = new Map<string, { isinOriginal: string; originalName: string; category: string; mvP1: number; mvP2: number }>();

      for (const d of p1ForFund) {
        const key = d.isinOriginal || d.originalName || '(no ISIN)';
        rowMap.set(key, { isinOriginal: d.isinOriginal, originalName: d.originalName, category: d.category, mvP1: d.marketValue, mvP2: 0 });
      }
      for (const d of p2ForFund) {
        const key = d.isinOriginal || d.originalName || '(no ISIN)';
        const existing = rowMap.get(key);
        if (existing) { existing.mvP2 = d.marketValue; }
        else { rowMap.set(key, { isinOriginal: d.isinOriginal, originalName: d.originalName, category: d.category, mvP1: 0, mvP2: d.marketValue }); }
      }

      const rows = Array.from(rowMap.values()).sort((a, b) => Math.max(b.mvP1, b.mvP2) - Math.max(a.mvP1, a.mvP2));
      const totalP1 = rows.reduce((sum, r) => sum + r.mvP1, 0);
      const totalP2 = rows.reduce((sum, r) => sum + r.mvP2, 0);
      groups.push({ fundCode, fundName: getFundName(fundCode), rows, totalP1, totalP2 });
    }

    groups.sort((a, b) => Math.max(b.totalP1, b.totalP2) - Math.max(a.totalP1, a.totalP2));
    return groups;
  }, [selectedCompany, funds]);

  // Handle sort column click
  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // New column, default to descending
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  // Format period labels for column headers
  const p1Short = formatPeriodShort(p1Label || '');
  const p2Short = formatPeriodShort(p2Label || '');
  const p1Month = (p1Label || '').split(' ')[0] || 'P1';
  const p1Year = (p1Label || '').split(' ')[1] || '';
  const p2Month = (p2Label || '').split(' ')[0] || 'P2';
  const p2Year = (p2Label || '').split(' ')[1] || '';

  // Get top movers for the overview grid
  const topMovers = useMemo(() => {
    return getTopMovers(filteredData, TOP_CHANGES_COUNT);
  }, [filteredData]);

  // Get all holdings for the composition comparison grid (sorted by selected column, with filter)
  const compositionGrid = useMemo(() => {
    // Include all holdings that have value in either period
    let allHoldings = [...filteredData].filter(c => c['mktvalp1%'] > 0 || c['mktvalp2%'] > 0);

    // Apply filter
    if (compGridFilter === 'new') {
      allHoldings = allHoldings.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0);
    } else if (compGridFilter === 'exits') {
      allHoldings = allHoldings.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0);
    } else if (compGridFilter === 'isin') {
      allHoldings = allHoldings.filter(c => c.mappingDetailsP1 || c.mappingDetailsP2);
    }

    // Apply search (case-insensitive, matches any part of name, minimum 2 chars)
    if (compGridSearch.trim().length >= 2) {
      const searchLower = compGridSearch.trim().toLowerCase();
      allHoldings = allHoldings.filter(c => c.name.toLowerCase().includes(searchLower));
    }

    // Sort based on selected column and direction
    const multiplier = compGridSortDir === 'desc' ? -1 : 1;
    return allHoldings.sort((a, b) => {
      let aVal: number, bVal: number;
      if (compGridSortCol === 'p1') {
        aVal = a['mktvalp1%'];
        bVal = b['mktvalp1%'];
      } else if (compGridSortCol === 'p2') {
        aVal = a['mktvalp2%'];
        bVal = b['mktvalp2%'];
      } else if (compGridSortCol === 'change') {
        aVal = a['mktvalp2%'] - a['mktvalp1%'];
        bVal = b['mktvalp2%'] - b['mktvalp1%'];
      } else if (compGridSortCol === 'mvChange') {
        aVal = a['mv%change'] ?? 0;
        bVal = b['mv%change'] ?? 0;
      } else if (compGridSortCol === 'qtyChange') {
        aVal = a['qty%change'] ?? 0;
        bVal = b['qty%change'] ?? 0;
      } else {
        // mfChange
        aVal = (a.numofmfp2mv || 0) - (a.numofmfp1mv || 0);
        bVal = (b.numofmfp2mv || 0) - (b.numofmfp1mv || 0);
      }
      return (aVal - bVal) * multiplier;
    });
  }, [filteredData, compGridSortCol, compGridSortDir, compGridFilter, compGridSearch]);

  // Composition grid pagination
  const compGridTotalPages = Math.ceil(compositionGrid.length / ITEMS_PER_PAGE);
  const paginatedCompGrid = useMemo(() => {
    const start = (compGridPage - 1) * ITEMS_PER_PAGE;
    return compositionGrid.slice(start, start + ITEMS_PER_PAGE);
  }, [compositionGrid, compGridPage]);

  // Process data (keep original order - top to bottom)
  const processedData = useMemo(() => {
    // Calculate total market value for composition % based on selected period
    const totalMv = compositionBasis === 'p1'
      ? filteredData.reduce((sum, item) => sum + (item.mktvalp1 || 0), 0)
      : filteredData.reduce((sum, item) => sum + (item.mktvalp2 || 0), 0);

    return filteredData.map(item => {
      const name = item.name || item.isin;
      // Table gets 25 chars, chart gets 18 chars (matching Holdings Composition chart)
      const tableName = name.length > 25 ? name.substring(0, 25) + '...' : name;
      const chartName = name.length > 18 ? name.substring(0, 18) + '...' : name;
      const p1 = item.numofmfp1mv || 0;
      const p2 = item.numofmfp2mv || 0;
      const mfChange = p2 - p1;
      // Composition based on selected period
      const itemMv = compositionBasis === 'p1' ? (item.mktvalp1 || 0) : (item.mktvalp2 || 0);
      const composition = totalMv > 0 ? (itemMv / totalMv) * 100 : 0;

      // Get raw percentage values
      const mvChangeRaw = item['mv%change'] !== null ? item['mv%change'] * 100 : 0;
      const qtyChangeRaw = item['qty%change'] !== null ? item['qty%change'] * 100 : 0;

      return {
        name: tableName,
        chartName,
        fullName: name,
        nseSymbol: item.nseSymbol || '',
        p1,
        p2,
        mfChange,
        composition,
        mvChange: mvChangeRaw,
        qtyChange: qtyChangeRaw,
        originalItem: item, // Keep reference for modal
      };
    });
  }, [filteredData, compositionBasis]);

  // Sort data based on current sort state
  const sortedData = useMemo(() => {
    const sorted = [...processedData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      const multiplier = sortDirection === 'desc' ? -1 : 1;
      return (aVal - bVal) * multiplier;
    });
    return sorted;
  }, [processedData, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, currentPage]);

  // Plotly traces - two bars: MV Change (grey) and Qty Change (blue)
  // Uses paginated data for chart to match table
  const traces = useMemo(() => {
    const reversed = [...paginatedData].reverse();
    const chartLabels = reversed.map(d => d.chartName);

    // Cap values for display
    const cappedMvChanges = reversed.map(d => Math.max(-50, Math.min(50, d.mvChange)));
    const cappedQtyChanges = reversed.map(d => Math.max(-50, Math.min(50, d.qtyChange)));

    // Format labels for display on bars - negative in parentheses
    const mvLabels = reversed.map(d => d.mvChange >= 0 ? `+${d.mvChange.toFixed(0)}%` : `(${Math.abs(d.mvChange).toFixed(0)}%)`);
    const qtyLabels = reversed.map(d => d.qtyChange >= 0 ? `+${d.qtyChange.toFixed(0)}%` : `(${Math.abs(d.qtyChange).toFixed(0)}%)`);

    return [
      {
        y: chartLabels,
        x: cappedMvChanges,
        name: 'MV %',
        type: 'bar' as const,
        orientation: 'h' as const,
        marker: {
          color: '#4A6FA5', // Steel blue
        },
        text: mvLabels,
        textposition: 'outside' as const,
        textfont: { size: 13, color: '#000000', family: 'Consolas, monospace' },
        hovertemplate: reversed.map(d => `<b>${d.fullName}</b><br>MV Change: ${d.mvChange >= 0 ? '+' : ''}${d.mvChange.toFixed(1)}%<extra></extra>`),
      },
      {
        y: chartLabels,
        x: cappedQtyChanges,
        name: 'Qty %',
        type: 'bar' as const,
        orientation: 'h' as const,
        marker: {
          color: '#8FAEC5', // Light steel blue
        },
        text: qtyLabels,
        textposition: 'outside' as const,
        textfont: { size: 13, color: '#000000', family: 'Consolas, monospace' },
        hovertemplate: reversed.map(d => `<b>${d.fullName}</b><br>Qty Change: ${d.qtyChange >= 0 ? '+' : ''}${d.qtyChange.toFixed(1)}%<extra></extra>`),
      },
    ];
  }, [paginatedData]);

  const layout = useMemo(() => ({
    font: {
      family: 'Consolas, "Courier New", monospace',
      size: 13,
      color: '#000000',
    },
    xaxis: {
      range: [-45, 70],
      zeroline: true,
      zerolinecolor: '#d1d5db',
      zerolinewidth: 1,
      showgrid: false,
      showline: false,
      showticklabels: false,
    },
    yaxis: {
      showticklabels: true,
      tickfont: { size: 11, color: '#000000', family: 'Consolas, "Courier New", monospace' },
      automargin: true,
      anchor: 'free' as const,
      position: 0, // Position at far left so negative bars don't overlap labels
    },
    barmode: 'group' as const,
    bargap: 0.08,
    margin: { l: 130, r: 60, t: 46, b: 30 },
    height: 490,
    showlegend: true,
    legend: {
      orientation: 'h' as const,
      yanchor: 'bottom' as const,
      y: -0.05,
      xanchor: 'center' as const,
      x: 0.5,
      font: { size: 12, color: '#000000' },
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    hovermode: 'closest' as const,
  }), []);

  const config = useMemo(() => ({
    displayModeBar: false,
    responsive: true,
  }), []);

  // Format helpers - negative in parentheses
  const formatPct = (val: number) => val >= 0 ? `+${val.toFixed(1)}%` : `(${Math.abs(val).toFixed(1)}%)`;
  const formatComp = (val: number) => `${val.toFixed(1)}%`;

  // Helper to format change display for top movers
  const formatTopMoverChange = (item: ComparisonCompany) => {
    const isNew = item.mktvalp1 === 0 && item.mktvalp2 > 0;
    const isExit = item.mktvalp1 > 0 && item.mktvalp2 === 0;

    if (isNew) {
      // Show P2 value in crores for new entries
      return { text: `₹${(item.mktvalp2 / 100).toFixed(0)} Cr`, badge: 'NEW', isPositive: true };
    }
    if (isExit) {
      // Show P1 value in crores for exits
      return { text: `₹${(item.mktvalp1 / 100).toFixed(0)} Cr`, badge: 'EXIT', isPositive: false };
    }
    // Regular change - show percentage
    const change = item['mv%change'] !== null ? item['mv%change'] * 100 : 0;
    const isPositive = change >= 0;
    return {
      text: isPositive ? `+${change.toFixed(1)}%` : `(${Math.abs(change).toFixed(1)}%)`,
      badge: null,
      isPositive,
    };
  };

  return (
    <div className="space-y-4">

      {/* 3. Holdings Composition - Table (LEFT) + Chart (RIGHT) */}
      {filteredData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded">
          <div className="border-t-2 border-slate-300 px-2 md:px-4 py-2">
            <div className="flex flex-wrap items-center gap-1">
              {/* Fund Filter Dropdown */}
              {availableFunds.length > 1 && (
                <div className="relative mr-1 flex-shrink-0" ref={fundDropdownRef}>
                  <button
                    onClick={() => setFundDropdownOpen(!fundDropdownOpen)}
                    className={`flex items-center gap-1.5 px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-base font-medium rounded transition-colors whitespace-nowrap border ${
                      isAllFundsSelected
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        : 'border-blue-600 bg-blue-50 text-blue-700'
                    }`}
                  >
                    {isAllFundsSelected
                      ? `All Funds (${availableFunds.length})`
                      : `${selectedFundCodes.length} of ${availableFunds.length} Funds`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${fundDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {fundDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[80] min-w-[220px] max-h-[320px] overflow-auto">
                      {/* All option */}
                      <button
                        onClick={selectAllFunds}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 border-b border-slate-100 ${
                          isAllFundsSelected ? 'font-semibold text-blue-700' : 'text-black'
                        }`}
                      >
                        <span className={`flex items-center justify-center w-4 h-4 rounded border ${
                          isAllFundsSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                        }`}>
                          {isAllFundsSelected && <Check className="h-3 w-3 text-white" />}
                        </span>
                        All Funds
                      </button>
                      {/* Individual funds */}
                      {availableFunds.map(fund => {
                        const isSelected = !isAllFundsSelected && selectedFundCodes.includes(fund.code);
                        return (
                          <button
                            key={fund.code}
                            onClick={() => toggleFund(fund.code)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-black hover:bg-slate-50"
                          >
                            <span className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 ${
                              isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </span>
                            <span className="truncate">{fund.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Filter buttons */}
              <button
                onClick={() => { setCompGridFilter('all'); setCompGridPage(1); }}
                className={`px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-base font-medium rounded transition-colors whitespace-nowrap ${
                  compGridFilter === 'all' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                }`}
              >
                All ({filteredData.filter(c => c['mktvalp1%'] > 0 || c['mktvalp2%'] > 0).length})
              </button>
              <button
                onClick={() => { setCompGridFilter('new'); setCompGridPage(1); }}
                className={`px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-base font-medium rounded transition-colors whitespace-nowrap ${
                  compGridFilter === 'new' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                }`}
              >
                New ({filteredData.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0).length})
              </button>
              <button
                onClick={() => { setCompGridFilter('exits'); setCompGridPage(1); }}
                className={`px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-base font-medium rounded transition-colors whitespace-nowrap ${
                  compGridFilter === 'exits' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                }`}
              >
                Exits ({filteredData.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0).length})
              </button>
              <button
                onClick={() => { setCompGridFilter('isin'); setCompGridPage(1); }}
                className={`px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-base font-medium rounded transition-colors whitespace-nowrap ${
                  compGridFilter === 'isin' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                }`}
              >
                ISIN ({filteredData.filter(c => c.mappingDetailsP1 || c.mappingDetailsP2).length})
              </button>
              <input
                type="text"
                placeholder="Search by company name..."
                value={compGridSearch}
                onChange={(e) => { setCompGridSearch(e.target.value); setCompGridPage(1); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setCompGridSearch(''); setCompGridPage(1); } }}
                className="ml-1 md:ml-2 px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-base rounded-lg border-2 border-blue-300 bg-blue-50/50 text-black placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white w-28 md:w-52"
              />
              {compGridSearch && (
                <button
                  onClick={() => { setCompGridSearch(''); setCompGridPage(1); }}
                  className="px-2 py-1 md:py-1.5 text-xs md:text-base font-medium rounded border border-blue-900 text-blue-900 hover:bg-blue-50 transition-colors"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => { setFilterInfoModal('all'); setFilterInfoTab('all'); }}
                className="ml-1 md:ml-2 inline-flex items-center justify-center w-[22px] h-[22px] md:w-[24px] md:h-[24px] rounded-full border-[1.5px] border-[#999] text-[#999] hover:text-[#555] hover:border-[#555] transition-colors text-sm font-semibold cursor-pointer leading-none"
                title="Definitions"
              >
                ?
              </button>
              {/* Spacer to push chart buttons right */}
              <div className="hidden md:block flex-1" />
              <div className="flex items-center gap-1.5 ml-auto md:ml-0">
                <span className="text-base text-slate-600">Chart:</span>
                <button
                  onClick={() => setChartView('composition')}
                  className={`px-3 md:px-4 py-1 md:py-1.5 text-base font-medium rounded transition-colors whitespace-nowrap ${
                    chartView === 'composition' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                  }`}
                >
                  Composition
                </button>
                <button
                  onClick={() => setChartView('delta')}
                  className={`px-3 md:px-4 py-1 md:py-1.5 text-base font-medium rounded transition-colors whitespace-nowrap ${
                    chartView === 'delta' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
                  }`}
                >
                  Changes
                </button>
              </div>
            </div>
          </div>
          {/* Two-column layout: Table LEFT, Chart RIGHT - Stacked on mobile */}
          <div className="flex flex-col lg:grid lg:grid-cols-[58%_42%] gap-0 min-h-[400px] lg:min-h-[580px]">
            {/* LEFT: Table */}
            <div className="p-1 md:p-2 lg:border-r border-slate-200 flex flex-col">
            <div className="overflow-hidden" style={{ minHeight: '350px' }}>
              <table className="text-sm md:text-base w-full table-fixed">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead>
                  {/* Row 1: Main labels (Dec, Sep, Comp, MV, Qty, MFs) */}
                  <tr className="border-b border-slate-200">
                    <th rowSpan={2} className="py-1 px-2 font-semibold text-black align-bottom">
                      <div className="flex items-end justify-between">
                        <span>Company</span>
                        <button
                          onClick={() => setShowColumnDefs(true)}
                          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border-[1.5px] border-[#999] text-[#999] hover:text-[#555] hover:border-[#555] transition-colors text-sm font-semibold cursor-pointer leading-none"
                          title="Column definitions"
                        >
                          ?
                        </button>
                      </div>
                    </th>
                    <th rowSpan={2} className="py-1 px-1 text-center font-semibold text-black w-8 align-bottom" title="NSE India">N</th>
                    <th rowSpan={2} className="py-1 px-1 text-center font-semibold text-black w-8 align-bottom" title="Yahoo Finance">Y</th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('p2'); setCompGridSortDir(compGridSortCol === 'p2' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      {p2Month}
                    </th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('p1'); setCompGridSortDir(compGridSortCol === 'p1' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      {p1Month}
                    </th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('change'); setCompGridSortDir(compGridSortCol === 'change' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Comp
                    </th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('mvChange'); setCompGridSortDir(compGridSortCol === 'mvChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      MV
                    </th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('qtyChange'); setCompGridSortDir(compGridSortCol === 'qtyChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Qty
                    </th>
                    <th
                      className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('mfChange'); setCompGridSortDir(compGridSortCol === 'mfChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      MFs
                    </th>
                  </tr>
                  {/* Row 2: Secondary labels (2025, Δ%, Δ) */}
                  <tr className="border-b-2 border-slate-300">
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('p2'); setCompGridSortDir(compGridSortCol === 'p2' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      {p2Year} {compGridSortCol === 'p2' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('p1'); setCompGridSortDir(compGridSortCol === 'p1' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      {p1Year} {compGridSortCol === 'p1' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('change'); setCompGridSortDir(compGridSortCol === 'change' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Δ% {compGridSortCol === 'change' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('mvChange'); setCompGridSortDir(compGridSortCol === 'mvChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Δ% {compGridSortCol === 'mvChange' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('qtyChange'); setCompGridSortDir(compGridSortCol === 'qtyChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Δ% {compGridSortCol === 'qtyChange' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th
                      className="pt-0 pb-1 px-1 text-center font-normal text-black cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => { setCompGridSortCol('mfChange'); setCompGridSortDir(compGridSortCol === 'mfChange' && compGridSortDir === 'desc' ? 'asc' : 'desc'); setCompGridPage(1); }}
                    >
                      Δ {compGridSortCol === 'mfChange' && <span className="text-blue-600">{compGridSortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="table-fade-in" key={`${compGridFilter}-${compGridSearch}-${compGridSortCol}-${compGridSortDir}-${compGridPage}`}>
                  {paginatedCompGrid.map((item, idx) => {
                    const p1Pct = item['mktvalp1%'] * 100;
                    const p2Pct = item['mktvalp2%'] * 100;
                    const changePctPoints = p2Pct - p1Pct;
                    const isNew = item.mktvalp1 === 0 && item.mktvalp2 > 0;
                    const isExit = item.mktvalp1 > 0 && item.mktvalp2 === 0;
                    const name = item.name || item.isin;
                    const shortName = name.length > 18 ? name.substring(0, 18) + '...' : name;
                    const mvChange = item['mv%change'] !== null ? item['mv%change'] * 100 : null;
                    const qtyChange = item['qty%change'] !== null ? item['qty%change'] * 100 : null;
                    const mfChange = (item.numofmfp2mv || 0) - (item.numofmfp1mv || 0);

                    return (
                      <tr
                        key={item.isin}
                        className="border-b border-slate-200 cursor-pointer hover:bg-slate-50"
                        onClick={() => {
                          if (isDebtGroupRow(item)) { onDebtGroupClick?.(); return; }
                          setSelectedCompany(item); setModalTab('overview'); setExpandedFunds(new Set());
                        }}
                      >
                        <td className="py-2 px-3 font-medium overflow-hidden max-w-0" title={name}>
                          <div className="flex items-center gap-1">
                            <span className="truncate text-sm text-blue-700 hover:underline">{shortName}</span>
                            {isNew && (
                              <span className="px-1.5 py-0.5 text-xs font-bold text-white rounded flex-shrink-0" style={{ backgroundColor: '#5B7B7B' }}>NEW</span>
                            )}
                            {isExit && (
                              <span className="px-1.5 py-0.5 text-xs font-bold text-white rounded flex-shrink-0" style={{ backgroundColor: '#9B5555' }}>EXIT</span>
                            )}
                            {(item.mappingDetailsP1 || item.mappingDetailsP2) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isDebtGroupRow(item)) { onDebtGroupClick?.(); return; }
                                  setSelectedCompany(item); setModalTab('isinMapping'); setExpandedFunds(new Set());
                                }}
                                className="px-1.5 py-0.5 text-xs font-bold bg-gray-600 hover:bg-gray-800 text-white rounded transition-colors flex-shrink-0"
                                title={isDebtGroupRow(item) ? 'View debt instruments breakdown' : 'View ISIN mapping details'}
                              >
                                ISN
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-1 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          {item.nseSymbol ? (
                            <a
                              href={`https://www.nseindia.com/get-quote/equity/${item.nseSymbol}/${name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on NSE India"
                              className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-slate-700 hover:text-black border border-slate-400 hover:border-slate-600 transition-colors"
                            >
                              N
                            </a>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          {item.nseSymbol ? (
                            <a
                              href={`https://finance.yahoo.com/quote/${item.nseSymbol}.NS`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on Yahoo Finance"
                              className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-slate-700 hover:text-black border border-slate-400 hover:border-slate-600 transition-colors"
                            >
                              Y
                            </a>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center font-medium font-mono tabular-nums">
                          {isNew ? `${p2Pct.toFixed(1)}%` : (p2Pct > 0 ? `${p2Pct.toFixed(1)}%` : '-')}
                        </td>
                        <td className="py-2 px-2 text-center font-medium font-mono tabular-nums">
                          {isExit ? `${p1Pct.toFixed(1)}%` : (p1Pct > 0 ? `${p1Pct.toFixed(1)}%` : '-')}
                        </td>
                        <td className="py-2 px-2 text-center font-bold font-mono tabular-nums">
                          {isNew ? <span className="text-emerald-700">NEW</span> : isExit ? <span className="text-red-700">EXIT</span> : (
                            <span className={changePctPoints >= 0 ? 'text-green-700' : 'text-red-700'}>
                              {changePctPoints >= 0 ? '+' : ''}{changePctPoints.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums">
                          {isNew ? <span className="text-emerald-700">NEW</span> : isExit ? <span className="text-red-700">EXIT</span> : (
                            mvChange !== null ? (
                              <span className={mvChange >= 0 ? 'text-teal-700' : 'text-red-600'}>
                                {mvChange >= 0 ? '+' : ''}{mvChange.toFixed(0)}%
                              </span>
                            ) : <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums">
                          {isNew ? <span className="text-emerald-700">NEW</span> : isExit ? <span className="text-red-700">EXIT</span> : (
                            qtyChange !== null ? (
                              <span className={qtyChange >= 0 ? 'text-teal-700' : 'text-red-600'}>
                                {qtyChange >= 0 ? '+' : ''}{qtyChange.toFixed(0)}%
                              </span>
                            ) : <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums">
                          {mfChange !== 0 ? (
                            <span className={mfChange > 0 ? 'text-teal-700' : 'text-red-600'}>
                              {mfChange > 0 ? '+' : ''}{mfChange}
                            </span>
                          ) : <span className="text-slate-400">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-2">
              <span className="text-base text-black">
                Page <span className="font-mono">{compGridPage}</span> of <span className="font-mono">{Math.max(1, compGridTotalPages)}</span> (<span className="font-mono">{compositionGrid.length}</span> items)
              </span>
              {compGridTotalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCompGridPage(1)}
                    disabled={compGridPage === 1}
                    className="px-2 py-1 text-base font-medium text-black bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCompGridPage(p => Math.max(1, p - 1))}
                    disabled={compGridPage === 1}
                    className="px-2 py-1 text-base font-medium text-black bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCompGridPage(p => Math.min(compGridTotalPages, p + 1))}
                    disabled={compGridPage === compGridTotalPages}
                    className="px-2 py-1 text-base font-medium text-black bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCompGridPage(compGridTotalPages)}
                    disabled={compGridPage === compGridTotalPages}
                    className="px-2 py-1 text-base font-medium text-black bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              )}
            </div>
          </div>

            {/* RIGHT: Chart - Below table on mobile */}
            <div className="p-1 md:p-2 pt-4 lg:pt-14" style={{ minHeight: '400px' }}>
              <h3 className="text-base font-semibold text-black text-center mb-2">
                {chartView === 'composition'
                  ? `Portfolio Composition — ${p1Label} vs ${p2Label}`
                  : `Composition Change — ${p1Label} to ${p2Label}`}
              </h3>
              {chartView === 'composition' ? (
                <Plot
                  data={[
                    {
                      y: [...paginatedCompGrid].reverse().map(item => {
                        const name = item.name || item.isin;
                        return name.length > 18 ? name.substring(0, 18) + '...' : name;
                      }),
                      x: [...paginatedCompGrid].reverse().map(item => item['mktvalp1%'] * 100),
                      name: p1Label,
                      type: 'bar',
                      orientation: 'h',
                      marker: { color: '#8FAEC5' }, // light steel blue (previous period)
                      text: [...paginatedCompGrid].reverse().map(item => `${(item['mktvalp1%'] * 100).toFixed(1)}%`),
                      textposition: 'outside',
                      textfont: { size: 11, color: '#000000', family: 'Consolas, monospace' },
                      hovertemplate: [...paginatedCompGrid].reverse().map(item =>
                        `<b>${item.name}</b><br>${p1Label}: ${(item['mktvalp1%'] * 100).toFixed(2)}%<extra></extra>`
                      ),
                    },
                    {
                      y: [...paginatedCompGrid].reverse().map(item => {
                        const name = item.name || item.isin;
                        return name.length > 18 ? name.substring(0, 18) + '...' : name;
                      }),
                      x: [...paginatedCompGrid].reverse().map(item => item['mktvalp2%'] * 100),
                      name: p2Label,
                      type: 'bar',
                      orientation: 'h',
                      marker: { color: '#4A6FA5' }, // steel blue (current period)
                      text: [...paginatedCompGrid].reverse().map(item => `${(item['mktvalp2%'] * 100).toFixed(1)}%`),
                      textposition: 'outside',
                      textfont: { size: 11, color: '#000000', family: 'Consolas, monospace' },
                      hovertemplate: [...paginatedCompGrid].reverse().map(item =>
                        `<b>${item.name}</b><br>${p2Label}: ${(item['mktvalp2%'] * 100).toFixed(2)}%<extra></extra>`
                      ),
                    },
                  ]}
                  layout={{
                    font: { family: 'Consolas, monospace', size: 11, color: '#000000' },
                    xaxis: {
                      range: [0, Math.max(...(paginatedCompGrid.length > 0 ? paginatedCompGrid.map(item => Math.max(item['mktvalp1%'], item['mktvalp2%']) * 100) : [1])) * 1.3],
                      showgrid: false,
                      zeroline: false,
                      showticklabels: false,
                    },
                    yaxis: {
                      showticklabels: true,
                      tickfont: { size: 11, color: '#000000' },
                      automargin: true,
                    },
                    barmode: 'group',
                    bargap: 0.12,
                    bargroupgap: 0.08,
                    margin: { l: 10, r: 60, t: 10, b: 40 },
                    height: 500,
                    showlegend: true,
                    legend: { orientation: 'h' as const, y: -0.08, x: 0.5, xanchor: 'center' as const },
                    plot_bgcolor: '#ffffff',
                    paper_bgcolor: '#ffffff',
                    hovermode: 'closest',
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%' }}
                />
              ) : (
                /* Delta/Changes Chart - shows MV% change for current page items */
                <Plot
                  data={(() => {
                    const chartData = [...paginatedCompGrid].reverse();
                    const positive = chartData.map(item => {
                      const change = (item['mktvalp2%'] - item['mktvalp1%']) * 100;
                      return change > 0 ? change : 0;
                    });
                    const negative = chartData.map(item => {
                      const change = (item['mktvalp2%'] - item['mktvalp1%']) * 100;
                      return change < 0 ? change : 0;
                    });
                    const labels = chartData.map(item => {
                      const name = item.name || item.isin;
                      return name.length > 18 ? name.substring(0, 18) + '...' : name;
                    });
                    return [
                      {
                        y: labels,
                        x: positive,
                        name: 'Increase',
                        type: 'bar' as const,
                        orientation: 'h' as const,
                        marker: { color: '#5478A0' }, // muted steel blue
                        text: positive.map(v => v > 0 ? `+${v.toFixed(2)}%` : ''),
                        textposition: 'outside' as const,
                        textfont: { size: 11, color: '#000000', family: 'Consolas, monospace' },
                        hovertemplate: chartData.map((item, i) =>
                          positive[i] > 0 ? `<b>${item.name}</b><br>Change: +${positive[i].toFixed(2)}%<extra></extra>` : ''
                        ),
                      },
                      {
                        y: labels,
                        x: negative,
                        name: 'Decrease',
                        type: 'bar' as const,
                        orientation: 'h' as const,
                        marker: { color: '#B54848' }, // muted desaturated red
                        text: negative.map(v => v < 0 ? `${v.toFixed(2)}%` : ''),
                        textposition: 'outside' as const,
                        textfont: { size: 11, color: '#000000', family: 'Consolas, monospace' },
                        hovertemplate: chartData.map((item, i) =>
                          negative[i] < 0 ? `<b>${item.name}</b><br>Change: ${negative[i].toFixed(2)}%<extra></extra>` : ''
                        ),
                      },
                    ];
                  })()}
                  layout={{
                    font: { family: 'Consolas, monospace', size: 11, color: '#000000' },
                    xaxis: {
                      zeroline: true,
                      zerolinecolor: '#334155',
                      zerolinewidth: 1,
                      showgrid: false,
                      showticklabels: false,
                    },
                    yaxis: {
                      showticklabels: true,
                      tickfont: { size: 11, color: '#000000' },
                      automargin: true,
                    },
                    barmode: 'relative',
                    bargap: 0.15,
                    margin: { l: 10, r: 60, t: 10, b: 40 },
                    height: 500,
                    showlegend: true,
                    legend: { orientation: 'h' as const, y: -0.08, x: 0.5, xanchor: 'center' as const },
                    plot_bgcolor: '#ffffff',
                    paper_bgcolor: '#ffffff',
                    hovermode: 'closest',
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Company Detail Modal */}
      {selectedCompany && (
        <div
          className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[5vh] overflow-y-auto"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[85vh] overflow-auto mb-[5vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedCompany.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-slate-300">ISIN: {selectedCompany.isin}</span>
                  {selectedCompany.nseSymbol && (
                    <span className="text-sm text-slate-300">NSE: {selectedCompany.nseSymbol}</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-white hover:text-slate-300 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setModalTab('overview')}
                className={`px-4 py-2 text-base font-medium border-b-2 ${
                  modalTab === 'overview'
                    ? 'text-black border-black'
                    : 'text-black border-transparent hover:border-slate-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setModalTab('byFund')}
                className={`px-4 py-2 text-base font-medium border-b-2 ${
                  modalTab === 'byFund'
                    ? 'text-black border-black'
                    : 'text-black border-transparent hover:border-slate-300'
                }`}
              >
                By Mutual Fund ({perMfBreakdown.length})
              </button>
              {(selectedCompany.mappingDetailsP1 || selectedCompany.mappingDetailsP2) && (
                <button
                  onClick={() => setModalTab('isinMapping')}
                  className={`px-4 py-2 text-base font-medium border-b-2 ${
                    modalTab === 'isinMapping'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-slate-300'
                  }`}
                >
                  ISIN Mapping
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Overview Tab */}
              {modalTab === 'overview' && (
                <>
                  {/* Market Value Section */}
                  <div>
                    <h4 className="text-base font-semibold text-black mb-3 border-b border-slate-200 pb-2">Market Value</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p1Label || 'Previous'}</div>
                    <div className="text-lg text-black font-mono">₹{(selectedCompany.mktvalp1 / 100).toFixed(0)} Cr</div>
                    <div className="text-base text-black font-mono">{(selectedCompany['mktvalp1%'] * 100).toFixed(2)}% of portfolio</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p2Label || 'Current'}</div>
                    <div className="text-lg text-black font-mono">₹{(selectedCompany.mktvalp2 / 100).toFixed(0)} Cr</div>
                    <div className="text-base text-black font-mono">{(selectedCompany['mktvalp2%'] * 100).toFixed(2)}% of portfolio</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">Change</div>
                    <div className={`text-lg font-mono ${selectedCompany['mv%change'] !== null && selectedCompany['mv%change'] >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {selectedCompany['mv%change'] !== null
                        ? `${selectedCompany['mv%change'] >= 0 ? '+' : ''}${(selectedCompany['mv%change'] * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                    <div className="text-sm text-black font-mono">
                      {selectedCompany.mktvalp2 - selectedCompany.mktvalp1 >= 0 ? '+' : ''}
                      ₹{((selectedCompany.mktvalp2 - selectedCompany.mktvalp1) / 100).toFixed(0)} Cr
                    </div>
                  </div>
                </div>
              </div>

              {/* Quantity Section */}
              <div>
                <h4 className="text-base font-semibold text-black mb-3 border-b border-slate-200 pb-2">Quantity (Shares)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p1Label || 'Previous'}</div>
                    <div className="text-lg text-black font-mono">{selectedCompany.qtyp1.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p2Label || 'Current'}</div>
                    <div className="text-lg text-black font-mono">{selectedCompany.qtyp2.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">Change</div>
                    <div className={`text-lg font-mono ${selectedCompany['qty%change'] !== null && selectedCompany['qty%change'] >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {selectedCompany['qty%change'] !== null
                        ? `${selectedCompany['qty%change'] >= 0 ? '+' : ''}${(selectedCompany['qty%change'] * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                    <div className="text-sm text-black font-mono">
                      {selectedCompany.qtyp2 - selectedCompany.qtyp1 >= 0 ? '+' : ''}
                      {(selectedCompany.qtyp2 - selectedCompany.qtyp1).toLocaleString('en-IN')} shares
                    </div>
                  </div>
                </div>
              </div>

              {/* MF Holdings Section */}
              <div>
                <h4 className="text-base font-semibold text-black mb-3 border-b border-slate-200 pb-2">MF Holdings</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p1Label || 'Previous'}</div>
                    <div className="text-lg text-black font-mono">{selectedCompany.numofmfp1mv} MFs</div>
                    <div className="text-sm text-black">with market value</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">{p2Label || 'Current'}</div>
                    <div className="text-lg text-black font-mono">{selectedCompany.numofmfp2mv} MFs</div>
                    <div className="text-sm text-black">with market value</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded">
                    <div className="text-xs text-black uppercase">Change</div>
                    <div className={`text-lg font-mono ${selectedCompany.numofmfp2mv - selectedCompany.numofmfp1mv >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {selectedCompany.numofmfp2mv - selectedCompany.numofmfp1mv >= 0 ? '+' : ''}
                      {selectedCompany.numofmfp2mv - selectedCompany.numofmfp1mv} MFs
                    </div>
                    <div className="text-sm text-black">
                      {selectedCompany.numofmfp2mv > selectedCompany.numofmfp1mv ? 'Gaining interest' :
                       selectedCompany.numofmfp2mv < selectedCompany.numofmfp1mv ? 'Losing interest' : 'No change'}
                    </div>
                  </div>
                </div>
              </div>

                  {/* External Links */}
                  {selectedCompany.nseSymbol && (
                    <div className="flex items-center gap-3 pt-2">
                      <a
                        href={`https://www.nseindia.com/get-quote/equity/${selectedCompany.nseSymbol}/${selectedCompany.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200"
                      >
                        View on NSE India
                      </a>
                      <a
                        href={`https://finance.yahoo.com/quote/${selectedCompany.nseSymbol}.NS`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded font-medium hover:bg-purple-200"
                      >
                        View on Yahoo Finance
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* By Mutual Fund Tab */}
              {modalTab === 'byFund' && (
                <div>
                  {perMfBreakdown.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>No per-fund data available.</p>
                      <p className="text-sm mt-1">Raw holdings data may not have been provided.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm" style={{ minWidth: '1050px' }}>
                        <thead>
                          {/* Row 1: Period headers */}
                          <tr className="border-b border-slate-300">
                            <th rowSpan={2} className="text-left py-2 px-3 font-semibold text-black align-bottom border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" style={{ minWidth: '220px' }} onClick={() => handleMfSort('fundName')}>
                              Mutual Fund{mfSortCol === 'fundName' && <span className="text-blue-600 ml-1">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th colSpan={3} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                              {p1Label || 'Previous'}
                            </th>
                            <th colSpan={3} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                              {p2Label || 'Current'}
                            </th>
                            <th colSpan={3} className="text-center py-2 px-2 font-semibold text-black">
                              Change
                            </th>
                          </tr>
                          {/* Row 2: Metric headers - all sortable */}
                          <tr className="border-b-2 border-black">
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('qtyP1')}>
                              Qty{mfSortCol === 'qtyP1' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvP1')}>
                              MV{mfSortCol === 'mvP1' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" title="Stock's market value as % of fund's total AUM" onClick={() => handleMfSort('compP1')}>
                              Comp%{mfSortCol === 'compP1' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('qtyP2')}>
                              Qty{mfSortCol === 'qtyP2' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvP2')}>
                              MV{mfSortCol === 'mvP2' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" title="Stock's market value as % of fund's total AUM" onClick={() => handleMfSort('compP2')}>
                              Comp%{mfSortCol === 'compP2' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('qtyChange')}>
                              Qty Δ%{mfSortCol === 'qtyChange' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvChange')}>
                              MV Δ%{mfSortCol === 'mvChange' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                            <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" title={`Change in composition percentage (${p2Month} Comp% − ${p1Month} Comp%)`} onClick={() => handleMfSort('compDelta')}>
                              Comp Δ{mfSortCol === 'compDelta' && <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPerMfBreakdown.map((fund, idx) => {
                            const isExpandable = fundInstrumentBreakdown.has(fund.fundCode);
                            const isExpanded = expandedFunds.has(fund.fundCode);
                            const subRows = isExpanded ? fundInstrumentBreakdown.get(fund.fundCode) : undefined;
                            return (
                            <Fragment key={fund.fundCode}>
                            <tr className={`border-b border-gray-200 hover:bg-gray-50 ${isExpandable ? 'cursor-pointer' : ''}`}
                              onClick={isExpandable ? () => toggleFundExpand(fund.fundCode) : undefined}
                            >
                              <td className="py-1.5 px-3 text-black border-r border-slate-200">
                                <span className="whitespace-nowrap flex items-center gap-1">
                                  {isExpandable && (
                                    isExpanded
                                      ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                  )}
                                  {fund.fundName}
                                </span>
                              </td>
                              {/* P1: Qty, MV, Comp% */}
                              <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                                {fund.qtyP1.toLocaleString('en-IN')}
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                                ₹{(fund.mvP1 / 100).toFixed(0)} Cr
                              </td>
                              <td
                                className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                                title={`${selectedCompany?.name || 'Stock'} MV (₹${(fund.mvP1 / 100).toFixed(0)} Cr) ÷ ${fund.fundName} total AUM (₹${(fund.fundAumP1 / 100).toFixed(0)} Cr)`}
                              >
                                {fund.compP1.toFixed(2)}%
                              </td>
                              {/* P2: Qty, MV, Comp% */}
                              <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                                {fund.qtyP2.toLocaleString('en-IN')}
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                                ₹{(fund.mvP2 / 100).toFixed(0)} Cr
                              </td>
                              <td
                                className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                                title={`${selectedCompany?.name || 'Stock'} MV (₹${(fund.mvP2 / 100).toFixed(0)} Cr) ÷ ${fund.fundName} total AUM (₹${(fund.fundAumP2 / 100).toFixed(0)} Cr)`}
                              >
                                {fund.compP2.toFixed(2)}%
                              </td>
                              {/* Changes */}
                              <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${fund.qtyChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : fund.qtyChange >= 0 ? `+${fund.qtyChange.toFixed(1)}%` : `(${Math.abs(fund.qtyChange).toFixed(1)}%)`}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${fund.mvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : fund.mvChange >= 0 ? `+${fund.mvChange.toFixed(1)}%` : `(${Math.abs(fund.mvChange).toFixed(1)}%)`}
                              </td>
                              {/* Comp% delta: direct difference */}
                              <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${
                                fund.isNew || fund.isExit
                                  ? fund.isNew ? 'text-teal-700' : 'text-red-600'
                                  : (fund.compP2 - fund.compP1) >= 0 ? 'text-teal-700' : 'text-red-600'
                              }`}>
                                {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : (() => {
                                  const delta = fund.compP2 - fund.compP1;
                                  return delta >= 0 ? `+${delta.toFixed(2)}%` : `(${Math.abs(delta).toFixed(2)}%)`;
                                })()}
                              </td>
                            </tr>
                            {/* Expanded sub-rows */}
                            {isExpanded && subRows && subRows.map((row, si) => {
                              const qtyChg = row.qtyP1 > 0 ? ((row.qtyP2 - row.qtyP1) / row.qtyP1) * 100 : (row.qtyP2 > 0 ? 100 : 0);
                              const mvChg = row.mvP1 > 0 ? ((row.mvP2 - row.mvP1) / row.mvP1) * 100 : (row.mvP2 > 0 ? 100 : 0);
                              const compDelta = row.compP2 - row.compP1;
                              const isSubNew = row.mvP1 === 0 && row.mvP2 > 0;
                              const isSubExit = row.mvP1 > 0 && row.mvP2 === 0;
                              return (
                                <tr key={`${fund.fundCode}-sub-${si}`} className="border-b border-slate-200 bg-emerald-100/70">
                                  <td className="py-2 px-3 text-black border-r border-slate-200">
                                    <span className="whitespace-nowrap pl-5">{row.originalName || '—'}</span>
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                                    {row.qtyP1.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                                    ₹{(row.mvP1 / 100).toFixed(0)} Cr
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                                    {row.compP1.toFixed(2)}%
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                                    {row.qtyP2.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                                    ₹{(row.mvP2 / 100).toFixed(0)} Cr
                                  </td>
                                  <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                                    {row.compP2.toFixed(2)}%
                                  </td>
                                  <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${qtyChg >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                    {isSubNew ? 'NEW' : isSubExit ? 'EXIT' : qtyChg >= 0 ? `+${qtyChg.toFixed(1)}%` : `(${Math.abs(qtyChg).toFixed(1)}%)`}
                                  </td>
                                  <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${mvChg >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                    {isSubNew ? 'NEW' : isSubExit ? 'EXIT' : mvChg >= 0 ? `+${mvChg.toFixed(1)}%` : `(${Math.abs(mvChg).toFixed(1)}%)`}
                                  </td>
                                  <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                                    isSubNew || isSubExit
                                      ? isSubNew ? 'text-teal-700' : 'text-red-600'
                                      : compDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                                  }`}>
                                    {isSubNew ? 'NEW' : isSubExit ? 'EXIT' : compDelta >= 0 ? `+${compDelta.toFixed(2)}%` : `(${Math.abs(compDelta).toFixed(2)}%)`}
                                  </td>
                                </tr>
                              );
                            })}
                            </Fragment>
                            );
                          })}
                        </tbody>
                        {/* Totals row */}
                        <tfoot>
                          <tr className="border-t-2 border-black">
                            <td className="py-1.5 px-3 text-black font-semibold border-r border-slate-200">Total</td>
                            {/* P1 Totals */}
                            <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                              {perMfBreakdown.reduce((sum, f) => sum + f.qtyP1, 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                              ₹{(perMfBreakdown.reduce((sum, f) => sum + f.mvP1, 0) / 100).toFixed(0)} Cr
                            </td>
                            <td
                              className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                              title="Overall portfolio composition (stock's total MV across all funds / total portfolio value)"
                            >
                              {((selectedCompany?.['mktvalp1%'] || 0) * 100).toFixed(2)}%
                            </td>
                            {/* P2 Totals */}
                            <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                              {perMfBreakdown.reduce((sum, f) => sum + f.qtyP2, 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                              ₹{(perMfBreakdown.reduce((sum, f) => sum + f.mvP2, 0) / 100).toFixed(0)} Cr
                            </td>
                            <td
                              className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                              title="Overall portfolio composition (stock's total MV across all funds / total portfolio value)"
                            >
                              {((selectedCompany?.['mktvalp2%'] || 0) * 100).toFixed(2)}%
                            </td>
                            {/* Change placeholders */}
                            <td className="py-1.5 px-2 text-right text-black font-mono">—</td>
                            <td className="py-1.5 px-2 text-right text-black font-mono">—</td>
                            {/* Comp% delta for totals: overall portfolio comp change */}
                            {(() => {
                              const totalCompP1 = (selectedCompany?.['mktvalp1%'] || 0) * 100;
                              const totalCompP2 = (selectedCompany?.['mktvalp2%'] || 0) * 100;
                              const delta = totalCompP2 - totalCompP1;
                              return (
                                <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${delta >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                  {delta >= 0 ? `+${delta.toFixed(2)}%` : `(${Math.abs(delta).toFixed(2)}%)`}
                                </td>
                              );
                            })()}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ISIN Mapping Tab */}
              {modalTab === 'isinMapping' && selectedCompany && (
                <div>
                  {isinFundGroups.length === 0 ? (
                    <p className="text-black text-base py-4">No mapping details available.</p>
                  ) : (() => {
                    const grandTotalP1 = isinFundGroups.reduce((sum, g) => sum + g.totalP1, 0);
                    const grandTotalP2 = isinFundGroups.reduce((sum, g) => sum + g.totalP2, 0);
                    const totalItems = isinFundGroups.reduce((sum, g) => sum + g.rows.length, 0);
                    const allCategories = new Set<string>();
                    isinFundGroups.forEach(g => g.rows.forEach(r => { if (r.category) allCategories.add(r.category); }));
                    const CATEGORY_LABELS: Record<string, string> = {
                      'CD_AGGREGATE': 'CD (Certificate of Deposit)', 'CP_AGGREGATE': 'CP (Commercial Paper)',
                      'TBILL_AGGREGATE': 'GOI T-Bill', 'GSEC_AGGREGATE': 'GOI G-Sec',
                      'CORPORATE_ACTION': 'Corporate Action', 'CASH_AGGREGATE': 'Cash & Others',
                    };
                    const categoryLabel = allCategories.size === 1
                      ? (CATEGORY_LABELS[[...allCategories][0]] || [...allCategories][0])
                      : allCategories.size > 1 ? 'Multiple Types' : '';
                    const fmtLakhs = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L`;
                    const fmtCrores = (l: number) => `₹${(l / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;

                    return (
                      <>
                        {/* Mapped ISIN + category badge */}
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-sm text-black">Mapped ISIN: <span className="font-mono">{selectedCompany.isin}</span></span>
                          {categoryLabel && (
                            <span className="inline-block px-2 py-1 text-sm font-medium text-black bg-gray-100 border border-gray-300">
                              {categoryLabel}
                            </span>
                          )}
                          <span className="text-sm text-black">
                            {isinFundGroups.length} fund{isinFundGroups.length !== 1 ? 's' : ''}, {totalItems} item{totalItems !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm" style={{ minWidth: '700px' }}>
                            <thead>
                              <tr className="border-b-2 border-black">
                                <th className="text-left py-2 px-3 font-bold text-black">Original Name</th>
                                <th className="text-left py-2 px-3 font-bold text-black">Original ISIN</th>
                                <th className="text-right py-2 px-3 font-bold text-black whitespace-nowrap">{p1Label}</th>
                                <th className="text-right py-2 px-3 font-bold text-black whitespace-nowrap">{p2Label}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {isinFundGroups.map((group) => (
                                <Fragment key={group.fundCode}>
                                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                                    <td colSpan={4} className="py-2 px-3 font-semibold text-black">
                                      {group.fundName}
                                    </td>
                                  </tr>
                                  {group.rows.map((row, idx) => (
                                    <tr key={`${group.fundCode}-${row.isinOriginal}-${idx}`} className="border-b border-gray-200">
                                      <td className="py-2 px-3 text-black" title={row.originalName}>
                                        {row.originalName || '—'}
                                      </td>
                                      <td className="py-2 px-3 text-black font-mono">
                                        {row.isinOriginal || '—'}
                                      </td>
                                      <td className="py-2 px-3 text-black text-right font-medium whitespace-nowrap">
                                        {row.mvP1 > 0 ? fmtLakhs(row.mvP1) : '—'}
                                      </td>
                                      <td className="py-2 px-3 text-black text-right font-medium whitespace-nowrap">
                                        {row.mvP2 > 0 ? fmtLakhs(row.mvP2) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                  {group.rows.length > 1 && (
                                    <tr className="border-b border-slate-300 bg-slate-50">
                                      <td colSpan={2} className="py-1.5 px-3 text-xs font-medium text-black">
                                        Subtotal ({group.rows.length} items)
                                      </td>
                                      <td className="py-1.5 px-3 text-xs text-black text-right font-medium whitespace-nowrap">
                                        {group.totalP1 > 0 ? fmtLakhs(group.totalP1) : '—'}
                                      </td>
                                      <td className="py-1.5 px-3 text-xs text-black text-right font-medium whitespace-nowrap">
                                        {group.totalP2 > 0 ? fmtLakhs(group.totalP2) : '—'}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-black bg-gray-50">
                                <td colSpan={2} className="py-2 px-3 font-bold text-black">
                                  Grand Total ({totalItems} items)
                                </td>
                                <td className="py-2 px-3 font-bold text-black text-right whitespace-nowrap">
                                  {grandTotalP1 > 0 ? <>{fmtLakhs(grandTotalP1)} <span className="font-normal text-xs">({fmtCrores(grandTotalP1)})</span></> : '—'}
                                </td>
                                <td className="py-2 px-3 font-bold text-black text-right whitespace-nowrap">
                                  {grandTotalP2 > 0 ? <>{fmtLakhs(grandTotalP2)} <span className="font-normal text-xs">({fmtCrores(grandTotalP2)})</span></> : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Reason note */}
                        {(() => {
                          const allDetails = [...(selectedCompany.mappingDetailsP1 || []), ...(selectedCompany.mappingDetailsP2 || [])];
                          const reason = allDetails.find(d => d.reason)?.reason;
                          if (!reason) return null;
                          return (
                            <div className="mt-4 p-3 bg-gray-50 border border-gray-200">
                              <p className="text-sm text-black">
                                <span className="font-medium">Reason:</span> {reason}
                              </p>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Definitions Modal (tabbed) */}
      {filterInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[45] p-4" onClick={() => setFilterInfoModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">Definitions</h3>
              <button onClick={() => setFilterInfoModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex-shrink-0 flex border-b border-gray-200 px-4">
              {([['all', 'All Holdings'], ['new', 'New Entries'], ['exits', 'Exits'], ['isin', 'ISIN Mapped']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilterInfoTab(key)}
                  className={`px-4 py-2 text-base font-semibold border-b-2 ${
                    filterInfoTab === key
                      ? 'text-black border-black'
                      : 'text-gray-500 border-transparent hover:text-black hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {filterInfoTab === 'all' && (
                <>
                  <p className="text-base text-black">
                    Every company held by the selected funds across both periods. This includes new entries, exits, and continuing holdings combined.
                  </p>
                  <div className="bg-sky-50 border border-sky-200 rounded p-3">
                    <p className="text-base text-black">Total count = New Entries + Exits + Continuing Holdings. Use the other filters to narrow down to a specific category.</p>
                  </div>
                </>
              )}

              {filterInfoTab === 'new' && (
                <>
                  <p className="text-base text-black">
                    Stocks that were not held by any of the selected funds in the previous period, but are now held by at least one fund in the current period.
                  </p>
                  <div>
                    <div className="text-base font-semibold text-black mb-2">Example</div>
                    <table className="w-full text-base border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Stock</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Previous</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Current</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Counted as</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="py-1.5 px-2 text-base text-black font-medium">Zomato</td>
                          <td className="py-1.5 px-2 text-base text-black">0 funds held it</td>
                          <td className="py-1.5 px-2 text-base text-black">3 funds hold it</td>
                          <td className="py-1.5 px-2 text-base text-black">New Entry</td>
                        </tr>
                        <tr className="border-b border-gray-100">
                          <td className="py-1.5 px-2 text-base text-black font-medium">HDFC Bank</td>
                          <td className="py-1.5 px-2 text-base text-black">2 funds held it</td>
                          <td className="py-1.5 px-2 text-base text-black">4 funds hold it</td>
                          <td className="py-1.5 px-2 text-base text-black">Not a New Entry</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-sky-50 border border-sky-200 rounded p-3">
                    <p className="text-base text-black">Different from More MFs (shown in cards above): New Entries are stocks appearing for the first time. More MFs only counts stocks that were already held but gained additional funds.</p>
                  </div>
                </>
              )}

              {filterInfoTab === 'exits' && (
                <>
                  <p className="text-base text-black">
                    Stocks that were held by at least one of the selected funds in the previous period, but are no longer held by any fund in the current period.
                  </p>
                  <div>
                    <div className="text-base font-semibold text-black mb-2">Example</div>
                    <table className="w-full text-base border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Stock</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Previous</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Current</th>
                          <th className="py-1.5 px-2 text-left font-semibold text-black text-base">Counted as</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="py-1.5 px-2 text-base text-black font-medium">Tata Motors</td>
                          <td className="py-1.5 px-2 text-base text-black">2 funds held it</td>
                          <td className="py-1.5 px-2 text-base text-black">0 funds hold it</td>
                          <td className="py-1.5 px-2 text-base text-black">Exit</td>
                        </tr>
                        <tr className="border-b border-gray-100">
                          <td className="py-1.5 px-2 text-base text-black font-medium">ICICI Bank</td>
                          <td className="py-1.5 px-2 text-base text-black">5 funds held it</td>
                          <td className="py-1.5 px-2 text-base text-black">3 funds hold it</td>
                          <td className="py-1.5 px-2 text-base text-black">Not an Exit</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-sky-50 border border-sky-200 rounded p-3">
                    <p className="text-base text-black">Different from Fewer MFs (shown in cards above): Exits are stocks completely removed from all funds. Fewer MFs only counts stocks that are still held but by fewer funds.</p>
                  </div>
                </>
              )}

              {filterInfoTab === 'isin' && (
                <>
                  <p className="text-base text-black">
                    Holdings where multiple ISINs have been merged into a single entry for accurate comparison. Without this, the same security would appear as separate rows with incorrect change calculations.
                  </p>
                  <div className="space-y-3">
                    <div className="text-base font-semibold text-black">Categories of ISIN Mappings</div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Certificates of Deposit (CDs)</div>
                      <p className="text-base text-black mt-1">Multiple CD series from the same bank are merged into one entry.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        INE238AD6AE9, INE238AD6AM2, ... (8 CDs) → "AXIS BANK CD"
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Commercial Papers (CPs)</div>
                      <p className="text-base text-black mt-1">Multiple CPs from the same issuer are merged into one entry.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        INE296A14A32, INE296A14A40, ... (4 CPs) → "BAJAJ FINANCE 365D CP"
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Treasury Bills (T-Bills)</div>
                      <p className="text-base text-black mt-1">All GOI Treasury Bills across different maturities are merged into a single entry.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        IN002024Z305, IN002025X158, ... → "GOI T-BILL"
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Government Securities (G-Secs)</div>
                      <p className="text-base text-black mt-1">GOI dated bonds with different coupon rates and maturities are merged.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        IN0020220037, IN0020230101, ... → "GOI G-SEC"
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Corporate Actions</div>
                      <p className="text-base text-black mt-1">When a company issues a new ISIN due to bonus, rights issue, or stock split, old and new ISINs are linked.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        BEML: INE258A01016 → INE258A01024 (after bonus issue)
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Cash & Blank ISINs</div>
                      <p className="text-base text-black mt-1">Cash holdings, TREPS, reverse repos, and items with blank ISINs are grouped per fund under a synthetic identifier.</p>
                    </div>
                  </div>

                  <div className="bg-sky-50 border border-sky-200 rounded p-3">
                    <p className="text-base text-black">For full ISIN mapping details with every individual ISIN, see the{' '}
                      {onIsinRemapsClick ? (
                        <button onClick={() => { setFilterInfoModal(null); onIsinRemapsClick(); }} className="font-semibold text-blue-700 underline hover:text-blue-900">ISIN Remaps</button>
                      ) : (
                        <span className="font-semibold">ISIN Remaps</span>
                      )} tab.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Column Definitions Modal (single tab) */}
      {showColumnDefs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[45] p-4" onClick={() => setShowColumnDefs(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">Column Definitions</h3>
              <button onClick={() => setShowColumnDefs(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-base">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">{p2Label}</td>
                    <td className="py-2.5 text-black">Stock's share of total portfolio value in {p2Label}. E.g., 4.5% means this stock is 4.5% of combined AUM.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">{p1Label}</td>
                    <td className="py-2.5 text-black">Stock's share of total portfolio value in {p1Label}. E.g., 3.8% means this stock was 3.8% of combined AUM.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">Comp &Delta;%</td>
                    <td className="py-2.5 text-black">Change in portfolio composition. If a stock was 3.8% and is now 4.5%, the change is +0.7 percentage points.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">MV &Delta;%</td>
                    <td className="py-2.5 text-black">Market Value change %. If MFs held &#8377;100 Cr earlier and now hold &#8377;120 Cr, this shows +20%.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">Qty &Delta;%</td>
                    <td className="py-2.5 text-black">Quantity change %. If MFs held 1 lakh shares earlier and now hold 1.1 lakh, this shows +10%.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-semibold text-black whitespace-nowrap align-top">MFs &Delta;</td>
                    <td className="py-2.5 text-black">Change in number of MFs holding this stock. +2 means 2 more MFs now hold it compared to before.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
