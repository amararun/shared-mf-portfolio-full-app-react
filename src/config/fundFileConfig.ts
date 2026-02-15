/**
 * Fund File Configuration
 * Maps fund codes to their Excel file paths for download.
 * Files are hosted on GitHub Releases for public access.
 */

// GitHub Release URL for MF portfolio files
export const GITHUB_RELEASE_BASE_URL = 'https://github.com/amararun/datasets/releases/download/mf-portfolio-v1';

export interface FundFileConfig {
  displayName: string;
  amcFolder: string;
  category: string;
  filePattern?: string;  // Custom pattern with placeholders
  morningstarUrl?: string;  // Morningstar India fund page
  valueResearchUrl?: string;  // Value Research Online fund page
  // Default pattern: {amcFolder}_{month_end}.xlsx
}

// Fund configuration matching the Python FUND_CONFIG
export const FUND_FILE_CONFIG: Record<string, FundFileConfig> = {
  // Midcap Funds
  'AXISMCF': {
    displayName: 'Axis Midcap Fund',
    amcFolder: 'axis',
    category: 'midcap',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdmz/axis-midcap-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/15690/axis-midcap-fund-direct-plan/'
  },
  'HDFCMIDCAP': {
    displayName: 'HDFC Mid-Cap Opportunities Fund',
    amcFolder: 'hdfc',
    category: 'midcap',
    filePattern: 'hdfc_midcap_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pe16/hdfc-mid-cap-opportunities-fund--direct-plan---growth-option/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16114/hdfc-mid-cap-fund-direct-plan/'
  },
  'MOTILALMIDCAP': {
    displayName: 'Motilal Oswal Midcap Fund',
    amcFolder: 'motilal',
    category: 'midcap',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/F00000SV9Z/Motilal-Oswal-Midcap-Direct-Growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/24080/motilal-oswal-midcap-fund-direct-plan/'
  },
  'KOTAKMIDCAP': {
    displayName: 'Kotak Emerging Equity Fund',
    amcFolder: 'kotak',
    category: 'midcap',
    filePattern: 'kotak_{month_end}.xls',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pcyj/kotak-emerging-equity-scheme-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/17134/kotak-emerging-equity-fund-direct-plan/'
  },
  'NIPPONMIDCAP': {
    displayName: 'Nippon India Growth Fund',
    amcFolder: 'nippon',
    category: 'midcap',
    filePattern: 'nippon_{month_short}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pd66/nippon-india-growth-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16083/nippon-india-growth-mid-cap-fund-direct-plan/'
  },

  // Smallcap Funds
  'NIPPONSMALLCAP': {
    displayName: 'Nippon India Small Cap Fund',
    amcFolder: 'nippon',
    category: 'smallcap',
    filePattern: 'nippon_{month_short}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pd8f/nippon-india-small-cap-fund---direct-plan---growth-plan/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16182/nippon-india-small-cap-fund-direct-plan/'
  },
  'SBISMALLCAP': {
    displayName: 'SBI Small Cap Fund',
    amcFolder: 'sbi',
    category: 'smallcap',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdtt/sbi-small-cap-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/15787/sbi-small-cap-fund-direct-plan/'
  },
  'AXISSMALLCAP': {
    displayName: 'Axis Small Cap Fund',
    amcFolder: 'axis',
    category: 'smallcap',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000sc5y/axis-small-cap-fund-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/22335/axis-small-cap-fund-direct-plan/'
  },

  // Flexicap Funds
  'PPFASFLEXICAP': {
    displayName: 'Parag Parikh Flexi Cap Fund',
    amcFolder: 'ppfas',
    category: 'flexicap',
    filePattern: 'ppfas_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pzh2/parag-parikh-flexi-cap-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/19701/parag-parikh-flexi-cap-fund-direct-plan/'
  },
  'KOTAKFLEXICAP': {
    displayName: 'Kotak Flexicap Fund',
    amcFolder: 'kotak',
    category: 'flexicap',
    filePattern: 'kotak_{month_end}.xls',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pczg/kotak-flexicap-fund-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/17140/kotak-flexicap-fund-direct-plan/'
  },
  'HDFCFLEXICAP': {
    displayName: 'HDFC Flexi Cap Fund',
    amcFolder: 'hdfc',
    category: 'flexicap',
    filePattern: 'hdfc_flexicap_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdzv/hdfc-flexi-cap-fund--direct-plan-growth-option/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16026/hdfc-flexi-cap-fund-direct-plan/'
  },

  // Large Cap Funds
  'ICICILARGECAP': {
    displayName: 'ICICI Pru Large Cap Fund',
    amcFolder: 'icici',
    category: 'largecap',
    filePattern: 'icici_largecap_{month_short}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pe3w/icici-prudential-bluechip-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/15841/icici-prudential-large-cap-fund-direct-plan/'
  },
  'SBILARGECAP': {
    displayName: 'SBI Blue Chip Fund',
    amcFolder: 'sbi',
    category: 'largecap',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdc9/sbi-bluechip-fund-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16198/sbi-bluechip-fund-direct-plan/'
  },
  'NIPPONLARGECAP': {
    displayName: 'Nippon India Large Cap Fund',
    amcFolder: 'nippon',
    category: 'largecap',
    filePattern: 'nippon_{month_short}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pd8n/nippon-india-large-cap-fund---direct-plan---growth-plan/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16192/nippon-india-large-cap-fund-direct-plan/'
  },
  'MIRAELARGECAP': {
    displayName: 'Mirae Asset Large Cap Fund',
    amcFolder: 'mirae',
    category: 'largecap',
    filePattern: 'mirae_largecap_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pd2h/mirae-asset-large-cap-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16575/mirae-asset-large-cap-fund-direct-plan/'
  },
  'HDFCLARGECAP': {
    displayName: 'HDFC Large Cap Fund',
    amcFolder: 'hdfc',
    category: 'largecap',
    filePattern: 'hdfc_largecap_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/F00000PE1U/HDFC-Large-Cap-Fund--Direct-Plan-Growth-Option/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16164/hdfc-large-cap-fund-direct-plan/'
  },

  // Focused Funds
  'SBIFOCUSED': {
    displayName: 'SBI Focused Equity Fund',
    amcFolder: 'sbi',
    category: 'focused',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdcc/sbi-focused-equity-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16324/sbi-focused-fund-direct-plan/'
  },
  'ICICIFOCUSED': {
    displayName: 'ICICI Pru Focused Equity Fund',
    amcFolder: 'icici',
    category: 'focused',
    filePattern: 'icici_focused_{month_short}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000peqf/icici-prudential-focused-equity-fund-direct-plan-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/17412/icici-prudential-focused-equity-fund-direct-plan/'
  },
  'HDFCFOCUSED': {
    displayName: 'HDFC Focused Fund',
    amcFolder: 'hdfc',
    category: 'focused',
    filePattern: 'hdfc_focused_{month_end}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdzs/hdfc-focused-30-fund--direct-plan-growth-option/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/16021/hdfc-focused-fund-direct-plan/'
  },
  'FRANKLINFOCUSED': {
    displayName: 'Franklin India Focused Equity Fund',
    amcFolder: 'franklin',
    category: 'focused',
    filePattern: 'franklin_{year_month}.xlsx',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdxu/franklin-india-focused-equity-fund-direct-growth/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/15990/franklin-india-focused-equity-fund-direct-plan/'
  },
  'AXISFOCUSED': {
    displayName: 'Axis Focused Fund',
    amcFolder: 'axis',
    category: 'focused',
    morningstarUrl: 'https://www.morningstar.in/mutualfunds/f00000pdm9/axis-focused-fund-direct-plan-growth-option/overview.aspx',
    valueResearchUrl: 'https://www.valueresearchonline.com/funds/15684/axis-focused-fund-direct-plan/'
  },
};

