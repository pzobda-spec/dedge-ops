export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Vous n&apos;avez pas accès à cette page</h1>
        <p className="mt-2 text-sm text-slate-500">
          Votre rôle ne permet pas d&apos;ouvrir cette section du cockpit.
        </p>
      </div>
    </div>
  )
}
