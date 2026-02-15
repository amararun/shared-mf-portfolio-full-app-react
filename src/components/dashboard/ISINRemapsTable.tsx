/**
 * ISINRemapsTable - Display ISIN mapping/remapping results from database
 * Shows corporate actions, CD/CP aggregation, T-Bill and G-Sec mappings
 * Also shows synthetic ISIN assignments for items without valid ISINs
 * Features:
 * - Toggle between ISIN Remaps and Synthetic ISINs
 * - Toggle between Mappings Only and Holdings Detail view
 * - Pagination, search, category filter
 * - Sort by market value in Holdings Detail view
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, ArrowUpDown } from 'lucide-react';
import {
  getISINRemapsMappings,
  getISINRemapsHoldings,
  getSyntheticISINMappings,
  getSyntheticISINHoldings,
  type ISINRemapMapping,
  type ISINRemapHolding,
  type SyntheticISINMapping,
  type SyntheticISINHolding,
} from '@/services/portfolioDb';

type DataSource = 'remaps' | 'synthetic';
type ViewMode = 'mappings' | 'holdings';

interface CategorySummary {
  category: string;
  count: number;
}

export const ISINRemapsTable = () => {
  // Data state
  const [remapsMappings, setRemapsMappings] = useState<ISINRemapMapping[]>([]);
  const [remapsHoldings, setRemapsHoldings] = useState<ISINRemapHolding[]>([]);
  const [syntheticMappings, setSyntheticMappings] = useState<SyntheticISINMapping[]>([]);
  const [syntheticHoldings, setSyntheticHoldings] = useState<SyntheticISINHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View toggles
  const [dataSource, setDataSource] = useState<DataSource>('remaps');
  const [viewMode, setViewMode] = useState<ViewMode>('mappings');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFund, setSelectedFund] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Sort state for holdings view
  const [sortByValue, setSortByValue] = useState<'desc' | 'asc'>('desc');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [remapsMap, remapsHold, synthMap, synthHold] = await Promise.all([
          getISINRemapsMappings(),
          getISINRemapsHoldings(),
          getSyntheticISINMappings(),
          getSyntheticISINHoldings(),
        ]);
        setRemapsMappings(remapsMap);
        setRemapsHoldings(remapsHold);
        setSyntheticMappings(synthMap);
        setSyntheticHoldings(synthHold);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Handle keyboard events for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchTerm) {
        setSearchTerm('');
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm]);

  // Reset filters when data source or view mode changes
  useEffect(() => {
    setCurrentPage(0);
    setSelectedCategory('all');
    setSelectedFund('all');
    setSelectedMonth('all');
    setSearchTerm('');
  }, [dataSource, viewMode]);

  // Get current data based on source and view mode
  const currentData = useMemo(() => {
    if (dataSource === 'remaps') {
      return viewMode === 'mappings' ? remapsMappings : remapsHoldings;
    } else {
      return viewMode === 'mappings' ? syntheticMappings : syntheticHoldings;
    }
  }, [dataSource, viewMode, remapsMappings, remapsHoldings, syntheticMappings, syntheticHoldings]);

  // Get category field name based on data source
  const getCategoryField = (row: unknown): string => {
    if (dataSource === 'remaps') {
      return (row as ISINRemapMapping | ISINRemapHolding).mapping_category || '';
    } else {
      return (row as SyntheticISINMapping).category || '';
    }
  };

  // Get unique categories for filter dropdown
  const availableCategories = useMemo(() => {
    const categories = [...new Set(currentData.map(row => getCategoryField(row)))];
    return categories.filter(c => c).sort();
  }, [currentData, dataSource]);

  // Get unique funds for holdings view filter
  const availableFunds = useMemo(() => {
    if (viewMode === 'mappings') return [];
    const holdings = dataSource === 'remaps' ? remapsHoldings : syntheticHoldings;
    return [...new Set(holdings.map(h => h.scheme_name))].sort();
  }, [viewMode, dataSource, remapsHoldings, syntheticHoldings]);

  // Get unique months for holdings view filter
  const availableMonths = useMemo(() => {
    if (viewMode === 'mappings') return [];
    const holdings = dataSource === 'remaps' ? remapsHoldings : syntheticHoldings;
    return [...new Set(holdings.map(h => h.month_end))].sort().reverse();
  }, [viewMode, dataSource, remapsHoldings, syntheticHoldings]);

  // Category summary counts
  const categorySummary = useMemo((): CategorySummary[] => {
    const counts: Record<string, number> = {};
    currentData.forEach(row => {
      const cat = getCategoryField(row);
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }, [currentData, dataSource]);

  // Filter data based on search, category, fund, month
  const filteredData = useMemo(() => {
    return currentData.filter(row => {
      const searchLower = searchTerm.toLowerCase();

      // Search across relevant fields (minimum 2 characters)
      let matchesSearch = searchTerm.length < 2;
      if (!matchesSearch) {
        if (dataSource === 'remaps') {
          const r = row as ISINRemapMapping | ISINRemapHolding;
          matchesSearch =
            r.isin_original?.toLowerCase().includes(searchLower) ||
            r.isin_mapped?.toLowerCase().includes(searchLower) ||
            r.name_mapped?.toLowerCase().includes(searchLower) ||
            r.mapping_reason?.toLowerCase().includes(searchLower);
        } else {
          const r = row as SyntheticISINMapping | SyntheticISINHolding;
          matchesSearch =
            r.isin_original?.toLowerCase().includes(searchLower) ||
            r.instrument_name?.toLowerCase().includes(searchLower);
        }
      }

      // Category filter
      const matchesCategory = selectedCategory === 'all' || getCategoryField(row) === selectedCategory;

      // Fund filter (holdings only)
      let matchesFund = true;
      if (viewMode === 'holdings' && selectedFund !== 'all') {
        matchesFund = (row as ISINRemapHolding | SyntheticISINHolding).scheme_name === selectedFund;
      }

      // Month filter (holdings only)
      let matchesMonth = true;
      if (viewMode === 'holdings' && selectedMonth !== 'all') {
        matchesMonth = (row as ISINRemapHolding | SyntheticISINHolding).month_end === selectedMonth;
      }

      return matchesSearch && matchesCategory && matchesFund && matchesMonth;
    });
  }, [currentData, searchTerm, selectedCategory, selectedFund, selectedMonth, dataSource, viewMode]);

  // Sort data (for holdings view, sort by market value)
  const sortedData = useMemo(() => {
    if (viewMode === 'mappings') return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = (a as ISINRemapHolding | SyntheticISINHolding).market_value || 0;
      const bVal = (b as ISINRemapHolding | SyntheticISINHolding).market_value || 0;
      return sortByValue === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [filteredData, viewMode, sortByValue]);

  // Pagination calculations
  const totalPages = pageSize === 0 ? 1 : Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (pageSize === 0) return sortedData;
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, selectedCategory, selectedFund, selectedMonth, pageSize, sortByValue]);

  // Format category for display
  const formatCategory = (cat: string) => cat.replace(/_/g, ' ');

  // Format number in Indian format
  const formatNumber = (num: number) => num.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // Calculate total market value for holdings
  const totalMarketValue = useMemo(() => {
    if (viewMode === 'mappings') return 0;
    return filteredData.reduce((sum, row) => {
      return sum + ((row as ISINRemapHolding | SyntheticISINHolding).market_value || 0);
    }, 0);
  }, [filteredData, viewMode]);

  if (loading) {
    return <div className="p-8 text-center text-black">Loading ISIN mapping data...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">Error: {error}</div>;
  }

  return (
    <div className="bg-white border border-black rounded-lg overflow-hidden">
      {/* Data Source Toggle */}
      <div className="flex border-b border-black">
        <button
          onClick={() => setDataSource('remaps')}
          className={`flex-1 px-4 py-2 text-sm font-bold transition-colors ${
            dataSource === 'remaps'
              ? 'bg-gray-100 text-black border-b-2 border-black'
              : 'bg-white text-black hover:bg-gray-50'
          }`}
        >
          ISIN Remaps ({remapsMappings.length})
        </button>
        <button
          onClick={() => setDataSource('synthetic')}
          className={`flex-1 px-4 py-2 text-sm font-bold transition-colors ${
            dataSource === 'synthetic'
              ? 'bg-gray-100 text-black border-b-2 border-black'
              : 'bg-white text-black hover:bg-gray-50'
          }`}
        >
          Synthetic ISINs ({syntheticMappings.length})
        </button>
      </div>

      {/* Summary Header */}
      <div className="p-4 border-b border-black bg-gray-50">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-lg font-bold text-black">
            {dataSource === 'remaps' ? 'ISIN Remapping' : 'Synthetic ISIN Assignments'}
          </h3>
          {/* View Mode Toggle */}
          <div className="flex border border-gray-400 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('mappings')}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'mappings'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              Mappings Only
            </button>
            <button
              onClick={() => setViewMode('holdings')}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'holdings'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              Holdings Detail
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {categorySummary.map(({ category, count }) => (
            <div key={category} className="flex items-center gap-2">
              <span className="font-medium text-black">{formatCategory(category)}:</span>
              <span className="text-black">{count}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 ml-4 border-l border-gray-400 pl-4">
            <span className="font-bold text-black">Total:</span>
            <span className="font-bold text-black">{currentData.length}</span>
          </div>
          {viewMode === 'holdings' && (
            <div className="flex items-center gap-2 ml-4 border-l border-gray-400 pl-4">
              <span className="font-bold text-black">Total MV:</span>
              <span className="font-bold text-black">₹{formatNumber(totalMarketValue)} L</span>
            </div>
          )}
        </div>
        <p className="text-sm text-black mt-2">
          {dataSource === 'remaps'
            ? viewMode === 'mappings'
              ? 'Distinct ISIN mappings for corporate actions, CDs, CPs, T-Bills, and G-Secs.'
              : 'All holdings where ISIN remapping was applied, with fund, month, and market value.'
            : viewMode === 'mappings'
              ? 'Items without valid Indian ISINs, assigned synthetic ISIN IN9999999999.'
              : 'All holdings with synthetic ISIN, with fund, month, and market value.'
          }
        </p>
      </div>

      {/* Controls Bar */}
      <div className="p-3 border-b border-gray-300 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by ISIN or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 px-3 pr-8 text-sm border-2 border-blue-300 rounded-lg bg-blue-50/50 text-black placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                title="Clear (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
            >
              <option value="all">All</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{formatCategory(cat)}</option>
              ))}
            </select>
          </div>

          {/* Fund Filter (holdings only) */}
          {viewMode === 'holdings' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-black">Fund:</label>
              <select
                value={selectedFund}
                onChange={(e) => setSelectedFund(e.target.value)}
                className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
              >
                <option value="all">All</option>
                {availableFunds.map(fund => (
                  <option key={fund} value={fund}>{fund}</option>
                ))}
              </select>
            </div>
          )}

          {/* Month Filter (holdings only) */}
          {viewMode === 'holdings' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-black">Month:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
              >
                <option value="all">All</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>
          )}

          {/* Page Size */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={0}>All</option>
            </select>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-sm font-medium text-black mr-2">
              {sortedData.length === 0 ? '0' : `${currentPage * pageSize + 1}-${Math.min((currentPage + 1) * pageSize, sortedData.length)}`} of {sortedData.length}
            </span>
            <button
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              className="h-8 w-8 flex items-center justify-center border border-gray-400 rounded text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="h-8 w-8 flex items-center justify-center border border-gray-400 rounded text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 flex items-center justify-center border border-gray-400 rounded text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 flex items-center justify-center border border-gray-400 rounded text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ minHeight: '480px' }}>
        {viewMode === 'mappings' ? (
          // Mappings Only View
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-100 border-b border-black">
              <tr>
                <th className="w-[14%] px-3 py-2 text-left font-bold text-black">Original ISIN</th>
                <th className="w-[12%] px-3 py-2 text-left font-bold text-black">Mapped ISIN</th>
                <th className="w-[30%] px-3 py-2 text-left font-bold text-black">Name</th>
                <th className="w-[14%] px-3 py-2 text-left font-bold text-black">Category</th>
                <th className="w-[30%] px-3 py-2 text-left font-bold text-black">
                  {dataSource === 'remaps' ? 'Reason' : 'Instrument Name'}
                </th>
              </tr>
            </thead>
            <tbody className="table-fade-in" key={`map-${searchTerm}-${selectedCategory}-${currentPage}`}>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-black">
                    No matching records found.
                  </td>
                </tr>
              ) : dataSource === 'remaps' ? (
                (paginatedData as ISINRemapMapping[]).map((row, idx) => (
                  <tr
                    key={`${row.isin_original}-${idx}`}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 text-black font-mono">{row.isin_original}</td>
                    <td className="px-3 py-2 text-black font-mono">{row.isin_mapped}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.name_mapped}>{row.name_mapped}</td>
                    <td className="px-3 py-2 text-black">{formatCategory(row.mapping_category)}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.mapping_reason}>{row.mapping_reason}</td>
                  </tr>
                ))
              ) : (
                (paginatedData as SyntheticISINMapping[]).map((row, idx) => (
                  <tr
                    key={`${row.isin_original}-${idx}`}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 text-black font-mono">{row.isin_original}</td>
                    <td className="px-3 py-2 text-black font-mono">{row.isin_assigned}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.instrument_name}>{row.instrument_name}</td>
                    <td className="px-3 py-2 text-black">{formatCategory(row.category)}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.instrument_name}>{row.instrument_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          // Holdings Detail View
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-100 border-b border-black">
              <tr>
                <th className="w-[12%] px-3 py-2 text-left font-bold text-black">Fund</th>
                <th className="w-[10%] px-3 py-2 text-left font-bold text-black">Month</th>
                <th className="w-[12%] px-3 py-2 text-left font-bold text-black">Original ISIN</th>
                <th className="w-[26%] px-3 py-2 text-left font-bold text-black">Name</th>
                <th className="w-[14%] px-3 py-2 text-left font-bold text-black">
                  {dataSource === 'remaps' ? 'Category' : 'Synthetic ISIN'}
                </th>
                <th className="w-[14%] px-3 py-2 text-right font-bold text-black">
                  <button
                    onClick={() => setSortByValue(s => s === 'desc' ? 'asc' : 'desc')}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    title="Toggle sort order"
                  >
                    MV (₹ Lakhs)
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="table-fade-in" key={`hold-${searchTerm}-${selectedCategory}-${selectedFund}-${selectedMonth}-${currentPage}`}>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-black">
                    No matching records found.
                  </td>
                </tr>
              ) : dataSource === 'remaps' ? (
                (paginatedData as ISINRemapHolding[]).map((row, idx) => (
                  <tr
                    key={`${row.scheme_name}-${row.month_end}-${row.isin_original}-${idx}`}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 text-black font-medium">{row.scheme_name}</td>
                    <td className="px-3 py-2 text-black">{row.month_end}</td>
                    <td className="px-3 py-2 text-black font-mono">{row.isin_original}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.name_mapped}>{row.name_mapped}</td>
                    <td className="px-3 py-2 text-black">{formatCategory(row.mapping_category)}</td>
                    <td className="px-3 py-2 text-right text-black font-medium">{formatNumber(row.market_value)}</td>
                  </tr>
                ))
              ) : (
                (paginatedData as SyntheticISINHolding[]).map((row, idx) => (
                  <tr
                    key={`${row.scheme_name}-${row.month_end}-${row.isin_original}-${idx}`}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 text-black font-medium">{row.scheme_name}</td>
                    <td className="px-3 py-2 text-black">{row.month_end}</td>
                    <td className="px-3 py-2 text-black font-mono">{row.isin_original}</td>
                    <td className="px-3 py-2 text-black truncate" title={row.instrument_name}>{row.instrument_name}</td>
                    <td className="px-3 py-2 text-black font-mono">{row.isin_assigned}</td>
                    <td className="px-3 py-2 text-right text-black font-medium">{formatNumber(row.market_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
