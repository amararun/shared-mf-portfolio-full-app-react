/**
 * Stock Links Component
 * Reusable component for external stock links (NSE India, Yahoo Finance)
 */

interface StockLinksProps {
  nseSymbol: string;
  companyName: string;
  yahooSymbol?: string; // Optional override, defaults to nseSymbol.NS
  className?: string;
}

/**
 * Format company name for NSE URL
 * "Fortis Healthcare Limited" -> "Fortis-Healthcare-Limited"
 */
const formatCompanyNameForUrl = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')            // Multiple hyphens to single
    .replace(/^-|-$/g, '');         // Trim hyphens
};

/**
 * Build NSE India URL
 * Format: https://www.nseindia.com/get-quote/equity/{SYMBOL}/{Company-Name}
 */
const getNseUrl = (symbol: string, companyName: string): string => {
  const formattedName = formatCompanyNameForUrl(companyName);
  return `https://www.nseindia.com/get-quote/equity/${symbol}/${formattedName}`;
};

/**
 * Build Yahoo Finance URL
 * Format: https://finance.yahoo.com/quote/{SYMBOL}.NS
 */
const getYahooUrl = (symbol: string): string => {
  return `https://finance.yahoo.com/quote/${symbol}.NS`;
};

export const StockLinks = ({
  nseSymbol,
  companyName,
  yahooSymbol,
  className = ''
}: StockLinksProps) => {
  if (!nseSymbol) return null;

  const nseUrl = getNseUrl(nseSymbol, companyName);
  const yahooUrl = getYahooUrl(yahooSymbol || nseSymbol);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {/* NSE India Link */}
      <a
        href={nseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-slate-700 hover:text-black border border-slate-400 hover:border-slate-600 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="View on NSE India"
      >
        N
      </a>

      {/* Yahoo Finance Link */}
      <a
        href={yahooUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-slate-700 hover:text-black border border-slate-400 hover:border-slate-600 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title="View on Yahoo Finance"
      >
        Y
      </a>
    </span>
  );
};
