// Normalisation commune. Règles de regroupement produit existantes, inchangées.
export function normalizeStatus(status: string | null | undefined): string {
  const normalized = normalizeText(status ?? '')
  if (['closed', 'ferme', 'fermee'].includes(normalized)) return 'Closed'
  if (['solved', 'resolved', 'resolu', 'resolue'].includes(normalized)) return 'Resolved'
  if (['pending', 'managed', 'on hold', 'onhold', 'stuck client', 'waiting'].includes(normalized)) return 'Pending'
  return 'Open'
}

export function normalizePriority(priority: string | null | undefined): string | null {
  const normalized = normalizeText(priority ?? '')
  if (!normalized) return null
  if (/^p[1-4]$/.test(normalized)) return normalized.toUpperCase()
  if (normalized === 'urgent') return 'Urgent'
  if (['high', 'haute', 'elevee'].includes(normalized)) return 'High'
  if (['medium', 'moyenne', 'normal'].includes(normalized)) return 'Medium'
  if (['low', 'basse', 'faible'].includes(normalized)) return 'Low'
  return priority?.trim() || null
}

export function normalizeCategory(classification: string): string {
  const normalized = normalizeText(classification).replace(/[-_]/g, ' ')
  if (normalized === 'question') return 'Question'
  if (['problem', 'probleme', 'incident', 'bug'].includes(normalized)) return 'Problem'
  if (['task', 'tache', 'demande'].includes(normalized)) return 'Task'
  if (['feature request', 'feature', 'suggestion', 'amelioration'].includes(normalized)) return 'Feature Request'
  return 'Non classé'
}

export function normalizeProduct(product: string, subject: string): string {
  const normalized = normalizeText(product).replace(/[-_]/g, ' ')
  const normalizedSubject = normalizeText(subject).replace(/[-_]/g, ' ')
  const searchable = `${normalized} ${normalizedSubject}`

  if (/^csm$/.test(normalized)) return 'CSM'
  if (/\b(dns|spf|dkim|dmarc)\b/.test(searchable)) return 'Newsletters'
  if (normalized === 'email delivery' || /mailinblack/.test(normalizedSubject)) return 'Autre'
  if (/whats\s*app/.test(normalized)) return 'WhatsApp'
  if (/loyalty program|programme de fidelite|\bloyalty\b/.test(normalized)) return 'Loyalty Program'
  if (/dmbook/.test(normalized)) return 'Dmbook Pro'
  if (/hub de messagerie|messaging hub|^hub$/.test(normalized)) return 'Hub de messagerie'
  if (/newsletter/.test(normalized)) return 'Newsletters'
  if (/campaign|campagne/.test(normalized)) return 'Campaigns'

  const csvImportOrExport = /\b(import|export)\b.*\bcsv\b|\bcsv\b.*\b(import|export)\b/.test(searchable)
  if (
    /guest profile|profil (client|invite)|customer profile/.test(normalized)
    || /\bsegment(ation|s)?\b/.test(searchable)
    || csvImportOrExport
  ) return 'Guest Profile'
  if (/\bpms\b|integration|interface|connecteur|synchronis/.test(normalized)) return 'PMS'
  if (/guest app|application|check ?in|commande|kiosque|wifi|statistiques app|\bpages?\b|formulaire|\bforms?\b/.test(normalized)) return 'Guest App'
  if (/crm|administrateur|admin|\b2fa\b/.test(normalized)) return 'CRM Core'
  return 'Autre'
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Même approximation sur Desk et Analytics ; une absence de compteur n’est pas zéro.
export function estimateFirstContactResolution(reopens: unknown, threads: unknown): boolean | null {
  const count = (v: unknown) => v == null || String(v).trim() === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null
  const reopenCount = count(reopens), threadCount = count(threads)
  return reopenCount !== null ? reopenCount === 0 : threadCount !== null ? threadCount <= 2 : null
}
