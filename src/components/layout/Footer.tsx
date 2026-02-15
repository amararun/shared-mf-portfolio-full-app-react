interface FooterProps {
  className?: string
}

export function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`mt-auto ${className}`}>
      {/* Data Attribution - Light background */}
      <div
        className="py-2"
        style={{ backgroundColor: '#FAFAFA', borderTop: '1px solid #E2E8F0' }}
      >
        <div className="max-w-6xl mx-auto px-4 text-center">
          <span className="text-sm md:text-base" style={{ fontWeight: '500', color: '#334155' }}>
            Built with monthly statutory portfolio disclosures | Data sourced from AMC websites
          </span>
        </div>
      </div>

      {/* Author Info - Dark background */}
      <div
        className="py-2"
        style={{ backgroundColor: '#0F172A' }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2 md:gap-1">
            <div className="text-center md:text-left flex flex-wrap justify-center md:justify-start items-center gap-x-1.5 gap-y-1" style={{ fontSize: '14px', fontWeight: '500' }}>
              <span style={{ color: '#FFFFFF', fontWeight: '500' }}>Amar Harolikar</span>
              <span className="hidden sm:inline" style={{ color: '#38BDF8' }}>•</span>
              <span style={{ color: '#E2E8F0', fontWeight: '500' }}>Decision Sciences & Applied AI</span>
              <span className="hidden sm:inline" style={{ color: '#38BDF8' }}>•</span>
              <span style={{ color: '#E2E8F0', fontWeight: '500' }}>
                <i className="fas fa-envelope mr-1"></i>amar@harolikar.com
              </span>
              <span className="hidden sm:inline" style={{ color: '#38BDF8' }}>•</span>
              <a
                href="https://www.linkedin.com/in/amarharolikar"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38BDF8', fontWeight: '500' }}
                className="hover:text-white hover:underline"
              >
                <i className="fab fa-linkedin mr-1"></i>LinkedIn
              </a>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-3 md:gap-4" style={{ fontSize: '14px', fontWeight: '500' }}>
              <a
                href="https://github.com/amararun"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38BDF8', fontWeight: '500' }}
                className="hover:text-white hover:underline"
              >
                <i className="fab fa-github mr-1"></i>GitHub
              </a>
              <a
                href="https://www.tigzig.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38BDF8', fontWeight: '500' }}
                className="hover:text-white hover:underline"
              >
                <i className="fas fa-globe mr-1"></i>Tigzig
              </a>
              <a
                href="https://www.tigzig.com/privacy-policy-tigzig"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38BDF8', fontWeight: '500' }}
                className="hover:text-white hover:underline"
              >
                <i className="fas fa-shield-alt mr-1"></i>Privacy
              </a>
              <a
                href="https://www.tigzig.com/terms-conditions"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38BDF8', fontWeight: '500' }}
                className="hover:text-white hover:underline"
              >
                <i className="fas fa-file-contract mr-1"></i>Terms
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
