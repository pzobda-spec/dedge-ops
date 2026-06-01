'use client'

import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket, MappedConversation } from '@/lib/zoho/mapper'
import Badge from '@/components/ui/Badge'
import RiskScore from '@/components/ui/RiskScore'
import { formatHoursAgo } from '@/lib/utils/dates'

// ─── Board columns ─────────────────────────────────────────────────────────────

const BOARD_COLUMNS: { status: string; label: string; bg: string; header: string }[] = [
  { status: 'Open',          label: 'Open',          bg: 'bg-[#eef4fc]',  header: 'bg-[#d4e4f8] text-[#2b5bb7]' },
  { status: 'Pending',       label: 'Pending',       bg: 'bg-[#fef8ea]',  header: 'bg-[#fbf1ca] text-[#84550e]' },
  { status: 'Managed',       label: 'Managed',       bg: 'bg-[#edfff4]',  header: 'bg-[#cff7dc] text-[#1c6437]' },
  { status: 'Stuck client',  label: 'Stuck client',  bg: 'bg-[#fff7ed]',  header: 'bg-[#ffe7cf] text-[#903b07]' },
  { status: 'Escalated',     label: 'Escalated',     bg: 'bg-[#f3eeff]',  header: 'bg-[#e8dbfa] text-[#59319f]' },
  { status: 'Stuck product', label: 'Stuck product', bg: 'bg-[#fff8f8]',  header: 'bg-[#fee3e2] text-[#b7221b]' },
]

const STATUS_BADGE: Record<string, string> = {
  Open:           'bg-[#d4e4f8] text-[#2b5bb7]',
  Pending:        'bg-[#fbf1ca] text-[#84550e]',
  Managed:        'bg-[#cff7dc] text-[#1c6437]',
  'Stuck client': 'bg-[#ffe7cf] text-[#903b07]',
  Escalated:      'bg-[#e8dbfa] text-[#59319f]',
  'Stuck product':'bg-[#fee3e2] text-[#b7221b]',
}

// ─── Filter options ────────────────────────────────────────────────────────────

const statusOptions = [
  { value: '',               label: 'Tous les statuts' },
  { value: 'Open',           label: 'Open' },
  { value: 'Managed',        label: 'Managed' },
  { value: 'Escalated',      label: 'Escalated' },
  { value: 'Pending',        label: 'Pending' },
  { value: 'Stuck client',   label: 'Stuck client' },
  { value: 'Stuck product',  label: 'Stuck product' },
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
  { value: '',       label: 'Toutes priorités' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high',   label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low',    label: 'Faible' },
]

const sortOptions = [
  { value: 'riskScore', label: 'Score de risque ↓' },
  { value: 'date',      label: 'Dernier message client ↓' },
]

// ─── Risk helpers ──────────────────────────────────────────────────────────────

function riskBand(score: number): 'high' | 'med' | 'low' {
  if (score >= 75) return 'high'
  if (score >= 50) return 'med'
  return 'low'
}

const RISK_EDGE_COLOR = { high: '#b7221b', med: '#903b07', low: '#1c6437' }

const RISK_RAILS = [
  { key: 'high', label: 'Critique',      hint: 'Risque ≥ 75', bg: 'bg-[#fff8f8]', headerColor: '#b7221b', filter: (t: ZohoMappedTicket) => t.riskScore >= 75 },
  { key: 'med',  label: 'À surveiller',  hint: 'Risque 50–74', bg: 'bg-[#fff7ed]', headerColor: '#903b07', filter: (t: ZohoMappedTicket) => t.riskScore >= 50 && t.riskScore < 75 },
  { key: 'low',  label: 'Sous contrôle', hint: 'Risque < 50',  bg: 'bg-[#edfff4]', headerColor: '#1c6437', filter: (t: ZohoMappedTicket) => t.riskScore < 50 },
]

const selectCls = 'border border-[#e2e2e2] rounded-lg px-3 py-1.5 text-sm bg-white text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#3b72d1]'

