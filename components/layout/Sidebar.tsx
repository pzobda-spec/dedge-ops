'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Tableau de bord' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/escalations', label: 'Escalades' },
  { href: '/trainings', label: 'Formations' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/knowledge', label: 'Base de connaissances' },
  { href: '/reporting', label: 'Reporting' },
  { href: '/assistant', label: 'Assistant IA' },
  { href: '/settings', label: 'Paramètres' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-full w-56 bg-slate-900 text-white flex flex-col z-40">
      <div className="px-4 py-5 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">D-EDGE Ops</span>
        <p className="text-xs text-slate-400 mt-0.5">Cockpit opérationnel</p>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
        D-EDGE Ops · v2
      </div>
    </aside>
  )
}
