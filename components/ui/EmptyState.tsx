export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-[#696969] text-sm">
      {message}
    </div>
  )
}
