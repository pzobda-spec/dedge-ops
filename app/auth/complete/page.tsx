'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

export default function CompleteSignInPage() {
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    async function complete() {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      const access_token = fragment.get('access_token')
      const refresh_token = fragment.get('refresh_token')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      if (!access_token || !refresh_token || fragment.has('error')) throw new Error('Ce lien est invalide ou a expiré. Demandez un nouveau lien de connexion.')
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { detectSessionInUrl: false },
      })
      const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token })
      if (sessionError) throw new Error('Ce lien est invalide ou a expiré. Demandez un nouveau lien de connexion.')
      sessionStorage.removeItem('dedge-current-user-v2')
      const response = await fetch('/api/auth/finish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next: new URLSearchParams(window.location.search).get('next') }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      window.location.replace(result.next)
    }
    complete().catch(err => setError(err instanceof Error ? err.message : 'Connexion impossible.'))
  }, [])
  return <div className="min-h-screen flex items-center justify-center p-6">
    <div className="max-w-md rounded-xl border bg-white p-8 text-center space-y-4">
      <h1 className="text-xl font-semibold">Connexion au cockpit</h1>
      {error ? <><p role="alert" className="text-sm text-red-700">{error}</p><Link href="/login" className="text-sm underline">Retour à la connexion</Link></> : <p role="status">Vérification de votre accès…</p>}
    </div>
  </div>
}