/**
 * Get the file path for a fund and month
 * Returns GitHub release URL for the file
 */
export function getFundFilePath(fundCode: string, monthEnd: string): string | null {
  const config = FUND_FILE_CONFIG[fundCode];
  if (!config) return null;

  // Parse month_end (YYYY-MM-DD or YYYY-MM)
  const parts = monthEnd.split('-');
  const year = parts[0];
  const month = parseInt(parts[1], 10);

  // Create date for formatting
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthShort = `${year}-${monthNames[month - 1]}`; // 2025-Dec
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`; // 2025-09

  // Get full month_end if only YYYY-MM provided
  let fullMonthEnd = monthEnd;
  if (parts.length === 2) {
    // Calculate last day of month
    const lastDay = new Date(parseInt(year), month, 0).getDate();
    fullMonthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  let filename: string;
  if (config.filePattern) {
    filename = config.filePattern
      .replace('{month_short}', monthShort)
      .replace('{month_end}', fullMonthEnd)
      .replace('{year_month}', yearMonth);
  } else {
    // Default pattern: {amcFolder}_{month_end}.xlsx
    filename = `${config.amcFolder}_${fullMonthEnd}.xlsx`;
  }

  // Return GitHub release URL (flat structure, no folders)
  return `${GITHUB_RELEASE_BASE_URL}/${filename}`;
}

/**
 * Get all file info for a set of funds and months
 */
export interface FundFileInfo {
  fundCode: string;
  displayName: string;
  month: string;
  filePath: string;
  fileName: string;
}

export function getFilesForFunds(
  funds: string[],
  months: string[]
): FundFileInfo[] {
  const files: FundFileInfo[] = [];

  for (const fundCode of funds) {
    const config = FUND_FILE_CONFIG[fundCode];
    if (!config) continue;

    for (const month of months) {
      const filePath = getFundFilePath(fundCode, month);
      if (!filePath) continue;

      const fileName = filePath.split('/').pop() || '';
      files.push({
        fundCode,
        displayName: config.displayName,
        month,
        filePath,
        fileName
      });
    }
  }

  return files;
}
