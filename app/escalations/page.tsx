import { Suspense } from 'react'
import LinearAnalyticsDashboard from './LinearAnalyticsDashboard'

export default function EscalationsPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <LinearAnalyticsDashboard />
    </Suspense>
  )
}

function DashboardFallback() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <div className="border-b border-[#e2e2e2] bg-white px-6 py-5">
        <div className="h-8 w-28 animate-pulse rounded bg-[#e2e2e2]" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-[#f0f0f0]" />
      </div>
      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-[#e2e2e2] bg-white" />
        ))}
      </div>
    </main>
  )
}
