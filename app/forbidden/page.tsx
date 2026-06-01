export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <div className="max-w-md rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-8 text-center">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Vous n&apos;avez pas accès à cette page</h1>
        <p className="mt-2 text-sm text-[#696969]">
          Votre rôle ne permet pas d&apos;ouvrir cette section du cockpit.
        </p>
      </div>
    </div>
  )
}
