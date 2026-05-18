'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { ZohoMappedTicket } from '@/lib/zoho/mapper'
import Badge from '@/components/ui/Badge'
import RiskScore from '@/components/ui/RiskScore'
import { formatHoursAgo } from '@/lib/utils/dates'
import type { TicketStatus, TicketPriority } from '@/lib/mockData'

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'Open', label: 'Open' },
  { value: 'Managed', label: 'Managed' },
  { value: 'Escalated', label: 'Escalated' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Solved', label: 'Solved' },
  { value: 'Stuck client', label: 'Stuck client' },
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

export default function TicketsPage() {
  const [tickets, setTickets] = useState<ZohoMappedTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState('riskScore')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/zoho/tickets?limit=100')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTickets(data.tickets || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load tickets:', err)
      setError('Erreur de chargement des tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 3 minutes
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    loadTickets()
    intervalRef.current = setInterval(loadTickets, 3 * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loadTickets])

  const searchLower = filterSearch.toLowerCase()
  const filtered = tickets
    .filter(t => {
      if (filterStatus && t.zohoStatus !== filterStatus) return false
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

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tickets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading
              ? 'Chargement...'
              : `${tickets.length} tickets · ${filtered.length} affichés${lastRefreshed ? ` · mis à jour ${lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          </p>
        </div>
        <button
          onClick={loadTickets}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          title="Rafraîchir les tickets"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? 'animate-spin' : ''}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          Rafraîchir
        </button>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="text"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Rechercher (client, sujet...)"
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700 w-56"
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {statusOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {productOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {priorityOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700"
          >
            {sortOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-3" />
            <span className="text-slate-500 text-sm">Chargement des tickets...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700 text-sm font-medium">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-sm text-red-600 underline"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sujet</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut Zoho</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
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
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-sm">
                      Aucun ticket correspondant aux filtres
                    </td>
                  </tr>
                ) : (
                  filtered.map(ticket => (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                          <span className="font-medium text-slate-900 line-clamp-1">{ticket.subject}</span>
                        </Link>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-slate-400">#{ticket.externalId}</span>
                          <a
                            href={`https://support.loungeup.com/agent/loungeup/loungeup-support-team/tickets/details/${ticket.zohoInternalId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-slate-400 hover:text-blue-500 transition-colors"
                            title="Ouvrir dans Zoho Desk"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                              <polyline points="15 3 21 3 21 9"/>
                              <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                          <span className="text-sm">{ticket.clientName}</span>
                          {ticket.clientEmail && (
                            <span className="block text-xs text-slate-400">{ticket.clientEmail}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                          {ticket.segment ? (
                            <Badge
                              label={ticket.segment}
                              variant={ticket.segment.toLowerCase() as 'strategic' | 'gold' | 'silver' | 'bronze'}
                            />
                          ) : null}
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
                          <Badge
                            label={statusLabels[ticket.status] || ticket.status}
                            variant={ticket.status as TicketStatus}
                          />
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                          <Badge
                            label={priorityLabels[ticket.priority] || ticket.priority}
                            variant={ticket.priority as TicketPriority}
                          />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <Link href={`/tickets/${ticket.zohoInternalId}`} className="block">
                          {ticket.productArea}
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
      </div>
    </div>
  )
}
