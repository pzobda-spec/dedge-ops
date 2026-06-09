'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { TODOIST_SYNC_EVENT } from './SyncButton'

interface TodoistProject {
  id: string
  name: string
  zoho_project_id: string | null
}

interface TodoistComment {
  id: string
  task_id: string
  project_id: string
  content: string
  posted_at: string
  author: string | null
}

interface MatchCandidate {
  todoist_project_id: string
  zoho_project_id: string
  todoist_project_name: string
  score: number
}

interface CommentsResponse {
  matched_project: TodoistProject | null
  comments: TodoistComment[]
  pending_candidates: MatchCandidate[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCommentsResponse(value: unknown): CommentsResponse {
  if (!isRecord(value) || !Array.isArray(value.comments) || !Array.isArray(value.pending_candidates)) {
    throw new Error('Invalid Todoist comments response')
  }
  return value as unknown as CommentsResponse
}

function responseError(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback
  return typeof value.error === 'string' ? value.error : fallback
}

export default function TodoistTimeline({
  zoho_project_id,
  canReviewMatch = false,
}: {
  zoho_project_id: string
  canReviewMatch?: boolean
}) {
  const [data, setData] = useState<CommentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const loadComments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/todoist/comments?zoho_project_id=${encodeURIComponent(zoho_project_id)}`,
      )
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(responseError(payload, `HTTP ${response.status}`))
      setData(parseCommentsResponse(payload))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Todoist notes')
    } finally {
      setLoading(false)
    }
  }, [zoho_project_id])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    const refresh = () => void loadComments()
    window.addEventListener(TODOIST_SYNC_EVENT, refresh)
    return () => window.removeEventListener(TODOIST_SYNC_EVENT, refresh)
  }, [loadComments])

  async function reviewMatch(candidate: MatchCandidate, action: 'confirm' | 'reject') {
    setReviewing(true)
    setError(null)
    try {
      const response = await fetch('/api/todoist/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todoist_project_id: candidate.todoist_project_id,
          zoho_project_id: candidate.zoho_project_id,
          action,
        }),
      })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(responseError(payload, `HTTP ${response.status}`))
      await loadComments()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to review match')
    } finally {
      setReviewing(false)
    }
  }

  const candidate = data?.pending_candidates[0]

  return (
    <details
      open
      className="group overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.06)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-[#1a1a1a]">
        <span>📋 Todoist Notes</span>
        <ChevronDown className="h-4 w-4 text-[#696969] transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-[#e2e2e2] p-5">
        {candidate && (
          <div className="mb-5 rounded-lg border border-[#d9caef] bg-[#f7f2ff] px-4 py-3">
            <p className="text-sm text-[#3f286c]">
              1 Todoist project may match — <strong>{candidate.todoist_project_name}</strong>.
            </p>
            {canReviewMatch && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => reviewMatch(candidate, 'confirm')}
                  className="rounded-md bg-[#59319f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7447b7] disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => reviewMatch(candidate, 'reject')}
                  className="rounded-md border border-[#bca8dc] bg-white px-3 py-1.5 text-xs font-medium text-[#59319f] hover:bg-[#faf9f5] disabled:opacity-50"
                >
                  Not this one
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg border border-[#fee3e2] bg-[#fff8f8] px-3 py-2 text-sm text-[#b7221b]">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#696969]">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading Todoist notes...
          </div>
        ) : !data?.matched_project ? (
          <p className="py-4 text-sm text-[#696969]">
            No Todoist project matched — sync to auto-detect
          </p>
        ) : data.comments.length === 0 ? (
          <p className="py-4 text-sm text-[#696969]">
            No Todoist notes linked to this project
          </p>
        ) : (
          <ol className="relative ml-1 border-l-2 border-[#59319f]/20">
            {data.comments.map(comment => {
              const postedAt = new Date(comment.posted_at)
              return (
                <li key={comment.id} className="relative pb-5 pl-6 last:pb-0">
                  <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-[#59319f]" />
                  <article className="rounded-lg border border-[#e2e2e2] bg-[#faf9f5] p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1a1a1a]">
                        {comment.author || 'Todoist'}
                      </span>
                      <time
                        dateTime={comment.posted_at}
                        title={format(postedAt, 'PPpp', { locale: enUS })}
                        className="text-xs text-[#696969]"
                      >
                        {formatDistanceToNow(postedAt, { addSuffix: true, locale: enUS })}
                      </time>
                    </div>
                    <div className="break-words text-sm leading-6 text-[#3f3f3f]">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#59319f] underline"
                            >
                              {children}
                            </a>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-white px-1 py-0.5 text-xs">{children}</code>
                          ),
                        }}
                      >
                        {comment.content}
                      </ReactMarkdown>
                    </div>
                  </article>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </details>
  )
}
