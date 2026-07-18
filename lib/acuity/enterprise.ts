import 'server-only'

const ENTERPRISE_BASE = 'https://acuityscheduling.com/api/enterprise/v2'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_CLASS_TIMES_PER_REQUEST = 50

export class AcuityEnterpriseConfigurationError extends Error {
  constructor(message = 'Acuity Enterprise n’est pas configuré.') {
    super(message)
    this.name = 'AcuityEnterpriseConfigurationError'
  }
}

export class AcuityEnterpriseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcuityEnterpriseValidationError'
  }
}

export class AcuityEnterpriseConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcuityEnterpriseConflictError'
  }
}

export class AcuityEnterpriseApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AcuityEnterpriseApiError'
    this.status = status
  }
}

interface AcuityEnterpriseConfig {
  enterpriseId: number
  instanceId: number
  apiKey: string
}

export interface AcuityEnterpriseCalendar {
  id: number
  name: string
  description?: string | null
  location?: string | null
  timezone?: string | null
}

export interface AcuityEnterpriseAppointmentType {
  id: number
  name: string
  active?: boolean
  description?: string | null
  duration: number
  price?: string | number | null
  category?: string | null
  color?: string | null
  private?: boolean
  type?: 'service' | 'class' | 'series'
  classSize?: number | null
  calendarIDs?: number[]
  formIDs?: number[]
  addonIDs?: number[]
  schedulingUrl?: string | null
}

export interface AcuityEnterpriseCatalog {
  calendars: AcuityEnterpriseCalendar[]
  appointmentTypes: AcuityEnterpriseAppointmentType[]
}

export interface CreateClassAppointmentTypeInput {
  name: string
  description?: string
  duration: number
  price?: string
  category: string
  color?: string
  classSize: number
  calendarIDs: number[]
  templateAppointmentTypeID: number
}

export interface OfferClassTimesInput {
  calendarID: number
  appointmentTypeID: number
  dates: string[]
  times: string[]
  makePublic: boolean
}

export interface AcuityAvailableClassTime {
  id?: number
  name?: string
  calendar?: string
  duration?: number
  slots?: number
  slotsAvailable?: number
  calendarID?: number
  appointmentTypeID?: number
  calendarTimezone?: string
  time?: string
  localeTime?: string
}

export interface AcuityAvailableClassResponse {
  times: AcuityAvailableClassTime[]
  errors: string[]
  warnings: string[]
  visibilityUpdated: boolean
  matchedSlots: number
  fullyMatched: boolean
}

interface AcuityEnterpriseForm {
  id: number
  fields?: Array<{ name?: string | null }>
}

function positiveIntegerFromEnv(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function isAcuityEnterpriseConfigured(): boolean {
  return Boolean(
    positiveIntegerFromEnv(process.env.ACUITY_ENTERPRISE_ID) &&
    process.env.ACUITY_ENTERPRISE_API_KEY?.trim() &&
    positiveIntegerFromEnv(process.env.ACUITY_INSTANCE_ID)
  )
}

function getConfig(): AcuityEnterpriseConfig {
  const enterpriseId = positiveIntegerFromEnv(process.env.ACUITY_ENTERPRISE_ID)
  const instanceId = positiveIntegerFromEnv(process.env.ACUITY_INSTANCE_ID)
  const apiKey = process.env.ACUITY_ENTERPRISE_API_KEY?.trim()

  if (!enterpriseId || !instanceId || !apiKey) {
    throw new AcuityEnterpriseConfigurationError(
      'Acuity Enterprise doit être configuré avec ACUITY_ENTERPRISE_ID, '
      + 'ACUITY_ENTERPRISE_API_KEY et ACUITY_INSTANCE_ID.'
    )
  }

  return { enterpriseId, instanceId, apiKey }
}

function compactUpstreamError(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const nestedError = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : null
  const candidates = [
    record.message,
    typeof record.error === 'string' ? record.error : null,
    nestedError?.message,
  ]
  return candidates.find(candidate => typeof candidate === 'string' && candidate.trim())
    ?.toString().replace(/\s+/g, ' ').trim().slice(0, 500) ?? ''
}

async function enterpriseFetch<T>(
  path: string,
  init: Omit<RequestInit, 'headers' | 'signal'> = {}
): Promise<T> {
  const { enterpriseId, instanceId, apiKey } = getConfig()
  const resolvedPath = path
    .replace('{enterpriseId}', String(enterpriseId))
    .replace('{instanceId}', String(instanceId))

  const response = await fetch(`${ENTERPRISE_BASE}${resolvedPath}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${enterpriseId}:${apiKey}`).toString('base64')}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })

  const responseText = await response.text()
  let responseBody: unknown = null
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }
  }

  if (!response.ok) {
    const detail = compactUpstreamError(responseBody)
    throw new AcuityEnterpriseApiError(
      response.status,
      detail
        ? `Acuity Enterprise (${response.status}) : ${detail}`
        : `Acuity Enterprise a répondu avec le statut ${response.status}.`
    )
  }

  return responseBody as T
}

