'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Role } from '@/lib/auth/roles'

interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
  invited_at: string | null
  last_login_at: string | null
}

interface AccessRequest {
  id: string
  email: string
  requested_at: string
  status: string
}

const roles: Role[] = ['admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead']
const roleLabels: Record<Role, string> = {
  admin:               'Admin',
  onboarder:           'Onboarder',
  support:             'Support',
  commercial_readonly: 'Commercial readonly',
  csm_lead:            'Team lead CSM',
}

const roleClasses: Record<Role, string> = {
  admin:               'bg-[#fee3e2] text-[#b7221b] border-[#fca5a5]',
  onboarder:           'bg-[#e8dbfa] text-[#59319f] border-[#c0a4f0]',
  support:             'bg-[#d4e4f8] text-[#2b5bb7] border-[#93c5fd]',
  commercial_readonly: 'bg-[#e2e2e2] text-[#4a4a4a] border-[#d1d5db]',
  csm_lead:            'bg-[#d8f2ec] text-[#0f6b58] border-[#7fd3c1]',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const inputCls = 'mt-1 w-full rounded-lg border border-[#e2e2e2] px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#3b72d1]'
const labelCls = 'text-xs font-semibold text-[#696969] uppercase tracking-wide'

function AccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/pending', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setRequests(data.requests ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les demandes.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAction(email: string, action: 'approve' | 'reject') {
    setActing(email)
    await fetch('/api/auth/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    })
    await load()
    setActing(null)
  }

  const pending = requests.filter(r => r.status === 'pending')
  const others = requests.filter(r => r.status !== 'pending')

  if (loading) return <p className="text-sm text-[#696969]">Chargement…</p>
  if (error) return <p className="text-sm text-[#b7221b]">Impossible de charger les demandes d&apos;accès : {error}</p>
  if (requests.length === 0) return <p className="text-sm text-[#696969] italic">Aucune demande d&apos;accès.</p>

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#84550e] uppercase tracking-wide">En attente</p>
          {pending.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-[#fbf1ca] p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#1a1a1a]">{r.email}</p>
                <p className="text-xs text-[#696969] mt-0.5">{formatDate(r.requested_at)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAction(r.email, 'approve')}
                  disabled={acting === r.email}
                  className="px-3 py-1.5 bg-[#1c6437] text-white text-xs font-medium rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors"
                >
                  {acting === r.email ? '…' : 'Approuver'}
                </button>
                <button
                  onClick={() => handleAction(r.email, 'reject')}
                  disabled={acting === r.email}
                  className="px-3 py-1.5 bg-[#f7f7f7] text-[#696969] text-xs font-medium rounded-lg hover:bg-[#e2e2e2] disabled:opacity-50 transition-colors"
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#696969] uppercase tracking-wide">Traitées</p>
          {others.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-[#e2e2e2] p-4 flex items-center justify-between gap-4 opacity-70">
              <p className="text-sm text-[#4a4a4a]">{r.email}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                r.status === 'approved'
                  ? 'bg-[#cff7dc] text-[#1c6437]'
                  : 'bg-[#e2e2e2] text-[#696969]'
              }`}>
                {r.status === 'approved' ? 'Approuvé' : 'Refusé'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)

  const activeCount = useMemo(() => users.filter(u => u.active).length, [users])

  async function loadUsers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setUsers(data.users ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les utilisateurs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  async function deactivate(user: AdminUser) {
    setError(null)
    setMessage(null)
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return }
    setMessage(`${user.email} désactivé.`)
    await loadUsers()
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--bg-canvas)' }} className="min-h-screen">
      <div className="bg-white border-b border-[#e2e2e2] px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Gestion des utilisateurs</h1>
          <p className="text-sm text-[#696969] mt-0.5">{activeCount} actifs / {users.length} total</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="px-4 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] transition-colors"
        >
          Inviter un utilisateur
        </button>
      </div>

      <div className="p-6">
        {error && <p className="mb-4 text-sm text-[#b7221b] bg-[#fee3e2] border border-[#fca5a5] rounded-lg px-3 py-2">{error}</p>}
        {message && <p className="mb-4 text-sm text-[#1c6437] bg-[#cff7dc] border border-[#86efac] rounded-lg px-3 py-2">{message}</p>}

        <div className="mb-8">
          <p className="text-xs font-bold text-[#696969] uppercase tracking-wide mb-4">Demandes d&apos;accès</p>
          <AccessRequests />
        </div>

        {loading ? (
          <div className="py-12 text-sm text-[#696969]">Chargement…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.06)]">
            <table className="w-full text-sm">
              <thead className="bg-[#f7f7f7] border-b border-[#e2e2e2]">
                <tr>
                  {['Email', 'Nom complet', 'Rôle', 'Statut', 'Invité le', 'Dernière connexion', 'Actions'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-[#696969] uppercase tracking-wide ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-[#f7f7f7] transition-colors">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{user.email}</td>
                    <td className="px-4 py-3 text-[#696969]">{user.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${roleClasses[user.role]}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${user.active ? 'bg-[#cff7dc] text-[#1c6437]' : 'bg-[#e2e2e2] text-[#696969]'}`}>
                        {user.active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#696969]">{formatDate(user.invited_at)}</td>
                    <td className="px-4 py-3 text-[#696969]">{formatDate(user.last_login_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingUser(user)} className="px-3 py-1.5 rounded-lg border border-[#e2e2e2] text-xs font-medium text-[#4a4a4a] hover:bg-[#f7f7f7] transition-colors">
                          Modifier
                        </button>
                        {user.active ? (
                          <button onClick={() => deactivate(user)} className="px-3 py-1.5 rounded-lg border border-[#fca5a5] text-xs font-medium text-[#b7221b] hover:bg-[#fee3e2] transition-colors">
                            Désactiver
                          </button>
                        ) : (
                          <button onClick={() => setEditingUser({ ...user, active: true })} className="px-3 py-1.5 rounded-lg border border-[#86efac] text-xs font-medium text-[#1c6437] hover:bg-[#cff7dc] transition-colors">
                            Réactiver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onSuccess={(email) => { setInviteOpen(false); setMessage(`Invitation envoyée à ${email}`); loadUsers() }}
          onError={setError}
        />
      )}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => { setEditingUser(null); setMessage('Utilisateur mis à jour.'); loadUsers() }}
          onError={setError}
        />
      )}
    </div>
  )
}

function UserModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[#e2e2e2] bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-[#1a1a1a]">{title}</h2>
          <button onClick={onClose} className="text-sm text-[#696969] hover:text-[#1a1a1a] transition-colors">Fermer</button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>Rôle</span>
      <select value={value} onChange={e => onChange(e.target.value as Role)} className={inputCls}>
        {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select>
    </label>
  )
}

function InviteModal({ onClose, onSuccess, onError }: { onClose: () => void; onSuccess: (email: string) => void; onError: (error: string) => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('onboarder')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const res = await fetch('/api/admin/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName, role }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { onError(data.error ?? `HTTP ${res.status}`); return }
    onSuccess(email)
  }

  return (
    <UserModalFrame title="Inviter un utilisateur" onClose={onClose}>
      <label className="block"><span className={labelCls}>Email</span><input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} /></label>
      <label className="block"><span className={labelCls}>Nom complet</span><input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} /></label>
      <RoleSelect value={role} onChange={setRole} />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-[#696969] hover:bg-[#f7f7f7] transition-colors">Annuler</button>
        <button onClick={submit} disabled={saving || !email} className="px-3 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] disabled:opacity-50 transition-colors">
          {saving ? 'Invitation…' : "Envoyer l'invitation"}
        </button>
      </div>
    </UserModalFrame>
  )
}

function EditModal({ user, onClose, onSuccess, onError }: { user: AdminUser; onClose: () => void; onSuccess: () => void; onError: (error: string) => void }) {
  const [role, setRole] = useState<Role>(user.role)
  const [active, setActive] = useState(user.active)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, active, full_name: fullName }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { onError(data.error ?? `HTTP ${res.status}`); return }
    onSuccess()
  }

  return (
    <UserModalFrame title={`Modifier ${user.email}`} onClose={onClose}>
      <label className="block"><span className={labelCls}>Nom complet</span><input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} /></label>
      <RoleSelect value={role} onChange={setRole} />
      <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        Compte actif
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-[#696969] hover:bg-[#f7f7f7] transition-colors">Annuler</button>
        <button onClick={submit} disabled={saving} className="px-3 py-2 rounded-lg bg-[#59319f] text-white text-sm font-medium hover:bg-[#3f2175] disabled:opacity-50 transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </UserModalFrame>
  )
}
