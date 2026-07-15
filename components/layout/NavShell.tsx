'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const isAuthPage = pathname === '/login' || pathname?.startsWith('/auth')

  useEffect(() => setMobileNavigationOpen(false), [pathname])

  if (isAuthPage) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)' }}>
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen min-w-0">
      {mobileNavigationOpen && (
        <button
          type="button"
          aria-label="Fermer la navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileNavigationOpen} onNavigate={() => setMobileNavigationOpen(false)} />
      <main className="min-h-screen min-w-0 flex-1 lg:ml-56">
        <TopBar onMenuClick={() => setMobileNavigationOpen(true)} />
        {children}
      </main>
    </div>
  )
}
