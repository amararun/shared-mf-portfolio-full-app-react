/**
 * AUM Breakdown Modal Component
 * Shows fund-by-fund AUM breakdown in a modal.
 */

import { useMemo, useEffect, useCallback, useState } from 'react';
import { X, Copy, Download, Loader2, AlertCircle } from 'lucide-react';
import type { HoldingRecord } from '@/services/portfolioDb';
import { getFundFilePath, FUND_FILE_CONFIG } from '@/config/fundFileConfig';

interface AumBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  holdingsP1: HoldingRecord[];
  holdingsP2: HoldingRecord[];
  p1Label: string;
  p2Label: string;
  p1Month: string;
  p2Month: string;
  funds: Array<{ code: string; displayName: string }>;
}

interface FundAum {
  fundCode: string;
  fundName: string;
  marketValue: number;
  quantity: number;
}

export const AumBreakdownModal = ({
  isOpen,
  onClose,
  holdingsP1,
  holdingsP2,
  p1Label,
  p2Label,
  p1Month,
  p2Month,
  funds,
}: AumBreakdownModalProps) => {
  // Download state
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});

  // Aggregate by fund
  const aggregateByFund = (holdings: HoldingRecord[]): FundAum[] => {
    const byFund = new Map<string, { mv: number; qty: number }>();

    for (const h of holdings) {
      const fundCode = h.scheme_name;
      const existing = byFund.get(fundCode) || { mv: 0, qty: 0 };
      byFund.set(fundCode, {
        mv: existing.mv + (h.market_value || 0),
        qty: existing.qty + (h.quantity || 0),
      });
    }

    return Array.from(byFund.entries()).map(([code, data]) => ({
      fundCode: code,
      fundName: funds.find(f => f.code === code)?.displayName || code,
      marketValue: data.mv,
      quantity: data.qty,
    })).sort((a, b) => b.marketValue - a.marketValue);
  };

  const p1Data = useMemo(() => aggregateByFund(holdingsP1), [holdingsP1, funds]);
  const p2Data = useMemo(() => aggregateByFund(holdingsP2), [holdingsP2, funds]);

  // Create a map of P1 data by fund code for easy lookup
  const p1DataByFund = useMemo(() => {
    const map = new Map<string, FundAum>();
    for (const fund of p1Data) {
      map.set(fund.fundCode, fund);
    }
    return map;
  }, [p1Data]);

  const totalP1Mv = p1Data.reduce((sum, f) => sum + f.marketValue, 0);
  const totalP1Qty = p1Data.reduce((sum, f) => sum + f.quantity, 0);
  const totalP2Mv = p2Data.reduce((sum, f) => sum + f.marketValue, 0);
  const totalP2Qty = p2Data.reduce((sum, f) => sum + f.quantity, 0);

  const mvChangePct = totalP1Mv > 0 ? ((totalP2Mv - totalP1Mv) / totalP1Mv) * 100 : 0;

  // Calculate per-fund percentage change
  const getFundChangePct = (fundCode: string, p2Mv: number): number | null => {
    const p1Fund = p1DataByFund.get(fundCode);
    if (!p1Fund || p1Fund.marketValue === 0) return null;
    return ((p2Mv - p1Fund.marketValue) / p1Fund.marketValue) * 100;
  };

  // Format helpers
  const formatCrores = (lakhs: number) => `₹${(lakhs / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  const formatCroresRaw = (lakhs: number) => (lakhs / 100).toFixed(0);
  const formatQty = (qty: number) => qty.toLocaleString('en-IN');
  const formatQtyRaw = (qty: number) => qty.toString();

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Copy to clipboard in tab-delimited format
  const handleCopy = useCallback(() => {
    const lines: string[] = [];

    // Header
    lines.push(['Fund Name', 'Market Value (Cr)', '% Change', 'Quantity'].join('\t'));

    // Period 2 (Latest)
    lines.push(`${p2Label} (Latest)`);
    for (const fund of p2Data) {
      const changePct = getFundChangePct(fund.fundCode, fund.marketValue);
      const changePctStr = changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—';
      lines.push([fund.fundName, formatCroresRaw(fund.marketValue), changePctStr, formatQtyRaw(fund.quantity)].join('\t'));
    }
    lines.push([`Total ${p2Label}`, formatCroresRaw(totalP2Mv), `${mvChangePct >= 0 ? '+' : ''}${mvChangePct.toFixed(1)}%`, formatQtyRaw(totalP2Qty)].join('\t'));

    lines.push(''); // Empty line

    // Period 1 (Previous)
    lines.push(`${p1Label} (Previous)`);
    for (const fund of p1Data) {
      lines.push([fund.fundName, formatCroresRaw(fund.marketValue), '—', formatQtyRaw(fund.quantity)].join('\t'));
    }
    lines.push([`Total ${p1Label}`, formatCroresRaw(totalP1Mv), '—', formatQtyRaw(totalP1Qty)].join('\t'));

    navigator.clipboard.writeText(lines.join('\n'));
  }, [p1Data, p2Data, p1Label, p2Label, totalP1Mv, totalP1Qty, totalP2Mv, totalP2Qty, mvChangePct, getFundChangePct]);

  // Download handler - uses proxy to fetch from GitHub Releases
  const handleDownload = useCallback(async (fundCode: string, month: string) => {
    const filePath = getFundFilePath(fundCode, month);
    if (!filePath) return;

    const key = `${fundCode}-${month}`;
    setDownloading(prev => ({ ...prev, [key]: true }));
    setDownloadError(prev => ({ ...prev, [key]: '' }));

    try {
      const response = await fetch('/api/fetch-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: filePath })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Detect actual Excel format from file header bytes
      // PK (0x504B) = xlsx/OOXML, D0CF (0xD0CF) = xls/OLE Binary
      const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4B;
      let fileName = filePath.split('/').pop() || 'file.xlsx';

      // Fix extension if it doesn't match actual format
      if (isXlsx && fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
        fileName = fileName.replace(/\.xls$/, '.xlsx');
      } else if (!isXlsx && fileName.endsWith('.xlsx')) {
        fileName = fileName.replace(/\.xlsx$/, '.xls');
      }

      const blob = new Blob([buffer]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(prev => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Download failed'
      }));
    } finally {
      setDownloading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  // Get download button for a fund
  const getDownloadButton = (fundCode: string, month: string) => {
    const filePath = getFundFilePath(fundCode, month);
    if (!filePath) return null;

    const key = `${fundCode}-${month}`;

    if (downloading[key]) {
      return <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-2" />;
    }

    if (downloadError[key]) {
      return (
        <span title={downloadError[key]}>
          <AlertCircle className="h-4 w-4 text-red-500 ml-2 cursor-help" />
        </span>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDownload(fundCode, month);
        }}
        title="Download Excel file"
        className="ml-2 p-0.5 hover:bg-gray-200 rounded transition-colors"
      >
        <Download className="h-5 w-5 text-gray-700" strokeWidth={2} />
      </button>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white border-2 border-black max-w-4xl w-full mx-4 max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-black">AUM Breakdown by Fund</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 text-base font-medium text-black hover:bg-gray-100 border border-black transition-colors"
            >
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-black" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-2 px-3 text-base font-bold text-black">Fund Name</th>
                <th className="text-right py-2 px-3 text-base font-bold text-black">Market Value</th>
                <th className="text-right py-2 px-3 text-base font-bold text-black">% Change</th>
                <th className="text-right py-2 px-3 text-base font-bold text-black">Quantity</th>
                <th className="text-center py-2 px-1 text-base font-bold text-black w-10" title="Download Excel">DL</th>
                <th className="text-center py-2 px-1 text-base font-bold text-black w-10" title="Morningstar">M</th>
                <th className="text-center py-2 px-1 text-base font-bold text-black w-10" title="Value Research">V</th>
              </tr>
            </thead>
            <tbody>
              {/* Period 2 (Latest) Header */}
              <tr className="bg-gray-100">
                <td colSpan={7} className="py-2 px-3 text-base font-bold text-black">
                  {p2Label} (Latest)
                </td>
              </tr>
              {/* Period 2 Funds */}
              {p2Data.map((fund) => {
                const changePct = getFundChangePct(fund.fundCode, fund.marketValue);
                const fundConfig = FUND_FILE_CONFIG[fund.fundCode];
                return (
                  <tr key={`p2-${fund.fundCode}`} className="border-b border-gray-200">
                    <td className="py-2 px-3 text-base text-black">
                      {fund.fundName}
                    </td>
                    <td className="py-2 px-3 text-base text-black text-right font-medium">
                      {formatCrores(fund.marketValue)}
                    </td>
                    <td className="py-2 px-3 text-base text-right font-medium" style={{ color: changePct !== null ? (changePct >= 0 ? '#166534' : '#dc2626') : undefined }}>
                      {changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-base text-black text-right">
                      {formatQty(fund.quantity)}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {getDownloadButton(fund.fundCode, p2Month)}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {fundConfig?.morningstarUrl ? (
                        <a
                          href={fundConfig.morningstarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on Morningstar"
                          className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-gray-600 hover:bg-gray-800 rounded transition-colors"
                        >
                          M
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {fundConfig?.valueResearchUrl ? (
                        <a
                          href={fundConfig.valueResearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on Value Research"
                          className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-gray-600 hover:bg-gray-800 rounded transition-colors"
                        >
                          V
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
              {/* Period 2 Total */}
              <tr className="border-b-2 border-black bg-gray-50">
                <td className="py-2 px-3 text-base font-bold text-black">Total {p2Label}</td>
                <td className="py-2 px-3 text-base font-bold text-black text-right">
                  {formatCrores(totalP2Mv)}
                </td>
                <td className="py-2 px-3 text-base font-bold text-right" style={{ color: mvChangePct >= 0 ? '#166534' : '#dc2626' }}>
                  {mvChangePct >= 0 ? '+' : ''}{mvChangePct.toFixed(1)}%
                </td>
                <td className="py-2 px-3 text-base font-bold text-black text-right">
                  {formatQty(totalP2Qty)}
                </td>
                <td className="py-1 px-1"></td>
                <td className="py-1 px-1"></td>
                <td className="py-1 px-1"></td>
              </tr>

              {/* Spacer */}
              <tr><td colSpan={7} className="py-2" /></tr>

              {/* Period 1 (Previous) Header */}
              <tr className="bg-gray-100">
                <td colSpan={7} className="py-2 px-3 text-base font-bold text-black">
                  {p1Label} (Previous)
                </td>
              </tr>
              {/* Period 1 Funds */}
              {p1Data.map((fund) => {
                const fundConfig = FUND_FILE_CONFIG[fund.fundCode];
                return (
                  <tr key={`p1-${fund.fundCode}`} className="border-b border-gray-200">
                    <td className="py-2 px-3 text-base text-black">
                      {fund.fundName}
                    </td>
                    <td className="py-2 px-3 text-base text-black text-right font-medium">
                      {formatCrores(fund.marketValue)}
                    </td>
                    <td className="py-2 px-3 text-base text-gray-300 text-right">—</td>
                    <td className="py-2 px-3 text-base text-black text-right">
                      {formatQty(fund.quantity)}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {getDownloadButton(fund.fundCode, p1Month)}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {fundConfig?.morningstarUrl ? (
                        <a
                          href={fundConfig.morningstarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on Morningstar"
                          className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-gray-600 hover:bg-gray-800 rounded transition-colors"
                        >
                          M
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1 px-1 text-center">
                      {fundConfig?.valueResearchUrl ? (
                        <a
                          href={fundConfig.valueResearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on Value Research"
                          className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-gray-600 hover:bg-gray-800 rounded transition-colors"
                        >
                          V
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
              {/* Period 1 Total */}
              <tr className="border-b-2 border-black bg-gray-50">
                <td className="py-2 px-3 text-base font-bold text-black">Total {p1Label}</td>
                <td className="py-2 px-3 text-base font-bold text-black text-right">
                  {formatCrores(totalP1Mv)}
                </td>
                <td className="py-2 px-3 text-base text-gray-300 text-right">—</td>
                <td className="py-2 px-3 text-base font-bold text-black text-right">
                  {formatQty(totalP1Qty)}
                </td>
                <td className="py-1 px-1"></td>
                <td className="py-1 px-1"></td>
                <td className="py-1 px-1"></td>
              </tr>

            </tbody>
          </table>

          {/* Note about quantity */}
          <p className="mt-4 text-base text-black">
            Note: Quantity numbers are not meaningful for comparison purposes and are included here for validation only.
          </p>
        </div>
      </div>
    </div>
  );
};
