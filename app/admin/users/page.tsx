'use client'

import { useEffect, useMemo, useState } from 'react'
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

const roles: Role[] = ['admin', 'onboarder', 'support', 'commercial_readonly']
const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  onboarder: 'Onboarder',
  support: 'Support',
  commercial_readonly: 'Commercial readonly',
}

const roleClasses: Record<Role, string> = {
  admin: 'bg-red-50 text-red-700 border-red-200',
  onboarder: 'bg-blue-50 text-blue-700 border-blue-200',
  support: 'bg-purple-50 text-purple-700 border-purple-200',
  commercial_readonly: 'bg-slate-100 text-slate-600 border-slate-200',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)

  const activeCount = useMemo(() => users.filter(user => user.active).length, [users])

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
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`)
      return
    }
    setMessage(`${user.email} désactivé.`)
    await loadUsers()
  }

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Gestion des utilisateurs</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeCount} actifs / {users.length} total</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"
        >
          Inviter un utilisateur
        </button>
      </div>

      <div className="p-6">
        {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {message && <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}
        {loading ? (
          <div className="py-12 text-sm text-slate-400">Chargement…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Nom complet</th>
                  <th className="px-4 py-3 text-left">Rôle</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left">Invité le</th>
                  <th className="px-4 py-3 text-left">Dernière connexion</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600">{user.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${roleClasses[user.role]}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.invited_at)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.last_login_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingUser(user)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          Modifier
                        </button>
                        {user.active ? (
                          <button onClick={() => deactivate(user)} className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50">
                            Désactiver
                          </button>
                        ) : (
                          <button onClick={() => setEditingUser({ ...user, active: true })} className="px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
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
          onSuccess={(email) => {
            setInviteOpen(false)
            setMessage(`Invitation envoyée à ${email}`)
            loadUsers()
          }}
          onError={setError}
        />
      )}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null)
            setMessage('Utilisateur mis à jour.')
            loadUsers()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function InviteModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void
  onSuccess: (email: string) => void
  onError: (error: string) => void
}) {
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
    if (!res.ok) {
      onError(data.error ?? `HTTP ${res.status}`)
      return
    }
    onSuccess(email)
  }

  return (
    <UserModalFrame title="Inviter un utilisateur" onClose={onClose}>
      <label className="block">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</span>
        <input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom complet</span>
        <input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <RoleSelect value={role} onChange={setRole} />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
        <button onClick={submit} disabled={saving || !email} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Invitation…' : 'Envoyer l’invitation'}
        </button>
      </div>
    </UserModalFrame>
  )
}

function EditModal({
  user,
  onClose,
  onSuccess,
  onError,
}: {
  user: AdminUser
  onClose: () => void
  onSuccess: () => void
  onError: (error: string) => void
}) {
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
    if (!res.ok) {
      onError(data.error ?? `HTTP ${res.status}`)
      return
    }
    onSuccess()
  }

  return (
    <UserModalFrame title={`Modifier ${user.email}`} onClose={onClose}>
      <label className="block">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom complet</span>
        <input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <RoleSelect value={role} onChange={setRole} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        Compte actif
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
        <button onClick={submit} disabled={saving} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </UserModalFrame>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rôle</span>
      <select value={value} onChange={e => onChange(e.target.value as Role)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
        {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select>
    </label>
  )
}

function UserModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-700">Fermer</button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}
