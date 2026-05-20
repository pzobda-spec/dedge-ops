'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket, MappedConversation } from '@/lib/zoho/mapper'
import Badge from '@/components/ui/Badge'
import RiskScore from '@/components/ui/RiskScore'
import { formatHoursAgo } from '@/lib/utils/dates'
import AnalyticsPane from './AnalyticsPane'

// ─── Colonnes du board ────────────────────────────────────────────────────────

const BOARD_COLUMNS: { status: string; label: string; bg: string; header: string }[] = [
  { status: 'Open',         label: 'Open',         bg: 'bg-blue-50',    header: 'bg-blue-100 text-blue-800' },
  { status: 'Pending',      label: 'Pending',      bg: 'bg-yellow-50',  header: 'bg-yellow-100 text-yellow-800' },
  { status: 'Managed',      label: 'Managed',      bg: 'bg-green-50',   header: 'bg-green-100 text-green-800' },
  { status: 'Stuck client', label: 'Stuck client', bg: 'bg-orange-50',  header: 'bg-orange-100 text-orange-800' },
  { status: 'Escalated',    label: 'Escalated',    bg: 'bg-purple-50',  header: 'bg-purple-100 text-purple-800' },
  { status: 'Stuck product',label: 'Stuck product',bg: 'bg-red-50',     header: 'bg-red-100 text-red-800' },
]

// ─── Filtres liste ─────────────────────────────────────────────────────────────

const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'Open', label: 'Open' },
  { value: 'Managed', label: 'Managed' },
  { value: 'Escalated', label: 'Escalated' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Stuck client', label: 'Stuck client' },
  { value: 'Stuck product', label: 'Stuck product' },
]

const productOptions = [
  { value: '', label: 'Tous les produits' },
  { value: 'CSM', label: 'CSM' },
  { value: 'Integration', label: 'Integration' },
  { value: 'Pages', label: 'Pages' },
  { value: 'Kiosque', label: 'Kiosque' },
  { value: 'Newsletters', label: 'Newsletters' },
  { value: 'PMS', label: 'PMS' },
  { value: 'Guest profile', label: 'Guest profile' },
  { value: 'Hub de messagerie', label: 'Hub de messagerie' },
  { value: 'Campagne Email', label: 'Campagne Email' },
  { value: 'Formulaires', label: 'Formulaires' },
  { value: 'Dmbook Pro', label: 'Dmbook Pro' },
  { value: 'Administrateur', label: 'Administrateur' },
  { value: 'Other', label: 'Other' },
]

