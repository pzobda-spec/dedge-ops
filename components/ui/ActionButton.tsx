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
    'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#3b72d1] focus:ring-offset-1'
  const variants = {
    primary:   'bg-[#59319f] text-white hover:bg-[#3f2175]',
    secondary: 'bg-white text-[#59319f] border border-[#59319f] hover:bg-[#f3eeff]',
    danger:    'bg-[#b7221b] text-white hover:bg-[#8f1914]',
  }
  return (
    <button
      className={`${base} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Chargement…' : label}
    </button>
  )
}
