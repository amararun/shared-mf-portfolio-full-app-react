> [\!NOTE]
> This repository is a working example of the concept described below. It may not yet include all recommended security hardening measures. My newer repositories now have robust security at both frontend and backend layers — rate limiting, SQL validation, concurrency controls, error sanitization, and more. You can use this repo to understand the core concept, but please apply security best practices before deploying to production. See my [80+ item Security Checklist](https://tigzig.com/security) and [live hardened examples](https://tigzig.com/security-examples) for reference.

# MDRIFT - Mutual Fund Portfolio Drift Analyzer

Serverless mutual fund portfolio analysis app. Tracks holdings drift across 21 Indian mutual funds (5 categories) over multiple time periods. Runs entirely in-browser - no backend needed.

**Live**: [mf-fetch.tigzig.com](https://mf-fetch.tigzig.com)

## Architecture

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS, deployed on Vercel
- **Database**: SQLite loaded in-browser via sql.js (WebAssembly). The ~1.6MB DB file is downloaded once and queried client-side
- **Raw Data Files**: AMC Excel files hosted on GitHub Releases ([amararun/datasets](https://github.com/amararun/datasets/releases/tag/mf-portfolio-v1)) for download buttons
- **Charts**: Plotly.js for interactive visualizations
- **State**: Zustand for state management

Fully serverless - the Vercel deployment serves static files only. All data processing happens in the browser.

## Key Features

- Period-over-period holdings comparison with new entries, exits, increases, decreases
- Interactive holdings analyzer with charts and full data table
- AUM breakdown by fund and aggregate
- ISIN validation and corporate action tracking
- Debt instrument grouping by issuer
- Direct stock links to NSE and Yahoo Finance

## Data

- `public/data/mf_portfolio.db` - SQLite database served to the browser (holdings + fund metadata)
- `public/data/validation_log.csv` - Conversion validation results displayed in the Validation tab
- Raw Excel files from AMC disclosures are hosted on GitHub Releases and linked via `src/config/fundFileConfig.ts`

## Scripts

Data pipeline scripts are in `scripts/` — Excel-to-SQLite conversion, ISIN mapping, validation, and extension fixing. AMC downloader scripts in `scripts/downloaders/` automate the manual action of downloading publicly available SEBI-mandated monthly portfolio disclosure files from AMC websites.

## Quick Start

```bash
npm install
npm run dev
```

---

## Author

Built by [Amar Harolikar](https://www.linkedin.com/in/amarharolikar/)

Explore 30+ open source AI tools for analytics, databases & automation at [tigzig.com](https://tigzig.com)
