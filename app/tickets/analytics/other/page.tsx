'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface OtherTicket {
  id: string
  ticketNumber: string
  subject: string
  status: string
  category: string
  createdTime: string
  accountName: string | null
  contactName: string | null
  zohoUrl: string
}

interface OtherTicketsResult {
  from: string
  to: string
  count: number
  tickets: OtherTicket[]
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default function OtherCategoryTicketsPage() {
  const [data, setData] = useState<OtherTicketsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const params = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search)
  }, [])

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const label = params.get('label') ?? `${from} -> ${to}`

  useEffect(() => {
    if (!from || !to) {
      setError('Paramètres from/to manquants')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/zoho/analytics/other-tickets?${new URLSearchParams({ from, to })}`, {
      signal: controller.signal,
    })
      .then(async res => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        setData(body)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erreur inconnue')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [from, to])

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href="/tickets/analytics" className="text-xs text-slate-500 hover:text-slate-900">
              Analytiques Tickets
            </Link>
            <h1 className="text-xl font-semibold text-slate-900">Tickets a categoriser</h1>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
          <Link
            href="/tickets/analytics"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retour
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-6xl">
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Chargement des tickets...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {data.count} ticket{data.count > 1 ? 's' : ''} Autre/Other
                </p>
                <p className="text-xs text-slate-500">
                  Cree entre {data.from} et {data.to}
                </p>
              </div>
            </div>

            {data.tickets.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">Aucun ticket Autre/Other sur cette periode.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.tickets.map(ticket => (
                  <div key={ticket.id} className="grid grid-cols-[110px_1fr_140px_130px_120px] gap-4 px-5 py-3 items-center hover:bg-slate-50">
                    <div className="font-mono text-xs text-slate-500">#{ticket.ticketNumber}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{ticket.subject}</p>
                      <p className="truncate text-xs text-slate-500">
                        {ticket.accountName || ticket.contactName || 'Client inconnu'}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(ticket.createdTime)}</div>
                    <div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {ticket.status}
                      </span>
                    </div>
                    <a
                      href={ticket.zohoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Ouvrir Zoho
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
