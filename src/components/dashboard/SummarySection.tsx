/**
 * Summary Section with Clickable Cards and Top 10 Changes
 * Option A implementation - replaces the Holdings Matrix with actionable insights
 */

import { useState, useMemo, useEffect } from 'react';
import { X, Table2 } from 'lucide-react';
import type { ComparisonCompany, ComparisonMetrics } from '@/lib/portfolio/aggregation';
import { getTopHoldings, formatCrores, formatPercentage } from '@/lib/portfolio/aggregation';

interface SummarySectionProps {
  data: ComparisonCompany[];
  metrics: ComparisonMetrics;
  p1Label: string;
  p2Label: string;
  onCompanyClick?: (company: ComparisonCompany) => void;
  companyDetailOpen?: boolean;
  onAumClick?: () => void;
}

type ModalType = 'new-entries' | 'exits' | 'more-mfs' | 'fewer-mfs' | 'continuing' | 'aum' | 'concentration' | null;
type ModalTab = 'data' | 'info';

// Info content for each card type
const infoContent: Record<string, { description: string; example: { headers: string[]; rows: string[][]; result: string[] }; note: string }> = {
  'new-entries': {
    description: 'Stocks that were not held by any of the selected funds in the previous period, but are now held by at least one fund in the current period.',
    example: {
      headers: ['Stock', 'Sep (Previous)', 'Dec (Current)', 'Counted as'],
      rows: [
        ['Zomato', '0 funds held it', '3 funds hold it', 'New Entry'],
        ['HDFC Bank', '2 funds held it', '4 funds hold it', 'Not a New Entry'],
      ],
      result: ['Zomato is a New Entry because no fund held it before.', 'HDFC Bank is not counted here because it was already held.'],
    },
    note: 'Different from More MFs: New Entries are stocks appearing for the first time. More MFs only counts stocks that were already held but gained additional funds.',
  },
  'exits': {
    description: 'Stocks that were held by at least one of the selected funds in the previous period, but are no longer held by any fund in the current period.',
    example: {
      headers: ['Stock', 'Sep (Previous)', 'Dec (Current)', 'Counted as'],
      rows: [
        ['Tata Motors', '2 funds held it', '0 funds hold it', 'Exit'],
        ['ICICI Bank', '5 funds held it', '3 funds hold it', 'Not an Exit'],
      ],
      result: ['Tata Motors is an Exit because all funds dropped it.', 'ICICI Bank is not counted here because it is still held by 3 funds.'],
    },
    note: 'Different from Fewer MFs: Exits are stocks completely removed from all funds. Fewer MFs only counts stocks that are still held but by fewer funds.',
  },
  'continuing': {
    description: 'Stocks held in both the previous and current period by at least one of the selected funds. These are the stable holdings that existed before and continue to exist.',
    example: {
      headers: ['Stock', 'Sep (Previous)', 'Dec (Current)', 'Counted as'],
      rows: [
        ['Reliance', '4 funds held it', '5 funds hold it', 'Continuing'],
        ['Infosys', '3 funds held it', '2 funds hold it', 'Continuing'],
        ['Zomato', '0 funds held it', '3 funds hold it', 'Not Continuing'],
      ],
      result: ['Both Reliance and Infosys are Continuing because they were held in both periods.', 'Zomato is not Continuing — it is a New Entry.'],
    },
    note: 'Continuing = Total holdings minus New Entries minus Exits.',
  },
  'more-mfs': {
    description: 'Stocks that were already held in the previous period AND now have more funds holding them in the current period. Only counts stocks present in both periods.',
    example: {
      headers: ['Stock', 'Sep (Previous)', 'Dec (Current)', 'Counted as'],
      rows: [
        ['Infosys', '2 funds held it', '4 funds hold it', 'More MFs (+2)'],
        ['Zomato', '0 funds held it', '3 funds hold it', 'Not counted here'],
        ['HDFC Bank', '3 funds held it', '3 funds hold it', 'Not counted here'],
      ],
      result: ['Infosys counts because it existed before and gained 2 more funds.', 'Zomato does not count — it is a New Entry (shown in the New Entries card).', 'HDFC Bank does not count — the number of funds did not change.'],
    },
    note: 'Different from New Entries: This card only shows stocks that already existed and gained additional fund interest. New stocks appear under New Entries instead.',
  },
  'fewer-mfs': {
    description: 'Stocks that are still held but by fewer funds than before. The stock must still be held by at least one fund in the current period.',
    example: {
      headers: ['Stock', 'Sep (Previous)', 'Dec (Current)', 'Counted as'],
      rows: [
        ['ICICI Bank', '5 funds held it', '4 funds hold it', 'Fewer MFs (-1)'],
        ['Tata Motors', '2 funds held it', '0 funds hold it', 'Not counted here'],
        ['SBI', '3 funds held it', '3 funds hold it', 'Not counted here'],
      ],
      result: ['ICICI Bank counts because it lost 1 fund but is still held.', 'Tata Motors does not count — it is an Exit (shown in the Exits card).', 'SBI does not count — the number of funds did not change.'],
    },
    note: 'Different from Exits: This card only shows stocks that lost some fund interest but are still held. Stocks dropped by all funds appear under Exits instead.',
  },
};

