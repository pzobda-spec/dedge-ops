'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AppUser } from '@/lib/auth/roles'

export interface UseCurrentUserResult {
  user: AppUser | null
  loading: boolean
  refresh: () => void
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const nextUser = res.ok ? (data.user ?? null) as AppUser | null : null
      setUser(nextUser)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return {
    user,
    loading,
    refresh: () => { load() },
  }
}