const priorityOptions = [
  { value: '', label: 'Toutes priorités' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Faible' },
]

const sortOptions = [
  { value: 'riskScore', label: 'Score de risque ↓' },
  { value: 'date', label: 'Dernier message client ↓' },
]

// ─── Helpers risque ────────────────────────────────────────────────────────────

function riskBand(score: number): 'high' | 'med' | 'low' {
  if (score >= 75) return 'high'
  if (score >= 50) return 'med'
  return 'low'
}

const RISK_EDGE_COLOR = { high: '#b91c1c', med: '#b45309', low: '#059669' }

const RISK_RAILS = [
  {
    key: 'high',
    label: 'Critique',
    hint: 'Risque ≥ 75',
    bg: 'bg-red-50',
    headerColor: '#b91c1c',
    filter: (t: ZohoMappedTicket) => t.riskScore >= 75,
  },
  {
    key: 'med',
    label: 'À surveiller',
    hint: 'Risque 50–74',
    bg: 'bg-amber-50',
    headerColor: '#b45309',
    filter: (t: ZohoMappedTicket) => t.riskScore >= 50 && t.riskScore < 75,
  },
  {
    key: 'low',
    label: 'Sous contrôle',
    hint: 'Risque < 50',
    bg: 'bg-green-50',
    headerColor: '#059669',
    filter: (t: ZohoMappedTicket) => t.riskScore < 50,
  },
]

// ─── Triage card ───────────────────────────────────────────────────────────────

function TriageCard({ ticket }: { ticket: ZohoMappedTicket }) {
  const band = riskBand(ticket.riskScore)
  return (
    <div
      onClick={() => window.open(`/tickets/${ticket.zohoInternalId}`, '_blank')}
      className="block bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:border-slate-300 hover:shadow transition-all relative overflow-hidden cursor-pointer"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ background: RISK_EDGE_COLOR[band] }}
      />
      <div className="flex items-start justify-between gap-2 mb-2 pl-2">
        <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug flex-1">
          {ticket.subject}
        </p>
        <span
          className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded tabular-nums"
          style={{
            background: band === 'high' ? '#fee2e2' : band === 'med' ? '#fef3c7' : '#d1fae5',
            color: RISK_EDGE_COLOR[band],
          }}
        >
          {ticket.riskScore}
        </span>
      </div>
      <div className="pl-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">{ticket.clientName}</span>
        {ticket.segment && (
          <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />
        )}
        {ticket.productArea && ticket.productArea !== 'Autre' && (
          <span className="text-xs text-slate-400">{ticket.productArea}</span>
        )}
      </div>
      <div className="pl-2 flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className={`text-xs font-semibold ${
          ticket.priority === 'urgent' ? 'text-red-600' :
          ticket.priority === 'high' ? 'text-amber-600' : 'text-slate-400'
        }`}>
          {ticket.priority === 'urgent' ? '● Urgent' : ticket.priority === 'high' ? '● Haute' : ticket.zohoStatus}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{formatHoursAgo(ticket.lastClientMessageAt)}</span>
          <a
            href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-slate-300 hover:text-blue-500 transition-colors"
            title="Ouvrir dans Zoho Desk"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Carte board ───────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: ZohoMappedTicket }) {
  const internalUrl = `/tickets/${ticket.zohoInternalId}`
  const zohoUrl = `https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`
  return (
    <div
      onClick={() => window.open(internalUrl, '_blank')}
      className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:border-slate-300 hover:shadow transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-400">#{ticket.externalId}</span>
          <a
            href={zohoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-slate-300 hover:text-blue-500 transition-colors"
            title="Ouvrir dans Zoho Desk"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
        <RiskScore score={ticket.riskScore} />
      </div>

      <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2 leading-snug">
        {ticket.subject}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-slate-600 truncate max-w-[100px]">{ticket.clientName}</span>
          {ticket.segment && (
            <Badge
              label={ticket.segment}
              variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
            />
          )}
        </div>
        {ticket.productArea && ticket.productArea !== 'Autre' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
            {ticket.productArea}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-400">{formatHoursAgo(ticket.lastClientMessageAt)}</span>
        {ticket.assigneeName && (
          <span className="text-xs text-slate-400 truncate max-w-[90px]">{ticket.assigneeName}</span>
        )}
      </div>
    </div>
  )
}

// ─── Inbox view ────────────────────────────────────────────────────────────────

const INBOX_FOLDERS = [
  { key: 'a-traiter',      label: 'À traiter',       statuses: ['Open', 'Escalated'] },
  { key: 'en-cours',       label: 'En cours',         statuses: ['Managed'] },
  { key: 'attente-client', label: 'Attente client',   statuses: ['Stuck client', 'Pending'] },
  { key: 'attente-produit',label: 'Attente produit',  statuses: ['Stuck product'] },
  { key: 'tous',           label: 'Tous les tickets', statuses: [] },
]

const CANNED_REPLIES = [
  {
    label: 'Accusé de réception',
    icon: '⚡',
    text: `Bonjour,\n\nMerci pour votre message. Nous prenons bien en charge votre demande et revenons vers vous dans les meilleurs délais.\n\nBien cordialement,`,
  },
  {
    label: 'Escalade en cours',
    icon: '↗',
    text: `Bonjour,\n\nVotre demande a été escaladée auprès de notre équipe produit. Nous vous tiendrons informés de l'avancement.\n\nBien cordialement,`,
  },
  {
    label: 'Demande de confirmation',
    icon: '✓',
    text: `Bonjour,\n\nLe problème a été résolu de notre côté. Pourriez-vous confirmer que tout fonctionne correctement pour vous ?\n\nMerci et bonne journée,`,
  },
]

