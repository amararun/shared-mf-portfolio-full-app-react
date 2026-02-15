/**
 * Portfolio Comparison View
 * Main dashboard for comparing MF portfolio holdings across periods.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

import { Footer } from '@/components/layout/Footer';
import { ComparisonSelector } from '@/components/dashboard/ComparisonSelector';
// MetricsCards hidden for now - restore when needed
import { CombinedChangeChart } from '@/components/dashboard/CombinedChangeChart';
import { ComparisonTable } from '@/components/dashboard/ComparisonTable';
import { ValidationTable } from '@/components/dashboard/ValidationTable';
import { ISINRemapsTable } from '@/components/dashboard/ISINRemapsTable';
import { ProcessTab } from '@/components/dashboard/ProcessTab';
import { AumBreakdownModal } from '@/components/dashboard/AumBreakdownModal';
import { SummarySection } from '@/components/dashboard/SummarySection';
import {
  getAvailablePeriods,
  getFundsWithCategory,
  getFundsForPeriod,
  getHoldings,
  getDatabaseStats,
  type FundInfo,
} from '@/services/portfolioDb';
import {
  buildComparisonData,
  calculateMetrics,
  getTopHoldings,
  type ComparisonCompany,
  type ComparisonMetrics,
} from '@/lib/portfolio/aggregation';
import { groupDebtInstruments, isDebtGroupRow } from '@/lib/portfolio/debtGrouping';
import { DebtGroupModal } from '@/components/dashboard/DebtGroupModal';

type TabType = 'charts' | 'table' | 'validation' | 'isin-remaps' | 'process';

export const PortfolioComparisonView = () => {
  // Data state
  const [periods, setPeriods] = useState<string[]>([]);
  const [funds, setFunds] = useState<FundInfo[]>([]);
  const [fundsP1, setFundsP1] = useState<string[]>([]);
  const [fundsP2, setFundsP2] = useState<string[]>([]);
  const [dbStats, setDbStats] = useState<{ totalHoldings: number; totalFunds: number; totalPeriods: number } | null>(null);

  // Comparison state
  const [comparisonData, setComparisonData] = useState<ComparisonCompany[]>([]);
  const [metrics, setMetrics] = useState<ComparisonMetrics | null>(null);
  const [selectedP1, setSelectedP1] = useState<{ month: string; funds: string[] }>({ month: '', funds: [] });
  const [selectedP2, setSelectedP2] = useState<{ month: string; funds: string[] }>({ month: '', funds: [] });
  const [rawHoldingsP1, setRawHoldingsP1] = useState<Awaited<ReturnType<typeof getHoldings>>>([]);
  const [rawHoldingsP2, setRawHoldingsP2] = useState<Awaited<ReturnType<typeof getHoldings>>>([]);
  const [showAumModal, setShowAumModal] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('charts');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCompared, setHasCompared] = useState(false);
  const [selectorCollapsed, setSelectorCollapsed] = useState(false);
  // Company selection from Table/Summary view (to open modal in Charts)
  const [selectedCompanyFromTable, setSelectedCompanyFromTable] = useState<ComparisonCompany | null>(null);
  const [companySelectionSource, setCompanySelectionSource] = useState<'summary' | 'table' | null>(null);
  // Custom header labels
  const [customLabelsEnabled, setCustomLabelsEnabled] = useState(false);
  const [customP1Row1, setCustomP1Row1] = useState('');
  const [customP1Row2, setCustomP1Row2] = useState('');
  const [customP2Row1, setCustomP2Row1] = useState('');
  const [customP2Row2, setCustomP2Row2] = useState('');
  // Debt group modal state
  const [showDebtModal, setShowDebtModal] = useState(false);

  // Group debt instruments into a single virtual row
  const { groupedData, debtItems } = useMemo(
    () => groupDebtInstruments(comparisonData),
    [comparisonData]
  );

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [periodsData, fundsData, stats] = await Promise.all([
          getAvailablePeriods(),
          getFundsWithCategory(),
          getDatabaseStats(),
        ]);

        setPeriods(periodsData);
        setFunds(fundsData);
        setDbStats(stats);

        // Load funds for default periods
        if (periodsData.length > 0) {
          const defaultP1 = periodsData[1] || periodsData[0];
          const defaultP2 = periodsData[0];

          const [fundsP1Data, fundsP2Data] = await Promise.all([
            getFundsForPeriod(defaultP1),
            getFundsForPeriod(defaultP2),
          ]);

          setFundsP1(fundsP1Data);
          setFundsP2(fundsP2Data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Update available funds when period selection changes
  const handlePeriodChange = useCallback(async (period: string, side: 'p1' | 'p2') => {
    try {
      const fundsData = await getFundsForPeriod(period);
      if (side === 'p1') {
        setFundsP1(fundsData);
      } else {
        setFundsP2(fundsData);
      }
    } catch (err) {
      console.error('Failed to load funds for period:', err);
    }
  }, []);

  // Handle comparison
  const handleCompare = useCallback(async (
    p1Month: string,
    p1Funds: string[],
    p2Month: string,
    p2Funds: string[]
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch holdings for both periods
      const [holdingsP1, holdingsP2] = await Promise.all([
        getHoldings(p1Funds, p1Month),
        getHoldings(p2Funds, p2Month),
      ]);

      console.log(`Loaded ${holdingsP1.length} holdings for P1, ${holdingsP2.length} for P2`);

      // Build comparison data
      const comparison = buildComparisonData(holdingsP1, holdingsP2);
      const compMetrics = calculateMetrics(comparison);

      setComparisonData(comparison);
      setMetrics(compMetrics);
      setSelectedP1({ month: p1Month, funds: p1Funds });
      setSelectedP2({ month: p2Month, funds: p2Funds });
      setRawHoldingsP1(holdingsP1);
      setRawHoldingsP2(holdingsP2);
      setHasCompared(true);
      setSelectorCollapsed(true); // Collapse selector after comparison

      console.log(`Comparison complete: ${comparison.length} companies`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Format period for display
  const formatPeriod = (period: string): string => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month)]} ${year}`;
  };

  const autoP1Label = formatPeriod(selectedP1.month);
  const autoP2Label = formatPeriod(selectedP2.month);
  const p1Label = customLabelsEnabled && (customP1Row1 || customP1Row2) ? `${customP1Row1} ${customP1Row2}`.trim() : autoP1Label;
  const p2Label = customLabelsEnabled && (customP2Row1 || customP2Row2) ? `${customP2Row1} ${customP2Row2}`.trim() : autoP2Label;

  // Custom label callbacks
  const handleCustomLabelsToggle = useCallback((enabled: boolean, autoP1: string, autoP2: string) => {
    setCustomLabelsEnabled(enabled);
    if (enabled) {
      const [a1r1, a1r2] = autoP1.split(' ');
      const [a2r1, a2r2] = autoP2.split(' ');
      setCustomP1Row1(a1r1 || '');
      setCustomP1Row2(a1r2 || '');
      setCustomP2Row1(a2r1 || '');
      setCustomP2Row2(a2r2 || '');
    }
  }, []);

  const handleCustomLabelChange = useCallback((field: 'p1Row1' | 'p1Row2' | 'p2Row1' | 'p2Row2', value: string) => {
    switch (field) {
      case 'p1Row1': setCustomP1Row1(value); break;
      case 'p1Row2': setCustomP1Row2(value); break;
      case 'p2Row1': setCustomP2Row1(value); break;
      case 'p2Row2': setCustomP2Row2(value); break;
    }
  }, []);

  // Top holdings available via getTopHoldings(comparisonData, 'p1'|'p2', 10) when needed

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-slate-950 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4 py-3 px-4 pr-6">
          {/* Logo + App Title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <svg className="h-7 w-9 flex-shrink-0 text-white" viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeLinecap="round">
              <path d="M 3,5 L 19,5" strokeWidth="3.5" />
              <path d="M 9,12 L 27,12" strokeWidth="3.5" />
              <path d="M 5,19 L 23,19" strokeWidth="3.5" />
            </svg>
            <span className="text-lg sm:text-xl md:text-2xl font-bold text-white">
              MDRIFT
            </span>
          </div>

          {/* Description */}
          <span className="hidden sm:inline text-xl text-white truncate min-w-0">
            Mutual Fund Composition &amp; Drift Analytics
          </span>

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Stats - right aligned */}
          {dbStats && (
            <span className="hidden md:inline text-base text-slate-300 whitespace-nowrap flex-shrink-0">
              {dbStats.totalHoldings.toLocaleString()} holdings · {dbStats.totalFunds} funds · {dbStats.totalPeriods} periods
            </span>
          )}

          {/* TIGZIG branding */}
          <a
            href="https://www.tigzig.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-lg sm:text-xl md:text-2xl font-bold text-white hover:opacity-80 transition-opacity flex-shrink-0"
          >
            TIGZIG
          </a>
        </div>
      </header>

      {/* Main Content - scrollbar starts here, below header */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden py-3 md:py-4">
        <div className="max-w-7xl mx-auto px-3 md:px-4 space-y-3 md:space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-white border-2 border-black text-black px-4 py-3 text-base font-medium">
              Error: {error}
            </div>
          )}

          {/* Selector */}
          <ComparisonSelector
            periods={periods}
            funds={funds}
            fundsP1={fundsP1}
            fundsP2={fundsP2}
            onCompare={handleCompare}
            onPeriodChange={handlePeriodChange}
            isLoading={isLoading}
            isCollapsed={selectorCollapsed}
            onToggleCollapse={() => setSelectorCollapsed(!selectorCollapsed)}
            holdingsCount={hasCompared ? groupedData.length : undefined}
            customLabelsEnabled={customLabelsEnabled}
            customP1Row1={customP1Row1}
            customP1Row2={customP1Row2}
            customP2Row1={customP2Row1}
            customP2Row2={customP2Row2}
            onCustomLabelsToggle={handleCustomLabelsToggle}
            onCustomLabelChange={handleCustomLabelChange}
          />

          {/* Results */}
          {hasCompared && comparisonData.length > 0 && metrics && (
            <>
              {/* Summary Section with Clickable Cards + Top 10 */}
              <SummarySection
                data={groupedData}
                metrics={metrics}
                p1Label={p1Label}
                p2Label={p2Label}
                companyDetailOpen={!!selectedCompanyFromTable && companySelectionSource === 'summary'}
                onCompanyClick={(company) => {
                  if (isDebtGroupRow(company)) {
                    setShowDebtModal(true);
                    return;
                  }
                  setSelectedCompanyFromTable(company);
                  setCompanySelectionSource('summary');
                  setActiveTab('charts');
                }}
                onAumClick={() => setShowAumModal(true)}
              />

              {/* Tabs */}
              <div className="flex flex-wrap border-b border-black">
                <button
                  onClick={() => setActiveTab('charts')}
                  className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 text-base md:text-lg font-semibold border-b-2 ${
                    activeTab === 'charts'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-gray-300'
                  }`}
                >
                  Holdings Analyzer
                </button>
                <button
                  onClick={() => setActiveTab('table')}
                  className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 text-base md:text-lg font-semibold border-b-2 ${
                    activeTab === 'table'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-gray-300'
                  }`}
                >
                  Full Data
                </button>
                <button
                  onClick={() => setActiveTab('validation')}
                  className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 text-base md:text-lg font-semibold border-b-2 ${
                    activeTab === 'validation'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-gray-300'
                  }`}
                >
                  Validation
                </button>
                <button
                  onClick={() => setActiveTab('isin-remaps')}
                  className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 text-base md:text-lg font-semibold border-b-2 ${
                    activeTab === 'isin-remaps'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-gray-300'
                  }`}
                >
                  ISIN Remaps
                </button>
                <button
                  onClick={() => setActiveTab('process')}
                  className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 text-base md:text-lg font-semibold border-b-2 ${
                    activeTab === 'process'
                      ? 'text-black border-black'
                      : 'text-black border-transparent hover:border-gray-300'
                  }`}
                >
                  Process
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'charts' && (
                <CombinedChangeChart
                  data={groupedData}
                  title={`All Holdings - ${p1Label}`}
                  p1Label={p1Label}
                  p2Label={p2Label}
                  rawHoldingsP1={rawHoldingsP1}
                  rawHoldingsP2={rawHoldingsP2}
                  funds={funds}
                  metrics={metrics}
                  onAumClick={() => setShowAumModal(true)}
                  onIsinRemapsClick={() => setActiveTab('isin-remaps')}
                  initialSelectedCompany={selectedCompanyFromTable}
                  onCompanyModalClose={() => {
                    if (companySelectionSource === 'table') {
                      setActiveTab('table');
                    }
                    setSelectedCompanyFromTable(null);
                    setCompanySelectionSource(null);
                  }}
                  onDebtGroupClick={() => setShowDebtModal(true)}
                />
              )}

              {activeTab === 'table' && (
                <ComparisonTable
                  data={groupedData}
                  p1Label={p1Label}
                  p2Label={p2Label}
                  rawHoldingsP1={rawHoldingsP1}
                  rawHoldingsP2={rawHoldingsP2}
                  funds={funds}
                  onCompanyClick={(company) => {
                    if (isDebtGroupRow(company)) {
                      setShowDebtModal(true);
                      return;
                    }
                    setSelectedCompanyFromTable(company);
                    setCompanySelectionSource('table');
                    setActiveTab('charts');
                  }}
                  onIsinRemapsClick={() => setActiveTab('isin-remaps')}
                />
              )}

              {activeTab === 'validation' && (
                <ValidationTable />
              )}

              {activeTab === 'isin-remaps' && (
                <ISINRemapsTable />
              )}

              {activeTab === 'process' && (
                <ProcessTab />
              )}
            </>
          )}

          {/* No data message */}
          {hasCompared && comparisonData.length === 0 && !isLoading && (
            <div className="bg-white border border-black px-4 py-8 text-center">
              <p className="text-base text-black">No data found for the selected combination.</p>
              <p className="text-base text-black mt-2">Try selecting different periods or funds.</p>
            </div>
          )}

          {/* Initial state */}
          {!hasCompared && !isLoading && (
            <div className="bg-white border border-black px-4 py-8 text-center">
              <p className="text-base text-black">Select periods and funds above, then click COMPARE to analyze.</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* AUM Breakdown Modal */}
      <AumBreakdownModal
        isOpen={showAumModal}
        onClose={() => setShowAumModal(false)}
        holdingsP1={rawHoldingsP1}
        holdingsP2={rawHoldingsP2}
        p1Label={p1Label}
        p2Label={p2Label}
        p1Month={selectedP1.month}
        p2Month={selectedP2.month}
        funds={funds}
      />

      {/* Debt Group Modal */}
      <DebtGroupModal
        isOpen={showDebtModal}
        onClose={() => setShowDebtModal(false)}
        debtItems={debtItems}
        rawHoldingsP1={rawHoldingsP1}
        rawHoldingsP2={rawHoldingsP2}
        funds={funds}
        p1Label={p1Label}
        p2Label={p2Label}
      />

    </div>
  );
};
