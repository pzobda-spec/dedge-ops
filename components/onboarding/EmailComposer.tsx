'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, MailCheck, X } from 'lucide-react'
import {
  getEmailTemplate,
  interpolateTemplate,
  type EmailTemplateKey,
} from '@/lib/onboarding/email-templates'
import type { OnboardingProjectDetail } from '@/lib/onboarding/projects'
import { useLocale } from '@/lib/i18n/LocaleContext'

interface UserSettings {
  acuity_link_15min?: string | null
  acuity_link_30min?: string | null
  acuity_link_60min?: string | null
  default_language?: 'fr' | 'en'
  signature?: string | null
  user_email?: string | null
}

interface EmailComposerProps {
  project: OnboardingProjectDetail
  templateKey: EmailTemplateKey
  onClose: () => void
  onLogged?: () => void
}

const templateNames: Record<EmailTemplateKey, string> = {
  email_launch: 'Email de lancement',
  email_content_request: 'Email préparation contenu',
  email_backoffice: 'Email accès back-office',
  email_followup_1: 'Relance niveau 1',
  email_followup_2: 'Relance niveau 2',
}

function firstNameFromEmail(email?: string | null): string {
  const local = email?.split('@')[0] ?? ''
  const first = local.split(/[._-]/)[0] ?? ''
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : ''
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function EmailComposer({ project, templateKey, onClose, onLogged }: EmailComposerProps) {
  const { t } = useLocale()
  const [settings, setSettings] = useState<UserSettings>({})
  const [language, setLanguage] = useState<'fr' | 'en'>('fr')
  const [vars, setVars] = useState<Record<string, string>>({
    prenom_client: '',
    hotel: project.hotel_name ?? '',
    prenom_onboarder: firstNameFromEmail(project.owner_email),
    date_rdv: '',
    date_butoir: todayDate(),
    livrable_precis: '',
    acuity_link_15min: '',
    acuity_link_30min: '',
    acuity_link_60min: '',
    drive_link: '',
  })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    fetch('/api/settings/me', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        const loaded = data.settings ?? {}
        setSettings(loaded)
        const defaultLanguage = loaded.default_language === 'en' ? 'en' : 'fr'
        setLanguage(defaultLanguage)
        setVars(prev => ({
          ...prev,
          prenom_onboarder: firstNameFromEmail(loaded.user_email) || prev.prenom_onboarder,
          acuity_link_15min: loaded.acuity_link_15min ?? '',
          acuity_link_30min: loaded.acuity_link_30min ?? '',
          acuity_link_60min: loaded.acuity_link_60min ?? '',
        }))
      })
      .catch(() => undefined)
  }, [])

  const template = useMemo(() => getEmailTemplate(templateKey, language), [templateKey, language])

  useEffect(() => {
    const interpolated = interpolateTemplate(template, vars)
    setSubject(interpolated.subject)
    const signature = settings.signature?.trim()
    setBody(signature ? `${interpolated.body}\n\n${signature}` : interpolated.body)
  }, [template, vars, settings.signature])

  function updateVar(key: string, value: string) {
    setVars(prev => ({ ...prev, [key]: value }))
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`)
    setMessage(t('Email copié.'))
  }

  function openGmail() {
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  }

  async function markSent() {
    setLogging(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding/projects/${encodeURIComponent(project.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: template.event_type,
          metadata: {
            template_key: template.key,
            subject,
            body_length: body.length,
            language,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      onLogged?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Impossible de logger l’email.'))
    } finally {
      setLogging(false)
    }
  }

  const needsDrive = templateKey === 'email_content_request'
  const needsFollowup = templateKey === 'email_followup_1' || templateKey === 'email_followup_2'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t(templateNames[templateKey])}</h3>
            <p className="text-sm text-slate-500 mt-1">{project.hotel_name ?? t('Projet onboarding')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label={t('Fermer')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Langue de l’email')}</span>
              <select value={language} onChange={e => setLanguage(e.target.value === 'en' ? 'en' : 'fr')} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="fr">FR</option>
                <option value="en">EN</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Prénom client')}</span>
              <input value={vars.prenom_client} onChange={e => updateVar('prenom_client', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Prénom onboarder')}</span>
              <input value={vars.prenom_onboarder} onChange={e => updateVar('prenom_onboarder', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Date du RDV')}</span>
              <input value={vars.date_rdv} onChange={e => updateVar('date_rdv', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="12/06/2026" />
            </label>
            {needsDrive && (
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Lien Drive')}</span>
                <input value={vars.drive_link} onChange={e => updateVar('drive_link', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            )}
            {needsFollowup && (
              <>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Livrable précis')}</span>
                  <input value={vars.livrable_precis} onChange={e => updateVar('livrable_precis', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Date butoir')}</span>
                  <input type="date" value={vars.date_butoir} onChange={e => updateVar('date_butoir', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</span>
            <textarea value={subject} onChange={e => setSubject(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Body</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={13} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </label>

          {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={copyEmail} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" />
              {t('Copier')}
            </button>
            <button onClick={openGmail} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" />
              {t('Ouvrir dans Gmail')}
            </button>
            <button onClick={markSent} disabled={logging} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
              <MailCheck className="h-4 w-4" />
              {logging ? 'Logging…' : t('Marquer comme envoyé')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
