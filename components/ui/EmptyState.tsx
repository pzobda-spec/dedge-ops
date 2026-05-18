export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
      {message}
    </div>
  )
}
