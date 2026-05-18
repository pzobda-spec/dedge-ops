import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'D-EDGE Ops Cockpit',
  description: 'Cockpit opérationnel D-EDGE CRM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="bg-slate-50 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-56 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  )
}
