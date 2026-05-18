export default function RiskScore({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-red-100 text-red-800'
      : score >= 60
      ? 'bg-orange-100 text-orange-800'
      : 'bg-green-100 text-green-800'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${color}`}
    >
      {score}
    </span>
  )
}
