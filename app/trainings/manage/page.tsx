'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Mode = 'dates' | 'new'
type Language = 'FR' | 'EN' | 'ES'

interface EnterpriseCalendar {
  id: number
  name: string
  description?: string | null
  location?: string | null
  timezone?: string | null
}

interface EnterpriseAppointmentType {
  id: number
  name: string
  active?: boolean
  description?: string | null
  duration: number
  price?: string | number | null
  category?: string | null
  private?: boolean
  type?: 'service' | 'class' | 'series'
  classSize?: number | null
  calendarIDs?: number[]
  schedulingUrl?: string | null
  formIDs?: number[]
}

interface CatalogPayload {
  configured?: boolean
  calendars?: EnterpriseCalendar[]
  appointmentTypes?: EnterpriseAppointmentType[]
  code?: string
  error?: string
}

interface SlotInput {
  date: string
  time: string
}

interface CreateFormState {
  name: string
  description: string
  language: Language
  duration: string
  capacity: string
  price: string
  calendarID: string
  templateAppointmentTypeID: string
}

interface RequestIdentity {
  fingerprint: string
  key: string
}

const CATEGORY_BY_LANGUAGE: Record<Language, string> = {
  FR: 'Formations 🇫🇷',
  EN: 'Training 🇬🇧',
  ES: 'Training 🇪🇸',
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] outline-none transition focus:border-[#8064b3] focus:ring-2 focus:ring-[#e6dcf5] disabled:cursor-not-allowed disabled:bg-[#f4f4f4]'
const labelClass = 'block text-xs font-semibold text-[#4a4a4a]'

function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initialDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return localIsoDate(tomorrow)
}

function newSlot(): SlotInput {
  return { date: initialDate(), time: '10:00' }
}

function maxPublicationDate(): string {
  const date = new Date()
  const originalDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + 18)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(originalDay, lastDay))
  return localIsoDate(date)
}

function availableTimeKey(value: { time?: string; localeTime?: string }): string | null {
  for (const candidate of [value.localeTime, value.time]) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(candidate ?? '')
    if (match) return `${match[1]}T${match[2]}`
  }
  return null
}

function newRequestIdentity(payload: unknown, current: RequestIdentity | null): RequestIdentity {
  const fingerprint = JSON.stringify(payload)
  if (current?.fingerprint === fingerprint) return current
  return { fingerprint, key: crypto.randomUUID() }
}

function isClassType(type: EnterpriseAppointmentType): boolean {
  return type.active !== false && (type.type === 'class' || Number(type.classSize) > 0)
}

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return fallback
}

