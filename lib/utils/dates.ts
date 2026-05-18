export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function getHoursSince(dateStr: string): number {
  const now = new Date()
  const past = new Date(dateStr)
  return (now.getTime() - past.getTime()) / (1000 * 60 * 60)
}

export function formatHoursAgo(dateStr: string): string {
  const hours = getHoursSince(dateStr)
  if (hours < 1) return "il y a moins d'1h"
  if (hours < 24) return `il y a ${Math.floor(hours)}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

export function getDaysSince(dateStr: string): number {
  return getHoursSince(dateStr) / 24
}
