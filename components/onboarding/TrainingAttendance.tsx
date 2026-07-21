'use client'

import { useEffect, useState } from 'react'
import { GraduationCap, LoaderCircle } from 'lucide-react'
import { useLocale } from '@/lib/i18n/LocaleContext'

type Attendance = { sessions_count: number; participants: Array<{ email: string; name: string; sessions_count: number }>; warning?: string; degraded?: boolean }

export default function TrainingAttendance({ projectId }: { projectId: string }) {
  const { locale, t } = useLocale()
  const [data, setData] = useState<Attendance | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/onboarding/projects/${encodeURIComponent(projectId)}/training-attendance`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? t('Formations indisponibles')); return body })
      .then(setData).catch(value => { if (value instanceof Error && value.name !== 'AbortError') setError(value.message) })
    return () => controller.abort()
  }, [projectId, t])
  return <section className="rounded-xl border border-[#e2e2e2] bg-white p-4 sm:p-6"><div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-[#59319f]" /><h3 className="text-base font-semibold">{t('Formations suivies pendant l’onboarding')}</h3></div>{!data && !error && <p className="mt-3 flex items-center gap-2 text-sm text-[#696969]"><LoaderCircle className="h-4 w-4 animate-spin" />{t('Chargement…')}</p>}{error && <p className="mt-3 text-sm text-red-700">{error}</p>}{data && <><p className="mt-3 text-2xl font-bold">{data.sessions_count}</p><p className="text-xs text-[#696969]">{locale === 'en' ? `session${data.sessions_count !== 1 ? 's' : ''} completed` : `session${data.sessions_count !== 1 ? 's' : ''} passée${data.sessions_count !== 1 ? 's' : ''}`}</p>{data.warning && <p className="mt-2 text-xs text-amber-700">{data.warning}</p>}{data.participants.length > 0 ? <div className="mt-4 divide-y divide-[#eeeeee]">{data.participants.map(participant => <div key={participant.email} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{participant.name || participant.email}</p>{participant.name && <p className="truncate text-xs text-[#696969]">{participant.email}</p>}</div><span className="shrink-0 text-xs font-semibold text-[#59319f]">{participant.sessions_count} session{participant.sessions_count !== 1 ? 's' : ''}</span></div>)}</div> : <p className="mt-4 text-sm text-[#696969]">{t('Aucune participation associée au nom de cet établissement.')}</p>}{data.degraded && <p className="mt-3 text-xs text-amber-700">{t('Données Acuity partielles.')}</p>}</>}</section>
}
