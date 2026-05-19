'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { ZohoMappedTicket, MappedConversation } from '@/lib/zoho/mapper'
import Badge from '@/components/ui/Badge'
import RiskScore from '@/components/ui/RiskScore'
import ActionButton from '@/components/ui/ActionButton'
import { formatHoursAgo, formatDate } from '@/lib/utils/dates'
import type { TicketStatus, TicketPriority } from '@/lib/mockData'
import { sanitizeEmailHtml } from '@/lib/zoho/htmlSanitizer'

const statusLabels: Record<string, string> = {
  open: 'Ouvert',
  pending: 'En attente',
  resolved: 'Résolu',
  reopened: 'Réouvert',
}

const priorityLabels: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Faible',
}

const sentimentLabels: Record<string, string> = {
  positive: '😊 Positif',
  neutral: '😐 Neutre',
  negative: '😠 Négatif',
}

const sourceLabels: Record<string, string> = {
  email: '📧 Email',
  chat: '💬 Chat',
  phone: '📞 Téléphone',
}

type AiAction = 'summarize' | 'reply' | 'escalation' | 'kb' | 'similar_bug'

type SimilarIssue = {
  source: 'zoho' | 'linear'
  identifier: string
  title: string
  status: string
  clientName?: string | null
  assigneeName?: string | null
  url?: string | null
  cause?: string
  solution?: string
  whySimilar: string
}

type FindSimilarResult = {
  verySimilar: SimilarIssue[]
  potentiallyRelated: SimilarIssue[]
  toCheck: SimilarIssue[]
  recommendation: string
}

interface EscalationResult {
  title?: string
  context?: string
  clientImpact?: string
  productModule?: string
  expectedBehavior?: string
  actualBehavior?: string
  stepsAlreadyChecked?: string[]
  clientExamples?: string[]
  urgencyLevel?: string
  [key: string]: unknown
}

const urgencyToPriority: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
}

// ─── Conversation thread components ────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('')
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch {
    return isoString
  }
}

function hasQuotedContent(html: string): boolean {
  return /<blockquote/i.test(html) || /class="gmail_quote"/i.test(html)
}

interface ConversationMessageProps {
  ticketId: string
  conv: MappedConversation
  expanded: boolean
  onToggleExpand: () => void
}