export function SummarySection({
  data,
  metrics,
  p1Label,
  p2Label,
  onCompanyClick,
  companyDetailOpen,
  onAumClick,
}: SummarySectionProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('data');

  // Reset tab to 'data' when opening a new modal
  const openModal = (type: ModalType) => {
    setModalTab('data');
    setActiveModal(type);
  };

  // Escape key handler for modals - skip if a higher-level modal (company detail) is open
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModal && !companyDetailOpen) {
        setActiveModal(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [activeModal, companyDetailOpen]);

  // Get ALL new entries and exits (not just major ones with 0.1% threshold)
  const allNewEntries = useMemo(() => {
    return data
      .filter(c => c.mktvalp1 === 0 && c.mktvalp2 > 0)
      .sort((a, b) => b.mktvalp2 - a.mktvalp2);
  }, [data]);

  const allExits = useMemo(() => {
    return data
      .filter(c => c.mktvalp1 > 0 && c.mktvalp2 === 0)
      .sort((a, b) => b.mktvalp1 - a.mktvalp1);
  }, [data]);

  const continuingCompanies = useMemo(() => {
    return data
      .filter(c => c.mktvalp1 > 0 && c.mktvalp2 > 0)
      .sort((a, b) => b.mktvalp2 - a.mktvalp2);
  }, [data]);

  // Get companies gaining/losing MF interest (only continuing holdings - exclude new entries/exits)
  const mfTrendCompanies = useMemo(() => {
    const gaining = data
      .filter(c => c.numofmfp2mv > c.numofmfp1mv && c.mktvalp1 > 0 && c.mktvalp2 > 0)
      .sort((a, b) => (b.numofmfp2mv - b.numofmfp1mv) - (a.numofmfp2mv - a.numofmfp1mv));

    const losing = data
      .filter(c => c.numofmfp2mv < c.numofmfp1mv && c.mktvalp1 > 0 && c.mktvalp2 > 0)
      .sort((a, b) => (a.numofmfp2mv - a.numofmfp1mv) - (b.numofmfp2mv - b.numofmfp1mv));

    return { gaining, losing };
  }, [data]);

  // Extract short month labels from period labels (e.g., "Sep 2025" → "Sep", "2025")
  const p1Month = p1Label.split(' ')[0] || p1Label;
  const p2Month = p2Label.split(' ')[0] || p2Label;
  const p1Year = p1Label.split(' ')[1] || '';
  const p2Year = p2Label.split(' ')[1] || '';

  // Render info tab content for a modal
  const renderInfoTab = (modalType: string) => {
    const info = infoContent[modalType];
    if (!info) return null;

    return (
      <div className="p-4 space-y-4">
        <p className="text-base text-black">{info.description}</p>

        {/* Example Table */}
        <div>
          <div className="text-base font-semibold text-black mb-2">Example</div>
          <table className="w-full text-base border border-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {info.example.headers.map((h, i) => (
                  <th key={i} className="py-1.5 px-2 text-left font-semibold text-black text-base">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {info.example.rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {row.map((cell, j) => (
                    <td key={j} className={`py-1.5 px-2 text-base text-black ${j === 0 ? 'font-medium' : ''}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 space-y-1">
            {info.example.result.map((r, i) => (
              <li key={i} className="text-base text-black flex gap-1.5">
                <span className="shrink-0">{r.includes('does not count') || r.includes('is not') ? '—' : '+'}</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Note */}
        <div className="bg-sky-50 border border-sky-200 rounded p-3">
          <p className="text-base text-black">{info.note}</p>
        </div>
      </div>
    );
  };

  // Modal content renderer
  const renderModalContent = () => {
    if (!activeModal) return null;

    let title = '';
    let companies: ComparisonCompany[] = [];

    switch (activeModal) {
      case 'new-entries':
        title = `New Entries (${allNewEntries.length})`;
        companies = allNewEntries;
        break;
      case 'exits':
        title = `Exits (${allExits.length})`;
        companies = allExits;
        break;
      case 'more-mfs':
        title = `More MFs Interested (${metrics.mfTrends.gaining})`;
        companies = mfTrendCompanies.gaining;
        break;
      case 'fewer-mfs':
        title = `Fewer MFs Interested (${metrics.mfTrends.losing})`;
        companies = mfTrendCompanies.losing;
        break;
      case 'continuing':
        title = `Continuing Holdings (${continuingCompanies.length})`;
        companies = continuingCompanies;
        break;
      case 'aum':
        title = `AUM Details`;
        companies = [];
        break;
      case 'concentration':
        title = `Top 10 Concentration`;
        companies = getTopHoldings(data, 'p2', 10);
        break;
    }

    // Special AUM modal content
    if (activeModal === 'aum') {
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">{title}</h3>
              <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-base text-black">{p1Label} AUM</span>
                <span className="text-base font-semibold text-black">{formatCrores(metrics.aum.p1)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-base text-black">{p2Label} AUM</span>
                <span className="text-base font-semibold text-black">{formatCrores(metrics.aum.p2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-base text-black">Change</span>
                <span className={`text-base font-semibold ${metrics.aum.changePct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCrores(metrics.aum.change)} ({metrics.aum.changePct >= 0 ? '+' : ''}{metrics.aum.changePct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Concentration modal keeps its simpler format
    if (activeModal === 'concentration') {
      const concColumns = [
        { label: 'Company', getValue: (c: ComparisonCompany) => c.name },
        { label: `${p2Label} MV`, getValue: (c: ComparisonCompany) => formatCrores(c.mktvalp2 / 100) },
        { label: '% of AUM', getValue: (c: ComparisonCompany) => formatPercentage(c['mktvalp2%']) },
      ];
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">{title}</h3>
              <button onClick={() => setActiveModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-black" />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b-2 border-black">
                    {concColumns.map((col, i) => (
                      <th key={i} className={`py-2 px-2 font-semibold text-black ${i === 0 ? 'text-left' : 'text-right'}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.isin} className="border-b border-gray-200 hover:bg-gray-100 cursor-pointer" onClick={() => onCompanyClick?.(company)}>
                      {concColumns.map((col, i) => (
                        <td key={i} className={`py-2 px-2 text-black ${i === 0 ? 'font-medium' : 'text-right'}`}>
                          {col.getValue(company)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // Check if this modal type has info content
    const hasInfo = activeModal in infoContent;

    // Standardized table for all 5 card modals (with Data/Info tabs)
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full h-[80vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-black">{title}</h3>
            <button
              onClick={() => setActiveModal(null)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="h-5 w-5 text-black" />
            </button>
          </div>

          {/* Tabs (only if info content exists) */}
          {hasInfo && (
            <div className="flex-shrink-0 flex border-b border-gray-200 px-4">
              <button
                onClick={() => setModalTab('data')}
                className={`px-4 py-2 text-base font-semibold border-b-2 ${
                  modalTab === 'data'
                    ? 'text-black border-black'
                    : 'text-gray-500 border-transparent hover:text-black hover:border-gray-300'
                }`}
              >
                Data
              </button>
              <button
                onClick={() => setModalTab('info')}
                className={`px-4 py-2 text-base font-semibold border-b-2 ${
                  modalTab === 'info'
                    ? 'text-black border-black'
                    : 'text-gray-500 border-transparent hover:text-black hover:border-gray-300'
                }`}
              >
                Info
              </button>
            </div>
          )}

          {/* Tab Content */}
          {modalTab === 'info' && hasInfo ? (
            <div className="overflow-auto flex-1">
              {renderInfoTab(activeModal)}
            </div>
          ) : (
            <div className="overflow-auto flex-1 p-4">
              {companies.length === 0 ? (
                <p className="text-base text-black text-center py-8">No data available</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '750px' }}>
                    <thead>
                      <tr className="border-b-2 border-black">
                        <th className="py-2 px-2 text-left font-semibold text-black">Company</th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">{p2Month}<br/><span className="font-normal text-xs">{p2Year}</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">{p1Month}<br/><span className="font-normal text-xs">{p1Year}</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">MV<br/><span className="font-normal text-xs">Δ%</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">Qty<br/><span className="font-normal text-xs">Δ%</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">{p2Month}<br/><span className="font-normal text-xs">MFs</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">{p1Month}<br/><span className="font-normal text-xs">MFs</span></th>
                        <th className="py-2 px-2 text-right font-semibold text-black whitespace-nowrap">MF<br/><span className="font-normal text-xs">Δ</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((c) => {
                        const isNew = c.mktvalp1 === 0 && c.mktvalp2 > 0;
                        const isExit = c.mktvalp1 > 0 && c.mktvalp2 === 0;
                        const mfDelta = (c.numofmfp2mv || 0) - (c.numofmfp1mv || 0);
                        return (
                          <tr
                            key={c.isin}
                            className="border-b border-gray-200 hover:bg-gray-100 cursor-pointer"
                            onClick={() => onCompanyClick?.(c)}
                          >
                            <td className="py-2 px-2 text-black font-medium">
                              <span className="whitespace-nowrap">{c.name.length > 28 ? c.name.substring(0, 28) + '...' : c.name}</span>
                              {isNew && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold text-white rounded" style={{ backgroundColor: '#5B7B7B' }}>NEW</span>}
                              {isExit && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold text-white rounded" style={{ backgroundColor: '#9B5555' }}>EXIT</span>}
                            </td>
                            <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                              {c['mktvalp2%'] > 0 ? (c['mktvalp2%'] * 100).toFixed(2) + '%' : '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                              {c['mktvalp1%'] > 0 ? (c['mktvalp1%'] * 100).toFixed(2) + '%' : '—'}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                              isNew ? 'text-emerald-700' : isExit ? 'text-red-600'
                              : c['mv%change'] !== null ? (c['mv%change'] >= 0 ? 'text-teal-700' : 'text-red-600') : 'text-black'
                            }`}>
                              {isNew ? 'NEW' : isExit ? 'EXIT'
                                : c['mv%change'] !== null
                                  ? (c['mv%change'] >= 0 ? '+' : '') + (c['mv%change'] * 100).toFixed(1) + '%'
                                  : 'N/A'}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${
                              isNew ? 'text-emerald-700' : isExit ? 'text-red-600'
                              : c['qty%change'] !== null ? (c['qty%change'] >= 0 ? 'text-teal-700' : 'text-red-600') : 'text-black'
                            }`}>
                              {isNew ? 'NEW' : isExit ? 'EXIT'
                                : c['qty%change'] !== null
                                  ? (c['qty%change'] >= 0 ? '+' : '') + (c['qty%change'] * 100).toFixed(1) + '%'
                                  : 'N/A'}
                            </td>
                            <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                              {c.numofmfp2mv || 0}
                            </td>
                            <td className="py-2 px-2 text-right text-black font-mono whitespace-nowrap">
                              {c.numofmfp1mv || 0}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono font-semibold whitespace-nowrap ${
                              mfDelta > 0 ? 'text-teal-700' : mfDelta < 0 ? 'text-red-600' : 'text-black'
                            }`}>
                              {mfDelta > 0 ? `+${mfDelta}` : mfDelta < 0 ? `${mfDelta}` : '0'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Cards Container */}
      <div className="bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-14">
          {/* New Entries */}
          <button
            onClick={() => openModal('new-entries')}
            className="bg-white p-3 text-left hover:bg-gray-100 transition-colors"
          >
            <div className="text-base uppercase tracking-wide text-black font-semibold mb-1">
              New Entries
            </div>
            <div className="text-2xl font-bold text-black mb-0.5">
              {allNewEntries.length}
            </div>
            <div className="text-base text-black">
              {formatCrores(allNewEntries.reduce((sum, c) => sum + c.mktvalp2, 0) / 100)}
            </div>
          </button>

          {/* Exits */}
          <button
            onClick={() => openModal('exits')}
            className="bg-white p-3 text-left hover:bg-gray-100 transition-colors"
          >
            <div className="text-base uppercase tracking-wide text-black font-semibold mb-1">
              Exits
            </div>
            <div className="text-2xl font-bold text-black mb-0.5">
              {allExits.length}
            </div>
            <div className="text-base text-black">
              {formatCrores(allExits.reduce((sum, c) => sum + c.mktvalp1, 0) / 100)}
            </div>
          </button>

          {/* Continuing */}
          <button
            onClick={() => openModal('continuing')}
            className="bg-white p-3 text-left hover:bg-gray-100 transition-colors"
          >
            <div className="text-base uppercase tracking-wide text-black font-semibold mb-1">
              Continuing
            </div>
            <div className="text-2xl font-bold text-black mb-0.5">
              {continuingCompanies.length}
            </div>
            <div className="text-base text-black">
              Both Periods
            </div>
          </button>

          {/* More MFs */}
          <button
            onClick={() => openModal('more-mfs')}
            className="bg-white p-3 text-left hover:bg-gray-100 transition-colors"
          >
            <div className="text-base uppercase tracking-wide text-black font-semibold mb-1">
              More MFs
            </div>
            <div className="text-2xl font-bold text-black mb-0.5">
              {metrics.mfTrends.gaining}
            </div>
            <div className="text-base text-black">
              Gaining Interest
            </div>
          </button>

          {/* Fewer MFs */}
          <button
            onClick={() => openModal('fewer-mfs')}
            className="bg-white p-3 text-left hover:bg-gray-100 transition-colors"
          >
            <div className="text-base uppercase tracking-wide text-black font-semibold mb-1">
              Fewer MFs
            </div>
            <div className="text-2xl font-bold text-black mb-0.5">
              {metrics.mfTrends.losing}
            </div>
            <div className="text-base text-black">
              Losing Interest
            </div>
          </button>
        </div>

        {/* Row 2: AUM & Concentration (inside same container) */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 text-base text-black">
          <button
            onClick={() => openModal('aum')}
            className="hover:bg-white px-2 py-1 rounded transition-colors"
          >
            <span className="text-black">AUM:</span>
            <span className="font-bold ml-1">{formatCrores(metrics.aum.p2)}</span>
            <span className={`ml-1 ${metrics.aum.changePct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ({metrics.aum.changePct >= 0 ? '+' : ''}{metrics.aum.changePct.toFixed(1)}%)
            </span>
          </button>
          <span className="text-gray-400">|</span>
          <button
            onClick={() => openModal('concentration')}
            className="hover:bg-white px-2 py-1 rounded transition-colors"
          >
            <span className="text-black">Top 10:</span>
            <span className="font-bold ml-1">{metrics.concentration.p2.toFixed(1)}%</span>
            <span className={`ml-1 ${metrics.concentration.change >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ({metrics.concentration.change >= 0 ? '+' : ''}{metrics.concentration.change.toFixed(1)}%)
            </span>
          </button>
          {onAumClick && (
            <>
              <div className="flex-1" />
              <button
                onClick={onAumClick}
                className="flex items-center gap-2 px-4 py-2 text-base font-semibold text-[#555555] bg-transparent hover:bg-gray-100 border border-[#555555] rounded transition-colors"
              >
                <Table2 className="h-5 w-5" />
                <span className="hidden sm:inline">AUM Details & Downloads</span>
                <span className="sm:hidden">AUM Details</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* List Modal */}
      {renderModalContent()}
    </div>
  );
}