function arrayPayload<T>(payload: unknown, label: string): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  throw new AcuityEnterpriseApiError(502, `Acuity Enterprise a renvoyé un catalogue ${label} invalide.`)
}

export async function fetchAcuityEnterpriseCatalog(): Promise<AcuityEnterpriseCatalog> {
  const [rawCalendars, appointmentTypesPayload] = await Promise.all([
    fetchAllAcuityEnterpriseCalendars(),
    enterpriseFetch<unknown>(
      '/enterprises/{enterpriseId}/instance/{instanceId}/information/appointment-types'
    ),
  ])

  if (rawCalendars.some(calendar => (
    !Number.isSafeInteger(Number(calendar.id)) ||
    Number(calendar.id) <= 0 ||
    typeof calendar.name !== 'string' ||
    !calendar.name.trim()
  ))) {
    throw new AcuityEnterpriseApiError(502, 'Acuity Enterprise a renvoyé un calendrier invalide.')
  }
  const calendars = rawCalendars
    .map(calendar => ({ ...calendar, id: Number(calendar.id) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))

  const rawAppointmentTypes = arrayPayload<AcuityEnterpriseAppointmentType>(
    appointmentTypesPayload,
    'formations'
  )
  if (rawAppointmentTypes.some(type => (
    !Number.isSafeInteger(Number(type.id)) ||
    Number(type.id) <= 0 ||
    typeof type.name !== 'string' ||
    !type.name.trim()
  ))) {
    throw new AcuityEnterpriseApiError(502, 'Acuity Enterprise a renvoyé une formation invalide.')
  }
  const appointmentTypes = rawAppointmentTypes
    .map(type => ({
      ...type,
      id: Number(type.id),
      duration: Number(type.duration) || 0,
      classSize: type.classSize == null ? null : Number(type.classSize),
      calendarIDs: Array.isArray(type.calendarIDs)
        ? type.calendarIDs.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
        : [],
      formIDs: Array.isArray(type.formIDs)
        ? type.formIDs.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
        : [],
      addonIDs: Array.isArray(type.addonIDs)
        ? type.addonIDs.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
        : [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))

  return { calendars, appointmentTypes }
}

async function fetchAllAcuityEnterpriseCalendars(): Promise<AcuityEnterpriseCalendar[]> {
  const limit = 250
  let offset = 0
  const calendars: AcuityEnterpriseCalendar[] = []

  for (let page = 0; page < 100; page += 1) {
    const payload = await enterpriseFetch<unknown>(
      `/enterprises/{enterpriseId}/instance/{instanceId}/calendars?limit=${limit}&offset=${offset}`
    )
    const rows = arrayPayload<AcuityEnterpriseCalendar>(payload, 'calendriers')
    calendars.push(...rows)

    const pageInfo = payload && typeof payload === 'object'
      ? (payload as { pageInfo?: { total?: unknown } }).pageInfo
      : undefined
    const total = Number(pageInfo?.total)
    offset += rows.length
    if (rows.length < limit || (Number.isFinite(total) && offset >= total)) return calendars
    if (rows.length === 0) return calendars
  }

  throw new AcuityEnterpriseApiError(502, 'Le catalogue Acuity contient trop de pages de calendriers.')
}

async function fetchAcuityEnterpriseForms(): Promise<AcuityEnterpriseForm[]> {
  const payload = await enterpriseFetch<unknown>(
    '/enterprises/{enterpriseId}/instance/{instanceId}/information/forms'
  )
  return arrayPayload<AcuityEnterpriseForm>(payload, 'formulaires')
    .filter(form => Number.isSafeInteger(Number(form.id)) && Number(form.id) > 0)
    .map(form => ({ ...form, id: Number(form.id) }))
}

function normalizeFieldName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const HOTEL_FIELD_NAMES = new Set([
  'company name',
  'hotel name',
  'nom de l hotel',
  'nom de l etablissement',
  'nom de votre hotel',
  'nom de votre etablissement',
])

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new AcuityEnterpriseValidationError(`${label} est requis.`)
  if (normalized.length > maxLength) {
    throw new AcuityEnterpriseValidationError(`${label} ne peut pas dépasser ${maxLength} caractères.`)
  }
  return normalized
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw new AcuityEnterpriseValidationError(`${label} est invalide.`)
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.length > maxLength) {
    throw new AcuityEnterpriseValidationError(`${label} ne peut pas dépasser ${maxLength} caractères.`)
  }
  return normalized
}

function integerInRange(value: unknown, label: string, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AcuityEnterpriseValidationError(`${label} doit être un entier entre ${min} et ${max}.`)
  }
  return parsed
}

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AcuityEnterpriseValidationError('Le corps de la requête est invalide.')
  }
  return value as Record<string, unknown>
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: string[]): void {
  const allowedFields = new Set(allowed)
  const unknown = Object.keys(body).filter(key => !allowedFields.has(key))
  if (unknown.length > 0) {
    throw new AcuityEnterpriseValidationError(`Champ non autorisé : ${unknown[0]}.`)
  }
}

