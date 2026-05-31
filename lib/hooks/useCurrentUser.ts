'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AppUser } from '@/lib/auth/roles'

export interface UseCurrentUserResult {
  user: AppUser | null
  loading: boolean
  refresh: () => void
}

const CACHE_KEY = 'dedge-current-user'
const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedUser {
  expiresAt: number
  user: AppUser | null
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    try {
      if (!force) {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY)
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as CachedUser
          if (cached.expiresAt > Date.now()) {
            setUser(cached.user)
            setLoading(false)
            return
          }
        }
      }

      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const nextUser = res.ok ? (data.user ?? null) as AppUser | null : null
      setUser(nextUser)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        expiresAt: Date.now() + CACHE_TTL_MS,
        user: nextUser,
      }))
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(false) }, [load])

  return {
    user,
    loading,
    refresh: () => {
      sessionStorage.removeItem(CACHE_KEY)
      load(true)
    },
  }
}
