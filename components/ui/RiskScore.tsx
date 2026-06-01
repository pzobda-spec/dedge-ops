export default function RiskScore({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-[#fee3e2] text-[#b7221b]' :
    score >= 60 ? 'bg-[#ffe7cf] text-[#903b07]' :
                  'bg-[#cff7dc] text-[#1c6437]'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${color}`}
    >
      {score}
    </span>
  )
}
