'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Check, ChevronRight, Clock3, Flag, LoaderCircle,
  Play, RefreshCw, Save, Settings2,
} from 'lucide-react'
import {
  enabledProductKeys, IMPLEMENTATION_PHASES, OPTION_KEYS, PRODUCT_STATUSES,
  type CommercialPlan, type ImplementationPhase, type ProjectProductKey,
  type ProjectProductStatus,
} from '@/lib/onboarding/workspace'

type ProductRow = {
  product_key: ProjectProductKey
  status: ProjectProductStatus
  comment: string | null
  owner_email?: string | null
  target_date?: string | null
}

type Workspace = {
  commercial_plan: CommercialPlan | null
  customer_tier: string | null
  customer_type: string | null
  dmbook_only: boolean | null
  enabled_options: Record<string, boolean>
  csm_name: string | null
  csm_assignment_points: number | null
  csm_assignment_reason: string | null
}

type CockpitWorkspace = {
  implementation_phase: ImplementationPhase
  documents_received: boolean
  documents_received_at: string | null
  document_reservation: string | null
  resources_validated_at: string | null
  implementation_started_at: string | null
  implementation_target_date: string | null
  next_action: string | null
  next_action_due: string | null
  next_action_owner: string | null
  current_blocker: string | null
}

type Cockpit = {
  workspace: CockpitWorkspace
  products: ProductRow[]
  duration_weeks: number
}

