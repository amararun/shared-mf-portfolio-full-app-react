/**
 * DebtGroupModal
 * Shows drill-down for consolidated debt instruments (CDs, CPs, G-Secs, T-Bills).
 * Tab 1: By Mutual Fund - which fund holds how much debt (MV, Comp%, deltas)
 * Tab 2: By Instrument - individual debt instruments with comparison data
 */

import { useState, useMemo, useEffect, Fragment } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ComparisonCompany } from '@/lib/portfolio/aggregation';
import type { HoldingRecord } from '@/services/portfolioDb';
import { getDebtType, isDebtInstrument, DEBT_TYPE_LABELS, type DebtType } from '@/lib/portfolio/debtGrouping';

interface DebtGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtItems: ComparisonCompany[];
  rawHoldingsP1: HoldingRecord[];
  rawHoldingsP2: HoldingRecord[];
  funds: Array<{ code: string; displayName: string }>;
  p1Label: string;
  p2Label: string;
}

interface FundDebtBreakdown {
  fundCode: string;
  fundName: string;
  totalMvP1: number;
  totalMvP2: number;
  mvChange: number;
  compP1: number;
  compP2: number;
  fundAumP1: number;
  fundAumP2: number;
  isNew: boolean;
  isExit: boolean;
  instruments: Array<{
    name: string;
    type: DebtType;
    isinMapped: string;
    mvP1: number;
    mvP2: number;
    compP1: number;
    compP2: number;
    subItems: Array<{
      originalName: string;
      isinOriginal: string;
      mvP1: number;
      mvP2: number;
      compP1: number;
      compP2: number;
    }>;
  }>;
}

type MfSortCol = 'fundName' | 'mvP1' | 'compP1' | 'mvP2' | 'compP2' | 'mvChange' | 'compDelta';

