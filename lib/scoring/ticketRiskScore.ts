import { Ticket, Client } from '@/lib/mockData'

function getHoursSince(dateStr: string): number {
  const now = new Date()
  const past = new Date(dateStr)
  return (now.getTime() - past.getTime()) / (1000 * 60 * 60)
}

export function computeRiskScore(ticket: Ticket, client: Client): number {
  let score = 0
  const hoursSinceLastReply = getHoursSince(ticket.lastAgentReplyAt)

  if (client.segment === 'Strategic') score += 40
  else if (client.segment === 'Gold') score += 30
  else if (client.segment === 'Silver') score += 15

  if (hoursSinceLastReply > 48) score += 25
  else if (hoursSinceLastReply > 24) score += 15
  else if (hoursSinceLastReply > 8) score += 8

  if (ticket.sentiment === 'negative') score += 20
  if (ticket.type === 'problem') score += 15
  if (ticket.priority === 'urgent') score += 20
  else if (ticket.priority === 'high') score += 10
  if (ticket.status === 'reopened') score += 10

  return Math.min(score, 100)
}
