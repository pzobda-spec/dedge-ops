export default function TicketsLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-slate-200 rounded" />
          <div className="h-4 w-72 bg-slate-100 rounded" />
        </div>
        <div className="h-5 w-40 bg-slate-200 rounded" />
      </div>
      <div className="h-40 bg-white border border-slate-200 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-80 bg-white border border-slate-200 rounded-xl" />
        <div className="h-80 bg-white border border-slate-200 rounded-xl" />
      </div>
    </div>
  )
}
