'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

export const TODOIST_SYNC_EVENT = 'todoist-sync-complete'

interface SyncResponse {
  synced_projects: number
  synced_comments: number
}

function isSyncResponse(value: unknown): value is SyncResponse {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  return typeof response.synced_projects === 'number' &&
    typeof response.synced_comments === 'number'
}

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'object' || value === null) return fallback
  const error = (value as Record<string, unknown>).error
  return typeof error === 'string' ? error : fallback
}

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = window.setInterval(() => {
      setCooldownSeconds(current => Math.max(0, current - 1))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [cooldownSeconds])

  async function handleSync() {
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/todoist/sync', { method: 'POST' })
      const payload: unknown = await response.json()
      if (!response.ok || !isSyncResponse(payload)) {
        throw new Error(errorMessage(payload, `HTTP ${response.status}`))
      }

      setMessage(
        `Synced ${payload.synced_projects} projects, ${payload.synced_comments} comments — just now`,
      )
      setCooldownSeconds(30)
      window.dispatchEvent(new CustomEvent(TODOIST_SYNC_EVENT))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Todoist sync failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading || cooldownSeconds > 0}
        className="inline-flex items-center gap-2 rounded-lg border border-[#59319f] px-3 py-1.5 text-sm font-medium text-[#59319f] transition-colors hover:bg-[#f3eeff] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {loading
          ? 'Syncing Todoist...'
          : cooldownSeconds > 0
            ? `Sync available in ${cooldownSeconds}s`
            : 'Sync Todoist'}
      </button>
      {message && <span className="text-right text-xs text-[#696969]">{message}</span>}
    </div>
  )
}
