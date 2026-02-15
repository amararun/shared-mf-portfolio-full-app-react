/**
 * Comparison Selector Component
 * Allows selecting periods, categories, and funds for comparison.
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FundWithCategory {
  code: string;
  displayName: string;
  category: string;
}

interface ComparisonSelectorProps {
  periods: string[];
  funds: FundWithCategory[];
  fundsP1: string[];
  fundsP2: string[];
  onCompare: (p1Month: string, p1Funds: string[], p2Month: string, p2Funds: string[]) => void;
  onPeriodChange?: (period: string, side: 'p1' | 'p2') => void;
  isLoading?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  holdingsCount?: number; // Number of unique holdings after comparison
  // Custom labels
  customLabelsEnabled?: boolean;
  customP1Row1?: string;
  customP1Row2?: string;
  customP2Row1?: string;
  customP2Row2?: string;
  onCustomLabelsToggle?: (enabled: boolean, autoP1: string, autoP2: string) => void;
  onCustomLabelChange?: (field: 'p1Row1' | 'p1Row2' | 'p2Row1' | 'p2Row2', value: string) => void;
}

// Category display names
const CATEGORY_LABELS: Record<string, string> = {
  midcap: 'Midcap',
  largecap: 'Large Cap',
  flexicap: 'Flexi Cap',
  smallcap: 'Small Cap',
  focused: 'Focused',
};

export const ComparisonSelector = ({
  periods,
  funds,
  fundsP1,
  fundsP2,
  onCompare,
  onPeriodChange,
  isLoading = false,
  isCollapsed = false,
  onToggleCollapse,
  holdingsCount,
  customLabelsEnabled = false,
  customP1Row1 = '',
  customP1Row2 = '',
  customP2Row1 = '',
  customP2Row2 = '',
  onCustomLabelsToggle,
  onCustomLabelChange,
}: ComparisonSelectorProps) => {
  // Period selections
  const [periodP1, setPeriodP1] = useState<string>(periods[1] || periods[0] || '');
  const [periodP2, setPeriodP2] = useState<string>(periods[0] || '');

  // Category filter (empty = all categories)
  const [categoryP1, setCategoryP1] = useState<string>('');
  const [categoryP2, setCategoryP2] = useState<string>('');

  // Fund selections (multi-select)
  const [selectedFundsP1, setSelectedFundsP1] = useState<string[]>([]);
  const [selectedFundsP2, setSelectedFundsP2] = useState<string[]>([]);

  // Get unique categories from funds
  const categories = useMemo(() => {
    const cats = new Set(funds.map(f => f.category));
    return Array.from(cats).sort();
  }, [funds]);

  // Filter funds by category and availability
  const filteredFundsP1 = useMemo(() => {
    return fundsP1
      .map(code => funds.find(f => f.code === code))
      .filter((f): f is FundWithCategory => f !== undefined)
      .filter(f => !categoryP1 || f.category === categoryP1);
  }, [fundsP1, funds, categoryP1]);

  const filteredFundsP2 = useMemo(() => {
    return fundsP2
      .map(code => funds.find(f => f.code === code))
      .filter((f): f is FundWithCategory => f !== undefined)
      .filter(f => !categoryP2 || f.category === categoryP2);
  }, [fundsP2, funds, categoryP2]);

  // Group funds by category for display
  const groupedFundsP1 = useMemo(() => {
    const grouped: Record<string, FundWithCategory[]> = {};
    for (const fund of filteredFundsP1) {
      if (!grouped[fund.category]) {
        grouped[fund.category] = [];
      }
      grouped[fund.category].push(fund);
    }
    return grouped;
  }, [filteredFundsP1]);

  const groupedFundsP2 = useMemo(() => {
    const grouped: Record<string, FundWithCategory[]> = {};
    for (const fund of filteredFundsP2) {
      if (!grouped[fund.category]) {
        grouped[fund.category] = [];
      }
      grouped[fund.category].push(fund);
    }
    return grouped;
  }, [filteredFundsP2]);

  // Update periods when data loads
  useEffect(() => {
    if (periods.length > 0 && !periodP1) {
      setPeriodP1(periods[1] || periods[0]);
      setPeriodP2(periods[0]);
    }
  }, [periods, periodP1]);

  // Clear selections when category filter changes
  useEffect(() => {
    setSelectedFundsP1([]);
  }, [categoryP1]);

  useEffect(() => {
    setSelectedFundsP2([]);
  }, [categoryP2]);

  const toggleFundP1 = (code: string) => {
    setSelectedFundsP1(prev =>
      prev.includes(code)
        ? prev.filter(f => f !== code)
        : [...prev, code]
    );
  };

  const toggleFundP2 = (code: string) => {
    setSelectedFundsP2(prev =>
      prev.includes(code)
        ? prev.filter(f => f !== code)
        : [...prev, code]
    );
  };

  // Select/clear based on current filter
  const selectAllP1 = () => {
    const toSelect = filteredFundsP1.map(f => f.code);
    setSelectedFundsP1(prev => [...new Set([...prev, ...toSelect])]);
  };
  const clearAllP1 = () => {
    const toClear = new Set(filteredFundsP1.map(f => f.code));
    setSelectedFundsP1(prev => prev.filter(code => !toClear.has(code)));
  };
  const selectAllP2 = () => {
    const toSelect = filteredFundsP2.map(f => f.code);
    setSelectedFundsP2(prev => [...new Set([...prev, ...toSelect])]);
  };
  const clearAllP2 = () => {
    const toClear = new Set(filteredFundsP2.map(f => f.code));
    setSelectedFundsP2(prev => prev.filter(code => !toClear.has(code)));
  };

  const handleCompare = () => {
    if (periodP1 && periodP2 && selectedFundsP1.length > 0 && selectedFundsP2.length > 0) {
      onCompare(periodP1, selectedFundsP1, periodP2, selectedFundsP2);
    }
  };

  const canCompare = periodP1 && periodP2 && selectedFundsP1.length > 0 && selectedFundsP2.length > 0;

  // Format period for display (2025-09-30 -> Sep 2025)
  const formatPeriod = (period: string): string => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month)]} ${year}`;
  };


  return (
    <div className="bg-white">
      {/* Header */}
      <div
        className={`px-3 md:px-5 py-2 md:py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 ${!isCollapsed ? 'border-b border-slate-200' : ''}`}
        onClick={onToggleCollapse}
      >
        <h2 className="text-sm md:text-lg font-semibold text-black">
          {isCollapsed
            ? `${formatPeriod(periodP1)} (${selectedFundsP1.length} funds) → ${formatPeriod(periodP2)} (${selectedFundsP2.length} funds)${holdingsCount ? ` | ${holdingsCount} holdings` : ''}`
            : 'Select Periods & Funds to Compare'
          }
        </h2>
        {onToggleCollapse && (
          isCollapsed ? <ChevronDown className="h-4 w-4 md:h-5 md:w-5 text-black" /> : <ChevronUp className="h-4 w-4 md:h-5 md:w-5 text-black" />
        )}
      </div>

      {!isCollapsed && (
      <div className="p-3 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {/* Period 1 (Left) */}
          <div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-3 md:mb-4">
              <h3 className="text-sm md:text-base font-bold text-black whitespace-nowrap">PERIOD 1</h3>
              <select
                value={periodP1}
                onChange={(e) => {
                  const newPeriod = e.target.value;
                  setPeriodP1(newPeriod);
                  setSelectedFundsP1([]);
                  onPeriodChange?.(newPeriod, 'p1');
                }}
                className="border border-slate-300 rounded px-2 md:px-3 py-1 md:py-1.5 text-sm md:text-base text-black font-medium bg-white"
              >
                {periods.map(p => (
                  <option key={p} value={p}>{formatPeriod(p)}</option>
                ))}
              </select>
              <select
                value={categoryP1}
                onChange={(e) => setCategoryP1(e.target.value)}
                className="border border-slate-300 rounded px-2 md:px-3 py-1 md:py-1.5 text-sm md:text-base text-black bg-white flex-1 min-w-0"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 md:gap-3 mb-2">
              <button
                onClick={selectAllP1}
                className="text-sm md:text-base text-black underline hover:no-underline"
              >
                Select All
              </button>
              <span className="text-slate-400">|</span>
              <button
                onClick={clearAllP1}
                className="text-sm md:text-base text-black underline hover:no-underline"
              >
                Clear
              </button>
              <span className="flex-1"></span>
              <span className="text-sm md:text-base text-black">
                {selectedFundsP1.length} selected
              </span>
            </div>

            <div className="max-h-48 md:max-h-72 overflow-y-auto bg-slate-50 rounded p-2 md:p-3">
              {Object.entries(groupedFundsP1).sort(([a], [b]) => a.localeCompare(b)).map(([category, categoryFunds]) => (
                <div key={category} className="mb-2 md:mb-3 last:mb-0">
                  <div className="text-sm md:text-base font-semibold text-black mb-1">
                    {CATEGORY_LABELS[category] || category}
                    <span className="font-normal text-slate-500 ml-2">
                      {categoryFunds.filter(f => selectedFundsP1.includes(f.code)).length}/{categoryFunds.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {categoryFunds.map(fund => (
                      <label key={fund.code} className="flex items-center gap-2 cursor-pointer hover:bg-white py-1 px-2 rounded">
                        <input
                          type="checkbox"
                          checked={selectedFundsP1.includes(fund.code)}
                          onChange={() => toggleFundP1(fund.code)}
                          className="w-4 h-4 accent-black"
                        />
                        <span className="text-sm md:text-base text-black">{fund.displayName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {filteredFundsP1.length === 0 && (
                <div className="text-sm md:text-base text-black italic py-2">No funds available</div>
              )}
            </div>
          </div>

          {/* Period 2 (Right) */}
          <div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-3 md:mb-4">
              <h3 className="text-sm md:text-base font-bold text-black whitespace-nowrap">PERIOD 2</h3>
              <select
                value={periodP2}
                onChange={(e) => {
                  const newPeriod = e.target.value;
                  setPeriodP2(newPeriod);
                  setSelectedFundsP2([]);
                  onPeriodChange?.(newPeriod, 'p2');
                }}
                className="border border-slate-300 rounded px-2 md:px-3 py-1 md:py-1.5 text-sm md:text-base text-black font-medium bg-white"
              >
                {periods.map(p => (
                  <option key={p} value={p}>{formatPeriod(p)}</option>
                ))}
              </select>
              <select
                value={categoryP2}
                onChange={(e) => setCategoryP2(e.target.value)}
                className="border border-slate-300 rounded px-2 md:px-3 py-1 md:py-1.5 text-sm md:text-base text-black bg-white flex-1 min-w-0"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 md:gap-3 mb-2">
              <button
                onClick={selectAllP2}
                className="text-sm md:text-base text-black underline hover:no-underline"
              >
                Select All
              </button>
              <span className="text-slate-400">|</span>
              <button
                onClick={clearAllP2}
                className="text-sm md:text-base text-black underline hover:no-underline"
              >
                Clear
              </button>
              <span className="flex-1"></span>
              <span className="text-sm md:text-base text-black">
                {selectedFundsP2.length} selected
              </span>
            </div>

            <div className="max-h-48 md:max-h-72 overflow-y-auto bg-slate-50 rounded p-2 md:p-3">
              {Object.entries(groupedFundsP2).sort(([a], [b]) => a.localeCompare(b)).map(([category, categoryFunds]) => (
                <div key={category} className="mb-2 md:mb-3 last:mb-0">
                  <div className="text-sm md:text-base font-semibold text-black mb-1">
                    {CATEGORY_LABELS[category] || category}
                    <span className="font-normal text-slate-500 ml-2">
                      {categoryFunds.filter(f => selectedFundsP2.includes(f.code)).length}/{categoryFunds.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {categoryFunds.map(fund => (
                      <label key={fund.code} className="flex items-center gap-2 cursor-pointer hover:bg-white py-1 px-2 rounded">
                        <input
                          type="checkbox"
                          checked={selectedFundsP2.includes(fund.code)}
                          onChange={() => toggleFundP2(fund.code)}
                          className="w-4 h-4 accent-black"
                        />
                        <span className="text-sm md:text-base text-black">{fund.displayName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {filteredFundsP2.length === 0 && (
                <div className="text-sm md:text-base text-black italic py-2">No funds available</div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Labels */}
        <div className="mt-4 md:mt-6 border border-slate-200 rounded p-3 md:p-4 bg-slate-50">
          <div className="text-sm md:text-base text-black mb-2">
            Table headers default to period names (e.g., <strong>{formatPeriod(periodP1)}</strong> and <strong>{formatPeriod(periodP2)}</strong>).
            {' '}Enable custom labels to rename them — useful when comparing different funds from the same period
            (e.g., <em>HDFC Small Cap</em> vs <em>Kotak Small Cap</em> for Jan 2026).
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={customLabelsEnabled}
              onChange={(e) => {
                onCustomLabelsToggle?.(e.target.checked, formatPeriod(periodP1), formatPeriod(periodP2));
              }}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm md:text-base text-black font-medium">Use Custom Labels</span>
          </label>
          {customLabelsEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-sm md:text-base text-black">Group 1:</span>
                <input
                  type="text"
                  value={customP1Row1}
                  onChange={(e) => onCustomLabelChange?.('p1Row1', e.target.value)}
                  maxLength={10}
                  placeholder="Sep"
                  className="w-20 px-2 py-1 text-sm md:text-base text-black border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={customP1Row2}
                  onChange={(e) => onCustomLabelChange?.('p1Row2', e.target.value)}
                  maxLength={10}
                  placeholder="2025"
                  className="w-20 px-2 py-1 text-sm md:text-base text-black border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm md:text-base text-black">Group 2:</span>
                <input
                  type="text"
                  value={customP2Row1}
                  onChange={(e) => onCustomLabelChange?.('p2Row1', e.target.value)}
                  maxLength={10}
                  placeholder="Dec"
                  className="w-20 px-2 py-1 text-sm md:text-base text-black border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={customP2Row2}
                  onChange={(e) => onCustomLabelChange?.('p2Row2', e.target.value)}
                  maxLength={10}
                  placeholder="2025"
                  className="w-20 px-2 py-1 text-sm md:text-base text-black border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Compare Button */}
        <div className="mt-4 md:mt-6 flex justify-center">
          <button
            onClick={handleCompare}
            disabled={!canCompare || isLoading}
            className={`px-8 md:px-10 py-2 md:py-2.5 text-sm md:text-base font-bold rounded transition-colors ${
              canCompare && !isLoading
                ? 'bg-black text-white hover:bg-slate-800'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Loading...' : 'COMPARE'}
          </button>
        </div>
      </div>
      )}
    </div>
  );
};