function InboxPane({ tickets, loading }: { tickets: ZohoMappedTicket[]; loading: boolean }) {
  const [folder, setFolder] = useState('a-traiter')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const convsCache = useRef<Map<string, MappedConversation[]>>(new Map())
  const [, forceRender] = useState(0)
  const [convLoading, setConvLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const convPaneRef = useRef<HTMLDivElement>(null)

  const folderDef = INBOX_FOLDERS.find(f => f.key === folder)!
  const list = (
    folderDef.statuses.length === 0
      ? tickets.slice()
      : tickets.filter(t => folderDef.statuses.includes(t.zohoStatus))
  ).sort((a, b) => b.riskScore - a.riskScore)

  const selected = list.find(t => t.id === selectedId) ?? list[0] ?? null

  // Auto-select first ticket when folder or ticket list changes
  useEffect(() => {
    if (list.length > 0 && (!selectedId || !list.find(t => t.id === selectedId))) {
      setSelectedId(list[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, tickets.length])

  // Load conversations on selection
  useEffect(() => {
    if (!selected) return
    if (convsCache.current.has(selected.id)) return
    setConvLoading(true)
    fetch(`/api/zoho/tickets/${selected.zohoInternalId}/conversations`)
      .then(r => r.json())
      .then(d => {
        convsCache.current.set(selected.id, d.conversations ?? [])
        forceRender(n => n + 1)
      })
      .catch(() => {
        convsCache.current.set(selected.id, [])
        forceRender(n => n + 1)
      })
      .finally(() => setConvLoading(false))
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset draft when ticket changes
  useEffect(() => { setDraft('') }, [selectedId])

  // Scroll to bottom when conversations load
  useEffect(() => {
    if (convPaneRef.current && !convLoading) {
      convPaneRef.current.scrollTop = convPaneRef.current.scrollHeight
    }
  }, [selected?.id, convLoading])

  const conversations = selected ? (convsCache.current.get(selected.id) ?? []) : []
  // Show loading if fetch is in progress OR ticket is selected but not yet in cache
  const isLoadingConvs = convLoading || (!!selected && !convsCache.current.has(selected.id))

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const handleAskAI = async () => {
    if (!selected) return
    setAiLoading(true)
    try {
      const convSummary = (convsCache.current.get(selected.id) ?? [])
        .slice(-4)
        .map(c => `${c.authorType === 'client' ? 'Client' : 'Agent'}: ${c.summary}`)
        .join('\n')
      const res = await fetch('/api/ai/generate-client-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selected.zohoInternalId,
          subject: selected.subject,
          clientName: selected.clientName,
          segment: selected.segment,
          productArea: selected.productArea,
          issueDescription: convSummary || selected.subject,
          tone: 'professional',
        }),
      })
      const data = await res.json()
      if (data.body) {
        setDraft(data.body)
        showToast('Réponse IA générée — tu peux la modifier avant d\'envoyer')
      }
    } catch {
      showToast('Erreur lors de la génération IA')
    } finally {
      setAiLoading(false)
    }
  }

  const handleReply = () => {
    if (!selected || !draft.trim()) return
    navigator.clipboard.writeText(draft).catch(() => {})
    window.open(
      `https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${selected.zohoInternalId}`,
      '_blank'
    )
    showToast('Réponse copiée — colle-la dans Zoho (Ctrl+V)')
  }

  const foldersWithCounts = INBOX_FOLDERS.map(f => ({
    ...f,
    count: f.statuses.length === 0
      ? tickets.length
      : tickets.filter(t => f.statuses.includes(t.zohoStatus)).length,
  }))

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Column 1: Folder rail */}
      <aside className="w-52 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">
        <div className="px-3 pt-4 pb-3 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 pb-2">
            Vues
          </p>
          {foldersWithCounts.map(f => (
            <button
              key={f.key}
              onClick={() => setFolder(f.key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                folder === f.key
                  ? 'bg-slate-900 text-white font-medium'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="truncate">{f.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                folder === f.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Column 2: Ticket list */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="text-sm font-semibold text-slate-900">{folderDef.label}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {list.length} ticket{list.length !== 1 ? 's' : ''} · trié par risque
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              Chargement...
            </div>
          ) : list.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-12">Aucun ticket dans cette vue</p>
          ) : (
            list.map(t => {
              const band = riskBand(t.riskScore)
              const isSelected = t.id === selected?.id
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`relative flex items-stretch gap-2 px-4 py-3 cursor-pointer border-b border-slate-100 transition-colors ${
                    isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-900 rounded-r" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-slate-900 truncate">{t.clientName}</span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0 tabular-nums">
                        {formatHoursAgo(t.lastClientMessageAt)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 truncate mb-1.5">{t.subject}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400">{t.productArea}</span>
                      {(t.priority === 'urgent' || t.priority === 'high') && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className={`text-[11px] font-semibold ${
                            t.priority === 'urgent' ? 'text-red-600' : 'text-amber-600'
                          }`}>
                            {t.priority === 'urgent' ? '● Urgent' : '● Haute'}
                          </span>
                        </>
                      )}
                      {t.segment && (
                        <>
                          <span className="text-slate-300">·</span>
                          <Badge
                            label={t.segment}
                            variant={t.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Risk edge */}
                  <span
                    className="w-0.5 rounded-full flex-shrink-0 self-stretch"
                    style={{ background: RISK_EDGE_COLOR[band] }}
                    title={`Risque ${t.riskScore}`}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Column 3: Conversation + composer */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm bg-slate-50">
          Sélectionne un ticket dans la liste
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <header className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-white">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-mono">#{selected.externalId}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-600 tracking-wide">
                    {selected.zohoStatus}
                  </span>
                  {selected.priority === 'urgent' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-100 text-red-700 tracking-wide">Urgent</span>
                  )}
                  {selected.priority === 'high' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-100 text-amber-700 tracking-wide">Haute</span>
                  )}
                  <RiskScore score={selected.riskScore} />
                </div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug line-clamp-2">
                  {selected.subject}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-sm font-medium text-slate-700">{selected.clientName}</span>
                  {selected.segment && (
                    <Badge
                      label={selected.segment}
                      variant={selected.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
                    />
                  )}
                  <span className="text-xs text-slate-400">· {selected.productArea}</span>
                  <span className="text-xs text-slate-400">· {selected.threadCount} messages</span>
                  {selected.assigneeName && (
                    <span className="text-xs text-slate-400">· {selected.assigneeName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/tickets/${selected.zohoInternalId}`}
                  target="_blank"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Voir le ticket
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </Link>
                <a
                  href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${selected.zohoInternalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Zoho Desk
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            </div>
          </header>

          {/* Conversations */}
          <div ref={convPaneRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50">
            {isLoadingConvs ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                Chargement de la conversation…
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-10">Aucun message chargé</p>
            ) : (
              conversations.slice(-12).map(c => (
                <div
                  key={c.id}
                  className={`flex gap-3 ${c.authorType === 'agent' ? 'flex-row-reverse' : ''}`}
                  style={{ maxWidth: '88%', ...(c.authorType === 'agent' ? { marginLeft: 'auto' } : {}) }}
                >
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5 ${
                    c.authorType === 'agent' ? 'bg-slate-700' : 'bg-amber-600'
                  }`}>
                    {c.authorName.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[11px] text-slate-400 mb-1 ${c.authorType === 'agent' ? 'text-right' : ''}`}>
                      {c.authorName} · {formatHoursAgo(c.createdAt)}
                    </div>
                    <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      c.authorType === 'agent'
                        ? 'bg-slate-900 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}>
                      {c.summary || '(pas de contenu)'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div className="flex-shrink-0 border-t border-slate-200 bg-white p-4">
            {/* Canned replies + AI */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {CANNED_REPLIES.map(c => (
                <button
                  key={c.label}
                  onClick={() => setDraft(c.text)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                >
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
              <button
                onClick={handleAskAI}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-200 bg-teal-50 text-xs text-teal-700 hover:bg-teal-100 hover:border-teal-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiLoading ? (
                  <span className="w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gradient-to-br from-teal-400 to-teal-600" />
                )}
                {aiLoading ? 'Génération…' : 'Demander à l\'assistant IA'}
              </button>
            </div>

            <div className="flex items-end gap-3">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Rédiger une réponse pour ${selected.clientName}…`}
                rows={3}
                className="flex-1 resize-none border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition"
              />
              <button
                onClick={handleReply}
                disabled={!draft.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Répondre dans Zoho
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Le texte sera copié dans le presse-papier et Zoho s&apos;ouvrira — colle avec Ctrl+V / ⌘V
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

type ViewMode = 'list' | 'board' | 'triage' | 'inbox' | 'analytics'

export default function TicketsPage() {
  const [tickets, setTickets] = useState<ZohoMappedTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('list')

  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState('riskScore')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadTickets = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      else setRefreshing(true)
      setError(null)
      const res = await fetch('/api/zoho/tickets')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTickets(data.tickets || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load tickets:', err)
      setError('Erreur de chargement des tickets')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    loadTickets(true)
    intervalRef.current = setInterval(() => loadTickets(false), 3 * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loadTickets])

  // ─── Filtres communs (liste + board) ─────────────────────────────────────────

  const assignees = Array.from(
    new Set(tickets.map(t => t.assigneeName).filter(Boolean))
  ).sort() as string[]

  const searchLower = filterSearch.toLowerCase()
  const filtered = tickets
    .filter(t => {
      if (filterStatus && t.zohoStatus !== filterStatus) return false
      if (filterAssignee && t.assigneeName !== filterAssignee) return false
      if (filterProduct && t.productArea !== filterProduct) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (searchLower && !(
        t.subject.toLowerCase().includes(searchLower) ||
        t.clientName.toLowerCase().includes(searchLower)
      )) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'riskScore') return b.riskScore - a.riskScore
      return new Date(b.lastClientMessageAt).getTime() - new Date(a.lastClientMessageAt).getTime()
    })

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={view === 'inbox' ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen'}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Tickets</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
            {loading
              ? 'Chargement...'
              : `${tickets.length} tickets · ${view === 'list' || view === 'board' || view === 'triage' ? `${filtered.length} affichés · ` : ''}${lastRefreshed ? `mis à jour ${lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
            {refreshing && (
              <span className="inline-block w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle vue */}
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vue liste"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Liste
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-slate-200 ${view === 'board' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vue board"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/>
              </svg>
              Board
            </button>
            <button
              onClick={() => setView('triage')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-slate-200 ${view === 'triage' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vue triage par risque"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Triage
            </button>
            <button
              onClick={() => setView('inbox')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-slate-200 ${view === 'inbox' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Vue inbox"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
              </svg>
              Inbox
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-slate-200 ${view === 'analytics' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Analytiques"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Analyse
            </button>
          </div>

          <button
            onClick={() => loadTickets(false)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            title="Rafraîchir les tickets"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={(loading || refreshing) ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
            </svg>
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Inbox view ── */}
      {view === 'inbox' && (
        <InboxPane tickets={tickets} loading={loading} />
      )}

      {/* ── Analytics view ── */}
      {view === 'analytics' && <AnalyticsPane />}

      {/* ── Liste + Board + Triage ── */}
      {(view === 'list' || view === 'board' || view === 'triage') && (
        <div className="p-6">
          {/* Filtres */}
          <div className="flex gap-3 mb-4 flex-wrap">
            {view === 'list' && (
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="Rechercher (client, sujet...)"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700 w-56"
              />
            )}
            {view === 'list' && (
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700">
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700">
              <option value="">Tous les agents</option>
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {view === 'list' && (
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700">
                {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {view === 'list' && (
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700">
                {priorityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {view === 'list' && (
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700">
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {/* Spinner */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-3" />
              <span className="text-slate-500 text-sm">Chargement des tickets...</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && tickets.length === 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-700 text-sm font-medium">{error}</p>
              <button onClick={() => loadTickets(true)} className="mt-3 text-sm text-red-600 underline">
                Réessayer
              </button>
            </div>
          )}

          {/* ── Vue liste ── */}
          {!loading && !error && view === 'list' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sujet</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut Zoho</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priorité</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dernier message client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Risque</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigné à</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">
                        Aucun ticket correspondant aux filtres
                      </td>
                    </tr>
                  ) : (
                    filtered.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="font-medium text-slate-900 line-clamp-1">{ticket.subject}</span>
                          </Link>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-slate-400">#{ticket.externalId}</span>
                            <a href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
                              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              className="text-slate-400 hover:text-blue-500 transition-colors" title="Ouvrir dans Zoho Desk">
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-sm">{ticket.clientName}</span>
                            {ticket.clientEmail && <span className="block text-xs text-slate-400">{ticket.clientEmail}</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            {ticket.segment && (
                              <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                              {ticket.zohoStatus}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-xs text-slate-600">{ticket.priority}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-xs text-slate-600">{ticket.productArea}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            {formatHoursAgo(ticket.lastClientMessageAt)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <RiskScore score={ticket.riskScore} />
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            {ticket.assigneeName || '—'}
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Vue board ── */}
          {!loading && !error && view === 'board' && (
            <div className="overflow-x-auto">
              <div className="flex gap-4 min-w-max pb-4">
                {BOARD_COLUMNS.map(col => {
                  const colTickets = filtered.filter(t => t.zohoStatus === col.status)
                  return (
                    <div key={col.status} className="w-64 flex-shrink-0 flex flex-col max-h-[calc(100vh-180px)]">
                      <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between flex-shrink-0 ${col.header}`}>
                        <span className="text-xs font-semibold">{col.label}</span>
                        <span className="text-xs font-bold">{colTickets.length}</span>
                      </div>
                      <div className={`rounded-b-lg ${col.bg} flex-1 overflow-y-auto p-2 space-y-2 min-h-24`}>
                        {colTickets.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">Aucun ticket</p>
                        ) : (
                          colTickets.map(ticket => (
                            <TicketCard key={ticket.id} ticket={ticket} />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Vue triage ── */}
          {!loading && !error && view === 'triage' && (
            <div className="space-y-5">
              {RISK_RAILS.map(rail => {
                const railTickets = filtered
                  .filter(rail.filter)
                  .sort((a, b) => b.riskScore - a.riskScore)
                return (
                  <div key={rail.key} className={`rounded-xl ${rail.bg} p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: rail.headerColor }}>
                        {rail.label}
                      </h3>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
                        style={{ background: rail.headerColor + '22', color: rail.headerColor }}
                      >
                        {railTickets.length}
                      </span>
                      <span className="text-xs text-slate-400">{rail.hint}</span>
                    </div>
                    {railTickets.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">Aucun ticket dans cette catégorie</p>
                    ) : (
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {railTickets.map(t => (
                          <TriageCard key={t.id} ticket={t} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
