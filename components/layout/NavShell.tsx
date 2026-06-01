'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth')

  if (isAuthPage) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)' }}>
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen">
        <TopBar />
        {children}
      </main>
    </div>
  )
}
