const BASE = 'https://acuityscheduling.com/api/v1'
const APPOINTMENTS_LIMIT = 500
const SEGMENT_CONCURRENCY = 4
const REQUEST_INTERVAL_MS = 125
const FUTURE_BOUND_MONTHS = 18

let acuityRequestQueue = Promise.resolve()

function waitForAcuityRateLimit(): Promise<void> {
  const slot = acuityRequestQueue.then(
    () => new Promise<void>(resolve => setTimeout(resolve, REQUEST_INTERVAL_MS))
  )
  acuityRequestQueue = slot.catch(() => undefined)
  return slot
}

function getAuthHeader(): string {
  const userId = process.env.ACUITY_USER_ID!
  const apiKey = process.env.ACUITY_API_KEY!
  return 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64')
}

async function acuityFetch<T>(path: string): Promise<T> {
  await waitForAcuityRateLimit()
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: getAuthHeader() },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Acuity API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Raw Acuity types
// ---------------------------------------------------------------------------

interface AcuityRawAppointment {
  id: number
  firstName: string
  lastName: string
  email: string
  datetime: string
  date: string
  time: string
  endTime: string
  type: string
  appointmentTypeID: number
  classID?: number | null
  category: string
  duration: string
  calendar: string
  calendarID: number
  canceled: boolean
  noShow?: boolean
  forms?: Array<{
    id: number
    values: Array<{
      fieldID: number
      value: string
      name: string
    }>
  }>
}

interface AcuityRawClassOffering {
  id?: number
  appointmentTypeID: number
  calendarID: number
  name: string
  time: string
  calendar: string
  duration: number
  isSeries: boolean
  slots: number
  slotsAvailable: number
}

