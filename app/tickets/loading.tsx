export default function TicketsLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-slate-200 rounded" />
        <div className="h-9 w-48 bg-slate-200 rounded-lg" />
      </div>
      <div className="h-10 bg-slate-200 rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-200 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
