import Link from 'next/link'
import { ArrowLeft, ExternalLink, UserRound } from 'lucide-react'
import { isHardcodedAccessEmail } from '@/lib/auth/access'
import { ProjectDetailTabs, ForceSyncButton } from './ProjectDetailClient'
import { buildZohoProjectUrl } from '@/lib/zoho/projectsClient'
import { getSessionUserEmail } from '@/lib/auth/session'
import { getOnboardingProjectByIdOrZohoId } from '@/lib/onboarding/projects'
import { getUserByEmail } from '@/lib/auth/roles'
import SyncButton from '@/components/todoist/SyncButton'

const STATUS_LABELS: Record<string, string> = {
  not_started:    'Non démarré',
  in_progress:    'En cours',
  pending_client: 'En attente client',
  live:           'Live',
  blocked:        'Bloqué',
  standby:        'Standby',
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
  if (status === 'standby')        return 'bg-[#f1e8fb] text-[#6b3ba1]'
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
  const appUser = userEmail ? await getUserByEmail(userEmail) : null
  const isAdmin = appUser?.role === 'admin' || (!appUser && isHardcodedAccessEmail(userEmail))
  const readonly = appUser?.role === 'commercial_readonly' || !isAdmin && appUser?.role !== 'onboarder'
  const canSync = isAdmin || appUser?.role === 'onboarder'

  if (!project) {
    const zohoUrl = buildZohoProjectUrl(params.id)
    return (
      <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
        <header className="border-b border-[#e2e2e2] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <Link href="/onboarding" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#59319f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour aux onboardings
            </Link>
            <h1 className="text-xl font-semibold text-[#1a1a1a] sm:text-2xl">Projet non synchronisé</h1>
            <p className="mt-1 break-all text-sm text-[#696969]">Identifiant Zoho : {params.id}</p>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-4 rounded-xl border border-[#e2e2e2] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.05)] sm:p-6">
            <p className="text-sm text-[#4a4a4a]">
              Ce projet existe dans Zoho Projects mais n&apos;a pas encore été importé dans la base de données.
              {canSync
                ? ' Lancez la synchronisation pour l\'importer. La fiche se mettra ensuite à jour automatiquement.'
                : ' Votre profil dispose d\'un accès en lecture seule : un administrateur ou un onboarder doit lancer la synchronisation.'}
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start">
              {canSync && <ForceSyncButton projectId={params.id} />}
              {zohoUrl && (
                <a href={zohoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#59319f] hover:bg-[#f3eeff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2">
                  Voir dans Zoho
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  }

  const row = project
  const zohoUrl = row.zoho_project_id ? buildZohoProjectUrl(row.zoho_project_id) : null

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/onboarding" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#59319f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour aux onboardings
          </Link>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-medium ${productBadgeClass(row.product)}`}>
                  {row.product || 'Produit non renseigné'}
                </span>
                <span className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(row.zoho_status)}`}>
                  {row.zoho_status ? STATUS_LABELS[row.zoho_status] ?? row.zoho_status : 'Statut inconnu'}
                </span>
              </div>
              <h1 className="break-words text-2xl font-semibold leading-tight text-[#1f1f1f] sm:text-3xl">
                {row.hotel_name || 'Projet onboarding'}
              </h1>
              <div className="mt-2 flex items-start gap-2 text-sm text-[#696969]">
                <UserRound className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <p className="min-w-0 break-words">
                  <span className="font-medium text-[#4a4a4a]">Responsable :</span>{' '}
                  {row.owner || 'Non renseigné'}
                  {row.owner_email && <span className="break-all"> · {row.owner_email}</span>}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start lg:max-w-xl lg:justify-end">
              {zohoUrl && (
                <a
                  href={zohoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#d9caef] bg-white px-3 py-2 text-sm font-medium text-[#59319f] transition-colors hover:border-[#59319f] hover:bg-[#f3eeff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#59319f] focus-visible:ring-offset-2"
                >
                  Ouvrir dans Zoho
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {isAdmin && <ForceSyncButton projectId={row.id} />}
              {canSync && <SyncButton />}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ProjectDetailTabs project={row} readonly={readonly} />
      </main>
    </div>
  )
}