export function validateCreateClassAppointmentTypeInput(
  value: unknown
): CreateClassAppointmentTypeInput {
  const body = inputRecord(value)
  rejectUnknownFields(body, [
    'name',
    'description',
    'duration',
    'price',
    'category',
    'color',
    'classSize',
    'calendarIDs',
    'templateAppointmentTypeID',
  ])
  const calendarIDs = Array.isArray(body.calendarIDs)
    ? [...new Set(body.calendarIDs.map(id => integerInRange(id, 'calendarID', 1, Number.MAX_SAFE_INTEGER)))]
    : []
  if (calendarIDs.length === 0) {
    throw new AcuityEnterpriseValidationError('Sélectionnez au moins un calendrier.')
  }
  if (calendarIDs.length > 100) {
    throw new AcuityEnterpriseValidationError('Vous ne pouvez pas sélectionner plus de 100 calendriers.')
  }

  const color = optionalString(body.color, 'La couleur', 7)
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new AcuityEnterpriseValidationError('La couleur doit être au format #RRGGBB.')
  }

  const price = optionalString(body.price, 'Le prix', 20)
  if (price && !/^\d+(?:[.,]\d{1,2})?$/.test(price)) {
    throw new AcuityEnterpriseValidationError('Le prix doit être un nombre positif avec deux décimales maximum.')
  }

  return {
    name: requiredString(body.name, 'Le nom', 180),
    description: optionalString(body.description, 'La description', 5_000),
    duration: integerInRange(body.duration, 'La durée', 5, 1_440),
    price: price?.replace(',', '.'),
    category: requiredString(body.category, 'La catégorie', 180),
    color,
    classSize: integerInRange(body.classSize, 'La capacité', 1, 10_000),
    calendarIDs,
    templateAppointmentTypeID: integerInRange(
      body.templateAppointmentTypeID,
      'Le modèle de formation',
      1,
      Number.MAX_SAFE_INTEGER
    ),
  }
}

