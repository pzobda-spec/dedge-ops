import { notFound } from 'next/navigation'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { ProjectDetailTabs, ForceSyncButton } from './ProjectDetailClient'
import { buildZohoProjectUrl } from '@/lib/zoho/projectsClient'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { getUserByEmail } from '@/lib/auth/roles'

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

export default async function OnboardingProjectDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const [project, userEmail] = await Promise.all([
    getOnboardingProjectByIdOrZohoId(params.id),
    getSessionUserEmail(),
  ])

  if (!project) notFound()

  const row = project
  const zohoUrl = row.zoho_project_id ? buildZohoProjectUrl(row.zoho_project_id) : null
  const appUser = userEmail ? await getUserByEmail(userEmail) : null
  const isAdmin = appUser?.role === 'admin' || (!appUser && isHardcodedAccessEmail(userEmail))
  const readonly = appUser?.role === 'commercial_readonly' || !isAdmin && appUser?.role !== 'onboarder'

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

      <div className="p-6 max-w-5xl">
        <ProjectDetailTabs project={row} readonly={readonly} />
      </div>
    </div>
  )
}