function ConversationMessage({ ticketId, conv, expanded, onToggleExpand }: ConversationMessageProps) {
  const [showQuote, setShowQuote] = useState(false)
  const [fetchedContent, setFetchedContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  const isAgent = conv.direction === 'out'
  const initials = getInitials(conv.authorName)

  const content = fetchedContent
  const hasContent = Boolean(content)
  const hasQuote = hasContent && hasQuotedContent(content!)
  const isLong = hasContent && content!.length > 2000
  const sanitized = hasContent ? sanitizeEmailHtml(content!) : ''

  useEffect(() => {
    if (!expanded || fetchedContent !== null || loadingContent) return
    setLoadingContent(true)
    fetch(`/api/zoho/tickets/${ticketId}/threads/${conv.id}`)
      .then(r => r.json())
      .then(data => setFetchedContent(data.content || ''))
      .catch(() => setFetchedContent(''))
      .finally(() => setLoadingContent(false))
  }, [expanded, ticketId, conv.id, fetchedContent, loadingContent])

  return (
    <div
      className={`bg-white rounded-lg border shadow-sm ${
        isAgent
          ? 'border-l-4 border-l-blue-400 border-slate-200'
          : 'border-l-4 border-l-slate-300 border-slate-200'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
            isAgent
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {initials}
        </div>

        {/* Author + email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {conv.authorName}
            </span>
            {conv.fromEmail && (
              <span className="text-xs text-slate-400 truncate">&lt;{conv.fromEmail}&gt;</span>
            )}
          </div>
        </div>

        {/* Right: timestamp + channel badge + expand indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {conv.channel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {conv.channel}
            </span>
          )}
          <span className="text-xs text-slate-400">{formatDateTime(conv.createdAt)}</span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          {loadingContent ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
              Chargement...
            </div>
          ) : hasContent ? (
            <>
              {hasQuote && (
                <button
                  onClick={() => setShowQuote(v => !v)}
                  className="mb-2 text-xs text-blue-600 hover:underline"
                >
                  {showQuote ? 'Masquer la citation' : 'Voir la citation'}
                </button>
              )}
              <div
                className={`email-content text-sm text-slate-800 leading-relaxed ${
                  hasQuote && !showQuote ? 'hide-quotes' : ''
                } ${isLong ? 'max-h-96 overflow-y-auto' : ''}`}
                style={{ fontFamily: 'inherit', fontSize: '14px' }}
                dangerouslySetInnerHTML={{ __html: sanitized }}
              />
            </>
          ) : (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {conv.summary || <span className="text-slate-400 italic">Aucun contenu disponible.</span>}
            </p>
          )}
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && conv.summary && (
        <div
          className="px-4 pb-3 cursor-pointer"
          onClick={onToggleExpand}
        >
          <p className="text-xs text-slate-500 line-clamp-2">{conv.summary}</p>
        </div>
      )}
    </div>
  )
}

interface ConversationThreadProps {
  ticketId: string
  conversations: MappedConversation[]
}

function ConversationThread({ ticketId, conversations }: ConversationThreadProps) {
  const sorted = [...conversations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const lastId = sorted.length > 0 ? sorted[sorted.length - 1].id : null
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    lastId ? new Set([lastId]) : new Set()
  )

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {sorted.map(conv => (
        <ConversationMessage
          key={conv.id}
          ticketId={ticketId}
          conv={conv}
          expanded={expandedIds.has(conv.id)}
          onToggleExpand={() => toggleExpand(conv.id)}
        />
      ))}
    </div>
  )
}

// ─── Reply result renderer ──────────────────────────────────────────────────

type ReplyContext = { zohoKBCount?: number; localKBCount?: number; similarTicketsCount?: number }

function ReplyResultView({
  result,
  replyBody,
  setReplyBody,
  copied,
  setCopied,
  onRegenerate,
  onUseReply,
  regenerating,
}: {
  result: Record<string, unknown>
  replyBody: string
  setReplyBody: (v: string) => void
  copied: boolean
  setCopied: (v: boolean) => void
  onRegenerate: (critique: string, userDraft: string) => void
  onUseReply: (body: string) => void
  regenerating: boolean
}) {
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null)
  const [critique, setCritique] = useState('')
  const [userDraft, setUserDraft] = useState('')

  const ctx = (result._context ?? {}) as ReplyContext
  const sources = result.sources as string[] | undefined
  const totalSources = (ctx.zohoKBCount ?? 0) + (ctx.localKBCount ?? 0) + (ctx.similarTicketsCount ?? 0)

  return (
    <div className="space-y-3">
      {/* Sources badge */}
      {totalSources > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Basé sur :</span>
          {(ctx.zohoKBCount ?? 0) > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {ctx.zohoKBCount} article{(ctx.zohoKBCount ?? 0) > 1 ? 's' : ''} Zoho KB
            </span>
          )}
          {(ctx.localKBCount ?? 0) > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {ctx.localKBCount} fiche{(ctx.localKBCount ?? 0) > 1 ? 's' : ''} KB interne
            </span>
          )}
          {(ctx.similarTicketsCount ?? 0) > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {ctx.similarTicketsCount} ticket{(ctx.similarTicketsCount ?? 0) > 1 ? 's' : ''} similaire{(ctx.similarTicketsCount ?? 0) > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
      {totalSources === 0 && (
        <p className="text-xs text-slate-400 italic">Aucune source KB trouvée — réponse générée sans contexte documentaire.</p>
      )}

      {sources && sources.length > 0 && (
        <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
          <span className="font-medium">Sources : </span>{sources.join(' · ')}
        </div>
      )}

      {/* Reply body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-700">Réponse (éditable)</h3>
          <button
            onClick={() => {
              navigator.clipboard.writeText(replyBody)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
        <textarea
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
          rows={10}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 font-mono"
        />
      </div>

      {/* Feedback row */}
      {feedback === null && (
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-500">Ce draft convient ?</span>
          <button
            onClick={() => { setFeedback('good'); onUseReply(replyBody) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
          >
            👍 Oui, l&apos;utiliser
          </button>
          <button
            onClick={() => setFeedback('bad')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs font-medium hover:bg-red-100 transition-colors"
          >
            👎 Non, améliorer
          </button>
        </div>
      )}

      {feedback === 'good' && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-green-600 text-xs font-medium">✓ Réponse copiée dans la zone d&apos;envoi</span>
          <button onClick={() => setFeedback(null)} className="text-xs text-slate-400 hover:underline">Annuler</button>
        </div>
      )}

      {feedback === 'bad' && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-700">Qu&apos;est-ce qui ne va pas ?</p>
          <textarea
            value={critique}
            onChange={e => setCritique(e.target.value)}
            placeholder="Ex : trop formel, solution incorrecte, manque de détails sur..."
            rows={2}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none"
          />
          <p className="text-xs font-medium text-slate-700">
            Votre réponse au client <span className="text-slate-400 font-normal">(optionnel — servira de référence pour régénérer)</span>
          </p>
          <textarea
            value={userDraft}
            onChange={e => setUserDraft(e.target.value)}
            placeholder="Rédigez votre réponse ici..."
            rows={5}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none font-mono"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => { onRegenerate(critique, userDraft); setFeedback(null); setCritique(''); setUserDraft('') }}
              disabled={regenerating || (!critique.trim() && !userDraft.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {regenerating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {regenerating ? 'Régénération...' : 'Régénérer en tenant compte'}
            </button>
            <button onClick={() => setFeedback(null)} className="text-xs text-slate-400 hover:underline">Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Similar bug result renderer ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'In Progress': 'text-blue-600',
  'Todo': 'text-slate-500',
  'Backlog': 'text-slate-400',
  'Done': 'text-green-600',
  'Solved': 'text-green-600',
  'Cancelled': 'text-slate-400',
}

function IssueCard({ issue, icon, dimmed }: { issue: SimilarIssue; icon: string; dimmed?: boolean }) {
  const statusColor = STATUS_COLORS[issue.status] ?? 'text-slate-500'
  const isZoho = issue.source === 'zoho'

  return (
    <div className={`rounded-lg border p-3 ${dimmed ? 'border-slate-200 bg-white' : 'border-orange-200 bg-orange-50'}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
              isZoho ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {isZoho ? 'Zoho' : 'Linear'}
            </span>
            {issue.url ? (
              <a href={issue.url} target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-blue-600 hover:underline flex-shrink-0">
                {issue.identifier}
              </a>
            ) : (
              <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{issue.identifier}</span>
            )}
            <span className="text-sm font-medium text-slate-900 truncate">{issue.title}</span>
            <span className={`text-xs font-medium flex-shrink-0 ${statusColor}`}>{issue.status}</span>
          </div>
          <p className="text-xs text-slate-600 mb-1">{issue.whySimilar}</p>
          {issue.cause && issue.cause !== 'non documenté' && (
            <p className="text-xs text-slate-500"><span className="font-medium">Cause :</span> {issue.cause}</p>
          )}
          {issue.solution && issue.solution !== 'non documenté' && (
            <p className="text-xs text-slate-500"><span className="font-medium">Solution :</span> {issue.solution}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {issue.clientName && <span>{issue.clientName}</span>}
            {issue.clientName && issue.assigneeName && <span> · </span>}
            {issue.assigneeName && <span>{issue.assigneeName}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

function SimilarBugResultView({ result }: { result: FindSimilarResult }) {
  const hasResults =
    result.verySimilar?.length > 0 ||
    result.potentiallyRelated?.length > 0 ||
    result.toCheck?.length > 0

  if (!hasResults) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Aucun bug similaire trouvé dans le board Linear BUGS.</p>
        {result.recommendation && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">{result.recommendation}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {result.verySimilar?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Très similaire</p>
          <div className="space-y-2">
            {result.verySimilar.map((issue, i) => (
              <IssueCard key={i} issue={issue} icon="🎯" />
            ))}
          </div>
        </div>
      )}
      {result.potentiallyRelated?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Potentiellement lié</p>
          <div className="space-y-2">
            {result.potentiallyRelated.map((issue, i) => (
              <IssueCard key={i} issue={issue} icon="🔍" dimmed />
            ))}
          </div>
        </div>
      )}
      {result.toCheck?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">À vérifier</p>
          <div className="space-y-2">
            {result.toCheck.map((issue, i) => (
              <IssueCard key={i} issue={issue} icon="💡" dimmed />
            ))}
          </div>
        </div>
      )}
      {result.recommendation && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-900">{result.recommendation}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string

  const [ticket, setTicket] = useState<ZohoMappedTicket | null>(null)
  const [conversations, setConversations] = useState<MappedConversation[]>([])
  const [loadingTicket, setLoadingTicket] = useState(true)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [ticketError, setTicketError] = useState<string | null>(null)

  const [activeAction, setActiveAction] = useState<AiAction | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [copied, setCopied] = useState(false)

  const [regeneratingReply, setRegeneratingReply] = useState(false)

  const [creatingLinear, setCreatingLinear] = useState(false)
  const [linearIssue, setLinearIssue] = useState<{ identifier: string; url: string } | null>(null)
  const [linearError, setLinearError] = useState<string | null>(null)

  const [sendingReply, setSendingReply] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [replySent, setReplySent] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  const [showKBDialog, setShowKBDialog] = useState(false)
  const [kbInstructions, setKbInstructions] = useState('')

  useEffect(() => {
    async function loadTicket() {
      try {
        setLoadingTicket(true)
        setTicketError(null)
        const res = await fetch(`/api/zoho/tickets/${ticketId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setTicket(data)
      } catch (err) {
        console.error('Failed to load ticket:', err)
        setTicketError('Erreur de chargement du ticket')
      } finally {
        setLoadingTicket(false)
      }
    }

    async function loadConversations() {
      try {
        setLoadingConversations(true)
        const res = await fetch(`/api/zoho/tickets/${ticketId}/conversations`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setConversations(data.conversations || [])
      } catch (err) {
        console.error('Failed to load conversations:', err)
      } finally {
        setLoadingConversations(false)
      }
    }

    loadTicket()
    loadConversations()
  }, [ticketId])

  async function handleRegenerateReply(critique: string, userDraftReply: string) {
    if (!ticket) return
    setRegeneratingReply(true)
    setAiResult(null)
    setReplyBody('')
    const conversationSummary = conversations
      .map(c => `[${c.authorType === 'client' ? 'Client' : 'Agent'} - ${c.authorName}]: ${c.summary}`)
      .join('\n')
    try {
      const res = await fetch('/api/ai/generate-client-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          clientName: ticket.clientName,
          segment: ticket.segment ?? 'N/A',
          productArea: ticket.productArea,
          issueDescription: conversationSummary || ticket.subject,
          tone: 'professionnel et empathique',
          feedback: critique || undefined,
          userDraftReply: userDraftReply || undefined,
        }),
      })
      const data = await res.json()
      setActiveAction('reply')
      setAiResult(data)
      if (data.body) setReplyBody(data.body as string)
    } catch {
      setAiResult({ error: 'Erreur lors de la régénération.' })
    } finally {
      setRegeneratingReply(false)
    }
  }

  async function handleAction(action: AiAction, extra: Record<string, unknown> = {}) {
    if (!ticket) return
    setActiveAction(action)
    setAiLoading(true)
    setAiResult(null)
    setReplyBody('')

    try {
      let endpoint = ''
      let body: Record<string, unknown> = {}

      const conversationSummary = conversations
        .map(c => `[${c.authorType === 'client' ? 'Client' : 'Agent'} - ${c.authorName}]: ${c.summary}`)
        .join('\n')

      if (action === 'summarize') {
        endpoint = '/api/ai/summarize-ticket'
        body = {
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          clientName: ticket.clientName,
          segment: ticket.segment ?? 'N/A',
          productArea: ticket.productArea,
          conversationHistory: conversationSummary || ticket.subject,
          ageHours: Math.round(
            (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000
          ),
        }
      } else if (action === 'reply') {
        endpoint = '/api/ai/generate-client-reply'
        body = {
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          clientName: ticket.clientName,
          segment: ticket.segment ?? 'N/A',
          productArea: ticket.productArea,
          issueDescription: conversationSummary || ticket.subject,
          tone: 'professionnel et empathique',
        }
      } else if (action === 'escalation') {
        endpoint = '/api/ai/create-escalation'
        body = {
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          clientName: ticket.clientName,
          segment: ticket.segment ?? 'N/A',
          productArea: ticket.productArea,
          issueDescription: conversationSummary || ticket.subject,
          alreadyChecked: ['Logs applicatifs', 'Configuration client', 'Reproductibilité'],
          examples: [`Signalement du ${formatDate(ticket.createdAt)}`],
        }
      } else if (action === 'kb') {
        endpoint = '/api/ai/create-knowledge-article'
        body = {
          ticketId: ticket.zohoInternalId,
          subject: ticket.subject,
          productArea: ticket.productArea,
          resolution: '',
          conversationSummary: conversationSummary || ticket.subject,
          additionalInstructions: extra.additionalInstructions || '',
        }
      } else if (action === 'similar_bug') {
        endpoint = '/api/ai/find-similar-bug'
        body = {
          subject: ticket.subject,
          productArea: ticket.productArea,
          conversationHistory: conversationSummary || ticket.subject,
          zohoInternalId: ticket.zohoInternalId,
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setAiResult(data)

      if (action === 'reply' && data.body) {
        setReplyBody(data.body as string)
      }
    } catch {
      setAiResult({ error: 'Erreur lors de la génération. Vérifiez la clé API OpenAI.' })
    } finally {
      setAiLoading(false)
    }
  }

  async function handleCreateInLinear() {
    if (!aiResult) return
    const result = aiResult as EscalationResult
    const title = result.title || (ticket ? ticket.subject : 'Escalade technique')
    const description = [
      result.context && `**Contexte**\n${result.context}`,
      result.clientImpact && `**Impact client**\n${result.clientImpact}`,
      result.expectedBehavior && `**Comportement attendu**\n${result.expectedBehavior}`,
      result.actualBehavior && `**Comportement actuel**\n${result.actualBehavior}`,
      result.stepsAlreadyChecked?.length
        ? `**Vérifications effectuées**\n${result.stepsAlreadyChecked.map(s => `- ${s}`).join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const priority = result.urgencyLevel ? urgencyToPriority[result.urgencyLevel] : undefined

    setCreatingLinear(true)
    setLinearError(null)
    setLinearIssue(null)

    try {
      const res = await fetch('/api/linear/issues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: description || title, priority }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const created = await res.json()
      setLinearIssue({
        identifier: created.identifier,
        url: created.url,
      })
    } catch (err) {
      setLinearError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setCreatingLinear(false)
    }
  }

  async function handleSendReply() {
    if (!replyContent.trim() || !ticket) return
    setSendingReply(true)
    setReplyError(null)
    setReplySent(false)

    try {
      const res = await fetch(`/api/zoho/tickets/${ticket.zohoInternalId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent, contentType: 'html' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setReplySent(true)
      setReplyContent('')
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi')
    } finally {
      setSendingReply(false)
    }
  }

  const actionLabels: Record<AiAction, string> = {
    summarize: 'Résumé du ticket',
    reply: 'Réponse client générée',
    escalation: 'Ticket d\'escalade créé',
    kb: 'Fiche KB générée',
    similar_bug: 'Bugs similaires dans Linear',
  }

  if (loadingTicket) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-3" />
        <span className="text-slate-500 text-sm">Chargement du ticket...</span>
      </div>
    )
  }

  if (ticketError || !ticket) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">{ticketError || 'Ticket introuvable.'}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 underline">
          Retour
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-400">#{ticket.externalId}</span>
              <a
                href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-blue-500 transition-colors"
                title="Ouvrir dans Zoho Desk"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <RiskScore score={ticket.riskScore} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">{ticket.subject}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {ticket.clientName} · {ticket.productArea} · {formatHoursAgo(ticket.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Tags row */}
        <div className="flex flex-wrap gap-2">
          <Badge
            label={statusLabels[ticket.status] || ticket.status}
            variant={ticket.status as TicketStatus}
          />
          <Badge
            label={priorityLabels[ticket.priority] || ticket.priority}
            variant={ticket.priority as TicketPriority}
          />
          {ticket.segment && (
            <Badge
              label={ticket.segment}
              variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
            />
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            Zoho: {ticket.zohoStatus}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            {sourceLabels[ticket.source] || ticket.source}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            {sentimentLabels[ticket.sentiment]}
          </span>
          {ticket.language && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
              {ticket.language}
            </span>
          )}
        </div>

        {/* AI action buttons */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions IA</h2>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Résumer le ticket"
              onClick={() => handleAction('summarize')}
              loading={aiLoading && activeAction === 'summarize'}
              variant="secondary"
            />
            <ActionButton
              label="Réponse client"
              onClick={() => handleAction('reply')}
              loading={aiLoading && activeAction === 'reply'}
              variant="secondary"
            />
            <ActionButton
              label="Créer escalade tech"
              onClick={() => handleAction('escalation')}
              loading={aiLoading && activeAction === 'escalation'}
              variant="secondary"
            />
            <ActionButton
              label="Créer fiche KB"
              onClick={() => { setKbInstructions(''); setShowKBDialog(true) }}
              loading={aiLoading && activeAction === 'kb'}
              variant="secondary"
            />
            <ActionButton
              label="Find similar bug"
              onClick={() => handleAction('similar_bug')}
              loading={aiLoading && activeAction === 'similar_bug'}
              variant="secondary"
            />
          </div>
        </div>

        {/* AI Output Panel */}
        {(aiLoading || aiResult) && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              {activeAction ? actionLabels[activeAction] : 'Résultat IA'}
            </h2>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                Génération en cours...
              </div>
            ) : aiResult ? (
              <div className="space-y-4">
                {activeAction === 'similar_bug' ? (
                  <SimilarBugResultView result={aiResult as unknown as FindSimilarResult} />
                ) : activeAction === 'reply' ? (
                  <ReplyResultView
                    result={aiResult}
                    replyBody={replyBody}
                    setReplyBody={setReplyBody}
                    copied={copied}
                    setCopied={setCopied}
                    onRegenerate={handleRegenerateReply}
                    onUseReply={(body) => setReplyContent(body)}
                    regenerating={regeneratingReply}
                  />
                ) : (
                  <pre className="text-xs bg-slate-50 rounded p-3 overflow-auto max-h-64 text-slate-700 whitespace-pre-wrap">
                    {JSON.stringify(aiResult, null, 2)}
                  </pre>
                )}
                {activeAction === 'escalation' && !('error' in aiResult) && (
                  <div className="border-t border-slate-200 pt-4">
                    {linearIssue ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-green-700 font-medium">
                          Escalade créée :
                        </span>
                        <a
                          href={linearIssue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 font-mono hover:underline"
                        >
                          {linearIssue.identifier}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleCreateInLinear}
                          disabled={creatingLinear}
                          className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {creatingLinear ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Création...
                            </>
                          ) : (
                            'Créer dans Linear'
                          )}
                        </button>
                        {linearError && (
                          <span className="text-sm text-red-600">{linearError}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Conversation thread */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Conversations
            {!loadingConversations && (
              <span className="ml-2 text-slate-400 font-normal">({conversations.length})</span>
            )}
          </h2>

          {loadingConversations ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              Chargement des conversations...
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune conversation disponible.</p>
          ) : (
            <ConversationThread ticketId={ticketId} conversations={conversations} />
          )}
        </div>

        {/* Send reply */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Envoyer une réponse</h2>
          <textarea
            value={replyContent}
            onChange={e => setReplyContent(e.target.value)}
            rows={6}
            placeholder="Rédigez votre réponse au client..."
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 mb-3"
          />
          {replyError && (
            <p className="text-red-600 text-xs mb-2">{replyError}</p>
          )}
          {replySent && (
            <p className="text-green-600 text-xs mb-2">Réponse envoyée avec succès !</p>
          )}
          <button
            onClick={handleSendReply}
            disabled={sendingReply || !replyContent.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingReply ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Envoi en cours...
              </span>
            ) : (
              'Envoyer la réponse'
            )}
          </button>
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Informations</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Créé le</dt>
              <dd className="text-slate-900">{formatDate(ticket.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Mis à jour le</dt>
              <dd className="text-slate-900">{formatDate(ticket.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Dernier message client</dt>
              <dd className="text-slate-900">{formatHoursAgo(ticket.lastClientMessageAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Dernière réponse agent</dt>
              <dd className="text-slate-900">{formatHoursAgo(ticket.lastAgentReplyAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Langue client</dt>
              <dd className="text-slate-900">{ticket.language || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Canal</dt>
              <dd className="text-slate-900">{ticket.channel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email client</dt>
              <dd className="text-slate-900">{ticket.clientEmail || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Assigné à</dt>
              <dd className="text-slate-900">{ticket.assigneeName || '—'}</dd>
            </div>
            {ticket.dueDate && (
              <div>
                <dt className="text-slate-500">Échéance</dt>
                <dd className="text-slate-900">{formatDate(ticket.dueDate)}</dd>
              </div>
            )}
            {ticket.responseDueDate && (
              <div>
                <dt className="text-slate-500">Délai de réponse</dt>
                <dd className="text-slate-900">{formatDate(ticket.responseDueDate)}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">Fils de discussion</dt>
              <dd className="text-slate-900">{ticket.threadCount}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* KB dialog */}
      {showKBDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Créer une fiche KB</h2>
            <p className="text-sm text-slate-500 mb-4">
              Ajoutez des instructions pour guider la génération (symptômes observés, étapes de vérification, contexte particulier…).
            </p>
            <textarea
              autoFocus
              value={kbInstructions}
              onChange={e => setKbInstructions(e.target.value)}
              rows={7}
              placeholder={`Ex :
- Symptôme : le client ne reçoit pas les emails de confirmation
- Vérifier : configuration SMTP, domaine expéditeur, logs d'envoi
- Contexte : hôtel nouvellement onboardé, PMS Mews`}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowKBDialog(false)}
                className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowKBDialog(false)
                  handleAction('kb', { additionalInstructions: kbInstructions })
                }}
                className="px-4 py-2 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700 transition-colors"
              >
                Générer la fiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
