'use client'

import { useState } from 'react'

type State = 'idle' | 'loading' | 'sent' | 'pending' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('loading')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next: new URLSearchParams(window.location.search).get('next') }),
      })
      const data = await res.json()
      if (data.status === 'sent') setState('sent')
      else if (data.status === 'pending') setState('pending')
      else { setState('error'); setErrorMsg(data.error ?? 'Erreur inconnue') }
    } catch {
      setState('error')
      setErrorMsg('Erreur réseau')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-xs font-bold text-[#696969] uppercase tracking-widest mb-1">D-EDGE</p>
          <h1 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">Ops Cockpit</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#e2e2e2] shadow-[0_8px_24px_rgba(0,0,0,0.10)] p-7">
          {state === 'sent' ? (
            <div className="text-center py-2 space-y-3">
              <div className="w-12 h-12 bg-[#cff7dc] rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-[#1c6437]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">Vérifiez votre email</p>
                <p className="text-xs text-[#696969] mt-1">
                  Lien envoyé à <strong>{email}</strong>.<br />
                  Cliquez dessus pour accéder au cockpit.
                </p>
              </div>
              <p className="text-xs text-[#b0b0b0]">Vérifiez aussi vos spams.</p>
            </div>
          ) : state === 'pending' ? (
            <div className="text-center py-2 space-y-3">
              <div className="w-12 h-12 bg-[#ffe7cf] rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-[#903b07]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">Demande envoyée</p>
                <p className="text-xs text-[#696969] mt-1">
                  L&apos;accès pour <strong>{email}</strong> est en attente de validation.<br />
                  Vous recevrez un email dès approbation.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#696969] mb-1.5 uppercase tracking-wide">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="prenom.nom@d-edge.com"
                  required
                  autoFocus
                  className="w-full border border-[#e2e2e2] rounded-lg px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b0b0b0] focus:outline-none focus:ring-2 focus:ring-[#3b72d1] focus:border-transparent transition-shadow"
                />
              </div>

              {state === 'error' && (
                <p className="text-xs text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={state === 'loading'}
                className="w-full bg-[#59319f] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#3f2175] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#3b72d1] focus:ring-offset-1"
              >
                {state === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Vérification…
                  </span>
                ) : 'Continuer'}
              </button>

              <p className="text-center text-xs text-[#696969]">
                Connexion par lien email — aucun mot de passe
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
