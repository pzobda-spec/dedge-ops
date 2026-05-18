type BadgeVariant =
  | 'strategic'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'open'
  | 'pending'
  | 'resolved'
  | 'reopened'
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'fr'
  | 'en'
  | 'es'
  | 'default'

const variantClasses: Record<BadgeVariant, string> = {
  strategic: 'bg-red-100 text-red-800',
  gold: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-200 text-slate-700',
  bronze: 'bg-orange-50 text-orange-700',
  open: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  reopened: 'bg-purple-100 text-purple-800',
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-slate-100 text-slate-600',
  fr: 'bg-blue-100 text-blue-800',
  en: 'bg-green-100 text-green-800',
  es: 'bg-yellow-100 text-yellow-800',
  default: 'bg-slate-100 text-slate-600',
}

export default function Badge({
  label,
  variant = 'default',
}: {
  label: string
  variant?: BadgeVariant
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]}`}
    >
      {label}
    </span>
  )
}
