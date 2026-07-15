import { Suspense } from 'react'
import TicketsAnalyticsDashboard from '@/components/analytics/TicketsAnalyticsDashboard'

export default function TicketsPage() {
  return (
    <Suspense fallback={<TicketsPageFallback />}>
      <TicketsAnalyticsDashboard />
    </Suspense>
  )
}

function TicketsPageFallback() {
  return (
    <main className="min-h-full bg-[#f7f7f7] p-6">
      <div className="mx-auto max-w-[1600px] animate-pulse space-y-6">
        <div className="h-20 rounded-xl bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-xl bg-white" />)}
        </div>
      </div>
    </main>
  )
}
