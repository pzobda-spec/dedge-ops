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
}

const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  onboarder: 'Onboarder',
  support: 'Support',
  commercial_readonly: 'Commercial',
}

const roleClasses: Record<Role, string> = {
  admin: 'bg-red-50 text-red-700 border-red-200',
  onboarder: 'bg-blue-50 text-blue-700 border-blue-200',
  support: 'bg-purple-50 text-purple-700 border-purple-200',
  commercial_readonly: 'bg-slate-100 text-slate-600 border-slate-200',
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

export default function TopBar({ title, subtitle }: TopBarProps) {
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
    <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
      <div>
        {title && <h1 className="text-xl font-semibold text-slate-900">{title}</h1>}
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {user && (
        <div className="relative">
          <button
            onClick={() => setOpen(value => !value)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials(user.email, user.full_name)}
            </span>
            <span className="max-w-[180px] truncate text-sm text-slate-700">{user.email}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${roleClasses[user.role]}`}>
              {roleLabels[user.role]}
            </span>
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <Link href="/settings/me" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Mes paramètres
              </Link>
              <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">
                Déconnexion
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