const planLabels: Record<CommercialPlan, string> = { communication: 'Communication', engagement: 'Engagement', insight: 'Insight', enterprise: 'Enterprise' }
const productLabels: Record<ProjectProductKey, string> = { campaigns: 'Campagnes', app: 'Guest App', guest_profile: 'Guest Profile', membership_lite: 'Membership Lite', whatsapp: 'WhatsApp', loyalty_program: 'Loyalty Program' }
const statusLabels: Record<ProjectProductStatus, string> = { not_started: 'Non démarré', in_progress: 'En cours', pending_client: 'En attente client', blocked: 'Bloqué', live: 'Live', cancelled: 'Annulé' }
const phaseLabels: Record<ImplementationPhase, string> = {
  waiting_resources: 'En attente des ressources client', ready_to_start: 'Prêt à démarrer', kickoff: 'Appel de lancement',
  configuration: 'Configuration', v1_review: 'V1 présentée', iteration_1: 'Itération 1', iteration_2: 'Itération 2',
  final_validation: 'Validation finale', live: 'Live', performance_review: 'Performance review',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export default function ProjectWorkspace({ projectId, readonly }: { projectId: string; readonly: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [cockpit, setCockpit] = useState<Cockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<{ csm_name: string; remaining_points: number } | null>(null)
  const [suggestionPoints, setSuggestionPoints] = useState<number | null>(null)
  const [activity, setActivity] = useState('')
  const [activityKind, setActivityKind] = useState('note')
  const [documentReservation, setDocumentReservation] = useState('')

  async function load() {
    setError(null)
    const [workspaceResponse, cockpitResponse] = await Promise.all([
      fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/workspace`),
      fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/implementation`),
    ])
    const [workspacePayload, cockpitPayload] = await Promise.all([workspaceResponse.json(), cockpitResponse.json()])
    if (!workspaceResponse.ok) throw new Error(workspacePayload.error ?? 'Configuration indisponible')
    if (!cockpitResponse.ok) throw new Error(cockpitPayload.error ?? 'Cockpit indisponible')
    setWorkspace(workspacePayload.workspace)
    setCockpit(cockpitPayload)
    setDocumentReservation(cockpitPayload.workspace?.document_reservation ?? '')
  }

  useEffect(() => {
    setLoading(true)
    load().catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const enabledKeys = useMemo(() => workspace ? enabledProductKeys(workspace.commercial_plan, workspace.enabled_options ?? {}) : [], [workspace])

  async function patchImplementation(body: Record<string, unknown>) {
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/implementation`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Mise à jour impossible')
      setCockpit(payload)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }

  async function saveConfiguration() {
    if (!workspace?.commercial_plan) return setError('Sélectionnez un plan client.')
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workspace),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Configuration non enregistrée')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }

  async function saveProduct(key: ProjectProductKey, status: ProjectProductStatus, comment: string) {
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/products`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_key: key, status, comment }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Mise à jour impossible')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }

  async function suggestCsm(accept?: string) {
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/csm-suggestion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(accept ? { accept_csm: accept } : {}),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Suggestion impossible')
      if (accept) { setSuggestion(null); await load() } else { setSuggestion(payload.suggestion); setSuggestionPoints(payload.points) }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }

  async function addActivity() {
    if (!activity.trim()) return
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'note_added', event_label: activityKind === 'call' ? 'Compte rendu d’appel' : activityKind === 'document' ? 'Document échangé' : activityKind === 'decision' ? 'Décision projet' : 'Mise à jour projet', metadata: { note: activity.trim(), kind: activityKind } }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Mise à jour non enregistrée')
      setActivity('')
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-[#e2e2e2] bg-white p-5 text-sm text-[#696969]"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement du cockpit…</div>
  if (!workspace || !cockpit) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? 'Cockpit indisponible'}</p>

  const waiting = !cockpit.workspace.documents_received
  const phaseIndex = Math.max(0, IMPLEMENTATION_PHASES.indexOf(cockpit.workspace.implementation_phase))

  return <div className="space-y-5">
    <section className={`overflow-hidden rounded-xl border ${waiting ? 'border-[#edc765] bg-[#fffbeb]' : 'border-[#a9dfba] bg-[#f3fbf5]'}`}>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr] lg:p-6">
        <div>
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${waiting ? 'bg-[#fbf1ca] text-[#84550e]' : 'bg-[#cff7dc] text-[#1c6437]'}`}>
              {waiting ? <Clock3 className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </span>
            <div><p className="text-xs font-bold uppercase tracking-[.08em] text-[#696969]">État du projet</p><h3 className="text-lg font-semibold text-[#1f1f1f]">{phaseLabels[cockpit.workspace.implementation_phase]}</h3></div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#4a4a4a]">
            {waiting ? 'L’implémentation et sa timeline ne démarrent qu’à réception des documents demandés.' : `Documents reçus le ${formatDate(cockpit.workspace.documents_received_at)} · cible calculée : ${formatDate(cockpit.workspace.implementation_target_date)}.`}
          </p>
        </div>
        <div className="rounded-lg border border-white/80 bg-white/70 p-4">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#2a2a2a]"><input disabled={readonly || saving} type="checkbox" checked={cockpit.workspace.documents_received} onChange={event => void patchImplementation({ action: 'documents', documents_received: event.target.checked, document_reservation: documentReservation })} className="h-5 w-5 rounded border-[#aaa] text-[#59319f] focus:ring-[#8064b3]" />Documents reçus</label>
          <label className="mt-3 block text-xs font-semibold text-[#696969]">Réserve / éléments manquants<textarea disabled={readonly || saving} rows={2} value={documentReservation} onChange={event => setDocumentReservation(event.target.value)} onBlur={() => { if (documentReservation !== (cockpit.workspace.document_reservation ?? '')) void patchImplementation({ action: 'documents', documents_received: cockpit.workspace.documents_received, document_reservation: documentReservation }) }} placeholder="Ex. Données PMS partielles, visuels du spa manquants…" className="mt-1 w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm font-normal" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!readonly && cockpit.workspace.implementation_phase === 'ready_to_start' && <button disabled={saving} onClick={() => void patchImplementation({ action: 'start_implementation' })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#1c6437] px-3 py-2 text-xs font-semibold text-white"><Play className="h-4 w-4" />Démarrer l’implémentation</button>}
            <span className="text-xs text-[#696969]">Durée cible : {cockpit.duration_weeks} semaines max.</span>
          </div>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-xl border border-[#e2e2e2] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-[#59319f]" /><h3 className="font-semibold text-[#1f1f1f]">Prochaine action</h3></div>
        <PilotageEditor cockpit={cockpit} readonly={readonly} saving={saving} onSave={patchImplementation} />
      </section>
      <ImplementationGantt cockpit={cockpit} products={cockpit.products} enabledKeys={enabledKeys} phaseIndex={phaseIndex} readonly={readonly} saving={saving} onPhaseChange={phase => patchImplementation({ action: 'phase', phase })} />
    </div>

    {!readonly && <section className="rounded-xl border border-[#d9caef] bg-[#faf7ff] p-4 sm:p-5">
      <div className="mb-3"><h3 className="font-semibold text-[#1f1f1f]">Ajouter une mise à jour</h3><p className="mt-1 text-xs text-[#696969]">Le carnet de bord partagé du projet — appels, décisions, documents et informations client.</p></div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <select value={activityKind} onChange={event => setActivityKind(event.target.value)} className="rounded-lg border border-[#d9caef] bg-white px-3 py-2.5 text-sm lg:w-40"><option value="note">Note</option><option value="call">Appel client</option><option value="document">Document</option><option value="decision">Décision</option></select>
        <textarea rows={2} value={activity} onChange={event => setActivity(event.target.value)} placeholder="Ex. Call client : CSV reçu, campagne validée, formation prévue le 28 juillet…" className="min-h-11 flex-1 rounded-lg border border-[#d9caef] bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#d9caef]" />
        <button disabled={saving || !activity.trim()} onClick={() => void addActivity()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#59319f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" />Publier</button>
      </div>
    </section>}

    <section className="rounded-xl border border-[#e2e2e2] bg-white p-4 sm:p-5">
      <div className="mb-4"><h3 className="font-semibold text-[#1f1f1f]">Chantiers produits</h3><p className="mt-1 text-xs text-[#696969]">Un coup d’œil suffit pour connaître l’état de chaque produit ou option.</p></div>
      <div className="divide-y divide-[#ededed] rounded-lg border border-[#e5e5e5]">
        {enabledKeys.map(key => <ProductEditor key={key} name={productLabels[key]} row={cockpit.products.find(product => product.product_key === key)} readonly={readonly} saving={saving} onSave={(status, comment) => saveProduct(key, status, comment)} />)}
      </div>
    </section>

    <details className="rounded-xl border border-[#e2e2e2] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-[#1f1f1f]"><span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#696969]" />Configuration du projet et passation CSM</span><ChevronRight className="h-4 w-4 text-[#8a8a8a]" /></summary>
      <div className="space-y-5 border-t border-[#ededed] p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-medium text-[#4a4a4a]">Plan<select disabled={readonly} value={workspace.commercial_plan ?? ''} onChange={event => setWorkspace({ ...workspace, commercial_plan: event.target.value as CommercialPlan })} className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm"><option value="">À renseigner</option>{Object.entries(planLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs font-medium text-[#4a4a4a]">Tier<select disabled={readonly} value={workspace.customer_tier ?? ''} onChange={event => setWorkspace({ ...workspace, customer_tier: event.target.value })} className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm"><option value="">À renseigner</option>{['Bronze','Silver','Gold','Key'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-medium text-[#4a4a4a]">Type<select disabled={readonly} value={workspace.customer_type ?? ''} onChange={event => setWorkspace({ ...workspace, customer_type: event.target.value })} className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm"><option value="">À renseigner</option><option>Individuel</option><option>Groupe</option></select></label>
          <label className="flex items-end gap-2 pb-2 text-sm text-[#4a4a4a]"><input disabled={readonly} type="checkbox" checked={workspace.dmbook_only === true} onChange={event => setWorkspace({ ...workspace, dmbook_only: event.target.checked })} />DmBook seul</label>
        </div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#696969]">Options</p><div className="flex flex-wrap gap-4">{OPTION_KEYS.map(key => <label key={key} className="flex items-center gap-2 text-sm"><input disabled={readonly} type="checkbox" checked={workspace.enabled_options?.[key] === true} onChange={event => setWorkspace({ ...workspace, enabled_options: { ...workspace.enabled_options, [key]: event.target.checked } })} />{productLabels[key]}</label>)}</div></div>
        {!readonly && <button disabled={saving} onClick={() => void saveConfiguration()} className="rounded-lg bg-[#59319f] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Enregistrer la configuration</button>}
        <div className="border-t border-[#e2e2e2] pt-4"><p className="text-sm font-semibold">CSM {workspace.csm_name ? `: ${workspace.csm_name}` : 'non attribué'}</p>{workspace.csm_assignment_reason && <p className="mt-1 text-xs text-[#696969]">{workspace.csm_assignment_reason}</p>}{!readonly && !workspace.csm_name && <button disabled={saving} onClick={() => void suggestCsm()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#59319f] px-3 py-2 text-sm font-medium text-[#59319f]"><RefreshCw className="h-4 w-4" />Suggérer un CSM</button>}{suggestion && <div className="mt-3 rounded-lg bg-[#f3eeff] p-3 text-sm"><strong>{suggestion.csm_name}</strong> · {suggestionPoints} points · {suggestion.remaining_points} disponibles<button onClick={() => void suggestCsm(suggestion.csm_name)} className="ml-3 rounded bg-[#59319f] px-2 py-1 text-xs text-white">Attribuer</button></div>}</div>
      </div>
    </details>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>
}

function ProductEditor({ name, row, readonly, saving, onSave }: { name: string; row?: ProductRow; readonly: boolean; saving: boolean; onSave: (status: ProjectProductStatus, comment: string) => Promise<void> }) {
  const [status, setStatus] = useState<ProjectProductStatus>(row?.status ?? 'not_started')
  const [comment, setComment] = useState(row?.comment ?? '')
  useEffect(() => { setStatus(row?.status ?? 'not_started'); setComment(row?.comment ?? '') }, [row])
  return <div className="grid gap-2 p-3 sm:grid-cols-[180px_155px_minmax(220px,1fr)_36px] sm:items-center">
    <p className="text-sm font-semibold text-[#2a2a2a]">{name}</p>
    <select disabled={readonly || saving} value={status} onChange={event => { const next = event.target.value as ProjectProductStatus; setStatus(next); void onSave(next, comment) }} className="rounded-md border border-[#d9d9d9] bg-white px-2 py-1.5 text-xs">{PRODUCT_STATUSES.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>
    <input disabled={readonly || saving} value={comment} onChange={event => setComment(event.target.value)} onBlur={() => { if (comment !== (row?.comment ?? '')) void onSave(status, comment) }} placeholder="Ex. En attente du CSV client" className="rounded-md border border-transparent bg-[#f7f7f7] px-2 py-1.5 text-xs outline-none focus:border-[#c9b8e3] focus:bg-white" />
    <span className={`h-2.5 w-2.5 justify-self-center rounded-full ${status === 'live' ? 'bg-[#2d8a4e]' : status === 'blocked' ? 'bg-[#c43d36]' : status === 'pending_client' ? 'bg-[#d3a52d]' : status === 'in_progress' ? 'bg-[#4677c8]' : 'bg-[#bbb]'}`} />
  </div>
}

function PilotageEditor({ cockpit, readonly, saving, onSave }: { cockpit: Cockpit; readonly: boolean; saving: boolean; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [action, setAction] = useState(cockpit.workspace.next_action ?? '')
  const [due, setDue] = useState(cockpit.workspace.next_action_due ?? '')
  const [owner, setOwner] = useState(cockpit.workspace.next_action_owner ?? '')
  const [blocker, setBlocker] = useState(cockpit.workspace.current_blocker ?? '')
  useEffect(() => { setAction(cockpit.workspace.next_action ?? ''); setDue(cockpit.workspace.next_action_due ?? ''); setOwner(cockpit.workspace.next_action_owner ?? ''); setBlocker(cockpit.workspace.current_blocker ?? '') }, [cockpit])
  return <div className="mt-4 space-y-3">
    <label className="block text-xs font-semibold text-[#696969]">Action<input disabled={readonly} value={action} onChange={event => setAction(event.target.value)} placeholder="Que faut-il faire maintenant ?" className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2.5 text-sm" /></label>
    <div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#696969]">Échéance<input disabled={readonly} type="date" value={due} onChange={event => setDue(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm" /></label><label className="block text-xs font-semibold text-[#696969]">Responsable<input disabled={readonly} value={owner} onChange={event => setOwner(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm" /></label></div>
    <label className="block text-xs font-semibold text-[#696969]">Blocage éventuel<textarea disabled={readonly} rows={2} value={blocker} onChange={event => setBlocker(event.target.value)} placeholder="Aucun blocage" className="mt-1 w-full rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm" /></label>
    {!readonly && <button disabled={saving} onClick={() => void onSave({ action: 'pilotage', next_action: action, next_action_due: due, next_action_owner: owner, current_blocker: blocker })} className="inline-flex items-center gap-2 rounded-lg bg-[#1f1f1f] px-3 py-2 text-xs font-semibold text-white"><Save className="h-3.5 w-3.5" />Enregistrer</button>}
  </div>
}

function ImplementationGantt({ cockpit, products, enabledKeys, phaseIndex, readonly, saving, onPhaseChange }: { cockpit: Cockpit; products: ProductRow[]; enabledKeys: ProjectProductKey[]; phaseIndex: number; readonly: boolean; saving: boolean; onPhaseChange: (phase: ImplementationPhase) => Promise<void> }) {
  const weeks = cockpit.duration_weeks
  const buildWeeks = Math.max(2, weeks - (weeks >= 6 ? 2 : 1))
  const columns = Array.from({ length: weeks }, (_, index) => index + 1)
  return <section className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white">
    <div className="flex flex-col gap-3 border-b border-[#ededed] p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-[#1f1f1f]">Planning d’implémentation</h3><p className="mt-1 text-xs text-[#696969]">La semaine 1 commence à réception des documents.</p></div><div className="flex items-center gap-2 text-xs text-[#696969]"><CalendarDays className="h-4 w-4" />Cible {formatDate(cockpit.workspace.implementation_target_date)}</div></div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f3eeff] px-3 py-2"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8064b3] opacity-40" /><span className="relative inline-flex h-3 w-3 rounded-full bg-[#59319f]" /></span><span className="text-xs font-bold uppercase tracking-wide text-[#59319f]">Maintenant</span><select disabled={readonly || saving} value={cockpit.workspace.implementation_phase} onChange={event => void onPhaseChange(event.target.value as ImplementationPhase)} className="min-w-0 flex-1 rounded-md border border-[#d9caef] bg-white px-2 py-1.5 text-sm font-semibold text-[#2a2a2a]">{IMPLEMENTATION_PHASES.map(phase => <option key={phase} value={phase}>{phaseLabels[phase]}</option>)}</select></div>
    </div>
    <div className="overflow-x-auto p-4 sm:p-5"><div className="min-w-[720px]">
      <div className="grid grid-cols-[190px_1fr] items-end border-b border-[#ededed] pb-2"><span className="text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a]">Chantier</span><div className="grid" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(72px, 1fr))` }}>{columns.map(week => <span key={week} className="text-center text-[11px] font-bold text-[#8a8a8a]">S{week}</span>)}</div></div>
      <GanttRow label="Configuration" weeks={weeks} current={['kickoff','configuration'].includes(cockpit.workspace.implementation_phase)}><GanttBar start={1} span={buildWeeks} weeks={weeks} tone="purple" /></GanttRow>
      {enabledKeys.map((key, index) => { const row = products.find(product => product.product_key === key); const progress = row?.status === 'live' ? weeks : row?.status === 'in_progress' ? Math.max(1, Math.min(buildWeeks, phaseIndex - 2)) : 0; return <GanttRow key={key} label={productLabels[key]} weeks={weeks} current={row?.status === 'in_progress' || row?.status === 'pending_client' || row?.status === 'blocked'}>{progress > 0 && <GanttBar start={1} span={progress} weeks={weeks} tone={index % 2 ? 'blue' : 'purple'} />}</GanttRow> })}
      <GanttRow label="Présentation V1" weeks={weeks} current={cockpit.workspace.implementation_phase === 'v1_review'}><GanttMilestone at={buildWeeks} weeks={weeks} active={phaseIndex >= IMPLEMENTATION_PHASES.indexOf('v1_review')} /></GanttRow>
      <GanttRow label="Révisions · 2 max" weeks={weeks} current={['iteration_1','iteration_2','final_validation'].includes(cockpit.workspace.implementation_phase)}><GanttBar start={Math.min(weeks, buildWeeks + 1)} span={Math.max(1, weeks - buildWeeks)} weeks={weeks} tone="amber" /></GanttRow>
      <GanttRow label="Go live" weeks={weeks} current={['live','performance_review'].includes(cockpit.workspace.implementation_phase)}><GanttMilestone at={weeks} weeks={weeks} active={cockpit.workspace.implementation_phase === 'live' || cockpit.workspace.implementation_phase === 'performance_review'} /></GanttRow>
    </div></div>
  </section>
}