interface AcuityRawAppointmentType {
  id: number
  active?: boolean
  name: string
  description?: string
  duration: number
  category?: string
  private?: boolean
  type?: 'service' | 'class' | 'series'
  classSize?: number | null
  calendarIDs?: number[]
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AcuityParticipant {
  id: number
  firstName: string
  lastName: string
  email: string
  hotelName: string
  status: 'registered' | 'cancelled' | 'no_show'
}

export interface AcuitySession {
  id: string
  classID: number
  appointmentTypeID: number
  title: string
  theme: string
  language: 'FR' | 'EN' | 'ES'
  datetime: string
  date: string
  time: string
  duration: number
  calendar: string
  calendarID: number
  category: string
  participants: AcuityParticipant[]
  totalRegistered: number
  totalCancelled: number
  totalNoShow: number
  capacity: number | null
  availableSlots: number | null
  visibility: 'public' | 'private'
  isDraft: boolean
  uniqueHotels: string[]
  duplicateHotels: string[]
  status: 'scheduled' | 'completed' | 'cancelled'
}

export interface AcuitySessionsMeta {
  source: 'acuity'
  minDate: string | null
  maxDate: string
  requests: number
  segments: number
  appointments: number
  classes: number
  degraded: boolean
  warnings: string[]
  truncated: boolean
  truncatedRanges: Array<{ minDate: string; maxDate: string }>
}

export interface AcuitySessionsResult {
  sessions: AcuitySession[]
  meta: AcuitySessionsMeta
}

export interface OnboardingAppointment {
  acuity_id: number
  type_name: string
  datetime: string
  duration: number
  calendar: string
  category: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  client_name: string
  hotel_name: string
  project_id: string | null
}

export interface OnboardingAppointmentsResult {
  appointments: OnboardingAppointment[]
  meta: AcuitySessionsMeta
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRAINING_CATEGORIES = ['formation', 'training']
const EXCLUDED_KEYWORDS = ['meeting with', 'customer support', 'salons', 'reunión con']
const ONBOARDING_KEYWORDS = ['onboarding', 'kick-off', 'kickoff', 'implementation', 'implémentation']

function isTrainingCategory(category: string): boolean {
  const lower = category.toLowerCase()
  const isExcluded = EXCLUDED_KEYWORDS.some(kw => lower.includes(kw))
  if (isExcluded) return false
  return TRAINING_CATEGORIES.some(kw => lower.includes(kw))
}

function detectLanguage(category: string): 'FR' | 'EN' | 'ES' {
  if (category.includes('🇫🇷') || category.toLowerCase().includes('formations')) return 'FR'
  if (category.includes('🇬🇧') || category.toLowerCase().includes('training 🇬🇧')) return 'EN'
  if (category.includes('🇪🇸') || category.toLowerCase().includes('training 🇪🇸') || category.toLowerCase().includes('reunión')) return 'ES'
  return 'FR'
}

function cleanTitle(type: string): string {
  // Remove emoji flags
  let cleaned = type.replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
  // Remove specific single emoji like 📘
  cleaned = cleaned.replace(/[\u{1F4D8}]/gu, '')
  // Remove duration suffix like "(45 min)", "(60 min)" etc.
  cleaned = cleaned.replace(/\s*\(\d+\s*min\)\s*/gi, '')
  return cleaned.trim()
}

const HOTEL_FIELD_NAMES = new Set([
  'company name',
  'hotel name',
  'nom de l hotel',
  'nom de l etablissement',
  'nom de votre hotel',
  'nom de votre etablissement',
])

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function cleanHotelName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function getHotelName(appt: AcuityRawAppointment): string {
  for (const form of appt.forms ?? []) {
    const companyField = form.values.find(v =>
      HOTEL_FIELD_NAMES.has(normalizeForComparison(v.name))
    )
    const hotelName = cleanHotelName(companyField?.value ?? '')
    if (hotelName) return hotelName
  }
  return ''
}

function getCustomField(appt: AcuityRawAppointment, fieldName: string): string | null {
  const target = normalizeForComparison(fieldName.replace(/_/g, ' '))
  for (const form of appt.forms ?? []) {
    const field = form.values.find(v =>
      normalizeForComparison(v.name.replace(/_/g, ' ')) === target
    )
    const value = field?.value?.trim()
    if (value) return value
  }
  return null
}

function isOnboardingAppointment(appt: AcuityRawAppointment): boolean {
  const haystack = `${appt.category ?? ''} ${appt.type ?? ''}`.toLowerCase()
  return ONBOARDING_KEYWORDS.some(keyword => haystack.includes(keyword))
}

function isOwnerMeetingAppointment(appt: AcuityRawAppointment): boolean {
  return normalizeForComparison(appt.category ?? '').includes('meeting with')
}

function includesNormalized(value: string, needle: string): boolean {
  const cleanValue = normalizeForComparison(value)
  const cleanNeedle = normalizeForComparison(needle)
  if (!cleanValue || !cleanNeedle) return false
  return cleanValue.includes(cleanNeedle) || cleanNeedle.includes(cleanValue)
}

function formatDateDDMMYYYY(isoDatetime: string): string {
  const d = new Date(isoDatetime)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function formatClassTime(isoDatetime: string): string {
  const match = /T(\d{2}:\d{2})/.exec(isoDatetime)
  return match?.[1] ?? ''
}

function formatClassDate(isoDatetime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDatetime)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDateDDMMYYYY(isoDatetime)
}

function getParticipantStatus(appt: AcuityRawAppointment): AcuityParticipant['status'] {
  if (appt.noShow) return 'no_show'
  if (appt.canceled) return 'cancelled'
  return 'registered'
}

function getSessionIdentity(appt: AcuityRawAppointment): { id: string; classID: number } {
  if (typeof appt.classID === 'number' && Number.isFinite(appt.classID) && appt.classID > 0) {
    return { id: `class:${appt.classID}`, classID: appt.classID }
  }

  const datetime = Number.isNaN(new Date(appt.datetime).getTime())
    ? `${appt.date ?? ''}T${appt.time ?? ''}`
    : new Date(appt.datetime).toISOString()
  const calendarID = Number.isFinite(appt.calendarID) ? appt.calendarID : 'unknown-calendar'
  const appointmentTypeID = Number.isFinite(appt.appointmentTypeID)
    ? appt.appointmentTypeID
    : 'unknown-type'

  return {
    id: `fallback:${calendarID}:${appointmentTypeID}:${datetime}`,
    classID: 0,
  }
}

function normalizedInstant(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function offeringMatchKey(value: {
  appointmentTypeID: number
  calendarID: number
  datetime: string
}): string {
  return `${value.appointmentTypeID}:${value.calendarID}:${normalizedInstant(value.datetime)}`
}

function getOfferingIdentity(offering: AcuityRawClassOffering): { id: string; classID: number } {
  const classID = Number(offering.id)
  if (Number.isSafeInteger(classID) && classID > 0) {
    return { id: `class:${classID}`, classID }
  }
  return {
    id: `offering:${offeringMatchKey({
      appointmentTypeID: Number(offering.appointmentTypeID),
      calendarID: Number(offering.calendarID),
      datetime: offering.time,
    })}`,
    classID: 0,
  }
}

function buildCanonicalHotelNames(
  appointments: AcuityRawAppointment[]
): Map<string, string> {
  const hotelNames = new Map<string, string>()

  for (const appt of appointments) {
    if (getParticipantStatus(appt) !== 'registered') continue
    const hotelName = getHotelName(appt)
    const key = normalizeForComparison(hotelName)
    if (key && !hotelNames.has(key)) hotelNames.set(key, hotelName)
  }

  return hotelNames
}

function buildSession(
  id: string,
  classID: number,
  appointments: AcuityRawAppointment[],
  canonicalHotelNames: Map<string, string>,
  offering?: AcuityRawClassOffering,
  appointmentType?: AcuityRawAppointmentType
): AcuitySession {
  // Sort by datetime
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  )

  const first = sorted[0]
  const now = new Date()
  const datetime = offering?.time ?? first.datetime
  const sessionDatetime = new Date(datetime)

  const title = cleanTitle(offering?.name ?? first.type)
  const language = detectLanguage(first.category)

  const participants: AcuityParticipant[] = sorted.map(appt => {
    const rawHotelName = getHotelName(appt)
    const hotelName = canonicalHotelNames.get(normalizeForComparison(rawHotelName)) ?? rawHotelName
    return {
      id: appt.id,
      firstName: appt.firstName,
      lastName: appt.lastName,
      email: appt.email,
      hotelName,
      status: getParticipantStatus(appt),
    }
  })

  const totalRegistered = participants.filter(p => p.status === 'registered').length
  const totalCancelled = participants.filter(p => p.status === 'cancelled').length
  const totalNoShow = participants.filter(p => p.status === 'no_show').length

  // Only active registrations with an explicitly completed hotel field count here.
  const hotelCounts = new Map<string, { name: string; count: number }>()
  for (const p of participants) {
    if (p.status !== 'registered' || !p.hotelName) continue
    const key = normalizeForComparison(p.hotelName)
    if (!key) continue
    const current = hotelCounts.get(key)
    hotelCounts.set(key, { name: current?.name ?? p.hotelName, count: (current?.count ?? 0) + 1 })
  }
  const uniqueHotels = Array.from(hotelCounts.values(), hotel => hotel.name)
  const duplicateHotels = Array.from(hotelCounts.values())
    .filter(hotel => hotel.count >= 2)
    .map(hotel => hotel.name)

  const sessionStatus: AcuitySession['status'] = offering
    ? sessionDatetime < now
      ? 'completed'
      : 'scheduled'
    : totalRegistered === 0 && totalCancelled > 0 && totalNoShow === 0
      ? 'cancelled'
      : sessionDatetime < now
        ? 'completed'
        : 'scheduled'

  return {
    id,
    classID,
    appointmentTypeID: first.appointmentTypeID,
    title,
    theme: title,
    language,
    datetime,
    date: offering ? formatClassDate(datetime) : formatDateDDMMYYYY(datetime),
    time: offering ? formatClassTime(datetime) : first.time,
    duration: (offering?.duration ?? parseInt(first.duration, 10)) || 0,
    calendar: offering?.calendar ?? first.calendar,
    calendarID: offering?.calendarID ?? first.calendarID,
    category: first.category,
    participants,
    totalRegistered,
    totalCancelled,
    totalNoShow,
    capacity: Number.isFinite(Number(offering?.slots)) ? Number(offering?.slots) : null,
    availableSlots: Number.isFinite(Number(offering?.slotsAvailable))
      ? Number(offering?.slotsAvailable)
      : null,
    visibility: appointmentType?.private === true ? 'private' : 'public',
    isDraft: false,
    uniqueHotels,
    duplicateHotels,
    status: sessionStatus,
  }
}

function buildEmptySession(
  offering: AcuityRawClassOffering,
  appointmentType: AcuityRawAppointmentType
): AcuitySession {
  const datetime = offering.time
  const parsedDatetime = new Date(datetime)
  const title = cleanTitle(offering.name || appointmentType.name)
  const category = appointmentType.category?.trim() ?? ''
  const identity = getOfferingIdentity(offering)
  const visibility = appointmentType.private === true ? 'private' : 'public'

  return {
    id: identity.id,
    classID: identity.classID,
    appointmentTypeID: offering.appointmentTypeID,
    title,
    theme: title,
    language: detectLanguage(category),
    datetime,
    date: formatClassDate(datetime),
    time: formatClassTime(datetime),
    duration: Number(offering.duration) || Number(appointmentType.duration) || 0,
    calendar: offering.calendar,
    calendarID: offering.calendarID,
    category,
    participants: [],
    totalRegistered: 0,
    totalCancelled: 0,
    totalNoShow: 0,
    capacity: Number.isFinite(Number(offering.slots)) ? Number(offering.slots) : null,
    availableSlots: Number.isFinite(Number(offering.slotsAvailable))
      ? Number(offering.slotsAvailable)
      : null,
    visibility,
    isDraft: visibility === 'private',
    uniqueHotels: [],
    duplicateHotels: [],
    status: !Number.isNaN(parsedDatetime.getTime()) && parsedDatetime < new Date()
      ? 'completed'
      : 'scheduled',
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface AcuitySessionOptions {
  minDate?: string
  maxDate?: string
}

interface DateRange {
  minDate: string
  maxDate: string
}

interface FetchContext {
  requests: number
  segments: number
  truncatedRanges: DateRange[]
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid Acuity date: ${value}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Acuity date: ${value}`)
  }
  return parsed
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateOnly(date)
}

function getFutureBound(): string {
  const now = new Date()
  return formatDateOnly(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + FUTURE_BOUND_MONTHS + 1, 0))
  )
}

function buildAppointmentsPath(params: Record<string, string | number | boolean>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value))
  }
  return `/appointments?${searchParams.toString()}`
}

function splitIntoMonthlyRanges(minDate: string, maxDate: string): DateRange[] {
  const ranges: DateRange[] = []
  let cursor = minDate

  while (cursor <= maxDate) {
    const cursorDate = parseDateOnly(cursor)
    const endOfMonth = formatDateOnly(
      new Date(Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth() + 1, 0))
    )
    const rangeMaxDate = endOfMonth < maxDate ? endOfMonth : maxDate
    ranges.push({ minDate: cursor, maxDate: rangeMaxDate })
    cursor = addDays(rangeMaxDate, 1)
  }

  return ranges
}

function splitDateRange(range: DateRange): [DateRange, DateRange] | null {
  const minTime = parseDateOnly(range.minDate).getTime()
  const maxTime = parseDateOnly(range.maxDate).getTime()
  if (minTime >= maxTime) return null

  const dayMs = 24 * 60 * 60 * 1000
  const daySpan = Math.floor((maxTime - minTime) / dayMs)
  const leftMaxDate = formatDateOnly(new Date(minTime + Math.floor(daySpan / 2) * dayMs))
  return [
    { minDate: range.minDate, maxDate: leftMaxDate },
    { minDate: addDays(leftMaxDate, 1), maxDate: range.maxDate },
  ]
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index])
    }
  }

  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function fetchAppointmentRange(
  range: DateRange,
  context: FetchContext
): Promise<AcuityRawAppointment[]> {
  context.requests += 1
  const appointments = await acuityFetch<AcuityRawAppointment[]>(
    buildAppointmentsPath({
      max: APPOINTMENTS_LIMIT,
      showall: true,
      direction: 'ASC',
      minDate: range.minDate,
      maxDate: range.maxDate,
    })
  )

  if (appointments.length < APPOINTMENTS_LIMIT) {
    context.segments += 1
    return appointments
  }

  const splitRanges = splitDateRange(range)
  if (!splitRanges) {
    context.segments += 1
    context.truncatedRanges.push(range)
    return appointments
  }

  // Recursive calls remain sequential inside each monthly worker, keeping the
  // global request concurrency bounded while progressively shrinking hot ranges.
  const left = await fetchAppointmentRange(splitRanges[0], context)
  const right = await fetchAppointmentRange(splitRanges[1], context)
  return [...left, ...right]
}

async function getEarliestAppointmentDate(context: FetchContext): Promise<string | null> {
  context.requests += 1
  const appointments = await acuityFetch<AcuityRawAppointment[]>(
    buildAppointmentsPath({
      max: 1,
      showall: true,
      direction: 'ASC',
      excludeForms: true,
    })
  )
  const earliest = appointments[0]
  if (!earliest) return null

  // `date` is localized by Acuity (for example "26 janvier 2022"), while the
  // leading datetime component is stable and accepted by minDate/maxDate.
  const date = earliest.datetime?.slice(0, 10) || earliest.date
  parseDateOnly(date)
  return date
}

interface RawAppointmentsResult {
  appointments: AcuityRawAppointment[]
  meta: AcuitySessionsMeta
}

async function fetchRawAppointmentsWithMeta(
  options: AcuitySessionOptions = {}
): Promise<RawAppointmentsResult> {
  if (options.minDate) parseDateOnly(options.minDate)
  if (options.maxDate) parseDateOnly(options.maxDate)
  if (options.minDate && options.maxDate && options.minDate > options.maxDate) {
    throw new Error('Acuity minDate must be before or equal to maxDate')
  }

  const context: FetchContext = { requests: 0, segments: 0, truncatedRanges: [] }
  const maxDate = options.maxDate ?? getFutureBound()
  const minDate = options.minDate ?? await getEarliestAppointmentDate(context)

  if (!minDate || minDate > maxDate) {
    return {
      appointments: [],
      meta: {
        source: 'acuity',
        minDate,
        maxDate,
        requests: context.requests,
        segments: 0,
        appointments: 0,
        classes: 0,
        degraded: false,
        warnings: [],
        truncated: false,
        truncatedRanges: [],
      },
    }
  }

  const ranges = splitIntoMonthlyRanges(minDate, maxDate)
  const chunks = await mapWithConcurrency(ranges, SEGMENT_CONCURRENCY, range =>
    fetchAppointmentRange(range, context)
  )

  const appointmentsById = new Map<number, AcuityRawAppointment>()
  for (const appointment of chunks.flat()) {
    appointmentsById.set(appointment.id, appointment)
  }
  const appointments = Array.from(appointmentsById.values())
  const truncatedRanges = [...context.truncatedRanges].sort((a, b) =>
    a.minDate.localeCompare(b.minDate)
  )

  return {
    appointments,
    meta: {
      source: 'acuity',
      minDate,
      maxDate,
      requests: context.requests,
      segments: context.segments,
      appointments: appointments.length,
      classes: 0,
      degraded: false,
      warnings: [],
      truncated: truncatedRanges.length > 0,
      truncatedRanges,
    },
  }
}

function buildSessions(
  appointments: AcuityRawAppointment[],
  offerings: AcuityRawClassOffering[],
  appointmentTypes: AcuityRawAppointmentType[]
): AcuitySession[] {
  const trainingAppts = appointments.filter(a => isTrainingCategory(a.category))
  const canonicalHotelNames = buildCanonicalHotelNames(trainingAppts)
  const byClass = new Map<string, { classID: number; appointments: AcuityRawAppointment[] }>()
  const offeringsByClassId = new Map(
    offerings
      .filter(offering => Number.isFinite(Number(offering.id)) && Number(offering.id) > 0)
      .map(offering => [Number(offering.id), offering] as const)
  )
  const offeringsByMatchKey = new Map(
    offerings.map(offering => [offeringMatchKey({
      appointmentTypeID: Number(offering.appointmentTypeID),
      calendarID: Number(offering.calendarID),
      datetime: offering.time,
    }), offering] as const)
  )
  const appointmentTypesById = new Map(
    appointmentTypes.map(type => [Number(type.id), type] as const)
  )

  for (const appt of trainingAppts) {
    const identity = getSessionIdentity(appt)
    const group = byClass.get(identity.id) ?? { classID: identity.classID, appointments: [] }
    group.appointments.push(appt)
    byClass.set(identity.id, group)
  }

  const matchedOfferings = new Set<AcuityRawClassOffering>()
  const sessions = Array.from(byClass.entries()).map(([id, group]) => {
    const first = group.appointments[0]
    const offering = offeringsByClassId.get(group.classID) ?? offeringsByMatchKey.get(
      offeringMatchKey({
        appointmentTypeID: Number(first.appointmentTypeID),
        calendarID: Number(first.calendarID),
        datetime: first.datetime,
      })
    )
    if (offering) matchedOfferings.add(offering)
    const identity = offering ? getOfferingIdentity(offering) : { id, classID: group.classID }
    return buildSession(
      identity.id,
      identity.classID,
      group.appointments,
      canonicalHotelNames,
      offering,
      appointmentTypesById.get(Number(first.appointmentTypeID))
    )
  })

  for (const offering of offerings) {
    if (matchedOfferings.has(offering)) continue
    const appointmentType = appointmentTypesById.get(Number(offering.appointmentTypeID))
    if (!appointmentType || appointmentType.active === false) continue
    if (!isTrainingCategory(appointmentType.category ?? '')) continue
    sessions.push(buildEmptySession(offering, appointmentType))
  }

  sessions.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
  return sessions
}

function buildAvailabilityClassesPath(minDate: string, maxDate: string): string {
  const searchParams = new URLSearchParams({
    minDate,
    maxDate,
    includeUnavailable: 'true',
    includePrivate: 'true',
  })
  return `/availability/classes?${searchParams.toString()}`
}

async function fetchRawClassOfferings(
  minDate: string | null,
  maxDate: string
): Promise<{ offerings: AcuityRawClassOffering[]; appointmentTypes: AcuityRawAppointmentType[]; requests: number }> {
  if (!minDate || minDate > maxDate) {
    return { offerings: [], appointmentTypes: [], requests: 0 }
  }

  const [offerings, appointmentTypes] = await Promise.all([
    acuityFetch<AcuityRawClassOffering[]>(buildAvailabilityClassesPath(minDate, maxDate)),
    acuityFetch<AcuityRawAppointmentType[]>('/appointment-types'),
  ])

  if (!Array.isArray(offerings) || !Array.isArray(appointmentTypes)) {
    throw new Error('Acuity returned an invalid classes catalog')
  }

  return {
    offerings,
    appointmentTypes,
    requests: 2,
  }
}

export async function fetchSessionsWithMeta(
  options: AcuitySessionOptions = {}
): Promise<AcuitySessionsResult> {
  const { appointments, meta } = await fetchRawAppointmentsWithMeta(options)
  let offerings: AcuityRawClassOffering[] = []
  let appointmentTypes: AcuityRawAppointmentType[] = []
  let requests = 0
  let degraded = false
  const warnings: string[] = []
  try {
    const classesResult = await fetchRawClassOfferings(
      meta.minDate ?? options.minDate ?? new Date().toISOString().slice(0, 10),
      meta.maxDate
    )
    offerings = classesResult.offerings
    appointmentTypes = classesResult.appointmentTypes
    requests = classesResult.requests
  } catch {
    degraded = true
    warnings.push(
      'Les dates Acuity sans inscription ne sont temporairement pas disponibles. Les rendez-vous restent affichés.'
    )
  }

  return {
    sessions: buildSessions(appointments, offerings, appointmentTypes),
    meta: {
      ...meta,
      requests: meta.requests + requests,
      classes: offerings.length,
      degraded,
      warnings,
    },
  }
}

export async function fetchSessions(options?: AcuitySessionOptions): Promise<AcuitySession[]> {
  const result = await fetchSessionsWithMeta(options)
  return result.sessions
}

export async function fetchUpcomingSessions(): Promise<AcuitySession[]> {
  const today = new Date().toISOString().slice(0, 10)
  return fetchSessions({ minDate: today })
}

export async function fetchRecentSessions(months = 3): Promise<AcuitySession[]> {
  const minDate = new Date()
  minDate.setMonth(minDate.getMonth() - months)
  return fetchSessions({ minDate: minDate.toISOString().slice(0, 10) })
}

interface OnboardingAppointmentsFilter {
  from?: Date
  to?: Date
  hotelName?: string
  projectId?: string
  includeOwnerMeetings?: boolean
}

function dateFilterValue(date: Date | undefined, label: string): string | undefined {
  if (!date) return undefined
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Acuity ${label} date`)
  return date.toISOString().slice(0, 10)
}

function getOnboardingAppointmentStatus(
  appointment: AcuityRawAppointment,
  now: Date
): OnboardingAppointment['status'] {
  if (appointment.noShow) return 'no_show'
  if (appointment.canceled) return 'cancelled'

  const appointmentTime = new Date(appointment.datetime)
  if (Number.isNaN(appointmentTime.getTime())) {
    throw new Error(`Acuity appointment ${appointment.id} has an invalid datetime`)
  }
  return appointmentTime < now ? 'completed' : 'scheduled'
}

export async function fetchOnboardingAppointmentsWithMeta(
  filter?: OnboardingAppointmentsFilter
): Promise<OnboardingAppointmentsResult> {
  const { appointments: rawAppointments, meta } = await fetchRawAppointmentsWithMeta({
    minDate: dateFilterValue(filter?.from, 'from'),
    maxDate: dateFilterValue(filter?.to, 'to'),
  })
  const now = new Date()
  const expectedProjectId = filter?.projectId?.trim() ?? ''

  const appointments = rawAppointments
    .filter(appt =>
      isOnboardingAppointment(appt) ||
      (filter?.includeOwnerMeetings === true && isOwnerMeetingAppointment(appt))
    )
    .map(appt => {
      return {
        acuity_id: appt.id,
        type_name: cleanTitle(appt.type),
        datetime: appt.datetime,
        duration: parseInt(appt.duration, 10) || 0,
        calendar: appt.calendar,
        category: appt.category,
        status: getOnboardingAppointmentStatus(appt, now),
        client_name: `${appt.firstName} ${appt.lastName}`.trim(),
        hotel_name: getHotelName(appt),
        project_id: getCustomField(appt, 'project_id'),
      }
    })
    .filter(appt => {
      if (expectedProjectId && appt.project_id) {
        return appt.project_id.trim() === expectedProjectId
      }
      if (filter?.hotelName) {
        return includesNormalized(appt.hotel_name, filter.hotelName)
      }
      return !expectedProjectId
    })
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

  return { appointments, meta }
}

export async function fetchOnboardingAppointments(
  filter?: OnboardingAppointmentsFilter
): Promise<OnboardingAppointment[]> {
  const result = await fetchOnboardingAppointmentsWithMeta(filter)
  if (result.meta.truncated) {
    throw new Error('Acuity onboarding appointments are incomplete because a daily result limit was reached')
  }
  return result.appointments
}