export async function createAcuityClassAppointmentType(
  rawInput: unknown
): Promise<AcuityEnterpriseAppointmentType> {
  const input = validateCreateClassAppointmentTypeInput(rawInput)
  const [catalog, forms] = await Promise.all([
    fetchAcuityEnterpriseCatalog(),
    fetchAcuityEnterpriseForms(),
  ])
  const validCalendarIds = new Set(catalog.calendars.map(calendar => calendar.id))
  const invalidCalendarId = input.calendarIDs.find(id => !validCalendarIds.has(id))
  if (invalidCalendarId) {
    throw new AcuityEnterpriseValidationError(`Le calendrier ${invalidCalendarId} n’existe pas.`)
  }

  const normalizedName = input.name.toLocaleLowerCase('fr-FR')
  const existingType = catalog.appointmentTypes.find(type =>
    type.active !== false && type.name.trim().toLocaleLowerCase('fr-FR') === normalizedName
  )
  if (existingType) {
    throw new AcuityEnterpriseConflictError(
      `Une formation nommée « ${existingType.name} » existe déjà dans Acuity.`
    )
  }

  const template = catalog.appointmentTypes.find(type =>
    type.id === input.templateAppointmentTypeID &&
    type.active !== false &&
    (type.type === 'class' || Number(type.classSize) > 0)
  )
  if (!template) {
    throw new AcuityEnterpriseValidationError('Le modèle de formation sélectionné est invalide.')
  }
  if (!template.formIDs?.length) {
    throw new AcuityEnterpriseValidationError(
      'Le modèle sélectionné n’a aucun formulaire participant. Choisissez une formation qui collecte le nom de l’hôtel.'
    )
  }
  const templateFormIds = new Set(template.formIDs)
  const hasHotelField = forms.some(form =>
    templateFormIds.has(form.id) &&
    (form.fields ?? []).some(field => HOTEL_FIELD_NAMES.has(normalizeFieldName(field.name)))
  )
  if (!hasHotelField) {
    throw new AcuityEnterpriseValidationError(
      'Le modèle sélectionné ne collecte pas le nom de l’hôtel. Choisissez une autre formation modèle.'
    )
  }

  const payload = await enterpriseFetch<unknown>(
    '/enterprises/{enterpriseId}/instance/{instanceId}/information/appointment-types',
    {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        duration: input.duration,
        price: input.price ?? '0',
        category: input.category,
        color: input.color ?? '#59319f',
        private: true,
        classSize: input.classSize,
        isSeries: false,
        calendarIDs: input.calendarIDs,
        formIDs: template.formIDs,
        paddingBefore: 0,
        paddingAfter: 0,
      }),
    }
  )

  const data = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as { data?: unknown }).data ?? payload
    : payload
  let created = data && typeof data === 'object' && Number((data as { id?: unknown }).id)
    ? data as AcuityEnterpriseAppointmentType
    : null
  if (!created || (created.type && created.type !== 'class')) {
    const refreshed = await fetchAcuityEnterpriseCatalog()
    const reconciled = refreshed.appointmentTypes.find(type => (
      (created?.id && type.id === Number(created.id)) ||
      type.name.trim().toLocaleLowerCase('fr-FR') === normalizedName
    ))
    if (reconciled && (reconciled.type === 'class' || Number(reconciled.classSize) > 0)) {
      created = reconciled
    }
  }
  if (!created) {
    throw new AcuityEnterpriseApiError(
      502,
      'Acuity a accepté la création, mais la formation n’a pas pu être réconciliée.'
    )
  }
  if (created.type && created.type !== 'class' && !Number(created.classSize)) {
    throw new AcuityEnterpriseApiError(
      502,
      'Acuity a créé un type qui n’est pas une formation de groupe. Il a été conservé privé.'
    )
  }
  return {
    ...created,
    name: created.name || input.name,
    description: created.description ?? input.description,
    duration: Number(created.duration) || input.duration,
    price: created.price ?? input.price ?? '0',
    category: created.category ?? input.category,
    color: created.color ?? input.color ?? '#59319f',
    type: created.type ?? 'class',
    classSize: Number(created.classSize) || input.classSize,
    calendarIDs: created.calendarIDs?.length ? created.calendarIDs : input.calendarIDs,
    formIDs: created.formIDs?.length ? created.formIDs : template.formIDs,
    private: true,
  }
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function validateOfferClassTimesInput(value: unknown): OfferClassTimesInput {
  const body = inputRecord(value)
  rejectUnknownFields(body, [
    'calendarID',
    'appointmentTypeID',
    'dates',
    'times',
    'makePublic',
  ])
  const dates = Array.isArray(body.dates) ? body.dates : []
  const times = Array.isArray(body.times) ? body.times : []

  if (dates.length === 0) {
    throw new AcuityEnterpriseValidationError('Ajoutez au moins une date.')
  }
  if (dates.length > MAX_CLASS_TIMES_PER_REQUEST) {
    throw new AcuityEnterpriseValidationError(
      `Vous ne pouvez pas publier plus de ${MAX_CLASS_TIMES_PER_REQUEST} dates à la fois.`
    )
  }
  if (dates.length !== times.length) {
    throw new AcuityEnterpriseValidationError('Chaque date doit avoir une heure correspondante.')
  }

  const normalizedDates = dates.map((date, index) => {
    if (typeof date !== 'string' || !isValidIsoDate(date.trim())) {
      throw new AcuityEnterpriseValidationError(`La date ${index + 1} est invalide.`)
    }
    return date.trim()
  })
  const normalizedTimes = times.map((time, index) => {
    if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      throw new AcuityEnterpriseValidationError(`L’heure ${index + 1} est invalide.`)
    }
    return time.trim()
  })

  const pairs = new Set<string>()
  normalizedDates.forEach((date, index) => {
    const pair = `${date}T${normalizedTimes[index]}`
    if (pairs.has(pair)) {
      throw new AcuityEnterpriseValidationError(`La date ${date} à ${normalizedTimes[index]} est en double.`)
    }
    pairs.add(pair)
  })

  return {
    calendarID: integerInRange(body.calendarID, 'calendarID', 1, Number.MAX_SAFE_INTEGER),
    appointmentTypeID: integerInRange(
      body.appointmentTypeID,
      'appointmentTypeID',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    dates: normalizedDates,
    times: normalizedTimes,
    makePublic: body.makePublic === true,
  }
}

