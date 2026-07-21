import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserByEmail } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: { authorization_id?: string }
}) {
  const authorizationId = searchParams.authorization_id
  if (!authorizationId) return <ConsentError message="Demande d’autorisation incomplète." />

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const appUser = await getUserByEmail(user.email)
  if (!appUser) return <ConsentError message="Ce compte n’est pas autorisé à accéder à D-EDGE Ops." />

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) return <ConsentError message={error?.message ?? 'Demande OAuth invalide ou expirée.'} />
  if ('redirect_url' in data) redirect(data.redirect_url)

  const canWrite = appUser.role === 'admin' || appUser.role === 'onboarder'
  const scopes = data.scope.split(' ').filter(Boolean)

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-4">
      <section className="w-full max-w-lg rounded-2xl border border-[#e2e2e2] bg-white p-7 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <p className="text-xs font-bold uppercase tracking-widest text-[#696969]">D-EDGE Ops</p>
        <h1 className="mt-2 text-xl font-bold text-[#1a1a1a]">Autoriser {data.client.name}</h1>
        <p className="mt-2 text-sm text-[#696969]">
          Connecté en tant que <strong>{appUser.email}</strong>. Ce connecteur pourra lire les projets Onboarding
          {canWrite ? ' et proposer des modifications soumises à confirmation.' : '.'}
        </p>

        <div className="mt-5 rounded-xl border border-[#ded8e8] bg-[#f7f5fa] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#59319f]">Accès demandé</p>
          <ul className="mt-2 space-y-1 text-sm text-[#4a4a4a]">
            <li>• Rechercher et consulter les projets, décisions et actions</li>
            {canWrite && <li>• Enregistrer des comptes rendus après prévisualisation</li>}
            {canWrite && <li>• Mettre à jour les produits et leurs dates de reprise</li>}
          </ul>
          {scopes.length > 0 && <p className="mt-3 text-xs text-[#8a8a8a]">Scopes OAuth : {scopes.join(', ')}</p>}
        </div>

        <form action="/api/oauth/decision" method="POST" className="mt-6 flex justify-end gap-3">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" name="decision" value="deny" className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-sm font-semibold text-[#4a4a4a] hover:bg-[#f7f7f7]">
            Refuser
          </button>
          <button type="submit" name="decision" value="approve" className="rounded-lg bg-[#59319f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f2175]">
            Autoriser
          </button>
        </form>
      </section>
    </main>
  )
}

function ConsentError({ message }: { message: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-4"><div className="max-w-md rounded-xl border border-[#fca5a5] bg-white p-6 text-sm text-[#b7221b]">{message}</div></main>
}
