export default function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 ${className}`}>
      {children}
    </div>
  )
}
