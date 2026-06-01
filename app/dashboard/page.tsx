'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import type { LinearIssue } from '@/lib/linear/client'
import type { AcuitySession } from '@/lib/acuity/client'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { AppUser } from '@/lib/auth/roles'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils/dates'
import { isExcludedOnboardingOwner } from '@/lib/onboarding/constants'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTodayFR(): string {
  const d = new Date()
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3_600_000
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function formatWait(dateStr: string): string {
  const h = Math.floor(hoursAgo(dateStr))
  if (h < 1) return '< 1h'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr), t = new Date()
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Spinner({ color = 'border-t-[#696969]' }: { color?: string }) {
  return <div className={`w-3.5 h-3.5 border-2 border-[#e2e2e2] ${color} rounded-full animate-spin flex-shrink-0`} />
}

function SectionHeader({ title, href, label }: { title: string; href: string; label?: string }) {
  return (
    <div className="px-4 py-3 border-b border-[#e2e2e2] flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[#1a1a1a]">{title}</h2>
      {href && <Link href={href} className="text-xs text-[#59319f] hover:underline transition-colors">{label ?? 'Voir tout →'}</Link>}
    </div>
  )
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-[#b7221b]',
  high:   'bg-[#903b07]',
  medium: 'bg-[#2b5bb7]',
  low:    'bg-[#b0b0b0]',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tickets, setTickets] = useState<ZohoMappedTicket[]>([])
  const [escalations, setEscalations] = useState<LinearIssue[]>([])
  const [sessions, setSessions] = useState<AcuitySession[]>([])
  const [projects, setProjects] = useState<OnboardingProject[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingOther, setLoadingOther] = useState(true)
  const [canAccessRestricted, setCanAccessRestricted] = useState(false)
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeMsg, setNormalizeMsg] = useState<string | null>(null)
  const [fixingUndefined, setFixingUndefined] = useState(false)
  const [fixUndefinedMsg, setFixUndefinedMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoadingTickets(true)
    setLoadingOther(true)
    const me = await fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.resolve({ user: null }))
    const currentUser = me.user as AppUser | null
    const allowedRestricted = !!currentUser && ['admin', 'onboarder', 'support'].includes(currentUser.role)
    setCanAccessRestricted(allowedRestricted)

    const requests = [
      fetch('/api/zoho/tickets').then(r => r.json()),
      fetch('/api/linear/issues').then(r => r.json()),
      allowedRestricted ? fetch('/api/acuity/sessions?period=upcoming').then(r => r.json()) : Promise.resolve({ sessions: [] }),
      allowedRestricted ? fetch('/api/zoho/projects').then(r => r.json()) : Promise.resolve({ projects: [] }),
    ] as const

    const [ticketsRes, escalationsRes, sessionsRes, projectsRes] = await Promise.allSettled(requests)
    if (ticketsRes.status === 'fulfilled') setTickets(ticketsRes.value.tickets ?? [])
    setLoadingTickets(false)
    if (escalationsRes.status === 'fulfilled') setEscalations(escalationsRes.value.issues ?? [])
    if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.sessions ?? [])
    if (projectsRes.status === 'fulfilled') setProjects(projectsRes.value.projects ?? [])
    setLoadingOther(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleNormalize = useCallback(async () => {
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
  }, [])

  const handleFixUndefined = useCallback(async () => {
    setFixingUndefined(true)
    setFixUndefinedMsg(null)
    let totalProcessed = 0, round = 0
    while (round < 100) {
      let data: { processed?: number; hasMore?: boolean; error?: string } | null = null
      for (let retry = 0; retry < 3; retry++) {
        try {
          data = await fetch('/api/admin/fix-undefined-tickets', { method: 'POST' }).then(r => r.json())
          break
        } catch {
          if (retry === 2) break
          await new Promise(r => setTimeout(r, 3000 * (retry + 1)))
        }
      }
      if (!data) { setFixUndefinedMsg(`${totalProcessed} corrigés — erreur réseau.`); break }
      if (data.error) { setFixUndefinedMsg(`${totalProcessed} corrigés — erreur : ${data.error}`); break }
      totalProcessed += data.processed ?? 0
      round++
      setFixUndefinedMsg(`${totalProcessed} corrigés…`)
      if (!data.hasMore) { setFixUndefinedMsg(`Terminé — ${totalProcessed} ticket(s) corrigés.`); break }
    }
    setFixingUndefined(false)
  }, [])

  const noFirstReply = useMemo(() =>
    tickets
      .filter(t => (t.zohoStatus === 'Open' || t.zohoStatus === 'Escalated') && t.threadCount <= 1 && hoursAgo(t.createdAt) > 2)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [tickets])

  const highRisk = useMemo(() => tickets.filter(t => (t.riskScore ?? 0) >= 60), [tickets])
  const noFirstReplyIds = useMemo(() => new Set(noFirstReply.map(t => t.id)), [noFirstReply])

  const attentionList = useMemo(() => [
    ...noFirstReply,
    ...highRisk.filter(t => !noFirstReplyIds.has(t.id)).sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
  ].slice(0, 8), [noFirstReply, highRisk, noFirstReplyIds])

  const openEscalations = useMemo(() => escalations.filter(e => e.status !== 'resolved'), [escalations])
  const toQualify = useMemo(() => escalations.filter(e => e.status === 'to_qualify'), [escalations])

  const topEscalades = useMemo(() =>
    [...openEscalations]
      .sort((a, b) => {
        const u = (e: LinearIssue) => e.status === 'to_qualify' ? 0 : 1
        return u(a) - u(b) || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      })
      .slice(0, 4),
    [openEscalations])

  const todaySessions = useMemo(() => sessions.filter(s => isToday(s.datetime)), [sessions])
  const upcomingSessions = useMemo(() =>
    sessions.filter(s => {
      if (isToday(s.datetime)) return false
      const diff = new Date(s.datetime).getTime() - Date.now()
      return diff > 0 && diff <= 7 * 86_400_000
    }), [sessions])

  const baseProjects = useMemo(() => projects.filter(p => !isExcludedOnboardingOwner(p.ownerShort)), [projects])
  const blockedProjects = useMemo(() => baseProjects.filter(p => p.status === 'blocked'), [baseProjects])

  const goLiveSoon = useMemo(() =>
    baseProjects
      .filter(p => { if (!p.endDate || p.status === 'live') return false; const d = daysUntil(p.endDate); return d >= 0 && d <= 7 })
      .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? '')),
    [baseProjects])

  const toolBtnCls = 'px-3 py-1.5 text-xs text-[#696969] border border-[#e2e2e2] rounded-lg hover:bg-[#f7f7f7] transition-colors disabled:opacity-50 flex items-center gap-1.5'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Bonjour Pablo</h1>
          <p className="text-sm text-[#696969] mt-0.5 capitalize">{formatTodayFR()}</p>
        </div>
        <button
          onClick={loadAll}
          className={toolBtnCls}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Rafraîchir
        </button>
      </div>

      <div className="p-6 space-y-5 max-w-6xl">

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: 'Sans 1ère réponse', value: noFirstReply.length,
              sub: '> 2h · tickets ouverts', href: '/tickets',
              loading: loadingTickets, severity: 'critical' as const,
            },
            {
              label: 'Tickets à risque', value: highRisk.length,
              sub: 'score ≥ 60', href: '/tickets',
              loading: loadingTickets, severity: 'warning' as const,
            },
            {
              label: 'Escalades ouvertes', value: openEscalations.length,
              sub: toQualify.length > 0 ? `dont ${toQualify.length} à qualifier` : 'aucune à qualifier',
              href: '/escalations', loading: loadingOther, severity: 'warning' as const,
            },
            {
              label: 'Onboarding bloqués', value: blockedProjects.length,
              sub: 'projets en attente déblocage', href: '/onboarding/board',
              loading: loadingOther, severity: 'critical' as const,
            },
          ].map(({ label, value, sub, href, loading, severity }) => {
            const isAlert = value > 0
            const spinColor = severity === 'critical' ? 'border-t-[#b7221b]' : 'border-t-[#903b07]'
            const valColor = !isAlert ? 'text-[#1c6437]' : severity === 'critical' ? 'text-[#b7221b]' : 'text-[#903b07]'
            const borderColor = !isAlert ? 'border-[#e2e2e2]' : severity === 'critical' ? 'border-[#fca5a5]' : 'border-[#fdba74]'
            const bg = !isAlert ? 'bg-white' : severity === 'critical' ? 'bg-[#fff8f8]' : 'bg-[#fff7ed]'
            return (
              <Link key={label} href={href} className={`block rounded-xl border ${borderColor} ${bg} p-4 hover:shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-shadow`}>
                <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide">{label}</p>
                {loading
                  ? <div className="mt-2"><Spinner color={spinColor} /></div>
                  : <p className={`text-3xl font-bold tabular-nums mt-1.5 ${valColor}`}>{value}</p>
                }
                <p className="text-xs text-[#696969] mt-1">{sub}</p>
              </Link>
            )
          })}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-5 items-start">

          {/* Tickets */}
          <div className="col-span-2 bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e2e2e2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-[#1a1a1a]">Tickets · à traiter</h2>
                {!loadingTickets && attentionList.length > 0 && (
                  <span className="text-xs bg-[#fee3e2] text-[#b7221b] px-2 py-0.5 rounded-full font-semibold tabular-nums">
                    {attentionList.length}
                  </span>
                )}
              </div>
              {!loadingTickets && (
                <Link href="/tickets" className="text-xs text-[#59319f] hover:underline">
                  {tickets.length} ouverts →
                </Link>
              )}
            </div>

            {loadingTickets ? (
              <div className="flex items-center gap-2.5 px-5 py-6 text-sm text-[#696969]">
                <Spinner />Chargement…
              </div>
            ) : attentionList.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xl mb-1 text-[#1c6437]">✓</p>
                <p className="text-sm text-[#696969] font-medium">Aucun ticket en attente</p>
                <p className="text-xs text-[#b0b0b0] mt-0.5">Pas de ticket sans 1ère réponse depuis plus de 2h</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {attentionList.map(ticket => (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.zohoInternalId}`}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#f7f4fd] transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[ticket.priority] ?? 'bg-[#b0b0b0]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">{ticket.subject}</p>
                      <p className="text-xs text-[#696969] truncate">{ticket.clientName} · {ticket.productArea}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ticket.segment && (
                        <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />
                      )}
                      {noFirstReplyIds.has(ticket.id) ? (
                        <span className="text-xs font-semibold text-[#b7221b] tabular-nums text-right w-14">
                          {formatWait(ticket.createdAt)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-[#903b07] tabular-nums text-right w-14">
                          r.{ticket.riskScore}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar cards */}
          <div className="col-span-1 space-y-4">

            {canAccessRestricted && (
              <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                <SectionHeader title="Formations" href="/trainings" />
                {loadingOther ? (
                  <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#696969]"><Spinner />Chargement…</div>
                ) : todaySessions.length === 0 && upcomingSessions.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-[#696969]">Aucune formation cette semaine</p>
                ) : (
                  <div className="divide-y divide-[#f0f0f0]">
                    {todaySessions.map(s => (
                      <div key={s.classID} className="px-4 py-2.5 bg-[#d4e4f8]">
                        <p className="text-xs font-bold text-[#2b5bb7] uppercase tracking-wide mb-0.5">Aujourd&apos;hui</p>
                        <p className="text-sm font-medium text-[#1a1a1a] line-clamp-1">{s.title}</p>
                        <p className="text-xs text-[#696969]">
                          {new Date(s.datetime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {s.totalRegistered} inscrit{s.totalRegistered > 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                    {upcomingSessions.slice(0, 3).map(s => (
                      <div key={s.classID} className="px-4 py-2.5">
                        <p className="text-sm font-medium text-[#1a1a1a] line-clamp-1">{s.title}</p>
                        <p className="text-xs text-[#696969]">{formatDate(s.datetime)} · {s.totalRegistered} inscrit{s.totalRegistered > 1 ? 's' : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Escalades */}
            <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
              <SectionHeader title="Escalades" href="/escalations" />
              {loadingOther ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#696969]"><Spinner />Chargement…</div>
              ) : openEscalations.length === 0 ? (
                <p className="px-4 py-4 text-xs text-[#696969]">Aucune escalade ouverte</p>
              ) : (
                <div className="divide-y divide-[#f0f0f0]">
                  {topEscalades.map(e => (
                    <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#f7f7f7] transition-colors"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${e.status === 'to_qualify' ? 'bg-[#903b07]' : 'bg-[#2b5bb7]'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-[#b0b0b0]">{e.identifier}</p>
                        <p className="text-sm text-[#4a4a4a] line-clamp-2">{e.title}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Onboarding alerts */}
            {canAccessRestricted && !loadingOther && (blockedProjects.length > 0 || goLiveSoon.length > 0) && (
              <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                <SectionHeader title="Onboarding" href="/onboarding/board" label="Board →" />
                <div className="divide-y divide-[#f0f0f0]">
                  {blockedProjects.slice(0, 3).map(p => (
                    <a key={p.id} href={p.projectUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#f7f7f7] transition-colors"
                    >
                      <span className="text-xs bg-[#fee3e2] text-[#b7221b] px-1.5 py-0.5 rounded font-medium flex-shrink-0">Bloqué</span>
                      <div className="min-w-0">
                        <p className="text-sm text-[#1a1a1a] truncate">{p.hotelName}</p>
                        <p className="text-xs text-[#696969]">{p.ownerShort}</p>
                      </div>
                    </a>
                  ))}
                  {goLiveSoon.slice(0, 3).map(p => {
                    const d = daysUntil(p.endDate!)
                    return (
                      <a key={p.id} href={p.projectUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#f7f7f7] transition-colors"
                      >
                        <span className="text-xs bg-[#cff7dc] text-[#1c6437] px-1.5 py-0.5 rounded font-medium flex-shrink-0 whitespace-nowrap">
                          {d === 0 ? 'Auj.' : `J-${d}`}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-[#1a1a1a] truncate">{p.hotelName}</p>
                          <p className="text-xs text-[#696969]">{p.ownerShort}</p>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Outils admin */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#696969] font-medium">Outils</span>
          <span className="text-[#e2e2e2]">·</span>
          <a
            href="https://dash.getsitecontrol.com/sites/44891/widgets?folderId=13236"
            target="_blank" rel="noopener noreferrer"
            className={toolBtnCls}
          >
            Bannières GSC ↗
          </a>
          <button onClick={handleNormalize} disabled={normalizing} className={toolBtnCls}>
            {normalizing ? <><Spinner />Normalisation…</> : 'Normaliser les tickets'}
          </button>
          <button onClick={handleFixUndefined} disabled={fixingUndefined} className={toolBtnCls}>
            {fixingUndefined ? <><Spinner />Correction…</> : 'Corriger les "Undefined"'}
          </button>
          {(normalizeMsg || fixUndefinedMsg) && (
            <span className="text-xs text-[#696969]">{fixUndefinedMsg ?? normalizeMsg}</span>
          )}
        </div>

      </div>
    </div>
  )
}
