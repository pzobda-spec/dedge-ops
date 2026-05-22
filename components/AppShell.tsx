'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './layout/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth')

  if (isAuthPage) {
    return <div className="min-h-screen bg-slate-50">{children}</div>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen">{children}</main>
    </div>
  )
}
