/**
 * AMC Configuration for URL templates and fund data
 *
 * URL Template Placeholders:
 * - {DD} - Day with leading zero (01-31)
 * - {MM} - Month with leading zero (01-12)
 * - {YY} - 2-digit year (25)
 * - {YYYY} - 4-digit year (2025)
 * - {MONTH} - Full month name title case (January, February, etc.)
 * - {month} - Full month name lowercase (january, february, etc.)
 * - {MON} - 3-letter month uppercase (JAN, FEB, etc.)
 * - {Mon} - 3-letter month title case (Jan, Feb, etc.)
 */

export interface AMCFund {
  id: string;
  amc: string;
  amcDisplayName: string;
  category: 'all' | 'small_cap' | 'mid_cap' | 'large_cap' | 'flexi_cap' | 'multi_cap' | 'focused' | 'elss' | 'value';
  displayName: string;
  shortName: string;
  urlTemplate: string | null;
  defaultSheetName?: string;  // Hint for user, not auto-filled
  isActive: boolean;
  notes?: string;
}

// AMC display colors for UI
export const amcColors: Record<string, { bg: string; text: string; border: string }> = {
  axis: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  hdfc: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  icici: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  sbi: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  ppfas: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  franklin: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  quant: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  kotak: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  nippon: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  dsp: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  motilal: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
};

// Master list of tracked funds
// Start with "all funds" type AMCs (single file with multiple tabs)
export const amcFunds: AMCFund[] = [
  // Axis - All Funds (single file) - VERIFIED WORKING 13/13 months
  {
    id: 'axis-all',
    amc: 'axis',
    amcDisplayName: 'Axis Mutual Fund',
    category: 'all',
    displayName: 'Axis All Funds',
    shortName: 'Axis',
    urlTemplate: 'https://www.axismf.com/cms/sites/default/files/Statutory/Monthly%20Portfolio-{DD}%20{MM}%20{YY}.xlsx',
    defaultSheetName: 'Equity Holdings',
    isActive: true,
    notes: 'Fallback: space before dash (Portfolio -DD) if 404',
  },

  // Kotak - All Funds - VERIFIED WORKING 13/13 months
  {
    id: 'kotak-all',
    amc: 'kotak',
    amcDisplayName: 'Kotak Mahindra MF',
    category: 'all',
    displayName: 'Kotak All Funds',
    shortName: 'Kotak',
    urlTemplate: 'https://vatseelabs-s3.kotakmf.com/FormsDownloads/Portfolios/Consolidated-Portfolio-as-on-{MONTH}-{DD},-{YYYY}/ConsolidatedSEBIPortfolio{MONTH}{YYYY}.xlsx',
    isActive: true,
    notes: '6 fallbacks: .xls, Aug abbrev, lowercase p, Sebi case, no day',
  },

  // DSP - All Funds (URL TBD)
  {
    id: 'dsp-all',
    amc: 'dsp',
    amcDisplayName: 'DSP Mutual Fund',
    category: 'all',
    displayName: 'DSP All Funds',
    shortName: 'DSP',
    urlTemplate: null,  // TBD - needs validation
    isActive: false,
    notes: 'URL pattern needs validation',
  },

  // Nippon India - All Funds (URL TBD)
  {
    id: 'nippon-all',
    amc: 'nippon',
    amcDisplayName: 'Nippon India MF',
    category: 'all',
    displayName: 'Nippon India All Funds',
    shortName: 'Nippon',
    urlTemplate: null,  // TBD - needs validation
    isActive: false,
    notes: 'URL pattern needs validation',
  },

  // PPFAS - All Funds - VERIFIED WORKING (Jan 2025) - 13/13 months
  {
    id: 'ppfas-all',
    amc: 'ppfas',
    amcDisplayName: 'PPFAS Mutual Fund',
    category: 'all',
    displayName: 'Parag Parikh All Funds',
    shortName: 'PPFAS',
    urlTemplate: 'https://amc.ppfas.com/downloads/portfolio-disclosure/{YYYY}/PPFAS_Monthly_Portfolio_Report_{MONTH}_{DD}_{YYYY}.xls',
    defaultSheetName: 'Equity',
    isActive: true,
    notes: 'Mixed .xls/.xlsx - try .xls first, fallback to .xlsx if 404',
  },

  // Quant - All Funds (URL TBD)
  {
    id: 'quant-all',
    amc: 'quant',
    amcDisplayName: 'Quant Mutual Fund',
    category: 'all',
    displayName: 'Quant All Funds',
    shortName: 'Quant',
    urlTemplate: null,  // TBD - needs validation
    isActive: false,
    notes: 'URL pattern needs validation',
  },

  // Franklin - All Funds (URL TBD)
  {
    id: 'franklin-all',
    amc: 'franklin',
    amcDisplayName: 'Franklin Templeton',
    category: 'all',
    displayName: 'Franklin All Funds',
    shortName: 'Franklin',
    urlTemplate: null,  // TBD - needs validation
    isActive: false,
    notes: 'URL pattern needs validation',
  },

  // ICICI - All Funds (URL template TBD - complex auth)
  {
    id: 'icici-all',
    amc: 'icici',
    amcDisplayName: 'ICICI Prudential',
    category: 'all',
    displayName: 'ICICI All Funds',
    shortName: 'ICICI',
    urlTemplate: null,  // Complex - requires form submission
    isActive: false,
    notes: 'Requires form submission, not direct URL',
  },

  // SBI - All Funds (URL template TBD - complex auth)
  {
    id: 'sbi-all',
    amc: 'sbi',
    amcDisplayName: 'SBI Mutual Fund',
    category: 'all',
    displayName: 'SBI All Funds',
    shortName: 'SBI',
    urlTemplate: null,  // Complex - requires navigation
    isActive: false,
    notes: 'Requires form selection, not direct URL',
  },

  // HDFC - All Funds (TBD - complex patterns)
  {
    id: 'hdfc-all',
    amc: 'hdfc',
    amcDisplayName: 'HDFC Mutual Fund',
    category: 'all',
    displayName: 'HDFC All Funds',
    shortName: 'HDFC',
    urlTemplate: null,  // TBD - need to investigate pattern
    isActive: false,
    notes: 'URL pattern needs investigation',
  },

  // Motilal Oswal - All Funds (COMPLEX - random CMS prefix)
  {
    id: 'motilal-all',
    amc: 'motilal',
    amcDisplayName: 'Motilal Oswal MF',
    category: 'all',
    displayName: 'Motilal Oswal All Funds',
    shortName: 'Motilal',
    urlTemplate: null,  // CMS generates random file prefix each month
    isActive: false,
    notes: 'Unpredictable URL - CMS generates random prefix (db566, 966d5, etc.) per upload',
  },
];