export const DebtGroupModal = ({
  isOpen,
  onClose,
  debtItems,
  rawHoldingsP1,
  rawHoldingsP2,
  funds,
  p1Label,
  p2Label,
}: DebtGroupModalProps) => {
  const [activeTab, setActiveTab] = useState<'by-mf' | 'by-instrument'>('by-mf');
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());
  const [expandedInstruments, setExpandedInstruments] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedGroupFunds, setExpandedGroupFunds] = useState<Set<string>>(new Set());
  // Sort state for By Instrument tab
  const [sortCol, setSortCol] = useState<string>('mvP2');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Sort state for By MF tab
  const [mfSortCol, setMfSortCol] = useState<MfSortCol>('mvP2');
  const [mfSortDir, setMfSortDir] = useState<'asc' | 'desc'>('desc');

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Collect all debt ISINs (mapped) from the comparison items
  const debtIsins = useMemo(() => {
    return new Set(debtItems.map(d => d.isin));
  }, [debtItems]);

  // Get fund display name
  const getFundName = (code: string) =>
    funds.find(f => f.code === code)?.displayName || code;

  // Calculate total AUM for each fund (all holdings, not just debt)
  const fundTotalAum = useMemo(() => {
    const aumP1 = new Map<string, number>();
    const aumP2 = new Map<string, number>();
    for (const h of rawHoldingsP1) {
      aumP1.set(h.scheme_name, (aumP1.get(h.scheme_name) || 0) + (h.market_value || 0));
    }
    for (const h of rawHoldingsP2) {
      aumP2.set(h.scheme_name, (aumP2.get(h.scheme_name) || 0) + (h.market_value || 0));
    }
    return { aumP1, aumP2 };
  }, [rawHoldingsP1, rawHoldingsP2]);

  // Build per-fund debt breakdown from raw holdings
  const byMfData = useMemo((): FundDebtBreakdown[] => {
    const debtHoldingsP1 = rawHoldingsP1.filter(h => debtIsins.has(h.isin_mapped));
    const debtHoldingsP2 = rawHoldingsP2.filter(h => debtIsins.has(h.isin_mapped));

    const allFundCodes = new Set([
      ...debtHoldingsP1.map(h => h.scheme_name),
      ...debtHoldingsP2.map(h => h.scheme_name),
    ]);

    return Array.from(allFundCodes).map(fundCode => {
      const p1Rows = debtHoldingsP1.filter(h => h.scheme_name === fundCode);
      const p2Rows = debtHoldingsP2.filter(h => h.scheme_name === fundCode);

      const totalMvP1 = p1Rows.reduce((s, h) => s + (h.market_value || 0), 0);
      const totalMvP2 = p2Rows.reduce((s, h) => s + (h.market_value || 0), 0);
      const mvChange = totalMvP1 > 0 ? ((totalMvP2 - totalMvP1) / totalMvP1) * 100 : (totalMvP2 > 0 ? 100 : 0);

      // Composition %: debt MV in this fund / fund's total AUM
      const fundAumP1 = fundTotalAum.aumP1.get(fundCode) || 0;
      const fundAumP2 = fundTotalAum.aumP2.get(fundCode) || 0;
      const compP1 = fundAumP1 > 0 ? (totalMvP1 / fundAumP1) * 100 : 0;
      const compP2 = fundAumP2 > 0 ? (totalMvP2 / fundAumP2) * 100 : 0;

      const isNew = totalMvP1 === 0 && totalMvP2 > 0;
      const isExit = totalMvP1 > 0 && totalMvP2 === 0;

      // Build per-instrument breakdown within this fund (keyed by isin_mapped)
      const instrMap = new Map<string, { name: string; type: DebtType; mvP1: number; mvP2: number }>();
      // Track individual ISINs per mapped ISIN for sub-item drill-down
      const subItemMap = new Map<string, Map<string, { originalName: string; isinOriginal: string; mvP1: number; mvP2: number }>>();

      for (const h of p1Rows) {
        const name = h.name_mapped || h.name_final || h.instrument_name;
        const type = getDebtType(name) || 'cd';
        const key = h.isin_mapped;
        const existing = instrMap.get(key) || { name, type, mvP1: 0, mvP2: 0 };
        existing.mvP1 += h.market_value || 0;
        instrMap.set(key, existing);
        // Sub-item: group by isin_original within this isin_mapped
        const subKey = h.isin_original || h.instrument_name || '(unknown)';
        if (!subItemMap.has(key)) subItemMap.set(key, new Map());
        const subs = subItemMap.get(key)!;
        const sub = subs.get(subKey) || { originalName: h.instrument_name || h.name_nsdl || '', isinOriginal: h.isin_original || '', mvP1: 0, mvP2: 0 };
        sub.mvP1 += h.market_value || 0;
        subs.set(subKey, sub);
      }

      for (const h of p2Rows) {
        const name = h.name_mapped || h.name_final || h.instrument_name;
        const type = getDebtType(name) || 'cd';
        const key = h.isin_mapped;
        const existing = instrMap.get(key) || { name, type, mvP1: 0, mvP2: 0 };
        existing.mvP2 += h.market_value || 0;
        instrMap.set(key, existing);
        const subKey = h.isin_original || h.instrument_name || '(unknown)';
        if (!subItemMap.has(key)) subItemMap.set(key, new Map());
        const subs = subItemMap.get(key)!;
        const sub = subs.get(subKey) || { originalName: h.instrument_name || h.name_nsdl || '', isinOriginal: h.isin_original || '', mvP1: 0, mvP2: 0 };
        sub.mvP2 += h.market_value || 0;
        subs.set(subKey, sub);
      }

      // Add comp%, isinMapped, and subItems to each instrument
      const instruments = Array.from(instrMap.entries()).map(([isinMapped, instr]) => {
        const rawSubs = subItemMap.get(isinMapped);
        const subItems = rawSubs && rawSubs.size > 1
          ? Array.from(rawSubs.values()).map(s => ({
              ...s,
              compP1: fundAumP1 > 0 ? (s.mvP1 / fundAumP1) * 100 : 0,
              compP2: fundAumP2 > 0 ? (s.mvP2 / fundAumP2) * 100 : 0,
            })).sort((a, b) => Math.max(b.mvP1, b.mvP2) - Math.max(a.mvP1, a.mvP2))
          : [];
        return {
          ...instr,
          isinMapped,
          compP1: fundAumP1 > 0 ? (instr.mvP1 / fundAumP1) * 100 : 0,
          compP2: fundAumP2 > 0 ? (instr.mvP2 / fundAumP2) * 100 : 0,
          subItems,
        };
      }).sort((a, b) => b.mvP2 - a.mvP2);

      return {
        fundCode,
        fundName: getFundName(fundCode),
        totalMvP1,
        totalMvP2,
        mvChange,
        compP1,
        compP2,
        fundAumP1,
        fundAumP2,
        isNew,
        isExit,
        instruments,
      };
    });
  }, [rawHoldingsP1, rawHoldingsP2, debtIsins, funds, fundTotalAum]);

  // Sorted byMfData
  const sortedByMfData = useMemo(() => {
    const mult = mfSortDir === 'desc' ? -1 : 1;
    return [...byMfData].sort((a, b) => {
      let aVal: number | string = 0, bVal: number | string = 0;
      switch (mfSortCol) {
        case 'fundName': aVal = a.fundName; bVal = b.fundName; return mult * (aVal < bVal ? -1 : aVal > bVal ? 1 : 0);
        case 'mvP1': aVal = a.totalMvP1; bVal = b.totalMvP1; break;
        case 'compP1': aVal = a.compP1; bVal = b.compP1; break;
        case 'mvP2': aVal = a.totalMvP2; bVal = b.totalMvP2; break;
        case 'compP2': aVal = a.compP2; bVal = b.compP2; break;
        case 'mvChange': aVal = a.mvChange; bVal = b.mvChange; break;
        case 'compDelta': aVal = a.compP2 - a.compP1; bVal = b.compP2 - b.compP1; break;
      }
      return ((aVal as number) - (bVal as number)) * mult;
    });
  }, [byMfData, mfSortCol, mfSortDir]);

  // Group debt items by type for the "By Instrument" tab
  const byTypeData = useMemo(() => {
    const grouped: Record<DebtType, ComparisonCompany[]> = { cd: [], cp: [], tbill: [], gsec: [] };
    for (const item of debtItems) {
      const type = getDebtType(item.name);
      if (type) grouped[type].push(item);
    }
    for (const type of Object.keys(grouped) as DebtType[]) {
      grouped[type].sort((a, b) => b.mktvalp2 - a.mktvalp2);
    }
    return grouped;
  }, [debtItems]);

  // Aggregate group-level data for each debt type
  const byGroupData = useMemo(() => {
    return (Object.entries(byTypeData) as [DebtType, ComparisonCompany[]][])
      .filter(([, items]) => items.length > 0)
      .map(([type, items]) => {
        const totalMvP1 = items.reduce((s, d) => s + d.mktvalp1, 0);
        const totalMvP2 = items.reduce((s, d) => s + d.mktvalp2, 0);
        const compP1 = items.reduce((s, d) => s + d['mktvalp1%'], 0) * 100;
        const compP2 = items.reduce((s, d) => s + d['mktvalp2%'], 0) * 100;
        const mvChange = totalMvP1 > 0 ? ((totalMvP2 - totalMvP1) / totalMvP1) * 100 : (totalMvP2 > 0 ? 100 : 0);
        return { type, label: DEBT_TYPE_LABELS[type], count: items.length, totalMvP1, totalMvP2, compP1, compP2, mvChange, items };
      });
  }, [byTypeData]);

  // Per-group per-fund breakdown: which funds hold each instrument type
  const groupFundBreakdown = useMemo(() => {
    const result: Record<string, Array<{
      fundCode: string;
      fundName: string;
      mvP1: number;
      mvP2: number;
      compP1: number;
      compP2: number;
      mvChange: number;
      isNew: boolean;
      isExit: boolean;
    }>> = {};

    for (const fund of byMfData) {
      const byType: Record<string, { mvP1: number; mvP2: number }> = {};
      for (const instr of fund.instruments) {
        if (!byType[instr.type]) byType[instr.type] = { mvP1: 0, mvP2: 0 };
        byType[instr.type].mvP1 += instr.mvP1;
        byType[instr.type].mvP2 += instr.mvP2;
      }
      for (const [type, { mvP1, mvP2 }] of Object.entries(byType)) {
        if (mvP1 === 0 && mvP2 === 0) continue;
        if (!result[type]) result[type] = [];
        const compP1 = fund.fundAumP1 > 0 ? (mvP1 / fund.fundAumP1) * 100 : 0;
        const compP2 = fund.fundAumP2 > 0 ? (mvP2 / fund.fundAumP2) * 100 : 0;
        const mvChange = mvP1 > 0 ? ((mvP2 - mvP1) / mvP1) * 100 : (mvP2 > 0 ? 100 : 0);
        result[type].push({
          fundCode: fund.fundCode, fundName: fund.fundName,
          mvP1, mvP2, compP1, compP2, mvChange,
          isNew: mvP1 === 0 && mvP2 > 0,
          isExit: mvP1 > 0 && mvP2 === 0,
        });
      }
    }
    for (const type of Object.keys(result)) {
      result[type].sort((a, b) => b.mvP2 - a.mvP2);
    }
    return result;
  }, [byMfData]);

  // Sorted group data
  const sortedGroupData = useMemo(() => {
    const mult = sortDir === 'desc' ? -1 : 1;
    return [...byGroupData].sort((a, b) => {
      switch (sortCol) {
        case 'name': return mult * a.label.localeCompare(b.label);
        case 'mvP1': return mult * (a.totalMvP1 - b.totalMvP1);
        case 'pctP1': return mult * (a.compP1 - b.compP1);
        case 'mvP2': return mult * (a.totalMvP2 - b.totalMvP2);
        case 'pctP2': return mult * (a.compP2 - b.compP2);
        case 'change': return mult * (a.mvChange - b.mvChange);
        case 'compDelta': return mult * ((a.compP2 - a.compP1) - (b.compP2 - b.compP1));
        default: return mult * (a.totalMvP2 - b.totalMvP2);
      }
    });
  }, [byGroupData, sortCol, sortDir]);

  // Totals
  const totalP1Mv = debtItems.reduce((s, d) => s + d.mktvalp1, 0);
  const totalP2Mv = debtItems.reduce((s, d) => s + d.mktvalp2, 0);
  const totalP1Pct = debtItems.reduce((s, d) => s + d['mktvalp1%'], 0);
  const totalP2Pct = debtItems.reduce((s, d) => s + d['mktvalp2%'], 0);

  // Format helpers
  const fmtCr = (lakhs: number) => `₹${(lakhs / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  const fmtPct = (pct: number) => `${(pct * 100).toFixed(2)}%`;
  const fmtChange = (pct: number | null) => {
    if (pct === null) return '—';
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  const toggleFundExpand = (fundCode: string) => {
    setExpandedFunds(prev => {
      const next = new Set(prev);
      if (next.has(fundCode)) next.delete(fundCode);
      else next.add(fundCode);
      return next;
    });
  };

  const toggleGroupExpand = (type: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleGroupFundExpand = (type: string, fundCode: string) => {
    const key = `${type}::${fundCode}`;
    setExpandedGroupFunds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleInstrExpand = (fundCode: string, isinMapped: string) => {
    const key = `${fundCode}::${isinMapped}`;
    setExpandedInstruments(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Sort handler for By MF tab
  const handleMfSort = (col: MfSortCol) => {
    if (mfSortCol === col) {
      setMfSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setMfSortCol(col);
      setMfSortDir('desc');
    }
  };

  // Sort handler for By Instrument tab
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  // Short period labels
  const p2Short = p2Label.split(' ')[0] || p2Label;
  const p1Short = p1Label.split(' ')[0] || p1Label;

  // Sort indicator helper
  const MfSortIndicator = ({ col }: { col: MfSortCol }) => {
    if (mfSortCol !== col) return null;
    return <span className="text-blue-600 ml-0.5">{mfSortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start pt-[5vh] justify-center overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white border-2 border-black rounded-lg max-w-5xl w-full mx-4 max-h-[85vh] flex flex-col mb-[5vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-slate-900 text-white rounded-t-lg">
          <div>
            <h2 className="text-lg font-bold">Debt & Money Market</h2>
            <div className="flex gap-4 text-sm text-slate-300">
              <span>{debtItems.length} instruments</span>
              <span>{fmtPct(totalP2Pct)} of AUM ({p2Short})</span>
              <span>{fmtCr(totalP2Mv)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded transition-colors">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-300 px-4">
          <button
            onClick={() => setActiveTab('by-mf')}
            className={`px-4 py-2 text-base font-semibold border-b-2 ${
              activeTab === 'by-mf' ? 'text-black border-black' : 'text-black border-transparent hover:border-gray-300'
            }`}
          >
            By Mutual Fund
          </button>
          <button
            onClick={() => setActiveTab('by-instrument')}
            className={`px-4 py-2 text-base font-semibold border-b-2 ${
              activeTab === 'by-instrument' ? 'text-black border-black' : 'text-black border-transparent hover:border-gray-300'
            }`}
          >
            By Instrument Group
          </button>
        </div>

        {/* Content */}
        <div className="overflow-auto flex-1 p-4">

          {/* ===== By Mutual Fund Tab ===== */}
          {activeTab === 'by-mf' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" style={{ minWidth: '820px' }}>
                <thead>
                  {/* Row 1: Period headers */}
                  <tr className="border-b border-slate-300">
                    <th rowSpan={2} className="text-left py-2 px-3 font-semibold text-black align-bottom border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" style={{ minWidth: '220px' }} onClick={() => handleMfSort('fundName')}>
                      Mutual Fund<MfSortIndicator col="fundName" />
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                      {p1Label || 'Previous'}
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                      {p2Label || 'Current'}
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black">
                      Change
                    </th>
                  </tr>
                  {/* Row 2: Metric headers - all sortable */}
                  <tr className="border-b-2 border-black">
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvP1')}>
                      MV<MfSortIndicator col="mvP1" />
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" title="Debt market value as % of fund's total AUM" onClick={() => handleMfSort('compP1')}>
                      Comp%<MfSortIndicator col="compP1" />
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvP2')}>
                      MV<MfSortIndicator col="mvP2" />
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" title="Debt market value as % of fund's total AUM" onClick={() => handleMfSort('compP2')}>
                      Comp%<MfSortIndicator col="compP2" />
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleMfSort('mvChange')}>
                      MV Δ%<MfSortIndicator col="mvChange" />
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" title={`Change in composition percentage (${p2Short} Comp% − ${p1Short} Comp%)`} onClick={() => handleMfSort('compDelta')}>
                      Comp Δ<MfSortIndicator col="compDelta" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByMfData.map((fund, idx) => {
                    const isExpanded = expandedFunds.has(fund.fundCode);
                    const compDelta = fund.compP2 - fund.compP1;
                    return (
                    <Fragment key={fund.fundCode}>
                    <tr className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleFundExpand(fund.fundCode)}
                    >
                      <td className="py-1.5 px-3 text-black border-r border-slate-200">
                        <span className="whitespace-nowrap flex items-center gap-1">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                          }
                          {fund.fundName}
                          <span className="text-xs text-slate-500 ml-1">({fund.instruments.length})</span>
                        </span>
                      </td>
                      {/* P1: MV, Comp% */}
                      <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                        {fund.totalMvP1 > 0 ? fmtCr(fund.totalMvP1) : '—'}
                      </td>
                      <td
                        className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                        title={`Debt MV (₹${(fund.totalMvP1 / 100).toFixed(0)} Cr) ÷ ${fund.fundName} AUM (₹${(fund.fundAumP1 / 100).toFixed(0)} Cr)`}
                      >
                        {fund.totalMvP1 > 0 ? `${fund.compP1.toFixed(2)}%` : '—'}
                      </td>
                      {/* P2: MV, Comp% */}
                      <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                        {fmtCr(fund.totalMvP2)}
                      </td>
                      <td
                        className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                        title={`Debt MV (₹${(fund.totalMvP2 / 100).toFixed(0)} Cr) ÷ ${fund.fundName} AUM (₹${(fund.fundAumP2 / 100).toFixed(0)} Cr)`}
                      >
                        {fund.compP2.toFixed(2)}%
                      </td>
                      {/* Change: MV Δ%, Comp Δ */}
                      <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${fund.mvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                        {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : fund.mvChange >= 0 ? `+${fund.mvChange.toFixed(1)}%` : `(${Math.abs(fund.mvChange).toFixed(1)}%)`}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${
                        fund.isNew || fund.isExit
                          ? fund.isNew ? 'text-teal-700' : 'text-red-600'
                          : compDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                      }`}>
                        {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : compDelta >= 0 ? `+${compDelta.toFixed(2)}%` : `(${Math.abs(compDelta).toFixed(2)}%)`}
                      </td>
                    </tr>

                    {/* Expanded: individual instruments for this fund */}
                    {isExpanded && fund.instruments.map((instr, i) => {
                      const instrMvChange = instr.mvP1 > 0 ? ((instr.mvP2 - instr.mvP1) / instr.mvP1) * 100 : (instr.mvP2 > 0 ? 100 : 0);
                      const instrCompDelta = instr.compP2 - instr.compP1;
                      const instrIsNew = instr.mvP1 === 0 && instr.mvP2 > 0;
                      const instrIsExit = instr.mvP1 > 0 && instr.mvP2 === 0;
                      const hasSubItems = instr.subItems.length > 0;
                      const instrExpandKey = `${fund.fundCode}::${instr.isinMapped}`;
                      const instrIsExpanded = expandedInstruments.has(instrExpandKey);
                      return (
                      <Fragment key={`${fund.fundCode}-${i}`}>
                      <tr className={`border-b border-slate-200 bg-emerald-100/70 ${hasSubItems ? 'cursor-pointer' : ''}`}
                        onClick={hasSubItems ? (e) => { e.stopPropagation(); toggleInstrExpand(fund.fundCode, instr.isinMapped); } : undefined}
                      >
                        <td className="py-2 px-3 text-black border-r border-slate-200">
                          <span className="whitespace-nowrap pl-5 flex items-center gap-1">
                            {hasSubItems && (
                              instrIsExpanded
                                ? <ChevronDown className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                : <ChevronRight className="h-3 w-3 text-blue-600 flex-shrink-0" />
                            )}
                            <span className="inline-block px-1.5 py-0.5 text-xs font-medium bg-slate-200 text-slate-600 rounded mr-1">
                              {instr.type.toUpperCase()}
                            </span>
                            {instr.name}
                            {hasSubItems && <span className="text-xs text-slate-400 ml-1">({instr.subItems.length})</span>}
                          </span>
                        </td>
                        {/* P1: MV, Comp% */}
                        <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                          {instr.mvP1 > 0 ? fmtCr(instr.mvP1) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                          {instr.mvP1 > 0 ? `${instr.compP1.toFixed(2)}%` : '—'}
                        </td>
                        {/* P2: MV, Comp% */}
                        <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                          {instr.mvP2 > 0 ? fmtCr(instr.mvP2) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                          {instr.mvP2 > 0 ? `${instr.compP2.toFixed(2)}%` : '—'}
                        </td>
                        {/* Change: MV Δ%, Comp Δ */}
                        <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${instrMvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                          {instrIsNew ? 'NEW' : instrIsExit ? 'EXIT' : instrMvChange >= 0 ? `+${instrMvChange.toFixed(1)}%` : `(${Math.abs(instrMvChange).toFixed(1)}%)`}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                          instrIsNew || instrIsExit
                            ? instrIsNew ? 'text-teal-700' : 'text-red-600'
                            : instrCompDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                        }`}>
                          {instrIsNew ? 'NEW' : instrIsExit ? 'EXIT' : instrCompDelta >= 0 ? `+${instrCompDelta.toFixed(2)}%` : `(${Math.abs(instrCompDelta).toFixed(2)}%)`}
                        </td>
                      </tr>
                      {/* Third level: individual original ISINs */}
                      {instrIsExpanded && instr.subItems.map((sub, si) => {
                        const subMvChange = sub.mvP1 > 0 ? ((sub.mvP2 - sub.mvP1) / sub.mvP1) * 100 : (sub.mvP2 > 0 ? 100 : 0);
                        const subCompDelta = sub.compP2 - sub.compP1;
                        const subIsNew = sub.mvP1 === 0 && sub.mvP2 > 0;
                        const subIsExit = sub.mvP1 > 0 && sub.mvP2 === 0;
                        return (
                        <tr key={`${fund.fundCode}-${i}-sub-${si}`} className="border-b border-slate-200 bg-amber-50/70">
                          <td className="py-1.5 px-3 text-black border-r border-slate-200">
                            <span className="whitespace-nowrap pl-12 text-xs">
                              {sub.originalName || sub.isinOriginal || '—'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-black font-mono text-xs whitespace-nowrap">
                            {sub.mvP1 > 0 ? fmtCr(sub.mvP1) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-black font-mono text-xs border-r border-slate-200 whitespace-nowrap">
                            {sub.mvP1 > 0 ? `${sub.compP1.toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-black font-mono text-xs whitespace-nowrap">
                            {sub.mvP2 > 0 ? fmtCr(sub.mvP2) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-black font-mono text-xs border-r border-slate-200 whitespace-nowrap">
                            {sub.mvP2 > 0 ? `${sub.compP2.toFixed(2)}%` : '—'}
                          </td>
                          <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${subMvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                            {subIsNew ? 'NEW' : subIsExit ? 'EXIT' : subMvChange >= 0 ? `+${subMvChange.toFixed(1)}%` : `(${Math.abs(subMvChange).toFixed(1)}%)`}
                          </td>
                          <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${
                            subIsNew || subIsExit
                              ? subIsNew ? 'text-teal-700' : 'text-red-600'
                              : subCompDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                          }`}>
                            {subIsNew ? 'NEW' : subIsExit ? 'EXIT' : subCompDelta >= 0 ? `+${subCompDelta.toFixed(2)}%` : `(${Math.abs(subCompDelta).toFixed(2)}%)`}
                          </td>
                        </tr>
                        );
                      })}
                      </Fragment>
                      );
                    })}
                    </Fragment>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td className="py-1.5 px-3 text-black font-semibold border-r border-slate-200">Total ({byMfData.length} funds)</td>
                    {/* P1 Totals */}
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold whitespace-nowrap">
                      {totalP1Mv > 0 ? fmtCr(totalP1Mv) : '—'}
                    </td>
                    <td
                      className="py-1.5 px-2 text-right text-black font-mono font-semibold border-r border-slate-200 whitespace-nowrap"
                      title="Overall portfolio composition (total debt MV / total portfolio value)"
                    >
                      {totalP1Pct > 0 ? `${(totalP1Pct * 100).toFixed(2)}%` : '—'}
                    </td>
                    {/* P2 Totals */}
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold whitespace-nowrap">
                      {fmtCr(totalP2Mv)}
                    </td>
                    <td
                      className="py-1.5 px-2 text-right text-black font-mono font-semibold border-r border-slate-200 whitespace-nowrap"
                      title="Overall portfolio composition (total debt MV / total portfolio value)"
                    >
                      {(totalP2Pct * 100).toFixed(2)}%
                    </td>
                    {/* Change Totals */}
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold">—</td>
                    {(() => {
                      const delta = (totalP2Pct - totalP1Pct) * 100;
                      return (
                        <td className={`py-1.5 px-2 text-right font-mono font-semibold whitespace-nowrap ${delta >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                          {delta >= 0 ? `+${delta.toFixed(2)}%` : `(${Math.abs(delta).toFixed(2)}%)`}
                        </td>
                      );
                    })()}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ===== Instrument Group Tab ===== */}
          {activeTab === 'by-instrument' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" style={{ minWidth: '820px' }}>
                <thead>
                  {/* Row 1: Period headers */}
                  <tr className="border-b border-slate-300">
                    <th rowSpan={2} className="text-left py-2 px-3 font-semibold text-black align-bottom border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" style={{ minWidth: '280px' }} onClick={() => handleSort('name')}>
                      Instrument Group{sortCol === 'name' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                      {p1Label || 'Previous'}
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black border-r border-slate-200">
                      {p2Label || 'Current'}
                    </th>
                    <th colSpan={2} className="text-center py-2 px-2 font-semibold text-black">
                      Change
                    </th>
                  </tr>
                  {/* Row 2: Metric headers */}
                  <tr className="border-b-2 border-black">
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('mvP1')}>
                      MV{sortCol === 'mvP1' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('pctP1')}>
                      Comp%{sortCol === 'pctP1' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('mvP2')}>
                      MV{sortCol === 'mvP2' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black border-r border-slate-200 cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('pctP2')}>
                      Comp%{sortCol === 'pctP2' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('change')}>
                      MV Δ%{sortCol === 'change' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                    <th className="text-right py-2 px-2 font-normal text-black cursor-pointer hover:bg-slate-200 select-none" onClick={() => handleSort('compDelta')}>
                      Comp Δ{sortCol === 'compDelta' && <span className="text-blue-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroupData.map(group => {
                    const isExpanded = expandedGroups.has(group.type);
                    const compDelta = group.compP2 - group.compP1;
                    return (
                    <Fragment key={group.type}>
                    <tr className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleGroupExpand(group.type)}
                    >
                      <td className="py-1.5 px-3 text-black font-medium border-r border-slate-200">
                        <span className="whitespace-nowrap flex items-center gap-1">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                          }
                          {group.label}
                          <span className="text-xs text-slate-500 ml-1">({group.count} instruments, {(groupFundBreakdown[group.type] || []).length} funds)</span>
                        </span>
                      </td>
                      {/* P1: MV, Comp% */}
                      <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                        {group.totalMvP1 > 0 ? fmtCr(group.totalMvP1) : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                        {group.totalMvP1 > 0 ? `${group.compP1.toFixed(2)}%` : '—'}
                      </td>
                      {/* P2: MV, Comp% */}
                      <td className="py-1.5 px-2 text-right text-black font-mono whitespace-nowrap">
                        {fmtCr(group.totalMvP2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap">
                        {group.compP2.toFixed(2)}%
                      </td>
                      {/* Change: MV Δ%, Comp Δ */}
                      <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${group.mvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                        {group.mvChange >= 0 ? `+${group.mvChange.toFixed(1)}%` : `(${Math.abs(group.mvChange).toFixed(1)}%)`}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono whitespace-nowrap ${compDelta >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                        {compDelta >= 0 ? `+${compDelta.toFixed(2)}%` : `(${Math.abs(compDelta).toFixed(2)}%)`}
                      </td>
                    </tr>
                    {/* Expanded: which mutual funds hold this instrument group */}
                    {isExpanded && (groupFundBreakdown[group.type] || []).map(fund => {
                      const fundCompDelta = fund.compP2 - fund.compP1;
                      const groupFundKey = `${group.type}::${fund.fundCode}`;
                      const isFundExpanded = expandedGroupFunds.has(groupFundKey);
                      // Get individual instruments of this type from this fund
                      const fundData = byMfData.find(f => f.fundCode === fund.fundCode);
                      const fundInstruments = fundData
                        ? fundData.instruments.filter(instr => instr.type === group.type).sort((a, b) => b.mvP2 - a.mvP2)
                        : [];
                      return (
                        <Fragment key={fund.fundCode}>
                        <tr className="border-b border-slate-200 bg-emerald-100/70 cursor-pointer"
                          onClick={() => toggleGroupFundExpand(group.type, fund.fundCode)}
                        >
                          <td className="py-2 px-3 text-black border-r border-slate-200">
                            <span className="whitespace-nowrap pl-5 flex items-center gap-1">
                              {isFundExpanded
                                ? <ChevronDown className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                : <ChevronRight className="h-3 w-3 text-blue-600 flex-shrink-0" />
                              }
                              {fund.fundName}
                              <span className="text-xs text-slate-500 ml-1">({fundInstruments.length})</span>
                              {fund.isNew && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold text-white rounded" style={{ backgroundColor: '#5B7B7B' }}>NEW</span>}
                              {fund.isExit && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold text-white rounded" style={{ backgroundColor: '#9B5555' }}>EXIT</span>}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                            {fund.mvP1 > 0 ? fmtCr(fund.mvP1) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                            title={`${group.label} MV in ${fund.fundName} ÷ fund's total AUM`}
                          >
                            {fund.mvP1 > 0 ? `${fund.compP1.toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                            {fund.mvP2 > 0 ? fmtCr(fund.mvP2) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-black font-mono border-r border-slate-200 whitespace-nowrap"
                            title={`${group.label} MV in ${fund.fundName} ÷ fund's total AUM`}
                          >
                            {fund.mvP2 > 0 ? `${fund.compP2.toFixed(2)}%` : '—'}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${fund.mvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                            {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : fund.mvChange >= 0 ? `+${fund.mvChange.toFixed(1)}%` : `(${Math.abs(fund.mvChange).toFixed(1)}%)`}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                            fund.isNew || fund.isExit
                              ? fund.isNew ? 'text-teal-700' : 'text-red-600'
                              : fundCompDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                          }`}>
                            {fund.isNew ? 'NEW' : fund.isExit ? 'EXIT' : fundCompDelta >= 0 ? `+${fundCompDelta.toFixed(2)}%` : `(${Math.abs(fundCompDelta).toFixed(2)}%)`}
                          </td>
                        </tr>
                        {/* Third level: individual instruments of this type in this fund */}
                        {isFundExpanded && fundInstruments.map((instr, ii) => {
                          const instrMvChange = instr.mvP1 > 0 ? ((instr.mvP2 - instr.mvP1) / instr.mvP1) * 100 : (instr.mvP2 > 0 ? 100 : 0);
                          const instrCompDelta = instr.compP2 - instr.compP1;
                          const instrIsNew = instr.mvP1 === 0 && instr.mvP2 > 0;
                          const instrIsExit = instr.mvP1 > 0 && instr.mvP2 === 0;
                          return (
                            <tr key={`${fund.fundCode}-${group.type}-${ii}`} className="border-b border-slate-200 bg-amber-50/70">
                              <td className="py-1.5 px-3 text-black border-r border-slate-200">
                                <span className="whitespace-nowrap pl-10 text-xs">
                                  {instr.name}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono text-xs whitespace-nowrap">
                                {instr.mvP1 > 0 ? fmtCr(instr.mvP1) : '—'}
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono text-xs border-r border-slate-200 whitespace-nowrap">
                                {instr.mvP1 > 0 ? `${instr.compP1.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono text-xs whitespace-nowrap">
                                {instr.mvP2 > 0 ? fmtCr(instr.mvP2) : '—'}
                              </td>
                              <td className="py-1.5 px-2 text-right text-black font-mono text-xs border-r border-slate-200 whitespace-nowrap">
                                {instr.mvP2 > 0 ? `${instr.compP2.toFixed(2)}%` : '—'}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${instrMvChange >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {instrIsNew ? 'NEW' : instrIsExit ? 'EXIT' : instrMvChange >= 0 ? `+${instrMvChange.toFixed(1)}%` : `(${Math.abs(instrMvChange).toFixed(1)}%)`}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-mono text-xs whitespace-nowrap ${
                                instrIsNew || instrIsExit
                                  ? instrIsNew ? 'text-teal-700' : 'text-red-600'
                                  : instrCompDelta >= 0 ? 'text-teal-700' : 'text-red-600'
                              }`}>
                                {instrIsNew ? 'NEW' : instrIsExit ? 'EXIT' : instrCompDelta >= 0 ? `+${instrCompDelta.toFixed(2)}%` : `(${Math.abs(instrCompDelta).toFixed(2)}%)`}
                              </td>
                            </tr>
                          );
                        })}
                        </Fragment>
                      );
                    })}
                    </Fragment>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td className="py-1.5 px-3 text-black font-semibold border-r border-slate-200">Total ({debtItems.length} instruments)</td>
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold whitespace-nowrap">
                      {totalP1Mv > 0 ? fmtCr(totalP1Mv) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold border-r border-slate-200 whitespace-nowrap">
                      {totalP1Pct > 0 ? `${(totalP1Pct * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold whitespace-nowrap">
                      {fmtCr(totalP2Mv)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold border-r border-slate-200 whitespace-nowrap">
                      {(totalP2Pct * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-2 text-right text-black font-mono font-semibold">—</td>
                    {(() => {
                      const delta = (totalP2Pct - totalP1Pct) * 100;
                      return (
                        <td className={`py-1.5 px-2 text-right font-mono font-semibold whitespace-nowrap ${delta >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
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
      </div>
    </div>
  );
};