// ─── Triage card ───────────────────────────────────────────────────────────────

function TriageCard({ ticket }: { ticket: ZohoMappedTicket }) {
  const band = riskBand(ticket.riskScore)
  return (
    <div
      onClick={() => window.open(`/tickets/${ticket.zohoInternalId}`, '_blank')}
      className="block bg-white rounded-xl border border-[#e2e2e2] p-3 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:border-[#c0a4f0] hover:shadow-[0_4px_12px_rgba(89,49,159,0.10)] transition-all relative overflow-hidden cursor-pointer"
    >
      <span className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: RISK_EDGE_COLOR[band] }} />
      <div className="flex items-start justify-between gap-2 mb-2 pl-2">
        <p className="text-sm font-medium text-[#1a1a1a] line-clamp-2 leading-snug flex-1">{ticket.subject}</p>
        <span
          className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded tabular-nums"
          style={{
            background: band === 'high' ? '#fee3e2' : band === 'med' ? '#ffe7cf' : '#cff7dc',
            color: RISK_EDGE_COLOR[band],
          }}
        >
          {ticket.riskScore}
        </span>
      </div>
      <div className="pl-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[#4a4a4a] truncate max-w-[120px]">{ticket.clientName}</span>
        {ticket.segment && <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />}
        {ticket.productArea && ticket.productArea !== 'Autre' && (
          <span className="text-xs text-[#b0b0b0]">{ticket.productArea}</span>
        )}
      </div>
      <div className="pl-2 flex items-center justify-between mt-2 pt-2 border-t border-[#f0f0f0]">
        <span className={`text-xs font-semibold ${ticket.priority === 'urgent' ? 'text-[#b7221b]' : ticket.priority === 'high' ? 'text-[#903b07]' : 'text-[#b0b0b0]'}`}>
          {ticket.priority === 'urgent' ? '● Urgent' : ticket.priority === 'high' ? '● Haute' : ticket.zohoStatus}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#b0b0b0]">{formatHoursAgo(ticket.lastClientMessageAt)}</span>
          <a
            href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
            target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="text-[#b0b0b0] hover:text-[#59319f] transition-colors" title="Ouvrir dans Zoho Desk"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Board card ────────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: ZohoMappedTicket }) {
  const internalUrl = `/tickets/${ticket.zohoInternalId}`
  const zohoUrl = `https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`
  return (
    <div
      onClick={() => window.open(internalUrl, '_blank')}
      className="bg-white rounded-xl border border-[#e2e2e2] p-3 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:border-[#c0a4f0] hover:shadow-[0_4px_12px_rgba(89,49,159,0.10)] transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-[#b0b0b0]">#{ticket.externalId}</span>
          <a href={zohoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="text-[#b0b0b0] hover:text-[#59319f] transition-colors" title="Ouvrir dans Zoho Desk">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
        <RiskScore score={ticket.riskScore} />
      </div>

      <p className="text-sm font-medium text-[#1a1a1a] line-clamp-2 mb-2 leading-snug">{ticket.subject}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-[#4a4a4a] truncate max-w-[100px]">{ticket.clientName}</span>
          {ticket.segment && <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />}
        </div>
        {ticket.productArea && ticket.productArea !== 'Autre' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#f7f7f7] text-[#696969] flex-shrink-0">
            {ticket.productArea}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#f0f0f0]">
        <span className="text-xs text-[#b0b0b0]">{formatHoursAgo(ticket.lastClientMessageAt)}</span>
        {ticket.assigneeName && <span className="text-xs text-[#b0b0b0] truncate max-w-[90px]">{ticket.assigneeName}</span>}
      </div>
    </div>
  )
}

// ─── Inbox ─────────────────────────────────────────────────────────────────────

const INBOX_FOLDERS = [
  { key: 'a-traiter',       label: 'À traiter',       statuses: ['Open', 'Escalated'] },
  { key: 'en-cours',        label: 'En cours',         statuses: ['Managed'] },
  { key: 'attente-client',  label: 'Attente client',   statuses: ['Stuck client', 'Pending'] },
  { key: 'attente-produit', label: 'Attente produit',  statuses: ['Stuck product'] },
  { key: 'tous',            label: 'Tous les tickets', statuses: [] },
]

const CANNED_REPLIES = [
  { label: 'Accusé de réception', icon: '⚡', text: `Bonjour,\n\nMerci pour votre message. Nous prenons bien en charge votre demande et revenons vers vous dans les meilleurs délais.\n\nBien cordialement,` },
  { label: 'Escalade en cours', icon: '↗', text: `Bonjour,\n\nVotre demande a été escaladée auprès de notre équipe produit. Nous vous tiendrons informés de l'avancement.\n\nBien cordialement,` },
  { label: 'Demande de confirmation', icon: '✓', text: `Bonjour,\n\nLe problème a été résolu de notre côté. Pourriez-vous confirmer que tout fonctionne correctement pour vous ?\n\nMerci et bonne journée,` },
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

  useEffect(() => {
    if (list.length > 0 && (!selectedId || !list.find(t => t.id === selectedId))) {
      setSelectedId(list[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, tickets.length])

  useEffect(() => {
    if (!selected) return
    if (convsCache.current.has(selected.id)) return
    setConvLoading(true)
    fetch(`/api/zoho/tickets/${selected.zohoInternalId}/conversations`)
      .then(r => r.json())
      .then(d => { convsCache.current.set(selected.id, d.conversations ?? []); forceRender(n => n + 1) })
      .catch(() => { convsCache.current.set(selected.id, []); forceRender(n => n + 1) })
      .finally(() => setConvLoading(false))
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDraft('') }, [selectedId])

  useEffect(() => {
    if (convPaneRef.current && !convLoading) convPaneRef.current.scrollTop = convPaneRef.current.scrollHeight
  }, [selected?.id, convLoading])

  const conversations = selected ? (convsCache.current.get(selected.id) ?? []) : []
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
        body: JSON.stringify({ ticketId: selected.zohoInternalId, subject: selected.subject, clientName: selected.clientName, segment: selected.segment, productArea: selected.productArea, issueDescription: convSummary || selected.subject, tone: 'professional' }),
      })
      const data = await res.json()
      if (data.body) { setDraft(data.body); showToast('Réponse IA générée — tu peux la modifier avant d\'envoyer') }
    } catch {
      showToast('Erreur lors de la génération IA')
    } finally {
      setAiLoading(false)
    }
  }

  const handleReply = () => {
    if (!selected || !draft.trim()) return
    navigator.clipboard.writeText(draft).catch(() => {})
    window.open(`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${selected.zohoInternalId}`, '_blank')
    showToast('Réponse copiée — colle-la dans Zoho (Ctrl+V)')
  }

  const foldersWithCounts = INBOX_FOLDERS.map(f => ({
    ...f,
    count: f.statuses.length === 0 ? tickets.length : tickets.filter(t => f.statuses.includes(t.zohoStatus)).length,
  }))

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] text-white text-sm px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Folder rail */}
      <aside className="w-52 flex-shrink-0 border-r border-[#e2e2e2] bg-[#f7f4fd] flex flex-col overflow-y-auto">
        <div className="px-3 pt-4 pb-3 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#b0b0b0] px-2 pb-2">Vues</p>
          {foldersWithCounts.map(f => (
            <button key={f.key} onClick={() => setFolder(f.key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                folder === f.key ? 'bg-[#59319f] text-white font-medium' : 'text-[#4a4a4a] hover:bg-[#e8dbfa]'
              }`}
            >
              <span className="truncate">{f.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                folder === f.key ? 'bg-white/20 text-white' : 'bg-[#e8dbfa] text-[#59319f]'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Ticket list */}
      <div className="w-80 flex-shrink-0 border-r border-[#e2e2e2] bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e2e2e2] flex-shrink-0">
          <div className="text-sm font-semibold text-[#1a1a1a]">{folderDef.label}</div>
          <div className="text-xs text-[#696969] mt-0.5">{list.length} ticket{list.length !== 1 ? 's' : ''} · trié par risque</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#696969] text-sm gap-2">
              <div className="w-4 h-4 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin" />
              Chargement…
            </div>
          ) : list.length === 0 ? (
            <p className="text-center text-[#696969] text-sm py-12">Aucun ticket dans cette vue</p>
          ) : (
            list.map(t => {
              const band = riskBand(t.riskScore)
              const isSelected = t.id === selected?.id
              return (
                <div key={t.id} onClick={() => setSelectedId(t.id)}
                  className={`relative flex items-stretch gap-2 px-4 py-3 cursor-pointer border-b border-[#f0f0f0] transition-colors ${isSelected ? 'bg-[#f3eeff]' : 'hover:bg-[#f7f7f7]'}`}
                >
                  {isSelected && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#59319f] rounded-r" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-[#1a1a1a] truncate">{t.clientName}</span>
                      <span className="text-[11px] text-[#b0b0b0] flex-shrink-0 tabular-nums">{formatHoursAgo(t.lastClientMessageAt)}</span>
                    </div>
                    <p className="text-sm text-[#4a4a4a] truncate mb-1.5">{t.subject}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-[#696969]">{t.productArea}</span>
                      {(t.priority === 'urgent' || t.priority === 'high') && (
                        <><span className="text-[#e2e2e2]">·</span>
                        <span className={`text-[11px] font-semibold ${t.priority === 'urgent' ? 'text-[#b7221b]' : 'text-[#903b07]'}`}>
                          {t.priority === 'urgent' ? '● Urgent' : '● Haute'}
                        </span></>
                      )}
                      {t.segment && (
                        <><span className="text-[#e2e2e2]">·</span>
                        <Badge label={t.segment} variant={t.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} /></>
                      )}
                    </div>
                  </div>
                  <span className="w-0.5 rounded-full flex-shrink-0 self-stretch" style={{ background: RISK_EDGE_COLOR[band] }} title={`Risque ${t.riskScore}`} />
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Conversation + composer */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-[#696969] text-sm" style={{ backgroundColor: 'var(--bg-canvas)' }}>
          Sélectionne un ticket dans la liste
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          <header className="flex-shrink-0 px-6 py-4 border-b border-[#e2e2e2] bg-white">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] text-[#b0b0b0] font-mono">#{selected.externalId}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${STATUS_BADGE[selected.zohoStatus] ?? 'bg-[#f7f7f7] text-[#696969]'}`}>
                    {selected.zohoStatus}
                  </span>
                  {selected.priority === 'urgent' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#fee3e2] text-[#b7221b] tracking-wide">Urgent</span>
                  )}
                  {selected.priority === 'high' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#ffe7cf] text-[#903b07] tracking-wide">Haute</span>
                  )}
                  <RiskScore score={selected.riskScore} />
                </div>
                <h2 className="text-lg font-bold text-[#1a1a1a] leading-snug line-clamp-2">{selected.subject}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-sm font-medium text-[#4a4a4a]">{selected.clientName}</span>
                  {selected.segment && <Badge label={selected.segment} variant={selected.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />}
                  <span className="text-xs text-[#696969]">· {selected.productArea}</span>
                  <span className="text-xs text-[#696969]">· {selected.threadCount} messages</span>
                  {selected.assigneeName && <span className="text-xs text-[#696969]">· {selected.assigneeName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/tickets/${selected.zohoInternalId}`} target="_blank"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#e2e2e2] text-[#4a4a4a] hover:bg-[#f7f7f7] transition-colors whitespace-nowrap">
                  Voir le ticket
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </Link>
                <a href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${selected.zohoInternalId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#e2e2e2] text-[#4a4a4a] hover:bg-[#f7f7f7] transition-colors whitespace-nowrap">
                  Zoho Desk
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            </div>
          </header>

          {/* Conversations */}
          <div ref={convPaneRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ backgroundColor: 'var(--bg-canvas)' }}>
            {isLoadingConvs ? (
              <div className="flex items-center justify-center py-10 text-[#696969] text-sm gap-2">
                <div className="w-4 h-4 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin" />
                Chargement de la conversation…
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-[#696969] text-sm py-10">Aucun message chargé</p>
            ) : (
              conversations.slice(-12).map(c => (
                <div key={c.id} className={`flex gap-3 ${c.authorType === 'agent' ? 'flex-row-reverse' : ''}`}
                  style={{ maxWidth: '88%', ...(c.authorType === 'agent' ? { marginLeft: 'auto' } : {}) }}>
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5 ${
                    c.authorType === 'agent' ? 'bg-[#59319f]' : 'bg-[#903b07]'
                  }`}>
                    {c.authorName.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[11px] text-[#b0b0b0] mb-1 ${c.authorType === 'agent' ? 'text-right' : ''}`}>
                      {c.authorName} · {formatHoursAgo(c.createdAt)}
                    </div>
                    <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      c.authorType === 'agent'
                        ? 'bg-[#59319f] text-white rounded-tr-sm'
                        : 'bg-white border border-[#e2e2e2] text-[#4a4a4a] rounded-tl-sm'
                    }`}>
                      {c.summary || '(pas de contenu)'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div className="flex-shrink-0 border-t border-[#e2e2e2] bg-white p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {CANNED_REPLIES.map(c => (
                <button key={c.label} onClick={() => setDraft(c.text)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e2e2e2] bg-[#f7f7f7] text-xs text-[#4a4a4a] hover:bg-[#f0f0f0] hover:border-[#d1d5db] transition-colors">
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
              <button onClick={handleAskAI} disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#c0a4f0] bg-[#f3eeff] text-xs text-[#59319f] hover:bg-[#e8dbfa] transition-colors disabled:opacity-50">
                {aiLoading
                  ? <span className="w-3 h-3 border border-[#59319f] border-t-transparent rounded-full animate-spin" />
                  : <span className="w-2 h-2 rounded-full bg-[#59319f]" />
                }
                {aiLoading ? 'Génération…' : 'Demander à l\'assistant IA'}
              </button>
            </div>

            <div className="flex items-end gap-3">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Rédiger une réponse pour ${selected.clientName}…`}
                rows={3}
                className="flex-1 resize-none border border-[#e2e2e2] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] bg-white placeholder:text-[#b0b0b0] focus:outline-none focus:ring-2 focus:ring-[#3b72d1] transition"
              />
              <button onClick={handleReply} disabled={!draft.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#59319f] text-white text-sm font-medium rounded-lg hover:bg-[#3f2175] disabled:opacity-40 transition-colors flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Répondre dans Zoho
              </button>
            </div>
            <p className="text-[11px] text-[#b0b0b0] mt-2">
              Le texte sera copié dans le presse-papier et Zoho s&apos;ouvrira — colle avec Ctrl+V / ⌘V
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

type ViewMode = 'list' | 'board' | 'triage' | 'inbox'

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
  const [filterUndefined, setFilterUndefined] = useState(false)
  const [sortBy, setSortBy] = useState('riskScore')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const deferredSearch = useDeferredValue(filterSearch)

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

  const assignees = useMemo(() => Array.from(new Set(tickets.map(t => t.assigneeName).filter(Boolean))).sort() as string[], [tickets])

  const filtered = useMemo(() => {
    const searchLower = deferredSearch.trim().toLowerCase()
    return tickets.filter(t => {
      if (filterStatus && t.zohoStatus !== filterStatus) return false
      if (filterAssignee && t.assigneeName !== filterAssignee) return false
      if (filterProduct && t.productArea !== filterProduct) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (searchLower && !(t.subject.toLowerCase().includes(searchLower) || t.clientName.toLowerCase().includes(searchLower))) return false
      if (filterUndefined && !t.subject.startsWith('Undefined — ')) return false
      return true
    }).sort((a, b) => {
      if (sortBy === 'riskScore') return b.riskScore - a.riskScore
      return new Date(b.lastClientMessageAt).getTime() - new Date(a.lastClientMessageAt).getTime()
    })
  }, [deferredSearch, filterAssignee, filterPriority, filterProduct, filterStatus, filterUndefined, sortBy, tickets])

  const boardTicketsByStatus = useMemo(() => {
    const byStatus = new Map<string, ZohoMappedTicket[]>()
    for (const ticket of filtered) {
      const statusTickets = byStatus.get(ticket.zohoStatus)
      if (statusTickets) statusTickets.push(ticket)
      else byStatus.set(ticket.zohoStatus, [ticket])
    }
    return byStatus
  }, [filtered])

  const riskRailTickets = useMemo(() => {
    const rails = new Map<string, ZohoMappedTicket[]>()
    for (const rail of RISK_RAILS) rails.set(rail.key, [])
    for (const ticket of filtered) rails.get(riskBand(ticket.riskScore))?.push(ticket)
    for (const ts of rails.values()) ts.sort((a, b) => b.riskScore - a.riskScore)
    return rails
  }, [filtered])

  const viewBtnCls = (active: boolean) =>
    `px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${active ? 'bg-[#59319f] text-white' : 'text-[#696969] hover:bg-[#f7f7f7]'}`

  return (
    <div className={view === 'inbox' ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen'} style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Tickets</h1>
          <p className="text-sm text-[#696969] mt-0.5 flex items-center gap-2">
            {loading
              ? 'Chargement…'
              : `${tickets.length} tickets · ${view !== 'inbox' ? `${filtered.length} affichés · ` : ''}${lastRefreshed ? `mis à jour ${lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
            {refreshing && <span className="inline-block w-3 h-3 border border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin" />}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex rounded-lg border border-[#e2e2e2] overflow-hidden">
            <button onClick={() => setView('list')} className={viewBtnCls(view === 'list')} title="Vue liste">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Liste
            </button>
            <button onClick={() => setView('board')} className={`${viewBtnCls(view === 'board')} border-l border-[#e2e2e2]`} title="Vue board">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/>
              </svg>
              Board
            </button>
            <button onClick={() => setView('triage')} className={`${viewBtnCls(view === 'triage')} border-l border-[#e2e2e2]`} title="Vue triage par risque">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Triage
            </button>
            <button onClick={() => setView('inbox')} className={`${viewBtnCls(view === 'inbox')} border-l border-[#e2e2e2]`} title="Vue inbox">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
              </svg>
              Inbox
            </button>
          </div>

          <button onClick={() => loadTickets(false)} disabled={loading || refreshing}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-[#e2e2e2] text-[#696969] hover:bg-[#f7f7f7] disabled:opacity-40 transition-colors"
            title="Rafraîchir les tickets">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={(loading || refreshing) ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
            </svg>
            Rafraîchir
          </button>
        </div>
      </div>

      {/* Inbox */}
      {view === 'inbox' && <InboxPane tickets={tickets} loading={loading} />}

      {/* List + Board + Triage */}
      {(view === 'list' || view === 'board' || view === 'triage') && (
        <div className="p-6">
          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {view === 'list' && (
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="Rechercher (client, sujet…)"
                className={`${selectCls} w-56`}
              />
            )}
            {view === 'list' && (
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={selectCls}>
              <option value="">Tous les agents</option>
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {view === 'list' && (
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className={selectCls}>
                {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {view === 'list' && (
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={selectCls}>
                {priorityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {view === 'list' && (
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={selectCls}>
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {view === 'board' && (
              <button
                onClick={() => setFilterUndefined(v => !v)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filterUndefined ? 'bg-[#fbf1ca] border-[#f7d878] text-[#84550e] font-medium' : 'border-[#e2e2e2] text-[#696969] hover:bg-[#f7f7f7]'}`}
              >
                {filterUndefined ? '✕ Undefined' : 'Undefined'}
              </button>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#e2e2e2] border-t-[#59319f] rounded-full animate-spin mr-3" />
              <span className="text-[#696969] text-sm">Chargement des tickets…</span>
            </div>
          )}

          {!loading && error && tickets.length === 0 && (
            <div className="bg-[#fee3e2] border border-[#fca5a5] rounded-xl p-6 text-center">
              <p className="text-[#b7221b] text-sm font-medium">{error}</p>
              <button onClick={() => loadTickets(true)} className="mt-3 text-sm text-[#59319f] hover:underline">Réessayer</button>
            </div>
          )}

          {/* List view */}
          {!loading && !error && view === 'list' && (
            <div className="bg-white rounded-xl border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.06)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f7] border-b border-[#e2e2e2]">
                  <tr>
                    {['Sujet', 'Client', 'Segment', 'Statut Zoho', 'Priorité', 'Produit', 'Dernier message client', 'Risque', 'Assigné à'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#696969] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-[#696969] text-sm">
                        Aucun ticket correspondant aux filtres
                      </td>
                    </tr>
                  ) : (
                    filtered.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-[#f7f4fd] cursor-pointer transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="font-medium text-[#1a1a1a] line-clamp-1">{ticket.subject}</span>
                          </Link>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-[#b0b0b0]">#{ticket.externalId}</span>
                            <a href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
                              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              className="text-[#b0b0b0] hover:text-[#59319f] transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-sm text-[#4a4a4a]">{ticket.clientName}</span>
                            {ticket.clientEmail && <span className="block text-xs text-[#b0b0b0]">{ticket.clientEmail}</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            {ticket.segment && <Badge label={ticket.segment} variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'} />}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[ticket.zohoStatus] ?? 'bg-[#f7f7f7] text-[#696969]'}`}>
                              {ticket.zohoStatus}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-xs text-[#696969]">{ticket.priority}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <span className="text-xs text-[#696969]">{ticket.productArea}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block text-[#696969]">
                            {formatHoursAgo(ticket.lastClientMessageAt)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                            <RiskScore score={ticket.riskScore} />
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#696969] whitespace-nowrap">
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

          {/* Board view */}
          {!loading && !error && view === 'board' && (
            <div className="overflow-x-auto">
              <div className="flex gap-4 min-w-max pb-4">
                {BOARD_COLUMNS.map(col => {
                  const colTickets = boardTicketsByStatus.get(col.status) ?? []
                  return (
                    <div key={col.status} className="w-64 flex-shrink-0 flex flex-col max-h-[calc(100vh-180px)]">
                      <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between flex-shrink-0 ${col.header}`}>
                        <span className="text-xs font-semibold">{col.label}</span>
                        <span className="text-xs font-bold">{colTickets.length}</span>
                      </div>
                      <div className={`rounded-b-lg ${col.bg} flex-1 overflow-y-auto p-2 space-y-2 min-h-24`}>
                        {colTickets.length === 0
                          ? <p className="text-xs text-[#b0b0b0] text-center py-4">Aucun ticket</p>
                          : colTickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Triage view */}
          {!loading && !error && view === 'triage' && (
            <div className="space-y-5">
              {RISK_RAILS.map(rail => {
                const railTickets = riskRailTickets.get(rail.key) ?? []
                return (
                  <div key={rail.key} className={`rounded-xl ${rail.bg} p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: rail.headerColor }}>
                        {rail.label}
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
                        style={{ background: rail.headerColor + '22', color: rail.headerColor }}>
                        {railTickets.length}
                      </span>
                      <span className="text-xs text-[#696969]">{rail.hint}</span>
                    </div>
                    {railTickets.length === 0 ? (
                      <p className="text-xs text-[#696969] py-2">Aucun ticket dans cette catégorie</p>
                    ) : (
                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {railTickets.map(t => <TriageCard key={t.id} ticket={t} />)}
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
