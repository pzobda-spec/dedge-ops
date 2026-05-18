interface ActionButtonProps {
  label: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
}

export default function ActionButton({
  label,
  onClick,
  variant = 'primary',
  disabled,
  loading,
}: ActionButtonProps) {
  const base =
    'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50'
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button
      className={`${base} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Chargement...' : label}
    </button>
  )
}
