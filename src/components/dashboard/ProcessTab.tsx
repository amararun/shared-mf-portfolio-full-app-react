/**
 * Process Tab - Explains the data methodology for end users.
 */

export const ProcessTab = () => {
  return (
    <div className="py-4 space-y-6 pr-4">

      <div>
        <h3 className="text-lg font-bold text-black mb-2">1. Data Collection</h3>
        <p className="text-base text-black leading-relaxed">
          Every month, each mutual fund (AMC) publishes a detailed Excel file listing every single stock, bond,
          and instrument they hold — along with the quantity and market value. These are public regulatory
          disclosures mandated by SEBI.
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          We collect these files using automated download scripts for most AMCs. A few AMCs have
          website protections (CAPTCHAs, login gates) that prevent automation — for those, files are
          downloaded manually. All original Excel files are preserved on GitHub Releases and available
          for download via the AUM modal.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">2. Extraction &amp; Database Loading</h3>
        <p className="text-base text-black leading-relaxed">
          Each AMC uses a different Excel format — different column layouts, sheet names, and conventions.
          Fund-specific processing scripts read each Excel file, identify the correct data columns (company name,
          ISIN, quantity, market value), and load the holdings into a structured SQLite database.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">3. ISIN Identification</h3>
        <p className="text-base text-black leading-relaxed">
          Every security traded in India has a unique 12-character identifier called an ISIN
          (International Securities Identification Number), assigned by NSDL. We download
          the complete ISIN master database (~361,000 securities) from NSDL and the NSE equity list
          to build our reference.
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          Each holding from every fund is matched against this master. This lets us reliably identify the
          same company across different funds — even when fund houses spell the name differently
          (e.g., "Infosys Ltd" vs "Infosys Limited" vs "INFOSYS LTD.").
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">4. Corporate Action Mapping</h3>
        <p className="text-base text-black leading-relaxed">
          When a company does a stock split, bonus issue, or other restructuring, a new ISIN is
          issued. This means the same company can appear under two different ISINs across months.
          For example, if a company had a stock split between December and January, funds that bought
          before the split have the old ISIN and funds that bought after have the new one.
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          Our system automatically detects these situations by comparing ISINs from the same company and maps
          the old ISIN to the new one. This ensures that holdings are correctly grouped as one company
          across time periods, not shown as two separate entries.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">5. Debt Instrument Grouping</h3>
        <p className="text-base text-black leading-relaxed">
          Mutual funds hold many short-term debt instruments like Certificates of Deposit (CDs)
          from banks and Commercial Papers (CPs) from companies. A single bank like HDFC Bank might
          have 5–10 separate CDs with different maturity dates, each with its own ISIN.
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          Rather than showing these as separate entries, we group all CDs from the same bank and all CPs
          from the same company into a single consolidated entry. Government T-Bills and G-Secs
          are similarly grouped. This gives a cleaner, more meaningful view of a fund's debt exposure.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">6. Multi-Level Validation</h3>
        <p className="text-base text-black leading-relaxed">
          Multiple validation checks are run at different stages to ensure data accuracy:
        </p>
        <ul className="list-disc list-outside ml-5 mt-2 space-y-1.5 text-base text-black">
          <li>
            <span className="font-medium">Automated total matching</span> — After loading each fund, the database total
            is compared against the grand total in the original Excel file. These must match exactly (0.00% difference).
          </li>
          <li>
            <span className="font-medium">ISIN mapping review</span> — All corporate action mappings and debt groupings
            are exported to a human-readable file and reviewed before being applied. The ISIN Remaps tab shows
            these mappings.
          </li>
          <li>
            <span className="font-medium">Cross-validation with Value Research</span> — Fund-level net asset totals
            are independently verified against Value Research Online data. Results are visible in the
            Validation tab.
          </li>
        </ul>
        <p className="text-base text-black leading-relaxed mt-2">
          Validation results for every fund-month combination are shown in the <span className="font-medium">Validation</span> tab,
          including any cases with known expected differences (e.g., funds holding futures where
          mark-to-market values are included).
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">7. Frontend Database &amp; Delivery</h3>
        <p className="text-base text-black leading-relaxed">
          The final processed data is exported as a compact SQLite database (~1.6 MB) containing
          only the holdings data needed for the dashboard. This file is fully public and hosted
          on GitHub.
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          When you open this app, the database is downloaded directly into your browser — no server
          or backend is involved. All queries, filtering, and calculations happen locally
          in your browser using sql.js (SQLite compiled to WebAssembly).
        </p>
        <p className="text-base text-black leading-relaxed mt-2">
          The original AMC Excel files are also available on GitHub Releases and can be downloaded
          using the download buttons in the AUM breakdown modal.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-black mb-2">8. Metrics &amp; Calculations</h3>
        <p className="text-base text-black leading-relaxed">
          The dashboard computes various metrics like percentage weight change, market value change,
          and quantity change across periods. For details on how each metric is calculated,
          click the <span className="font-medium">ⓘ</span> information icons next to column
          headers in the Holdings Analyzer and Full Data tabs.
        </p>
      </div>

    </div>
  );
};
