import { notFound } from 'next/navigation'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { ProjectDetailTabs, ForceSyncButton } from './ProjectDetailClient'
import { buildZohoProjectUrl } from '@/lib/zoho/projectsClient'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { getUserByEmail } from '@/lib/auth/roles'

const STATUS_LABELS: Record<string, string> = {
  not_started:    'Non démarré',
  in_progress:    'En cours',
  pending_client: 'En attente client',
  live:           'Live',
  blocked:        'Bloqué',
  other:          'Autre',
}

function productBadgeClass(product: string | null): string {
  if (!product) return 'bg-[#f7f7f7] text-[#696969]'
  if (product === 'LoungeUp')   return 'bg-[#d4e4f8] text-[#2b5bb7]'
  if (product === 'Dmbook Pro') return 'bg-[#e8dbfa] text-[#59319f]'
  if (product === 'WhatsApp')   return 'bg-[#cff7dc] text-[#1c6437]'
  return 'bg-[#f7f7f7] text-[#696969]'
}

function statusBadgeClass(status: string | null): string {
  if (status === 'live')           return 'bg-[#cff7dc] text-[#1c6437]'
  if (status === 'blocked')        return 'bg-[#fee3e2] text-[#b7221b]'
  if (status === 'pending_client') return 'bg-[#fbf1ca] text-[#84550e]'
  if (status === 'in_progress')    return 'bg-[#d4e4f8] text-[#2b5bb7]'
  return 'bg-[#f7f7f7] text-[#696969]'
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

  if (!project) {
    const zohoUrl = buildZohoProjectUrl(params.id)
    return (
      <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
        <div className="bg-white border-b border-[#e2e2e2] px-6 py-4">
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Projet non synchronisé</h1>
          <p className="text-sm text-[#696969] mt-0.5">ID Zoho : {params.id}</p>
        </div>
        <div className="p-6 max-w-xl">
          <div className="bg-white border border-[#e2e2e2] rounded-xl shadow-[0_4px_8px_rgba(0,0,0,0.06)] p-6 space-y-4">
            <p className="text-sm text-[#4a4a4a]">
              Ce projet existe dans Zoho Projects mais n&apos;a pas encore été importé dans la base de données.
              Lancez la synchronisation pour l&apos;importer, puis rechargez la page.
            </p>
            <div className="flex items-center gap-3">
              <ForceSyncButton projectId={params.id} />
              {zohoUrl && (
                <a href={zohoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-[#59319f] hover:underline">
                  Voir dans Zoho ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const row = project
  const zohoUrl = row.zoho_project_id ? buildZohoProjectUrl(row.zoho_project_id) : null
  const appUser = userEmail ? await getUserByEmail(userEmail) : null
  const isAdmin = appUser?.role === 'admin' || (!appUser && isHardcodedAccessEmail(userEmail))
  const readonly = appUser?.role === 'commercial_readonly' || !isAdmin && appUser?.role !== 'onboarder'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-1 rounded ${productBadgeClass(row.product)}`}>
                {row.product || 'Produit non renseigné'}
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded ${statusBadgeClass(row.zoho_status)}`}>
                {row.zoho_status ? STATUS_LABELS[row.zoho_status] ?? row.zoho_status : 'Statut inconnu'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-[#1f1f1f] truncate">
              {row.hotel_name || 'Projet onboarding'}
            </h1>
            <p className="text-sm text-[#696969] mt-1">
              Owner : {row.owner || '—'}{row.owner_email ? ` · ${row.owner_email}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {zohoUrl && (
              <a
                href={zohoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#59319f] hover:underline"
              >
                Voir dans Zoho ↗
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
