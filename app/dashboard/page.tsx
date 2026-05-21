'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import type { LinearIssue } from '@/lib/linear/client'
import type { AcuitySession } from '@/lib/acuity/client'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils/dates'

function formatTodayFR(): string {
  const d = new Date()
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000
}

function formatWait(dateStr: string): string {
  const h = Math.floor(hoursAgo(dateStr))
  if (h < 1) return '< 1h'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j ${h % 24}h`
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState<ZohoMappedTicket[]>([])
  const [escalations, setEscalations] = useState<LinearIssue[]>([])
  const [sessions, setSessions] = useState<AcuitySession[]>([])
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingOther, setLoadingOther] = useState(true)
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeMsg, setNormalizeMsg] = useState<string | null>(null)
  const [fixingUndefined, setFixingUndefined] = useState(false)
  const [fixUndefinedMsg, setFixUndefinedMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoadingTickets(true)
    setLoadingOther(true)

    const [ticketsRes, escalationsRes, sessionsRes, projectsRes] = await Promise.allSettled([
      fetch('/api/zoho/tickets').then(r => r.json()),
      fetch('/api/linear/issues').then(r => r.json()),
      fetch('/api/acuity/sessions?period=upcoming').then(r => r.json()),
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

  // Tickets sans 1ère réponse depuis > 2h — Open et Escalated uniquement
  const noFirstReply = tickets.filter(t =>
    (t.zohoStatus === 'Open' || t.zohoStatus === 'Escalated') &&
    t.threadCount <= 1 &&
    hoursAgo(t.createdAt) > 2
  )

  const pendingEscalations = escalations.filter(e => e.status !== 'resolved')

  const weekMs = 7 * 24 * 3600 * 1000
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekSessions = sessions.filter(s => {
    const d = new Date(s.datetime)
    return d >= todayStart && d <= new Date(todayStart.getTime() + weekMs)
  })

  const blockedProjects = projects.filter(p => p.status === 'blocked')

  // Top 5 tickets sans réponse, du plus ancien au plus récent
  const topTickets = [...noFirstReply]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5)

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
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Sans 1ère réponse</p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className={`text-3xl font-bold mt-2 ${noFirstReply.length > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {noFirstReply.length}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">&gt; 2h en attente de réponse</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Tickets ouverts</p>
            {loadingTickets ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mt-2" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 mt-2">{tickets.length}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Support · tous statuts non fermés</p>
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
          <a
            href="https://dash.getsitecontrol.com/sites/44891/widgets?folderId=13236"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            Gérer les bannières GSC ↗
          </a>
          <button
            disabled={normalizing}
            onClick={async () => {
              setNormalizing(true)
              setNormalizeMsg(null)
              try {
                const res = await fetch('/api/admin/normalize-tickets', { method: 'POST' })
                const data = await res.json()
                setNormalizeMsg(data.message ?? data.error ?? 'Terminé.')
              } catch {
                setNormalizeMsg('Erreur réseau.')
              } finally {
                setNormalizing(false)
              }
            }}
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {normalizing ? (
              <><span className="w-3 h-3 border border-slate-400 border-t-slate-700 rounded-full animate-spin" />Normalisation…</>
            ) : 'Normaliser les tickets'}
          </button>
          {normalizeMsg && (
            <span className="text-xs text-slate-500">{normalizeMsg}</span>
          )}
          <button
            disabled={fixingUndefined}
            onClick={async () => {
              setFixingUndefined(true)
              setFixUndefinedMsg(null)
              let totalProcessed = 0
              let round = 0
              const MAX_RETRIES = 3
              const MAX_ROUNDS = 100
              while (round < MAX_ROUNDS) {
                let data: { processed?: number; hasMore?: boolean; message?: string; error?: string } | null = null
                let retries = 0
                while (retries < MAX_RETRIES) {
                  try {
                    const res = await fetch('/api/admin/fix-undefined-tickets', { method: 'POST' })
                    data = await res.json()
                    break
                  } catch {
                    retries++
                    if (retries >= MAX_RETRIES) { data = null; break }
                    await new Promise(r => setTimeout(r, 3000 * retries))
                  }
                }
                if (!data) { setFixUndefinedMsg(`${totalProcessed} corrigés — erreur réseau après ${MAX_RETRIES} tentatives.`); break }
                if (data.error) { setFixUndefinedMsg(`${totalProcessed} corrigés — erreur : ${data.error}`); break }
                totalProcessed += data.processed ?? 0
                round++
                setFixUndefinedMsg(`En cours… ${totalProcessed} corrigés (passe ${round})`)
                if (!data.hasMore) { setFixUndefinedMsg(`Terminé — ${totalProcessed} ticket(s) corrigés.`); break }
              }
              setFixingUndefined(false)
            }}
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {fixingUndefined ? (
              <><span className="w-3 h-3 border border-slate-400 border-t-slate-700 rounded-full animate-spin" />Correction…</>
            ) : 'Corriger les "Undefined"'}
          </button>
          {fixUndefinedMsg && (
            <span className="text-xs text-slate-500">{fixUndefinedMsg}</span>
          )}
        </div>

        {/* Main content */}
        <div className="grid grid-cols-4 gap-6">
          {/* Left: tickets sans 1ère réponse */}
          <div className="col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Tickets sans 1ère réponse
                {!loadingTickets && noFirstReply.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-red-500">
                    {noFirstReply.length} en attente
                  </span>
                )}
              </h2>
              {!loadingTickets && noFirstReply.length > 5 && (
                <Link href="/tickets" className="text-xs text-blue-600 hover:underline">
                  Voir tous ({noFirstReply.length})
                </Link>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
              {loadingTickets ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  Chargement...
                </div>
              ) : topTickets.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400 text-center">
                  Aucun ticket en attente de 1ère réponse depuis plus de 2h.
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
                      <p className="text-sm font-medium text-slate-900 truncate">{ticket.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ticket.clientName} · {ticket.productArea}</p>
                    </div>
                    {ticket.segment && (
                      <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />
                    )}
                    <div className="flex-shrink-0 text-right">
                      <span className="text-sm font-semibold text-red-600">{formatWait(ticket.createdAt)}</span>
                      <p className="text-xs text-slate-400">sans réponse</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="col-span-1 space-y-4">
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
