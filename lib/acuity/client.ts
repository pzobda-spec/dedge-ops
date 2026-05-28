const BASE = 'https://acuityscheduling.com/api/v1'

function getAuthHeader(): string {
  const userId = process.env.ACUITY_USER_ID!
  const apiKey = process.env.ACUITY_API_KEY!
  return 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64')
}

async function acuityFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: getAuthHeader() },
    signal: AbortSignal.timeout(10000),
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
  classID: number
  category: string
  duration: string
  calendar: string
  calendarID: number
  canceled: boolean
  forms: Array<{
    id: number
    values: Array<{
      fieldID: number
      value: string
      name: string
    }>
  }>
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
  status: 'registered' | 'cancelled'
}

export interface AcuitySession {
  classID: number
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
  uniqueHotels: string[]
  duplicateHotels: string[]
  status: 'scheduled' | 'completed' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRAINING_CATEGORIES = ['formation', 'training']
const EXCLUDED_KEYWORDS = ['meeting with', 'customer support', 'salons', 'reunión con']

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

function getHotelName(appt: AcuityRawAppointment): string {
  for (const form of appt.forms) {
    const companyField = form.values.find(v => v.name === 'Company Name')
    if (companyField?.value) return companyField.value
  }
  return `${appt.firstName} ${appt.lastName}`
}

function formatDateDDMMYYYY(isoDatetime: string): string {
  const d = new Date(isoDatetime)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function buildSession(classID: number, appointments: AcuityRawAppointment[]): AcuitySession {
  // Sort by datetime
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  )

  const first = sorted[0]
  const now = new Date()
  const sessionDatetime = new Date(first.datetime)

  const title = cleanTitle(first.type)
  const language = detectLanguage(first.category)

  const participants: AcuityParticipant[] = sorted.map(appt => ({
    id: appt.id,
    firstName: appt.firstName,
    lastName: appt.lastName,
    email: appt.email,
    hotelName: getHotelName(appt),
    status: appt.canceled ? 'cancelled' : 'registered',
  }))

  const totalRegistered = participants.filter(p => p.status === 'registered').length
  const totalCancelled = participants.filter(p => p.status === 'cancelled').length

  // Unique hotels
  const hotelCounts: Record<string, number> = {}
  for (const p of participants) {
    hotelCounts[p.hotelName] = (hotelCounts[p.hotelName] || 0) + 1
  }
  const uniqueHotels = Object.keys(hotelCounts)
  const duplicateHotels = Object.entries(hotelCounts)
    .filter(([, count]) => count >= 2)
    .map(([name]) => name)

  const sessionStatus: AcuitySession['status'] =
    sessionDatetime < now ? 'completed' : 'scheduled'

  return {
    classID,
    title,
    theme: title,
    language,
    datetime: first.datetime,
    date: formatDateDDMMYYYY(first.datetime),
    time: first.time,
    duration: parseInt(first.duration, 10) || 0,
    calendar: first.calendar,
    calendarID: first.calendarID,
    category: first.category,
    participants,
    totalRegistered,
    totalCancelled,
    uniqueHotels,
    duplicateHotels,
    status: sessionStatus,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchSessions(options?: {
  minDate?: string
  maxDate?: string
}): Promise<AcuitySession[]> {
  let path = '/appointments?max=500'
  if (options?.minDate) path += `&minDate=${options.minDate}`
  if (options?.maxDate) path += `&maxDate=${options.maxDate}`

  const appointments = await acuityFetch<AcuityRawAppointment[]>(path)

  // Filter to training categories only
  const trainingAppts = appointments.filter(a => isTrainingCategory(a.category))

  // Group by classID
  const byClass = new Map<number, AcuityRawAppointment[]>()
  for (const appt of trainingAppts) {
    const existing = byClass.get(appt.classID) || []
    existing.push(appt)
    byClass.set(appt.classID, existing)
  }

  // Build sessions
  const sessions = Array.from(byClass.entries()).map(([classID, appts]) =>
    buildSession(classID, appts)
  )

  // Sort by datetime desc
  sessions.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

  return sessions
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
