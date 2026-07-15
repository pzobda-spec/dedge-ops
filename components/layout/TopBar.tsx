'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { Role } from '@/lib/auth/roles'

interface TopBarProps {
  title?: string
  subtitle?: string
  onMenuClick?: () => void
}

const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  onboarder: 'Onboarder',
  support: 'Support',
  commercial_readonly: 'Commercial',
}

const roleClasses: Record<Role, string> = {
  admin:               'bg-[#fee3e2] text-[#b7221b] border-[#fca5a5]',
  onboarder:           'bg-[#e8dbfa] text-[#59319f] border-[#c0a4f0]',
  support:             'bg-[#d4e4f8] text-[#2b5bb7] border-[#93c5fd]',
  commercial_readonly: 'bg-[#e2e2e2] text-[#4a4a4a] border-[#d1d5db]',
}

function initials(email: string, fullName: string | null): string {
  const source = fullName?.trim() || email.split('@')[0]
  return source
    .split(/[ ._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'
}

export default function TopBar({ title, subtitle, onMenuClick }: TopBarProps) {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [open, setOpen] = useState(false)

  async function logout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    sessionStorage.removeItem('dedge-current-user')
    router.push('/login')
  }

  return (
    <div className="flex min-h-[65px] items-center justify-between gap-3 border-b border-[#e2e2e2] bg-white px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Ouvrir la navigation"
          className="rounded-lg border border-[#e2e2e2] p-2 text-[#4a4a4a] hover:bg-[#f7f7f7] lg:hidden"
          onClick={onMenuClick}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="min-w-0">
        {title && <h1 className="text-xl font-semibold text-[#1a1a1a]">{title}</h1>}
        {subtitle && <p className="text-sm text-[#696969] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {user && (
        <div className="relative">
          <button
            onClick={() => setOpen(value => !value)}
            className="flex items-center gap-2 rounded-lg border border-[#e2e2e2] bg-white px-2.5 py-1.5 hover:bg-[#f7f7f7] transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#59319f] text-xs font-semibold text-white">
              {initials(user.email, user.full_name)}
            </span>
            <span className="hidden max-w-[180px] truncate text-sm text-[#4a4a4a] sm:inline">{user.email}</span>
            <span className={`hidden rounded-full border px-2 py-0.5 text-xs font-medium sm:inline ${roleClasses[user.role]}`}>
              {roleLabels[user.role]}
            </span>
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-[#e2e2e2] bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
              <Link href="/settings/me" className="block rounded-lg px-3 py-2 text-sm text-[#4a4a4a] hover:bg-[#f7f7f7]">
                Mes paramètres
              </Link>
              <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#b7221b] hover:bg-[#fee3e2]">
                Déconnexion
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
