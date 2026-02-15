import { BarChart3 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function Header() {
  const location = useLocation()
  const path = location.pathname

  const isActive = (checkPath: string) => path === checkPath

  const navLinks = [
    { path: '/dashboard', label: 'Analytics', icon: BarChart3 },
  ]

  return (
    <header className="bg-slate-950">
      <div className="max-w-7xl mx-auto flex items-center gap-4 py-2 px-4">
        {/* Brand with Logo */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <svg className="h-6 w-7 flex-shrink-0 text-white" viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M 3,5 L 19,5" strokeWidth="3.5" />
            <path d="M 9,12 L 27,12" strokeWidth="3.5" />
            <path d="M 5,19 L 23,19" strokeWidth="3.5" />
          </svg>
          <span className="text-xl font-bold text-white">MDRIFT</span>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-600" />

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-base font-medium transition-colors ${
                  isActive(link.path)
                    ? 'bg-sky-500 text-white'
                    : 'text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* TIGZIG branding */}
        <a
          href="https://www.tigzig.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl font-bold text-white hover:opacity-70 transition-opacity"
        >
          TIGZIG
        </a>
      </div>
    </header>
  )
}
