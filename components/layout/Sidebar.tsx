'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { canAccessRestrictedOps } from '@/lib/auth/access'

interface NavChild {
  href: string
  label: string
}

interface NavItem {
  href: string
  label: string
  restricted?: boolean
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
    restricted: true,
    children: [
      { href: '/trainings', label: 'Sessions' },
      { href: '/trainings/analytics', label: 'Analytiques' },
    ],
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    restricted: true,
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
  const router = useRouter()
  const [canAccessRestricted, setCanAccessRestricted] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser().then(({ data }) => {
      setCanAccessRestricted(canAccessRestrictedOps(data.user?.email))
    })
  }, [])

  const visibleNavItems = useMemo(
    () => navItems.filter(item => !item.restricted || canAccessRestricted),
    [canAccessRestricted],
  )

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed top-0 left-0 h-full w-56 bg-slate-900 text-white flex flex-col z-40">
      <div className="px-4 py-5 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">D-EDGE Ops</span>
        <p className="text-xs text-slate-400 mt-0.5">Cockpit opérationnel</p>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {visibleNavItems.map(item => {
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
      <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
        <span className="text-xs text-slate-500">D-EDGE Ops · v2</span>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-white transition-colors"
          title="Déconnexion"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
