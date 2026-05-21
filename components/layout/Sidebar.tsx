'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavChild {
  href: string
  label: string
}

interface NavItem {
  href: string
  label: string
  children?: NavChild[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord' },
  {
    href: '/tickets',
    label: 'Tickets',
    children: [
      { href: '/tickets', label: 'Tickets' },
      { href: '/tickets/analytics', label: 'Analytiques' },
    ],
  },
  {
    href: '/escalations',
    label: 'Board Bug',
    children: [
      { href: '/escalations', label: 'Board' },
      { href: '/escalations/analytics', label: 'Analytiques' },
    ],
  },
  {
    href: '/trainings',
    label: 'Formations',
    children: [
      { href: '/trainings', label: 'Sessions' },
      { href: '/trainings/analytics', label: 'Analytiques' },
    ],
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    children: [
      { href: '/onboarding', label: 'Dashboard' },
      { href: '/onboarding/board', label: 'Board' },
      { href: '/onboarding/charge', label: 'Charge' },
    ],
  },
  { href: '/settings', label: 'Paramètres' },
]

function isParentActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function isChildActive(href: string, pathname: string): boolean {
  return pathname === href
}

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
            const parentActive = isParentActive(item.href, pathname)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                    parentActive && !item.children
                      ? 'bg-slate-700 text-white font-medium'
                      : parentActive && item.children
                      ? 'text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
                {item.children && parentActive && (
                  <ul className="mt-0.5 mb-1 space-y-0.5 pl-3">
                    {item.children.map(child => {
                      const childActive = isChildActive(child.href, pathname)
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={`flex items-center px-3 py-1.5 rounded-md text-xs transition-colors ${
                              childActive
                                ? 'bg-slate-700 text-white font-medium'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            {child.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
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
