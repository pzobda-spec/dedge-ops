'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import type { LinearIssue } from '@/lib/linear/client'
import type { AcuitySession } from '@/lib/acuity/client'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
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
  const [escalations, setEscalations] = useState<LinearIssue[]>([])
  const [sessions, setSessions] = useState<AcuitySession[]>([])
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingOther, setLoadingOther] = useState(true)

  const loadAll = useCallback(async () => {
    setLoadingTickets(true)
    setLoadingOther(true)

    const [ticketsRes, escalationsRes, sessionsRes, projectsRes] = await Promise.allSettled([
      fetch('/api/zoho/tickets?limit=100').then(r => r.json()),
      fetch('/api/linear/issues').then(r => r.json()),
      fetch('/api/acuity/sessions?upcoming=true').then(r => r.json()),
      fetch('/api/zoho/projects').then(r => r.json()),
    ])

    if (ticketsRes.status === 'fulfilled') setTickets(ticketsRes.value.tickets ?? [])
    setLoadingTickets(false)

    if (escalationsRes.status === 'fulfilled') setEscalations(escalationsRes.value.issues ?? [])
    if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.sessions ?? [])
    if (projectsRes.status === 'fulfilled') setProjects(projectsRes.value.projects ?? [])
    setLoadingOther(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const now = new Date()

  const criticalTickets = tickets.filter(t => {
    if (!['Strategic', 'Gold'].includes(t.segment ?? '')) return false
    const hoursSinceAgentReply = (now.getTime() - new Date(t.lastAgentReplyAt).getTime()) / 3600000
    return hoursSinceAgentReply > 24
  })

  const openTickets = tickets.filter(t => t.status !== 'resolved')

  const pendingEscalations = escalations.filter(e => e.status !== 'resolved')

  const weekMs = 7 * 24 * 3600 * 1000
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(todayStart.getTime() + weekMs)
  const weekSessions = sessions.filter(s => {
    const d = new Date(s.datetime)
    return d >= todayStart && d <= weekEnd
  })

  const blockedProjects = projects.filter(p => p.status === 'blocked')

  const topTickets = [...tickets]
    .filter(t => t.status !== 'resolved')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4)

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Bonjour Pablo</h1>
        <p className="text-sm text-slate-500 mt-0.5 capitalize">{formatTodayFR()}</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Tickets critiques</p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-red-600 mt-2">{criticalTickets.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Strategic/Gold &gt; 24h sans réponse</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Tickets ouverts</p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 mt-2">{openTickets.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">non résolus</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Escalades en cours</p>
            {loadingOther ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-orange-600 mt-2">{pendingEscalations.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">non résolues</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Formations (7j)</p>
            {loadingOther ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-blue-600 mt-2">{weekSessions.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">cette semaine</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Onboarding bloqués</p>
            {loadingOther ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-red-500 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-red-500 mt-2">{blockedProjects.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">projets bloqués</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <Link href="/tickets" className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors">
            Répondre aux tickets critiques
          </Link>
          <Link href="/escalations" className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors">
            Relancer tech
          </Link>
          <Link href="/trainings" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
            Préparer formation
          </Link>
          <Link href="/reporting" className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors">
            Générer reporting
          </Link>
        </div>

        {/* Main content */}
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
                <div className="px-4 py-6 text-sm text-slate-400">Aucun ticket prioritaire en cours.</div>
              ) : (
                topTickets.map(ticket => (
                  <Link key={ticket.id} href={`/tickets/${ticket.zohoInternalId}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {ticket.zohoStatus}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{ticket.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ticket.clientName} · {ticket.productArea}</p>
                    </div>
                    {ticket.segment && (
                      <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />
                    )}
                    <div className="flex-shrink-0 text-xs text-slate-400">{formatHoursAgo(ticket.createdAt)}</div>
                    <RiskScore score={ticket.riskScore} />
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="col-span-1 space-y-4">
            {/* Pending escalations */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">Escalades en attente</h2>
              <div className="space-y-2">
                {loadingOther ? (
                  <div className="h-16 bg-white rounded-lg border border-slate-200 animate-pulse" />
                ) : pendingEscalations.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucune escalade en attente</p>
                ) : (
                  pendingEscalations.slice(0, 3).map(e => (
                    <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer"
                      className="block bg-white rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors"
                    >
                      <p className="text-xs font-mono text-slate-500">{e.identifier}</p>
                      <p className="text-sm font-medium text-slate-900 mt-1 line-clamp-2">{e.title}</p>
                    </a>
                  ))
                )}
              </div>
            </div>

            {/* Sessions this week */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">Formations (7 jours)</h2>
              <div className="space-y-2">
                {loadingOther ? (
                  <div className="h-16 bg-white rounded-lg border border-slate-200 animate-pulse" />
                ) : weekSessions.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucune formation cette semaine</p>
                ) : (
                  weekSessions.slice(0, 3).map(s => (
                    <div key={s.classID} className="bg-white rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-900 line-clamp-1">{s.title}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDate(s.datetime)} · {s.totalRegistered} inscrits
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Blocked onboarding */}
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-2">Onboarding bloqués</h2>
              <div className="space-y-2">
                {loadingOther ? (
                  <div className="h-16 bg-white rounded-lg border border-slate-200 animate-pulse" />
                ) : blockedProjects.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucun projet bloqué</p>
                ) : (
                  blockedProjects.slice(0, 3).map(p => (
                    <div key={p.id} className="bg-white rounded-lg border border-red-200 p-3">
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.ownerName}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
