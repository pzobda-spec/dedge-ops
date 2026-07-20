'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { Role } from '@/lib/auth/roles'

interface NavChild {
  href: string
  label: string
}

interface NavItem {
  href: string
  label: string
  roles: Role[]
  children?: NavChild[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', roles: ['admin', 'support'] },
  { href: '/tickets', label: 'Tickets', roles: ['admin', 'support'] },
  { href: '/escalations', label: 'Bugs', roles: ['admin', 'support'] },
  {
    href: '/trainings',
    label: 'Formations',
    roles: ['admin'],
    children: [
      { href: '/trainings', label: 'Sessions' },
      { href: '/trainings/analytics', label: 'Analytiques' },
    ],
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    roles: ['admin', 'onboarder', 'commercial_readonly'],
    children: [
      { href: '/onboarding', label: 'Projets' },
      { href: '/onboarding/pilotage', label: 'Pilotage' },
    ],
  },
  { href: '/knowledge', label: 'Knowledge Base', roles: ['admin', 'support'] },
  { href: '/reporting', label: 'Reporting', roles: ['admin', 'support'] },
  { href: '/assistant', label: 'Assistant IA', roles: ['admin', 'support'] },
  { href: '/settings', label: 'Paramètres', roles: ['admin', 'onboarder', 'support', 'commercial_readonly'] },
  {
    href: '/admin/users',
    label: 'Administration',
    roles: ['admin'],
    children: [
      { href: '/admin/users', label: 'Utilisateurs' },
    ],
  },
]

function isParentActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function isChildActive(href: string, pathname: string): boolean {
  return pathname === href
}

export default function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()

  const visibleNavItems = useMemo(
    () => navItems.filter(item => user && item.roles.includes(user.role)),
    [user],
  )

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    sessionStorage.removeItem('dedge-current-user')
    router.push('/login')
  }

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col bg-slate-900 text-white shadow-xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-bold text-lg tracking-tight">D-EDGE Ops</span>
            <p className="text-xs text-slate-400 mt-0.5">Cockpit analytique</p>
          </div>
          <button
            type="button"
            aria-label="Fermer le menu"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            onClick={onNavigate}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {visibleNavItems.map(item => {
            const parentActive = isParentActive(item.href, pathname)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                    parentActive && !item.children
                      ? 'bg-[#3f2175] text-white font-medium'
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
                            onClick={onNavigate}
                            className={`flex items-center px-3 py-1.5 rounded-md text-xs transition-colors ${
                              childActive
                                ? 'bg-[#e8dbfa] text-[#59319f] font-medium'
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
