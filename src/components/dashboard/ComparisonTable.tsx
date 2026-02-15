/**
 * Comparison Table Component
 * Interactive table with sorting and filtering - styled like Holdings Analysis.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, ChevronRight, ChevronLeft, ChevronDown, X } from 'lucide-react';
import type { ComparisonCompany } from '@/lib/portfolio/aggregation';
import { buildComparisonData } from '@/lib/portfolio/aggregation';
import type { HoldingRecord } from '@/services/portfolioDb';
import { isDebtGroupRow, groupDebtInstruments } from '@/lib/portfolio/debtGrouping';

interface ComparisonTableProps {
  data: ComparisonCompany[];
  p1Label: string;
  p2Label: string;
  onCompanyClick?: (company: ComparisonCompany) => void;
  onIsinRemapsClick?: () => void;
  rawHoldingsP1?: HoldingRecord[];
  rawHoldingsP2?: HoldingRecord[];
  funds?: Array<{ code: string; displayName: string }>;
}

type FilterType = 'all' | 'new-entries' | 'exits' | 'isin';
type SortCol = 'name' | 'mvp2' | 'mvp1' | 'mvChg' | 'qtyChg' | 'mfp2' | 'mfp1' | 'mfDelta' | 'valp2' | 'valp1' | 'rawqtyp2' | 'rawqtyp1';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export const ComparisonTable = ({ data, p1Label, p2Label, onCompanyClick, onIsinRemapsClick, rawHoldingsP1 = [], rawHoldingsP2 = [], funds = [] }: ComparisonTableProps) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortCol, setSortCol] = useState<SortCol>('mvp2');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [showMvColumns, setShowMvColumns] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter info modal state
  const [filterInfoModal, setFilterInfoModal] = useState<'all' | 'new' | 'exits' | 'isin' | null>(null);
  const [filterInfoTab, setFilterInfoTab] = useState<'all' | 'new' | 'exits' | 'isin'>('all');
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
  const filteredData = useMemo(() => {
    if (selectedFundCodes.length === 0) return data;
    const fP1 = rawHoldingsP1.filter(h => selectedFundCodes.includes(h.scheme_name));
    const fP2 = rawHoldingsP2.filter(h => selectedFundCodes.includes(h.scheme_name));
    const rebuilt = buildComparisonData(fP1, fP2);
    return groupDebtInstruments(rebuilt).groupedData;
  }, [data, rawHoldingsP1, rawHoldingsP2, selectedFundCodes]);

  // Fund filter helpers
  const isAllFundsSelected = selectedFundCodes.length === 0;
  const toggleFund = (code: string) => {
    setSelectedFundCodes(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      return [...prev, code];
    });
    setPage(1);
  };
  const selectAllFunds = () => {
    setSelectedFundCodes([]);
    setPage(1);
  };

  // Escape key handler for filter info modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (filterInfoModal) setFilterInfoModal(null);
        if (showColumnDefs) setShowColumnDefs(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [filterInfoModal, showColumnDefs]);

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

  // Extract month/year from labels (e.g., "Dec 2025" -> { month: "Dec", year: "2025" })
  const p2Parts = p2Label.split(' ');
  const p1Parts = p1Label.split(' ');
  const p2Month = p2Parts[0] || p2Label;
  const p2Year = p2Parts[1] || '';
  const p1Month = p1Parts[0] || p1Label;
  const p1Year = p1Parts[1] || '';

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...filteredData];

    // Apply type filter
    switch (filterType) {
      case 'new-entries':
        result = result.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0);
        break;
      case 'exits':
        result = result.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0);
        break;
      case 'isin':
        result = result.filter(c => c.mappingDetailsP1 || c.mappingDetailsP2);
        break;
    }

    // Apply search filter (minimum 2 characters)
    if (searchFilter.trim().length >= 2) {
      const search = searchFilter.trim().toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(search));
    }

    // Sort
    const multiplier = sortDir === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortCol) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '') * multiplier;
        case 'mvp2':
          aVal = a['mktvalp2%']; bVal = b['mktvalp2%']; break;
        case 'mvp1':
          aVal = a['mktvalp1%']; bVal = b['mktvalp1%']; break;
        case 'mvChg':
          aVal = a['mv%change'] ?? -Infinity; bVal = b['mv%change'] ?? -Infinity; break;
        case 'qtyChg':
          aVal = a['qty%change'] ?? -Infinity; bVal = b['qty%change'] ?? -Infinity; break;
        case 'mfp2':
          aVal = a.numofmfp2mv || 0; bVal = b.numofmfp2mv || 0; break;
        case 'mfp1':
          aVal = a.numofmfp1mv || 0; bVal = b.numofmfp1mv || 0; break;
        case 'mfDelta':
          aVal = (a.numofmfp2mv || 0) - (a.numofmfp1mv || 0);
          bVal = (b.numofmfp2mv || 0) - (b.numofmfp1mv || 0);
          break;
        case 'valp2':
          aVal = a.mktvalp2; bVal = b.mktvalp2; break;
        case 'valp1':
          aVal = a.mktvalp1; bVal = b.mktvalp1; break;
        case 'rawqtyp2':
          aVal = a.qtyp2; bVal = b.qtyp2; break;
        case 'rawqtyp1':
          aVal = a.qtyp1; bVal = b.qtyp1; break;
        default:
          aVal = 0; bVal = 0;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });

    return result;
  }, [filteredData, filterType, searchFilter, sortCol, sortDir]);

  // Pagination
  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return processedData.slice(start, start + itemsPerPage);
  }, [processedData, page, itemsPerPage]);

  // Handle sort click
  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  // Copy table as tab-delimited text
  const handleCopy = useCallback(() => {
    const headers = [
      'Company', 'Status', 'NSE', 'Yahoo',
      `MV% ${p2Label}`, `MV% ${p1Label}`, 'MV% Chg', 'Qty% Chg',
      `#MF ${p2Label}`, `#MF ${p1Label}`, '#MF Δ',
      `MV ${p2Label}`, `MV ${p1Label}`,
      `Qty ${p2Label}`, `Qty ${p1Label}`,
    ];

    const dataRows = processedData.map(c => {
      const isNew = c.mktvalp1 === 0 && c.mktvalp2 > 0;
      const isExit = c.mktvalp1 > 0 && c.mktvalp2 === 0;
      const status = isNew ? 'NEW' : isExit ? 'EXIT' : '';
      const mfDelta = (c.numofmfp2mv || 0) - (c.numofmfp1mv || 0);

      return [
        c.name || c.isin,
        status,
        c.nseSymbol || '',
        c.isin || '',
        (c['mktvalp2%'] * 100).toFixed(2) + '%',
        (c['mktvalp1%'] * 100).toFixed(2) + '%',
        c['mv%change'] !== null ? (c['mv%change'] >= 0 ? '+' : '') + (c['mv%change'] * 100).toFixed(1) + '%' : 'N/A',
        c['qty%change'] !== null ? (c['qty%change'] >= 0 ? '+' : '') + (c['qty%change'] * 100).toFixed(1) + '%' : 'N/A',
        String(c.numofmfp2mv || 0),
        String(c.numofmfp1mv || 0),
        (mfDelta >= 0 ? '+' : '') + mfDelta,
        '₹' + Math.round(c.mktvalp2).toLocaleString('en-IN'),
        '₹' + Math.round(c.mktvalp1).toLocaleString('en-IN'),
        String(c.qtyp2 || 0),
        String(c.qtyp1 || 0),
      ].join('\t');
    });

    const text = [headers.join('\t'), ...dataRows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [processedData, p1Label, p2Label]);

  // Sort indicator
  const SortIndicator = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return null;
    return <span className="text-blue-600 ml-1">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-end gap-2 md:gap-3">
        {/* Fund Filter Dropdown */}
        {availableFunds.length > 1 && (
          <div className="relative" ref={fundDropdownRef}>
            <button
              onClick={() => setFundDropdownOpen(!fundDropdownOpen)}
              className={`flex items-center gap-1 h-9 px-3 text-sm font-medium rounded transition-colors whitespace-nowrap border ${
                isAllFundsSelected
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'border-blue-600 bg-blue-50 text-blue-700'
              }`}
            >
              {isAllFundsSelected
                ? `All Funds (${availableFunds.length})`
                : `${selectedFundCodes.length} of ${availableFunds.length} Funds`}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fundDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {fundDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[80] min-w-[220px] max-h-[320px] overflow-auto">
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

        {/* Quick Filters */}
        <div className="flex gap-1.5 md:gap-2 flex-wrap items-end">
          <button
            onClick={() => { setFilterType('all'); setPage(1); }}
            className={`h-9 px-3 md:px-4 text-sm md:text-base font-medium rounded transition-colors whitespace-nowrap ${
              filterType === 'all' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
            }`}
          >
            All ({filteredData.length})
          </button>
          <button
            onClick={() => { setFilterType('new-entries'); setPage(1); }}
            className={`h-9 px-3 md:px-4 text-sm md:text-base font-medium rounded transition-colors whitespace-nowrap ${
              filterType === 'new-entries' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
            }`}
          >
            New ({filteredData.filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0).length})
          </button>
          <button
            onClick={() => { setFilterType('exits'); setPage(1); }}
            className={`h-9 px-3 md:px-4 text-sm md:text-base font-medium rounded transition-colors whitespace-nowrap ${
              filterType === 'exits' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
            }`}
          >
            Exits ({filteredData.filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0).length})
          </button>
          <button
            onClick={() => { setFilterType('isin'); setPage(1); }}
            className={`h-9 px-3 md:px-4 text-sm md:text-base font-medium rounded transition-colors whitespace-nowrap ${
              filterType === 'isin' ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-900 hover:bg-blue-50'
            }`}
          >
            ISIN ({filteredData.filter(c => c.mappingDetailsP1 || c.mappingDetailsP2).length})
          </button>
        </div>

        {/* Search + Definitions ? */}
        <div className="flex items-end gap-1">
          <input
            type="text"
            placeholder="Search by company name..."
            value={searchFilter}
            onChange={(e) => { setSearchFilter(e.target.value); setPage(1); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchFilter(''); setPage(1); } }}
            className="h-9 border-2 border-blue-300 rounded-lg bg-blue-50/50 px-3 text-sm md:text-base text-black placeholder-slate-500 w-full md:w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white"
          />
          {searchFilter && (
            <button
              onClick={() => { setSearchFilter(''); setPage(1); }}
              className="h-9 px-2 text-sm font-medium rounded border border-blue-900 text-blue-900 hover:bg-blue-50 transition-colors"
              title="Clear search (Esc)"
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
        </div>

        <div className="flex items-end gap-2 md:ml-auto">
          {/* Rows per page */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-black whitespace-nowrap">Rows:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
              className="h-9 px-2 text-sm border border-slate-400 rounded text-black bg-white hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowMvColumns(!showMvColumns)}
            className="flex items-center gap-1 h-9 px-3 text-sm border border-slate-400 rounded text-slate-700 hover:bg-slate-100 transition-colors"
            title={showMvColumns ? "Hide expanded columns" : "Show Market Value & Quantity columns"}
          >
            {showMvColumns ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {showMvColumns ? 'Less' : 'More'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 h-9 px-3 text-sm border border-slate-400 rounded text-slate-700 hover:bg-slate-100 transition-colors"
            title="Copy table as tab-delimited text (paste into Excel)"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto" style={{ minHeight: '480px' }}>
          <table className={`w-full text-sm md:text-base table-fixed ${showMvColumns ? 'min-w-[1400px]' : 'min-w-[850px]'}`}>
            <colgroup>
              <col style={{ width: showMvColumns ? '15%' : '24%' }} /> {/* Company */}
              <col style={{ width: showMvColumns ? '2.5%' : '3%' }} />  {/* N */}
              <col style={{ width: showMvColumns ? '2.5%' : '3%' }} />  {/* Y */}
              <col style={{ width: showMvColumns ? '7%' : '10%' }} />  {/* MV% P2 */}
              <col style={{ width: showMvColumns ? '7%' : '10%' }} />  {/* MV% P1 */}
              <col style={{ width: showMvColumns ? '7%' : '10%' }} />  {/* MV% Chg */}
              <col style={{ width: showMvColumns ? '7%' : '10%' }} />  {/* Qty% Chg */}
              <col style={{ width: showMvColumns ? '5%' : '10%' }} />  {/* #MF P2 */}
              <col style={{ width: showMvColumns ? '5%' : '10%' }} />  {/* #MF P1 */}
              <col style={{ width: showMvColumns ? '5%' : '10%' }} />  {/* #MF Δ */}
              {showMvColumns && <col style={{ width: '9.5%' }} />} {/* MV P2 */}
              {showMvColumns && <col style={{ width: '9.5%' }} />} {/* MV P1 */}
              {showMvColumns && <col style={{ width: '9.5%' }} />} {/* Qty P2 */}
              {showMvColumns && <col style={{ width: '9.5%' }} />} {/* Qty P1 */}
            </colgroup>
            <thead>
              {/* Row 1: Main labels */}
              <tr className="border-b border-slate-200">
                <th rowSpan={2} className="py-1 px-2 text-left font-semibold text-black align-bottom">
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
                  onClick={() => handleSort('mvp2')}
                >
                  {p2Month}
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mvp1')}
                >
                  {p1Month}
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mvChg')}
                >
                  MV
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('qtyChg')}
                >
                  Qty
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfp2')}
                >
                  {p2Month}
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfp1')}
                >
                  {p1Month}
                </th>
                <th
                  className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfDelta')}
                >
                  MFs
                </th>
                {showMvColumns && (
                  <th
                    className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('valp2')}
                  >
                    {p2Month}
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('valp1')}
                  >
                    {p1Month}
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none border-l border-slate-300"
                    onClick={() => handleSort('rawqtyp2')}
                  >
                    {p2Month}
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-1 pb-0 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('rawqtyp1')}
                  >
                    {p1Month}
                  </th>
                )}
              </tr>
              {/* Row 2: Secondary labels (year + sort indicator, or group label for expanded cols) */}
              <tr className="border-b-2 border-slate-300">
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mvp2')}
                >
                  {p2Year} <SortIndicator col="mvp2" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mvp1')}
                >
                  {p1Year} <SortIndicator col="mvp1" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mvChg')}
                >
                  Δ% <SortIndicator col="mvChg" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('qtyChg')}
                >
                  Δ% <SortIndicator col="qtyChg" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfp2')}
                >
                  {p2Year} <SortIndicator col="mfp2" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfp1')}
                >
                  {p1Year} <SortIndicator col="mfp1" />
                </th>
                <th
                  className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort('mfDelta')}
                >
                  Δ <SortIndicator col="mfDelta" />
                </th>
                {showMvColumns && (
                  <th
                    className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('valp2')}
                  >
                    ₹ Cr <SortIndicator col="valp2" />
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('valp1')}
                  >
                    ₹ Cr <SortIndicator col="valp1" />
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none border-l border-slate-300"
                    onClick={() => handleSort('rawqtyp2')}
                  >
                    Qty <SortIndicator col="rawqtyp2" />
                  </th>
                )}
                {showMvColumns && (
                  <th
                    className="pt-0 pb-1 px-1 text-center font-semibold text-black cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => handleSort('rawqtyp1')}
                  >
                    Qty <SortIndicator col="rawqtyp1" />
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="table-fade-in" key={`${filterType}-${searchFilter}-${sortCol}-${sortDir}-${page}`}>
              {paginatedData.map((item, idx) => {
                const isNew = item.mktvalp1 === 0 && item.mktvalp2 > 0;
                const isExit = item.mktvalp1 > 0 && item.mktvalp2 === 0;
                const name = item.name || item.isin;
                const shortName = name.length > 22 ? name.substring(0, 22) + '...' : name;
                const mvChange = item['mv%change'] !== null ? item['mv%change'] * 100 : null;
                const qtyChange = item['qty%change'] !== null ? item['qty%change'] * 100 : null;
                const mfDelta = (item.numofmfp2mv || 0) - (item.numofmfp1mv || 0);

                return (
                  <tr
                    key={item.isin}
                    className={`border-b border-slate-200 hover:bg-slate-50 ${onCompanyClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onCompanyClick?.(item)}
                  >
                    <td className="py-2 px-2 font-medium overflow-hidden max-w-0" title={name}>
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm text-blue-700 hover:underline">{shortName}</span>
                        {isNew && (
                          <span className="px-1.5 py-0.5 text-xs font-bold text-white rounded flex-shrink-0" style={{ backgroundColor: '#5B7B7B' }}>NEW</span>
                        )}
                        {isExit && (
                          <span className="px-1.5 py-0.5 text-xs font-bold text-white rounded flex-shrink-0" style={{ backgroundColor: '#9B5555' }}>EXIT</span>
                        )}
                        {(item.mappingDetailsP1 || item.mappingDetailsP2) && (
                          <span
                            className="px-1.5 py-0.5 text-xs font-bold bg-gray-600 text-white rounded flex-shrink-0"
                            title={isDebtGroupRow(item) ? 'Debt instruments grouped' : 'ISIN mapped — click row for details'}
                          >
                            ISN
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                      {item.nseSymbol ? (
                        <a
                          href={`https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(item.nseSymbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-1.5 py-0.5 text-xs font-medium border border-slate-400 rounded text-slate-700 hover:bg-slate-100 inline-block"
                        >
                          N
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                      {item.nseSymbol ? (
                        <a
                          href={`https://finance.yahoo.com/quote/${encodeURIComponent(item.nseSymbol)}.NS`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-1.5 py-0.5 text-xs font-medium border border-slate-400 rounded text-slate-700 hover:bg-slate-100 inline-block"
                        >
                          Y
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-1 text-right text-black font-mono">
                      {(item['mktvalp2%'] * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 px-1 text-right text-black font-mono">
                      {(item['mktvalp1%'] * 100).toFixed(2)}%
                    </td>
                    <td className={`py-2 px-1 text-right font-mono ${mvChange !== null && mvChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {mvChange !== null ? `${mvChange >= 0 ? '+' : ''}${mvChange.toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className={`py-2 px-1 text-right font-mono ${qtyChange !== null && qtyChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {qtyChange !== null ? `${qtyChange >= 0 ? '+' : ''}${qtyChange.toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className="py-2 px-1 text-right text-black font-mono">
                      {isDebtGroupRow(item) ? '—' : (item.numofmfp2mv || 0)}
                    </td>
                    <td className="py-2 px-1 text-right text-black font-mono">
                      {isDebtGroupRow(item) ? '—' : (item.numofmfp1mv || 0)}
                    </td>
                    <td className={`py-2 px-1 text-right font-mono ${isDebtGroupRow(item) ? 'text-black' : mfDelta > 0 ? 'text-emerald-700' : mfDelta < 0 ? 'text-red-700' : 'text-black'}`}>
                      {isDebtGroupRow(item) ? '—' : <>{mfDelta > 0 ? '+' : ''}{mfDelta}</>}
                    </td>
                    {showMvColumns && (
                      <td className="py-2 px-1 text-right text-black font-mono whitespace-nowrap">
                        ₹{(item.mktvalp2 / 100).toFixed(0)} Cr
                      </td>
                    )}
                    {showMvColumns && (
                      <td className="py-2 px-1 text-right text-black font-mono whitespace-nowrap">
                        ₹{(item.mktvalp1 / 100).toFixed(0)} Cr
                      </td>
                    )}
                    {showMvColumns && (
                      <td className="py-2 px-1 text-right text-black font-mono whitespace-nowrap border-l border-slate-200">
                        {item.qtyp2 ? item.qtyp2.toLocaleString('en-IN') : '—'}
                      </td>
                    )}
                    {showMvColumns && (
                      <td className="py-2 px-1 text-right text-black font-mono whitespace-nowrap">
                        {item.qtyp1 ? item.qtyp1.toLocaleString('en-IN') : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50">
          <span className="text-sm text-black">
            Page {page} of {totalPages} ({processedData.length} items)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
            >
              First
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 font-medium"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      {/* Filter Definitions Modal (tabbed) */}
      {filterInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[45] p-4" onClick={() => setFilterInfoModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-black">Filter Definitions</h3>
              <button onClick={() => setFilterInfoModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              {([
                { key: 'all', label: 'All Holdings' },
                { key: 'new', label: 'New Entries' },
                { key: 'exits', label: 'Exits' },
                { key: 'isin', label: 'ISIN Mapped' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterInfoTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filterInfoTab === tab.key
                      ? 'border-b-2 border-blue-600 text-blue-700'
                      : 'text-slate-600 hover:text-black hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Content */}
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
                        INE238AD6AE9, INE238AD6AM2, ... (8 CDs) &rarr; &ldquo;AXIS BANK CD&rdquo;
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Commercial Papers (CPs)</div>
                      <p className="text-base text-black mt-1">Multiple CPs from the same issuer are merged into one entry.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        INE296A14A32, INE296A14A40, ... (4 CPs) &rarr; &ldquo;BAJAJ FINANCE 365D CP&rdquo;
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Treasury Bills (T-Bills)</div>
                      <p className="text-base text-black mt-1">All GOI Treasury Bills across different maturities are merged into a single entry.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        IN002024Z305, IN002025X158, ... &rarr; &ldquo;GOI T-BILL&rdquo;
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Government Securities (G-Secs)</div>
                      <p className="text-base text-black mt-1">GOI dated bonds with different coupon rates and maturities are merged.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        IN0020220037, IN0020230101, ... &rarr; &ldquo;GOI G-SEC&rdquo;
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Corporate Actions</div>
                      <p className="text-base text-black mt-1">When a company issues a new ISIN due to bonus, rights issue, or stock split, old and new ISINs are linked.</p>
                      <div className="mt-1 text-sm text-slate-700 bg-slate-50 rounded px-2 py-1 font-mono">
                        BEML: INE258A01016 &rarr; INE258A01024 (after bonus issue)
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3">
                      <div className="font-semibold text-black text-base">Cash &amp; Blank ISINs</div>
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

      {/* Column Definitions Modal */}
      {showColumnDefs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[45] p-4" onClick={() => setShowColumnDefs(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-black">Column Definitions</h3>
              <button onClick={() => setShowColumnDefs(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-base border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-2 px-3 text-left font-semibold text-black w-1/4">Column</th>
                    <th className="py-2 px-3 text-left font-semibold text-black">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">MV% {p2Label}</td>
                    <td className="py-2 px-3 text-black">Stock&rsquo;s share of total portfolio value in {p2Label}.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">MV% {p1Label}</td>
                    <td className="py-2 px-3 text-black">Stock&rsquo;s share of total portfolio value in {p1Label}.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">MV &Delta;%</td>
                    <td className="py-2 px-3 text-black">Market Value change %. If MFs held &#8377;100 Cr earlier and now hold &#8377;120 Cr, this shows +20%.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">Qty &Delta;%</td>
                    <td className="py-2 px-3 text-black">Quantity change %. If MFs held 1 lakh shares earlier and now hold 1.1 lakh, this shows +10%.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">#MF {p2Label}</td>
                    <td className="py-2 px-3 text-black">Number of MFs holding this stock in {p2Label}.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">#MF {p1Label}</td>
                    <td className="py-2 px-3 text-black">Number of MFs holding this stock in {p1Label}.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">MFs &Delta;</td>
                    <td className="py-2 px-3 text-black">Change in number of MFs holding this stock. +2 means 2 more MFs now hold it.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">MV &#8377; Cr (More)</td>
                    <td className="py-2 px-3 text-black">Total market value (&#8377; Crores) of this stock across all selected funds. Visible in expanded view.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-3 text-black font-medium">Qty (More)</td>
                    <td className="py-2 px-3 text-black">Total quantity (shares) of this stock across all selected funds. Visible in expanded view.</td>
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
