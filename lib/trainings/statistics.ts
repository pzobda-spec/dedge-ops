import { Training } from '@/lib/mockData'

export function getUniqueHotels(training: Training): string[] {
  return [...new Set(training.registrations.map(r => r.hotelName))]
}

export function getDuplicateHotels(training: Training): string[] {
  const counts: Record<string, number> = {}
  training.registrations.forEach(r => {
    counts[r.hotelName] = (counts[r.hotelName] || 0) + 1
  })
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
}

export function getTrainingStats(trainings: Training[]) {
  const byLanguage = { FR: 0, EN: 0, ES: 0 }
  const themeCount: Record<string, number> = {}
  const hotelSet = new Set<string>()

  trainings.forEach(t => {
    byLanguage[t.language]++
    themeCount[t.theme] = (themeCount[t.theme] || 0) + 1
    t.registrations.forEach(r => hotelSet.add(r.hotelName))
  })

  const topThemes = Object.entries(themeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))

  return { byLanguage, topThemes, totalUniqueHotels: hotelSet.size }
}
