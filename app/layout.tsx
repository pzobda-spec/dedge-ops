import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })

export const metadata: Metadata = {
  title: 'D-EDGE Ops Cockpit',
  description: 'Cockpit opérationnel D-EDGE CRM',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <body className="bg-slate-50 text-slate-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
