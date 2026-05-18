'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import {
  escalations,
  trainings,
  onboardingProjects,
  getClient,
} from '@/lib/mockData'
import Badge from '@/components/ui/Badge'
import RiskScore from '@/components/ui/RiskScore'
import { formatHoursAgo, formatDate } from '@/lib/utils/dates'

function formatTodayFR(): string {
  const d = new Date()
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState<ZohoMappedTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)

  useEffect(() => {
    async function loadTickets() {
      try {
        const res = await fetch('/api/zoho/tickets?limit=100')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setTickets(data.tickets || [])
      } catch (err) {
        console.error('Dashboard: failed to load tickets:', err)
      } finally {
        setLoadingTickets(false)
      }
    }
    loadTickets()
  }, [])

  const now = new Date()

  // Critical tickets: Strategic or Gold segment AND no agent reply > 24h
  const criticalTickets = tickets.filter(t => {
    if (!['Strategic', 'Gold'].includes(t.segment ?? '')) return false
    const hoursSinceAgentReply = (now.getTime() - new Date(t.lastAgentReplyAt).getTime()) / 3600000
    return hoursSinceAgentReply > 24
  })

  const openTickets = tickets.filter(t => !['resolved'].includes(t.status))

  // Mock data for escalations, trainings, onboarding
  const pendingEscalations = escalations.filter(e => e.status !== 'resolved')
  const blockedProjects = onboardingProjects.filter(p => p.status === 'blocked')

  const weekMs = 7 * 24 * 3600 * 1000
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(todayStart.getTime() + weekMs)
  const weekTrainings = trainings.filter(t => {
    const d = new Date(t.trainingDate)
    return d >= todayStart && d <= weekEnd
  })

  // Top 4 tickets by risk score
  const topTickets = [...tickets]
    .filter(t => t.status !== 'resolved')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4)

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Bonjour Pablo 👋</h1>
        <p className="text-sm text-slate-500 mt-0.5 capitalize">{formatTodayFR()}</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              Tickets critiques
            </p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-red-600 mt-2">{criticalTickets.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Strategic/Gold &gt; 24h sans réponse</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              Tickets ouverts
            </p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 mt-2">{openTickets.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">non résolus</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              Escalades en cours
            </p>
            <p className="text-3xl font-bold text-orange-600 mt-2">{pendingEscalations.length}</p>
            <p className="text-xs text-slate-400 mt-1">non résolues</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              Formations (7j)
            </p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{weekTrainings.length}</p>
            <p className="text-xs text-slate-400 mt-1">cette semaine</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              Onboarding bloqués
            </p>
            <p className="text-3xl font-bold text-red-500 mt-2">{blockedProjects.length}</p>
            <p className="text-xs text-slate-400 mt-1">projets bloqués</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <Link
            href="/tickets"
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Répondre aux tickets critiques
          </Link>
          <Link
            href="/escalations"
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Relancer tech
          </Link>
          <Link
            href="/trainings"
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Préparer formation
          </Link>
          <Link
            href="/reporting"
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Générer reporting
          </Link>
        </div>

        {/* Main content — 2 columns */}
        <div className="grid grid-cols-4 gap-6">
          {/* Left: priority tickets */}
          <div className="col-span-3 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Tickets prioritaires</h2>
            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
              {loadingTickets ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  Chargement...
                </div>
              ) : topTickets.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">
                  Aucun ticket prioritaire en cours.
                </div>
              ) : (
                topTickets.map(ticket => (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.zohoInternalId}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {ticket.zohoStatus}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {ticket.subject}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ticket.clientName} · {ticket.productArea}
                      </p>
                    </div>
                    {ticket.segment && (
                      <div className="flex-shrink-0">
                        <Badge
                          label={ticket.segment}
                          variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
                        />
                      </div>
                    )}
                    <div className="flex-shrink-0 text-xs text-slate-400">
                      {formatHoursAgo(ticket.createdAt)}
                    </div>
                    <div className="flex-shrink-0">
                      <RiskScore score={ticket.riskScore} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="col-span-1 space-y-4">
            {/* Pending escalations */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">
                Escalades en attente
              </h2>
              <div className="space-y-2">
                {pendingEscalations.slice(0, 3).map(e => {
                  const mockTicket = escalations.find(x => x.id === e.id)
                  return (
                    <div
                      key={e.id}
                      className="bg-white rounded-lg border border-slate-200 p-3"
                    >
                      <p className="text-xs font-mono text-slate-500">{e.linearIssueId}</p>
                      <p className="text-sm font-medium text-slate-900 mt-1 line-clamp-2">
                        {e.subject}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Trainings this week */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">
                Formations (7 jours)
              </h2>
              <div className="space-y-2">
                {(weekTrainings.length > 0 ? weekTrainings : trainings.slice(0, 3)).slice(0, 3).map(t => (
                  <div
                    key={t.id}
                    className="bg-white rounded-lg border border-slate-200 p-3"
                  >
                    <p className="text-sm font-medium text-slate-900 line-clamp-1">{t.title}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDate(t.trainingDate)} · {t.registrations.length} inscrits
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Blocked onboarding */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">
                Onboarding bloqués
              </h2>
              <div className="space-y-2">
                {blockedProjects.slice(0, 3).map(p => {
                  const client = getClient(p.clientId)
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-lg border border-red-200 p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">{client?.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.owner} · {p.plan}</p>
                      <p className="text-xs text-red-600 mt-1 line-clamp-2">{p.blockers}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
