import { eachDayOfInterval, format } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fetchActiveBusinessHours, fetchHolidayList, type ZohoHolidayList } from '@/lib/zoho/client'
import type { BusinessWeek } from './types'

const DAYS: Record<string, keyof BusinessWeek> = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday',
}

export async function syncBusinessHoursFromZoho(): Promise<{ synced: boolean; id?: string; error?: string }> {
  try {
    const sets = await fetchActiveBusinessHours()
    const selectedId = process.env.ZOHO_BUSINESS_HOURS_ID?.trim()
    const selected = sets.find(item => item.id === selectedId)
      ?? sets.find(item => item.name.toLocaleLowerCase('fr-FR').includes('paris'))
      ?? sets[0]
    if (!selected) throw new Error('No active Zoho business hours set found')

    const weeklySchedule: BusinessWeek = {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
    }
    for (const interval of selected.businessTimes ?? []) {
      const day = DAYS[interval.day?.toUpperCase()]
      if (!day || interval.startTime === interval.endTime) continue
      weeklySchedule[day].push({ start: interval.startTime, end: interval.endTime })
    }

    const holidayListIds = (selected.holidayLists ?? [])
      .filter(item => item.status !== 'INACTIVE')
      .map(item => item.id)
    const lists = await Promise.all(holidayListIds.map(id => fetchHolidayList(id)))
    const holidays = expandHolidayLists(lists)
    const timezone = normalizeTimezone(selected.timeZone?.id)
    const now = new Date().toISOString()

    const { error: deactivateError } = await supabaseAdmin
      .from('support_business_hours')
      .update({ active: false, updated_at: now })
      .eq('active', true)
      .neq('id', selected.id)
    if (deactivateError) throw new Error(deactivateError.message)

    const { error } = await supabaseAdmin.from('support_business_hours').upsert({
      id: selected.id,
      name: selected.name,
      timezone,
      weekly_schedule: weeklySchedule,
      holidays,
      zoho_holiday_list_ids: holidayListIds,
      source: 'zoho_desk',
      active: true,
      synced_at: now,
      sync_error: null,
      updated_at: now,
    }, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    return { synced: true, id: selected.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabaseAdmin.from('support_business_hours').update({
      sync_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('active', true)
    return { synced: false, error: message }
  }
}

function expandHolidayLists(lists: ZohoHolidayList[]): string[] {
  const currentYear = new Date().getUTCFullYear()
  const dates = new Set<string>()
  for (const list of lists) {
    const years = list.holidayListType === 'YEAR_SPECIFIC' && list.year
      ? [Number(list.year)]
      : [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]
    for (const holiday of list.holidays ?? []) {
      for (const year of years) {
        if (!Number.isInteger(year)) continue
        const start = new Date(`${year}-${holiday.from}T12:00:00Z`)
        let end = new Date(`${year}-${holiday.to}T12:00:00Z`)
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue
        if (end < start) end = new Date(`${year + 1}-${holiday.to}T12:00:00Z`)
        for (const day of eachDayOfInterval({ start, end })) dates.add(format(day, 'yyyy-MM-dd'))
      }
    }
  }
  return [...dates].sort()
}

function normalizeTimezone(value: string | undefined): string {
  if (value) {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: value }).format(new Date())
      return value
    } catch {
      // Fall through to the support calendar default.
    }
  }
  return 'Europe/Paris'
}
