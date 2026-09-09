import type { AcuitySession } from './client'

export function summarizeTrainingPlanning(sessions: AcuitySession[]) {
  const groups = new Map<string, { theme: string; language: string; sessions: number; minutes: number; registrations: number; empty: number; capacity: number; knownCapacitySessions: number; registrationsWithCapacity: number }>()
  for (const session of sessions) {
    if (session.status !== 'scheduled' || session.isDraft) continue
    const key = JSON.stringify([session.theme, session.language])
    const row = groups.get(key) ?? { theme: session.theme, language: session.language, sessions: 0, minutes: 0, registrations: 0, empty: 0, capacity: 0, knownCapacitySessions: 0, registrationsWithCapacity: 0 }
    row.sessions++
    row.minutes += session.duration
    row.registrations += session.totalRegistered
    if (session.totalRegistered === 0) row.empty++
    if (session.capacity !== null && session.capacity > 0) {
      row.capacity += session.capacity
      row.knownCapacitySessions++
      row.registrationsWithCapacity += session.totalRegistered
    }
    groups.set(key, row)
  }
  return [...groups.values()].sort((a, b) => b.empty - a.empty || a.language.localeCompare(b.language) || a.theme.localeCompare(b.theme))
}