// Get only active funds with URL templates
export function getActiveFunds(): AMCFund[] {
  return amcFunds.filter(f => f.isActive && f.urlTemplate);
}

// Get fund by ID
export function getFundById(id: string): AMCFund | undefined {
  return amcFunds.find(f => f.id === id);
}

// Parse URL template with date
export function parseUrlTemplate(template: string, monthEnd: Date): string {
  const day = String(monthEnd.getDate()).padStart(2, '0');
  const month = String(monthEnd.getMonth() + 1).padStart(2, '0');
  const year = String(monthEnd.getFullYear());
  const shortYear = year.slice(-2);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[monthEnd.getMonth()];
  const monthShortName = monthShort[monthEnd.getMonth()];

  return template
    .replace(/{DD}/g, day)
    .replace(/{MM}/g, month)
    .replace(/{YYYY}/g, year)
    .replace(/{YY}/g, shortYear)
    .replace(/{MONTH}/g, monthName)
    .replace(/{month}/g, monthName.toLowerCase())
    .replace(/{MON}/g, monthShortName.toUpperCase())
    .replace(/{Mon}/g, monthShortName);
}

// Generate last N month-end dates
export function getMonthEndDates(count: number): { value: Date; label: string; isoDate: string }[] {
  const months: { value: Date; label: string; isoDate: string }[] = [];
  const today = new Date();

  for (let i = 1; i <= count; i++) {
    // Get first day of (current month - i)
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
    // Get last day of that month
    const lastDay = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);

    const year = lastDay.getFullYear();
    const month = String(lastDay.getMonth() + 1).padStart(2, '0');
    const day = String(lastDay.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    const label = lastDay.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    months.push({ value: lastDay, label, isoDate });
  }

  return months;
}

// Get AMC color scheme
export function getAmcColor(amc: string): { bg: string; text: string; border: string } {
  return amcColors[amc] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
}
