import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from '@/components/providers/SessionProvider'
import AppShell from '@/components/layout/AppShell'

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
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  )
}