function GanttRow({ label, weeks, current = false, children }: { label: string; weeks: number; current?: boolean; children: React.ReactNode }) {
  return <div className={`grid min-h-11 grid-cols-[190px_1fr] items-center border-b border-[#f1f1f1] px-1 last:border-0 ${current ? 'bg-[#f5f0fb]' : ''}`}><span className={`flex items-center gap-2 pr-4 text-xs ${current ? 'font-bold text-[#59319f]' : 'font-medium text-[#4a4a4a]'}`}>{current && <span className="h-3 w-3 flex-none rounded-full border-[3px] border-[#d9caef] bg-[#59319f] shadow-[0_0_0_3px_#f3eeff]" />}{label}{current && <span className="ml-auto rounded bg-[#e8dcf8] px-1.5 py-0.5 text-[9px] font-bold uppercase">Actuel</span>}</span><div className={`relative grid h-7 overflow-hidden rounded bg-[repeating-linear-gradient(to_right,#f6f6f6_0,#f6f6f6_calc((100%/var(--weeks))-1px),#e7e7e7_calc((100%/var(--weeks))-1px),#e7e7e7_calc(100%/var(--weeks)))] ${current ? 'ring-2 ring-[#c9b8e3]' : ''}`} style={{ gridTemplateColumns: `repeat(${weeks}, minmax(72px, 1fr))`, ['--weeks' as string]: weeks }}>{children}</div></div>
}

function GanttBar({ start, span, weeks, tone }: { start: number; span: number; weeks: number; tone: 'purple' | 'blue' | 'amber' }) {
  const color = tone === 'blue' ? 'bg-[#6d98df]' : tone === 'amber' ? 'bg-[#e2b649]' : 'bg-[#8064b3]'
  return <span className={`z-10 my-1 rounded ${color}`} style={{ gridColumn: `${Math.min(start, weeks)} / span ${Math.min(span, weeks - start + 1)}` }} />
}

function GanttMilestone({ at, weeks, active }: { at: number; weeks: number; active: boolean }) {
  return <span className={`z-10 m-auto h-4 w-4 rotate-45 rounded-[2px] border-2 ${active ? 'border-[#1c6437] bg-[#62b67b]' : 'border-[#8064b3] bg-white'}`} style={{ gridColumn: Math.min(at, weeks) }} />
}
