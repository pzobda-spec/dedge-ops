import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { canAccessRestrictedOps } from '@/lib/auth/access'
import { ProjectDetailTabs, ForceSyncButton } from './ProjectDetailClient'
import { supabaseAdmin } from '@/lib/supabase/server'
import { buildZohoProjectUrl } from '@/lib/zoho/projectsClient'
import { formatDate } from '@/lib/utils/dates'

interface OnboardingProjectRow {
  id: string
  zoho_project_id: string | null
  zoho_status: string | null
  hotel_name: string | null
  product: string | null
  owner: string | null
  owner_email: string | null
  start_date: string | null
  target_go_live: string | null
  actual_go_live: string | null
  last_synced_at: string | null
}

const statusLabels: Record<string, string> = {
  not_started: 'Non demarre',
  in_progress: 'En cours',
  pending_client: 'En attente client',
  live: 'Live',
  blocked: 'Bloque',
  other: 'Autre',
}

function productBadgeClass(product: string | null): string {
  if (!product) return 'bg-slate-100 text-slate-500'
  if (product === 'LoungeUp') return 'bg-blue-100 text-blue-700'
  if (product === 'Dmbook Pro') return 'bg-purple-100 text-purple-700'
  if (product === 'WhatsApp') return 'bg-green-100 text-green-700'
  return 'bg-slate-100 text-slate-600'
}

function statusBadgeClass(status: string | null): string {
  if (status === 'live') return 'bg-emerald-100 text-emerald-700'
  if (status === 'blocked') return 'bg-red-100 text-red-700'
  if (status === 'pending_client') return 'bg-yellow-100 text-yellow-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-600'
}

async function getCurrentUserEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

async function getProjectByIdOrZohoId(id: string): Promise<{
  project: OnboardingProjectRow | null
  error: Error | null
}> {
  const select = 'id, zoho_project_id, zoho_status, hotel_name, product, owner, owner_email, start_date, target_go_live, actual_go_live, last_synced_at'

  const { data: projectById, error: idError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(select)
    .eq('id', id)
    .maybeSingle()

  if (idError) return { project: null, error: new Error(idError.message) }
  if (projectById) return { project: projectById as OnboardingProjectRow, error: null }

  const { data: projectByZohoId, error: zohoError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(select)
    .eq('zoho_project_id', id)
    .maybeSingle()

  if (zohoError) return { project: null, error: new Error(zohoError.message) }
  return { project: (projectByZohoId as OnboardingProjectRow | null) ?? null, error: null }
}

export default async function OnboardingProjectDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const [{ project, error }, userEmail] = await Promise.all([
    getProjectByIdOrZohoId(params.id),
    getCurrentUserEmail(),
  ])

  if (error) throw error
  if (!project) notFound()

  const row = project
  const zohoUrl = row.zoho_project_id ? buildZohoProjectUrl(row.zoho_project_id) : null
  const isAdmin = canAccessRestrictedOps(userEmail)

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-1 rounded ${productBadgeClass(row.product)}`}>
                {row.product || 'Produit non renseigne'}
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded ${statusBadgeClass(row.zoho_status)}`}>
                {row.zoho_status ? statusLabels[row.zoho_status] ?? row.zoho_status : 'Statut inconnu'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 truncate">
              {row.hotel_name || 'Projet onboarding'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Owner: {row.owner || '—'}{row.owner_email ? ` · ${row.owner_email}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {zohoUrl && (
              <a
                href={zohoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Voir dans Zoho
              </a>
            )}
            {isAdmin && <ForceSyncButton projectId={row.id} />}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Debut</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{row.start_date ? formatDate(row.start_date) : '—'}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Go-live cible</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{row.target_go_live ? formatDate(row.target_go_live) : '—'}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Go-live reel</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{row.actual_go_live ? formatDate(row.actual_go_live) : '—'}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Derniere sync</p>
            <p className="text-sm font-medium text-slate-900 mt-1">{row.last_synced_at ? formatDate(row.last_synced_at.slice(0, 10)) : '—'}</p>
          </div>
        </div>

        <ProjectDetailTabs />
      </div>
    </div>
  )
}