export default function ManageTrainingsPage() {
  const [mode, setMode] = useState<Mode>('dates')
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedTypeID, setSelectedTypeID] = useState('')
  const [selectedCalendarID, setSelectedCalendarID] = useState('')
  const [slots, setSlots] = useState<SlotInput[]>([newSlot()])
  const [makePublic, setMakePublic] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const createIdentity = useRef<RequestIdentity | null>(null)
  const publishIdentity = useRef<RequestIdentity | null>(null)
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    description: '',
    language: 'FR',
    duration: '60',
    capacity: '12',
    price: '0',
    calendarID: '',
    templateAppointmentTypeID: '',
  })
  const busy = creating || publishing

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setCatalogError(null)
    try {
      const response = await fetch('/api/admin/acuity-enterprise/catalog', { cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as CatalogPayload
      if (!response.ok) {
        setCatalog(body)
        throw new Error(body.error ?? `Impossible de charger Acuity Enterprise (${response.status}).`)
      }

      const calendars = body.calendars ?? []
      const classTypes = (body.appointmentTypes ?? []).filter(isClassType)
      const templates = classTypes.filter(type => (type.formIDs?.length ?? 0) > 0)
      setCatalog(body)
      setSelectedTypeID(current => current || String(classTypes[0]?.id ?? ''))
      setSelectedCalendarID(current => current || String(calendars[0]?.id ?? ''))
      setCreateForm(current => ({
        ...current,
        calendarID: current.calendarID || String(calendars[0]?.id ?? ''),
        templateAppointmentTypeID:
          current.templateAppointmentTypeID || String(templates[0]?.id ?? ''),
      }))
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Impossible de charger Acuity Enterprise.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  const calendars = useMemo(() => catalog?.calendars ?? [], [catalog])
  const classTypes = useMemo(
    () => (catalog?.appointmentTypes ?? []).filter(isClassType),
    [catalog],
  )
  const templateTypes = useMemo(
    () => classTypes.filter(type => (type.formIDs?.length ?? 0) > 0),
    [classTypes],
  )
  const selectedType = classTypes.find(type => String(type.id) === selectedTypeID) ?? null
  const allowedCalendars = useMemo(() => {
    if (!selectedType?.calendarIDs?.length) return calendars
    return calendars.filter(calendar => selectedType.calendarIDs?.includes(calendar.id))
  }, [calendars, selectedType])
  const selectedCalendar = allowedCalendars.find(
    calendar => String(calendar.id) === selectedCalendarID,
  ) ?? null

  useEffect(() => {
    if (!selectedType) return
    const firstAllowed = allowedCalendars[0]
    if (!allowedCalendars.some(calendar => String(calendar.id) === selectedCalendarID)) {
      setSelectedCalendarID(String(firstAllowed?.id ?? ''))
    }
    setMakePublic(selectedType.private === true)
  }, [allowedCalendars, selectedCalendarID, selectedType])

  useEffect(() => {
    if (templateTypes.some(type => String(type.id) === createForm.templateAppointmentTypeID)) return
    setCreateForm(current => ({
      ...current,
      templateAppointmentTypeID: String(templateTypes[0]?.id ?? ''),
    }))
  }, [createForm.templateAppointmentTypeID, templateTypes])

  function clearFeedback() {
    setMessage(null)
    setMutationError(null)
  }

  function selectType(type: EnterpriseAppointmentType) {
    if (busy) return
    clearFeedback()
    setSelectedTypeID(String(type.id))
    setMode('dates')
  }

  function updateSlot(index: number, key: keyof SlotInput, value: string) {
    clearFeedback()
    setSlots(current => current.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, [key]: value } : slot
    )))
  }

  function addSlot() {
    clearFeedback()
    setSlots(current => current.length >= 50 ? current : [...current, newSlot()])
  }

  function removeSlot(index: number) {
    clearFeedback()
    setSlots(current => current.length === 1 ? current : current.filter((_, i) => i !== index))
  }

  async function publishDates(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    if (!selectedType || !selectedCalendar) {
      setMutationError('Sélectionnez une formation et un calendrier.')
      return
    }

    const payload = {
      appointmentTypeID: selectedType.id,
      calendarID: selectedCalendar.id,
      dates: slots.map(slot => slot.date),
      times: slots.map(slot => slot.time),
      makePublic: selectedType.private === true && makePublic,
    }
    const identity = newRequestIdentity(payload, publishIdentity.current)
    publishIdentity.current = identity
    let releaseIdentity = false
    setPublishing(true)

    try {
      const response = await fetch('/api/admin/acuity-enterprise/class-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': identity.key,
        },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({})) as {
        error?: string
        published?: number
        requested?: number
        partial?: boolean
        warnings?: string[]
        errors?: string[]
        times?: Array<{ time?: string; localeTime?: string }>
        code?: string
        uncertain?: boolean
      }
      if (!response.ok && !body.partial) {
        releaseIdentity = response.status < 500
          && body.code !== 'OPERATION_IN_PROGRESS'
          && body.uncertain !== true
        throw new Error(responseError(body, `Publication impossible (${response.status}).`))
      }

      const published = body.published ?? 0
      const requested = body.requested ?? slots.length
      if (body.partial) {
        const publishedKeys = new Set((body.times ?? []).map(availableTimeKey).filter(Boolean))
        const remainingSlots = slots.filter(slot => !publishedKeys.has(`${slot.date}T${slot.time}`))
        const details = [...(body.errors ?? []), ...(body.warnings ?? [])].join(' · ')
        setMutationError(
          `${published} date${published > 1 ? 's' : ''} publiée${published > 1 ? 's' : ''} sur ${requested}. ${details}`.trim()
        )
        if (remainingSlots.length > 0 && remainingSlots.length < slots.length) {
          setSlots(remainingSlots)
        }
      } else {
        setMessage(
          `${published} date${published > 1 ? 's' : ''} publiée${published > 1 ? 's' : ''} dans Acuity pour ${selectedType.name}${selectedType.private && !makePublic ? ' · la formation reste privée' : ''}.`
        )
        setSlots([newSlot()])
      }
      await loadCatalog()
      releaseIdentity = body.uncertain !== true
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Publication impossible.')
    } finally {
      if (releaseIdentity) publishIdentity.current = null
      setPublishing(false)
    }
  }

  function updateCreateForm(key: keyof CreateFormState, value: string) {
    clearFeedback()
    setCreateForm(current => ({ ...current, [key]: value }))
  }

  async function createTraining(event: FormEvent) {
    event.preventDefault()
    clearFeedback()
    const payload = {
      name: createForm.name,
      description: createForm.description,
      duration: Number(createForm.duration),
      price: createForm.price,
      category: CATEGORY_BY_LANGUAGE[createForm.language],
      color: '#59319f',
      classSize: Number(createForm.capacity),
      calendarIDs: [Number(createForm.calendarID)],
      templateAppointmentTypeID: Number(createForm.templateAppointmentTypeID),
    }
    const identity = newRequestIdentity(payload, createIdentity.current)
    createIdentity.current = identity
    let releaseIdentity = false
    setCreating(true)

    try {
      const response = await fetch('/api/admin/acuity-enterprise/appointment-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': identity.key,
        },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({})) as {
        error?: string
        appointmentType?: EnterpriseAppointmentType
        code?: string
        uncertain?: boolean
      }
      if (!response.ok || !body.appointmentType?.id) {
        releaseIdentity = !response.ok
          && response.status < 500
          && body.code !== 'OPERATION_IN_PROGRESS'
          && body.uncertain !== true
        throw new Error(responseError(body, `Création impossible (${response.status}).`))
      }

      const created = body.appointmentType
      setCatalog(current => ({
        ...current,
        appointmentTypes: [
          ...(current?.appointmentTypes ?? []).filter(type => type.id !== created.id),
          created,
        ],
      }))
      setSelectedTypeID(String(created.id))
      setSelectedCalendarID(String(createForm.calendarID))
      setMakePublic(true)
      setMode('dates')
      setMessage('Formation créée en privé. Ajoutez maintenant ses dates pour la rendre réservable.')
      setCreateForm(current => ({ ...current, name: '', description: '' }))
      releaseIdentity = true
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Création impossible.')
    } finally {
      if (releaseIdentity) createIdentity.current = null
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[#1a1a1a]">
      <header className="border-b border-[#e2e2e2] bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Link href="/trainings" className="text-xs font-semibold text-[#59319f] hover:underline">
              ← Retour aux formations
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Gérer les formations</h1>
            <p className="mt-1 text-sm text-[#696969]">
              Créez les formations et publiez leurs prochaines dates directement dans Acuity.
            </p>
          </div>
          <div className="inline-flex self-start rounded-xl bg-[#f4f1f8] p-1" role="group" aria-label="Gestion des formations">
            <ModeButton active={mode === 'dates'} disabled={busy} onClick={() => { setMode('dates'); clearFeedback() }}>
              Publier des dates
            </ModeButton>
            <ModeButton active={mode === 'new'} disabled={busy} onClick={() => { setMode('new'); clearFeedback() }}>
              Nouvelle formation
            </ModeButton>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true">
            <div className="h-96 animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
            <div className="h-[520px] animate-pulse rounded-xl border border-[#e2e2e2] bg-white" />
          </div>
        )}

        {!loading && catalogError && (
          <section className="rounded-xl border border-[#efc5c2] bg-white p-6 shadow-sm" role="alert">
            <h2 className="text-base font-bold text-[#8f2822]">
              {catalog?.configured === false ? 'Acuity Enterprise doit être configuré' : 'Connexion Enterprise impossible'}
            </h2>
            <p className="mt-2 text-sm text-[#696969]">{catalogError}</p>
            {catalog?.code === 'ACUITY_ENTERPRISE_NOT_CONFIGURED' && (
              <div className="mt-4 rounded-lg bg-[#f7f7f7] p-3 font-mono text-xs text-[#4a4a4a]">
                ACUITY_ENTERPRISE_ID<br />
                ACUITY_ENTERPRISE_API_KEY<br />
                ACUITY_INSTANCE_ID
              </div>
            )}
            <button type="button" onClick={loadCatalog} className="mt-4 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm font-semibold text-[#4a4a4a] hover:bg-[#f7f7f7]">
              Réessayer
            </button>
          </section>
        )}

        {!loading && !catalogError && (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="self-start rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_10px_rgba(36,25,55,0.05)] lg:sticky lg:top-5">
              <div className="border-b border-[#ededed] px-4 py-3">
                <p className="text-sm font-bold">Catalogue</p>
                <p className="mt-0.5 text-xs text-[#696969]">{classTypes.length} formation{classTypes.length > 1 ? 's' : ''} active{classTypes.length > 1 ? 's' : ''}</p>
              </div>
              <div className="max-h-[65vh] space-y-1 overflow-y-auto p-2">
                {classTypes.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-[#878787]">Aucune formation de groupe.</p>
                ) : classTypes.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    disabled={busy}
                    aria-pressed={selectedTypeID === String(type.id) && mode === 'dates'}
                    onClick={() => selectType(type)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selectedTypeID === String(type.id) && mode === 'dates' ? 'bg-[#eee7f8] text-[#3f2175]' : 'hover:bg-[#f7f7f7]'}`}
                  >
                    <span className="block text-sm font-semibold">{type.name}</span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[#696969]">
                      <span>{type.duration} min</span>
                      {Number(type.classSize) > 0 && <span>{type.classSize} places</span>}
                      {type.private && <span className="font-semibold text-[#9a5b13]">Privée</span>}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="rounded-xl border border-[#e2e2e2] bg-white p-5 shadow-[0_4px_10px_rgba(36,25,55,0.05)] sm:p-6">
              {message && <p className="mb-5 rounded-lg border border-[#9ed8b2] bg-[#effaf3] px-4 py-3 text-sm font-medium text-[#1c6437]" role="status">{message}</p>}
              {mutationError && <p className="mb-5 rounded-lg border border-[#efc5c2] bg-[#fff8f8] px-4 py-3 text-sm font-medium text-[#8f2822]" role="alert">{mutationError}</p>}

              {mode === 'dates' ? (
                <PublishDatesForm
                  classTypes={classTypes}
                  selectedType={selectedType}
                  selectedTypeID={selectedTypeID}
                  onTypeChange={setSelectedTypeID}
                  calendars={allowedCalendars}
                  selectedCalendar={selectedCalendar}
                  selectedCalendarID={selectedCalendarID}
                  onCalendarChange={setSelectedCalendarID}
                  slots={slots}
                  onSlotChange={updateSlot}
                  onAddSlot={addSlot}
                  onRemoveSlot={removeSlot}
                  makePublic={makePublic}
                  onMakePublicChange={setMakePublic}
                  publishing={publishing}
                  onSubmit={publishDates}
                />
              ) : (
                <CreateTrainingForm
                  form={createForm}
                  calendars={calendars}
                  templates={templateTypes}
                  creating={creating}
                  onChange={updateCreateForm}
                  onSubmit={createTraining}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function ModeButton({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-white text-[#59319f] shadow-sm' : 'text-[#696969] hover:text-[#3f2175]'}`}>
      {children}
    </button>
  )
}

function PublishDatesForm(props: {
  classTypes: EnterpriseAppointmentType[]
  selectedType: EnterpriseAppointmentType | null
  selectedTypeID: string
  onTypeChange: (value: string) => void
  calendars: EnterpriseCalendar[]
  selectedCalendar: EnterpriseCalendar | null
  selectedCalendarID: string
  onCalendarChange: (value: string) => void
  slots: SlotInput[]
  onSlotChange: (index: number, key: keyof SlotInput, value: string) => void
  onAddSlot: () => void
  onRemoveSlot: (index: number) => void
  makePublic: boolean
  onMakePublicChange: (value: boolean) => void
  publishing: boolean
  onSubmit: (event: FormEvent) => void
}) {
  if (props.classTypes.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-bold">Un modèle Acuity est requis</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#696969]">Créez d’abord une formation de groupe avec son formulaire hôtel dans Acuity. Elle servira ensuite de modèle sécurisé ici.</p>
      </div>
    )
  }

  return (
    <form onSubmit={props.onSubmit} aria-busy={props.publishing}>
      <fieldset disabled={props.publishing} className="min-w-0 border-0 p-0">
      <div>
        <h2 className="text-lg font-bold">Publier de nouvelles dates</h2>
        <p className="mt-1 text-sm text-[#696969]">Les créneaux sont créés dans Acuity. Une formation privée ne devient réservable que si vous activez sa publication.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Formation
          <select required value={props.selectedTypeID} onChange={event => props.onTypeChange(event.target.value)} className={inputClass}>
            {props.classTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Animateur / calendrier
          <select required value={props.selectedCalendarID} onChange={event => props.onCalendarChange(event.target.value)} className={inputClass}>
            {props.calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
          </select>
        </label>
      </div>

      {props.calendars.length === 0 && (
        <p className="mt-4 rounded-lg border border-[#efc5c2] bg-[#fff8f8] px-4 py-3 text-sm text-[#8f2822]" role="alert">
          Aucun calendrier actif n’est associé à cette formation. Ajoutez-en un dans Acuity avant de publier une date.
        </p>
      )}

      {props.selectedType && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-[#f7f7f7] px-4 py-3 text-xs text-[#696969]">
          <span><strong className="text-[#4a4a4a]">Durée :</strong> {props.selectedType.duration} min</span>
          <span><strong className="text-[#4a4a4a]">Capacité :</strong> {props.selectedType.classSize ?? '—'}</span>
          <span><strong className="text-[#4a4a4a]">Fuseau :</strong> {props.selectedCalendar?.timezone ?? 'Acuity'}</span>
          {props.selectedType.schedulingUrl && (
            <a href={props.selectedType.schedulingUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#59319f] hover:underline">Lien de réservation ↗</a>
          )}
        </div>
      )}

      <fieldset className="mt-7">
        <legend className="text-sm font-bold">Dates et heures</legend>
        <div className="mt-3 space-y-3">
          {props.slots.map((slot, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-[#e2e2e2] bg-[#fcfcfc] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className={labelClass}>
                Date {index + 1}
                <input required type="date" min={localIsoDate(new Date())} max={maxPublicationDate()} value={slot.date} onChange={event => props.onSlotChange(index, 'date', event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Heure
                <input required type="time" value={slot.time} onChange={event => props.onSlotChange(index, 'time', event.target.value)} className={inputClass} />
              </label>
              <button type="button" onClick={() => props.onRemoveSlot(index)} disabled={props.slots.length === 1} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-xs font-semibold text-[#696969] hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Supprimer la date ${index + 1}`}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={props.onAddSlot} disabled={props.slots.length >= 50} className="mt-3 text-sm font-semibold text-[#59319f] hover:underline disabled:opacity-40">
          + Ajouter une date
        </button>
      </fieldset>

      {props.selectedType?.private ? (
        <label className="mt-6 flex items-start gap-3 rounded-lg border border-[#ead5a7] bg-[#fffaf0] p-4 text-sm text-[#6e4a14]">
          <input type="checkbox" checked={props.makePublic} onChange={event => props.onMakePublicChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#59319f]" />
          <span><strong>Rendre la formation publique après publication.</strong><br /><span className="text-xs">Si une date échoue, elle restera privée par sécurité.</span></span>
        </label>
      ) : (
        <p className="mt-6 rounded-lg border border-[#ccebdd] bg-[#f0fbf6] px-4 py-3 text-sm text-[#1c6437]">Cette formation est déjà publique et réservable.</p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#ededed] pt-5">
        <p className="text-xs text-[#696969]">Maximum 50 dates par publication · doublons refusés</p>
        <button type="submit" disabled={props.publishing || !props.selectedType || !props.selectedCalendar} className="rounded-lg bg-[#59319f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3f2175] disabled:cursor-not-allowed disabled:opacity-50">
          {props.publishing ? 'Publication…' : `Publier ${props.slots.length} date${props.slots.length > 1 ? 's' : ''}`}
        </button>
      </div>
      </fieldset>
    </form>
  )
}

function CreateTrainingForm(props: {
  form: CreateFormState
  calendars: EnterpriseCalendar[]
  templates: EnterpriseAppointmentType[]
  creating: boolean
  onChange: (key: keyof CreateFormState, value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  if (props.templates.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-bold">Aucun modèle avec formulaire hôtel</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-[#696969]">Pour protéger les KPI, la première formation doit être configurée dans Acuity avec un formulaire contenant « Company Name » ou « Hotel Name ». Rechargez ensuite cette page.</p>
      </div>
    )
  }

  return (
    <form onSubmit={props.onSubmit} aria-busy={props.creating}>
      <fieldset disabled={props.creating} className="min-w-0 border-0 p-0">
      <div>
        <h2 className="text-lg font-bold">Créer une formation</h2>
        <p className="mt-1 text-sm text-[#696969]">Elle sera créée en privé, puis rendue publique après la publication réussie de ses dates.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Nom de la formation
          <input required maxLength={180} value={props.form.name} onChange={event => props.onChange('name', event.target.value)} placeholder="Ex. Formation Guest App" className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea maxLength={5000} rows={4} value={props.form.description} onChange={event => props.onChange('description', event.target.value)} placeholder="Objectifs et programme de la formation…" className={inputClass} />
        </label>
        <label className={labelClass}>
          Langue
          <select value={props.form.language} onChange={event => props.onChange('language', event.target.value)} className={inputClass}>
            <option value="FR">Français</option>
            <option value="EN">Anglais</option>
            <option value="ES">Espagnol</option>
          </select>
        </label>
        <label className={labelClass}>
          Animateur / calendrier
          <select required value={props.form.calendarID} onChange={event => props.onChange('calendarID', event.target.value)} className={inputClass}>
            <option value="">Sélectionner…</option>
            {props.calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Durée (minutes)
          <input required type="number" min={5} max={1440} step={5} value={props.form.duration} onChange={event => props.onChange('duration', event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Capacité
          <input required type="number" min={1} max={10000} value={props.form.capacity} onChange={event => props.onChange('capacity', event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Prix
          <input required inputMode="decimal" value={props.form.price} onChange={event => props.onChange('price', event.target.value)} placeholder="0" className={inputClass} />
        </label>
        <label className={labelClass}>
          Copier les formulaires de
          <select required value={props.form.templateAppointmentTypeID} onChange={event => props.onChange('templateAppointmentTypeID', event.target.value)} className={inputClass}>
            <option value="">Sélectionner une formation modèle…</option>
            {props.templates.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>
      </div>

      <p className="mt-4 rounded-lg border border-[#d9cfeb] bg-[#f7f3fc] px-4 py-3 text-xs text-[#59319f]">
        Le modèle recopie les formulaires participants existants, notamment le champ hôtel utilisé dans les KPI.
      </p>

      <div className="mt-7 flex justify-end border-t border-[#ededed] pt-5">
        <button type="submit" disabled={props.creating || props.calendars.length === 0 || props.templates.length === 0} className="rounded-lg bg-[#59319f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3f2175] disabled:cursor-not-allowed disabled:opacity-50">
          {props.creating ? 'Création…' : 'Créer en privé'}
        </button>
      </div>
      </fieldset>
    </form>
  )
}
