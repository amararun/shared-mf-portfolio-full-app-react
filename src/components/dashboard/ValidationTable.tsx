/**
 * ValidationTable - Display validation results from CSV
 * Shows comparison of database totals vs Excel grand totals
 * Features: pagination, search by fund name, month filter
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

interface ValidationRow {
  fund_code: string;
  month_end: string;
  excel_grand_total: number;
  db_total: number;
  difference: number;
  diff_pct: number;
  status: string;
  manual_review: string;
}

interface ValidationSummary {
  pass: number;
  fail: number;
  unknown: number;
}

export const ValidationTable = () => {
  const [data, setData] = useState<ValidationRow[]>([]);
  const [summary, setSummary] = useState<ValidationSummary>({ pass: 0, fail: 0, unknown: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadValidationData = async () => {
      try {
        const response = await fetch('/data/validation_log.csv');
        if (!response.ok) throw new Error('Failed to load validation data');

        const text = await response.text();
        const lines = text.trim().split('\n');

        const rows: ValidationRow[] = [];
        let pass = 0, fail = 0, unknown = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: ValidationRow = {
            fund_code: values[0] || '',
            month_end: values[1] || '',
            excel_grand_total: parseFloat(values[2]) || 0,
            db_total: parseFloat(values[3]) || 0,
            difference: parseFloat(values[4]) || 0,
            diff_pct: parseFloat(values[5]) || 0,
            status: values[6] || 'UNKNOWN',
            manual_review: values[7] || '',
          };
          rows.push(row);

          if (row.status === 'PASS') pass++;
          else if (row.status === 'FAIL') fail++;
          else unknown++;
        }

        setData(rows);
        setSummary({ pass, fail, unknown });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadValidationData();
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

  // Parse CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // Get unique months for filter dropdown
  const availableMonths = useMemo(() => {
    const months = [...new Set(data.map(r => r.month_end))];
    return months.sort().reverse(); // Most recent first
  }, [data]);

  // Filter data based on search, month, and status selection
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesSearch = searchTerm === '' ||
        row.fund_code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = selectedMonth === 'all' || row.month_end === selectedMonth;
      const matchesStatus = selectedStatus === 'all' || row.status === selectedStatus;
      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [data, searchTerm, selectedMonth, selectedStatus]);

  // Pagination calculations
  const totalPages = pageSize === 0 ? 1 : Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (pageSize === 0) return filteredData; // Show all
    const start = currentPage * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, selectedMonth, selectedStatus, pageSize]);

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const formatPct = (pct: number) => {
    return `${(pct * 100).toFixed(2)}%`;
  };

  if (loading) {
    return <div className="p-8 text-center text-black" style={{ minHeight: '480px' }}>Loading validation data...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600" style={{ minHeight: '480px' }}>Error: {error}</div>;
  }

  return (
    <div className="bg-white border border-black rounded-lg overflow-hidden">
      {/* Summary Header */}
      <div className="p-4 border-b border-black bg-gray-50">
        <h3 className="text-lg font-bold text-black mb-2">Data Validation Summary</h3>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-black">{summary.pass} PASS</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-black">{summary.fail} FAIL</span>
          </div>
          {summary.unknown > 0 && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium text-black">{summary.unknown} UNKNOWN</span>
            </div>
          )}
        </div>
        <p className="text-sm text-black mt-2">
          Compares database totals with Excel Grand Totals. Threshold: 0.01%
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
              placeholder="Search fund name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 px-3 pr-8 text-sm border border-gray-400 rounded text-black placeholder-gray-500 focus:outline-none focus:border-black"
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

          {/* Month Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
            >
              <option value="all">All Months</option>
              {availableMonths.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-black">Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 px-2 text-sm border border-gray-400 rounded text-black bg-white focus:outline-none focus:border-black"
            >
              <option value="all">All</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>

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
              <option value={0}>All</option>
            </select>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-sm font-medium text-black mr-2">
              {filteredData.length === 0 ? '0' : `${currentPage * pageSize + 1}-${Math.min((currentPage + 1) * pageSize, filteredData.length)}`} of {filteredData.length}
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-gray-100 border-b border-black">
            <tr>
              <th className="w-[15%] px-3 py-2 text-left font-bold text-black">Fund</th>
              <th className="w-[10%] px-3 py-2 text-left font-bold text-black">Month</th>
              <th className="w-[14%] px-3 py-2 text-right font-bold text-black">Excel Total</th>
              <th className="w-[14%] px-3 py-2 text-right font-bold text-black">DB Total</th>
              <th className="w-[10%] px-3 py-2 text-right font-bold text-black">Diff%</th>
              <th className="w-[9%] px-3 py-2 text-center font-bold text-black">Status</th>
              <th className="w-[28%] px-3 py-2 text-left font-bold text-black">Manual Review</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-black">
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr
                  key={`${row.fund_code}-${row.month_end}`}
                  className={`border-b border-gray-200 ${
                    row.status === 'FAIL' ? 'bg-red-50' :
                    row.status === 'PASS' ? '' : 'bg-yellow-50'
                  }`}
                >
                  <td className="px-3 py-2 text-black font-medium">{row.fund_code}</td>
                  <td className="px-3 py-2 text-black">{row.month_end}</td>
                  <td className="px-3 py-2 text-right text-black">{formatNumber(row.excel_grand_total)}</td>
                  <td className="px-3 py-2 text-right text-black">{formatNumber(row.db_total)}</td>
                  <td className="px-3 py-2 text-right text-black">{formatPct(row.diff_pct)}</td>
                  <td className="px-3 py-2 text-center">
                    {row.status === 'PASS' ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> PASS
                      </span>
                    ) : row.status === 'FAIL' ? (
                      <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                        <XCircle className="h-4 w-4" /> FAIL
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-yellow-700 font-medium">
                        <AlertCircle className="h-4 w-4" /> {row.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-black">
                    {row.manual_review && (
                      <span className="text-black italic">{row.manual_review}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
