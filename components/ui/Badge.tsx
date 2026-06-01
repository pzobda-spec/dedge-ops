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
  strategic: 'bg-[#fee3e2] text-[#b7221b]',
  gold:      'bg-[#ffe7cf] text-[#903b07]',
  silver:    'bg-[#e2e2e2] text-[#4a4a4a]',
  bronze:    'bg-[#ffe7cf] text-[#903b07]',
  open:      'bg-[#d4e4f8] text-[#2b5bb7]',
  pending:   'bg-[#fbf1ca] text-[#84550e]',
  resolved:  'bg-[#cff7dc] text-[#1c6437]',
  reopened:  'bg-[#e8dbfa] text-[#59319f]',
  urgent:    'bg-[#fee3e2] text-[#b7221b]',
  high:      'bg-[#ffe7cf] text-[#903b07]',
  medium:    'bg-[#d4e4f8] text-[#2b5bb7]',
  low:       'bg-[#e2e2e2] text-[#4a4a4a]',
  fr:        'bg-[#d4e4f8] text-[#2b5bb7]',
  en:        'bg-[#cff7dc] text-[#1c6437]',
  es:        'bg-[#ffe7cf] text-[#903b07]',
  default:   'bg-[#e2e2e2] text-[#4a4a4a]',
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