function nowInTimezone(timeZone: string | null | undefined): { date: string; time: string } {
  if (!timeZone) {
    throw new AcuityEnterpriseValidationError('Le calendrier Acuity n’a pas de fuseau horaire.')
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date())
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return {
      date: `${value.year}-${value.month}-${value.day}`,
      time: `${value.hour}:${value.minute}`,
    }
  } catch {
    throw new AcuityEnterpriseValidationError('Le fuseau horaire du calendrier Acuity est invalide.')
  }
}

function addUtcMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`)
  const originalDay = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(originalDay, lastDay))
  return date.toISOString().slice(0, 10)
}

function offeredSlotKey(time: AcuityAvailableClassTime): string | null {
  for (const value of [time.localeTime, time.time]) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? '')
    if (match) return `${match[1]}T${match[2]}`
  }
  return null
}

async function setAppointmentTypeVisibility(
  appointmentTypeID: number,
  isPrivate: boolean
): Promise<void> {
  await enterpriseFetch<unknown>(
    `/enterprises/{enterpriseId}/instance/{instanceId}/information/appointment-types/${appointmentTypeID}`,
    { method: 'PATCH', body: JSON.stringify({ private: isPrivate }) }
  )
}

export async function offerAcuityClassTimes(
  rawInput: unknown
): Promise<AcuityAvailableClassResponse> {
  const input = validateOfferClassTimesInput(rawInput)
  const catalog = await fetchAcuityEnterpriseCatalog()
  const calendar = catalog.calendars.find(item => item.id === input.calendarID)
  if (!calendar) {
    throw new AcuityEnterpriseValidationError('Le calendrier sélectionné n’existe pas.')
  }
  const appointmentType = catalog.appointmentTypes.find(type =>
    type.id === input.appointmentTypeID &&
    type.active !== false &&
    (type.type === 'class' || Number(type.classSize) > 0)
  )
  if (!appointmentType) {
    throw new AcuityEnterpriseValidationError('La formation sélectionnée n’existe pas ou n’est pas une classe.')
  }
  if (appointmentType.calendarIDs?.length && !appointmentType.calendarIDs.includes(calendar.id)) {
    throw new AcuityEnterpriseValidationError('Cette formation n’est pas associée au calendrier sélectionné.')
  }

  const now = nowInTimezone(calendar.timezone)
  const horizon = addUtcMonths(now.date, 18)
  const pastDate = input.dates.find(date => date < now.date)
  if (pastDate) {
    throw new AcuityEnterpriseValidationError(`La date ${pastDate} est déjà passée.`)
  }
  const tooFarDate = input.dates.find(date => date > horizon)
  if (tooFarDate) {
    throw new AcuityEnterpriseValidationError('Les dates ne peuvent pas dépasser un horizon de 18 mois.')
  }
  const pastTimeIndex = input.dates.findIndex((date, index) => (
    date === now.date && input.times[index] <= now.time
  ))
  if (pastTimeIndex >= 0) {
    throw new AcuityEnterpriseValidationError(
      `L’heure ${input.times[pastTimeIndex]} est déjà passée dans le fuseau ${calendar.timezone}.`
    )
  }

  const payload = await enterpriseFetch<Partial<AcuityAvailableClassResponse>>(
    '/enterprises/{enterpriseId}/instance/{instanceId}/information/availability/classes',
    {
      method: 'POST',
      body: JSON.stringify({
        calendarID: input.calendarID,
        appointmentTypeID: input.appointmentTypeID,
        dates: input.dates,
        times: input.times,
      }),
    }
  )

  const result: AcuityAvailableClassResponse = {
    times: Array.isArray(payload?.times) ? payload.times : [],
    errors: Array.isArray(payload?.errors) ? payload.errors.map(String) : [],
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.map(String) : [],
    visibilityUpdated: false,
    matchedSlots: 0,
    fullyMatched: false,
  }

  const requestedKeys = new Set(input.dates.map((date, index) => `${date}T${input.times[index]}`))
  const returnedKeys = new Set<string>()
  let responseMatchesContext = true
  for (const time of result.times) {
    const key = offeredSlotKey(time)
    if (!key || !requestedKeys.has(key) || returnedKeys.has(key)) responseMatchesContext = false
    if (Number(time.calendarID) !== input.calendarID) {
      responseMatchesContext = false
    }
    if (Number(time.appointmentTypeID) !== input.appointmentTypeID) {
      responseMatchesContext = false
    }
    if (key && requestedKeys.has(key)) returnedKeys.add(key)
  }
  result.matchedSlots = returnedKeys.size
  result.fullyMatched = responseMatchesContext && (
    returnedKeys.size === requestedKeys.size && result.errors.length === 0
  )

  if (input.makePublic && result.fullyMatched) {
    try {
      await setAppointmentTypeVisibility(input.appointmentTypeID, false)
      result.visibilityUpdated = true
    } catch {
      result.warnings.push(
        'Les dates ont été publiées, mais la formation est restée privée. Rendez-la publique dans Acuity avant de partager le lien.'
      )
    }
  }

  return result
}

export function acuityEnterpriseErrorDetails(error: unknown): {
  status: number
  code: string
  message: string
} {
  if (error instanceof AcuityEnterpriseConfigurationError) {
    return { status: 503, code: 'ACUITY_ENTERPRISE_NOT_CONFIGURED', message: error.message }
  }
  if (error instanceof AcuityEnterpriseValidationError) {
    return { status: 400, code: 'INVALID_REQUEST', message: error.message }
  }
  if (error instanceof AcuityEnterpriseConflictError) {
    return { status: 409, code: 'ACUITY_ENTERPRISE_CONFLICT', message: error.message }
  }
  if (error instanceof AcuityEnterpriseApiError) {
    if (error.status === 400 || error.status === 409 || error.status === 422) {
      return {
        status: error.status,
        code: 'ACUITY_ENTERPRISE_ERROR',
        message: error.message,
      }
    }
    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        code: 'ACUITY_ENTERPRISE_AUTH_ERROR',
        message: 'Acuity Enterprise a refusé les identifiants ou les permissions configurées.',
      }
    }
    if (error.status === 429) {
      return {
        status: 503,
        code: 'ACUITY_ENTERPRISE_RATE_LIMIT',
        message: 'Acuity Enterprise limite temporairement les requêtes. Réessayez dans quelques minutes.',
      }
    }
    return {
      status: 502,
      code: 'ACUITY_ENTERPRISE_ERROR',
      message: 'Acuity Enterprise n’a pas pu terminer l’opération.',
    }
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { status: 504, code: 'ACUITY_ENTERPRISE_TIMEOUT', message: 'Acuity Enterprise ne répond pas.' }
  }
  if (error instanceof TypeError) {
    return {
      status: 502,
      code: 'ACUITY_ENTERPRISE_NETWORK_ERROR',
      message: 'Impossible de joindre Acuity Enterprise.',
    }
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Une erreur interne empêche de terminer l’opération Acuity.',
  }
}

export function isAcuityEnterpriseOutcomeUnknown(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === 'TimeoutError') ||
    (error instanceof AcuityEnterpriseApiError && error.status >= 500)
  )
}
