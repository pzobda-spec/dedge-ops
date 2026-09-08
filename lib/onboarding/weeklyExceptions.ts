/**
 * Vue « à traiter cette semaine » : regroupe les dossiers portant au moins une
 * exception métier en UNE ligne par dossier, jamais une ligne par exception.
 * Module pur, aucun accès Supabase, Zoho, Next, réseau ou horloge.
 */

import type { MilestoneDelayRow } from '@/lib/onboarding/milestoneDelay'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { CsmAccountRow } from '@/lib/csm/dashboard'
import type { Availability } from '@/lib/onboarding/capacityModel'
import { effectiveCapacity } from '@/lib/onboarding/capacityModel'
import { isActiveProject } from '@/lib/onboarding/workload'
import { buildZohoProjectUrl } from '@/lib/zoho/projectsClient'

/** Nature du dossier concerné, elle décide du lien d'action. */
export type ExceptionSubjectKind = 'project' | 'account' | 'implementer'

/** Règle ayant fait entrer le dossier dans la liste. */
export type ExceptionRuleKey =
  | 'milestone_overdue'
  | 'started_without_go_live'
  | 'ticket_burst'
  | 'live_without_csm'
  | 'implementer_over_capacity'
  | 'follow_up_due'

export interface ExceptionReason {
  rule: ExceptionRuleKey
  /** Phrase française prête à afficher, chiffrée, compréhensible seule. */
  label: string
  /** Ancienneté du signal en jours, pour trier. `null` si la règle n'en porte pas. */
  ageDays: number | null
  /** Sévérité relative, sert au tri : 3 haute, 2 moyenne, 1 basse. */
  weight: number
}

export interface ExceptionRow {
  subjectKind: ExceptionSubjectKind
  /** Identifiant du dossier : id projet, id compte CRM, ou nom d'implémenteur. */
  subjectId: string
  subjectName: string
  /** Propriétaire à qui l'action revient, `null` si personne n'est identifiable. */
  ownerName: string | null
  /** Lien d'action externe, `null` si aucun n'est constructible. */
  actionUrl: string | null
  /** Toutes les raisons de présence de ce dossier. Jamais vide. */
  reasons: ExceptionReason[]
  /** Somme des poids, sert au tri principal. */
  score: number
  /** Ancienneté maximale parmi les raisons, sert au tri secondaire. */
  oldestAgeDays: number | null
}

export interface WeeklyExceptionsResult {
  rows: ExceptionRow[]
  /** Nombre de DOSSIERS concernés, jamais le nombre de raisons. */
  subjectCount: number
  /** Nombre de raisons, exposé séparément pour ne pas être confondu. */
  reasonCount: number
  /** Décompte par règle, pour l'affichage des filtres. */
  countsByRule: Record<ExceptionRuleKey, number>
  /** Règles NON couvertes aujourd'hui, avec leur motif. À afficher, jamais à taire. */
  uncoveredRules: { rule: string; reason: string }[]
  diagnostics: {
    /**
     * Comptes signalés par un pic de tickets dont le nom Desk ne correspond à
     * aucun compte CRM. Ils restent listés, mais sans lien avec le reste du
     * dossier : à afficher plutôt qu'à taire.
     */
    ticketAccountsUnlinked: number
    /**
     * Entrées Desk écartées parce que leur libellé est une adresse e-mail et
     * non un compte. Mesuré le 7 septembre 2026 : sur 45 entrées Desk portant
     * des tickets récents, 34 sont des adresses, dont des boîtes internes
     * D-EDGE. Les présenter comme des comptes clients en difficulté serait
     * faux, et aucune correspondance de repli ne les rattacherait.
     */
    ticketAccountsIgnoredAsEmail: number
  }
}

/** Contrat partagé entre la route agrégée et la page « À traiter ». */
export interface WeeklyExceptionsResponse extends WeeklyExceptionsResult {
  referenceDate: string
  warnings: string[]
  milestonesTruncated: boolean
}

export interface WeeklyExceptionsInput {
  /** Sortie de `computeMilestoneDelays`, champ `actionable` uniquement. */
  overdueMilestones: readonly MilestoneDelayRow[]
  projects: readonly OnboardingProject[]
  /** Sortie de `buildCsmAccountRows`, champ `rows`. */
  csmAccounts: readonly CsmAccountRow[]
  /** Compteurs de tickets par nom de compte normalisé, sortie de `loadTicketCountsByAccountName`. */
  ticketsByAccountName: ReadonlyMap<string, { open: number; last6m: number }>
  /** Tickets créés sur 7 jours glissants, par nom de compte normalisé. */
  recentTicketsByAccountName: ReadonlyMap<string, number>
  /** Roster OB avec charge courante, issu de `computePlanCharge`. */
  obRoster: readonly {
    name: string
    maxProjects: number
    availability: Availability
    currentActiveProjects?: number
  }[]
  /** Date de référence 'YYYY-MM-DD', injectée pour rester déterministe. */
  referenceDate: string
}

/** Jours écoulés depuis le début d'un projet sans date de mise en ligne. */
export const DAYS_STARTED_WITHOUT_GO_LIVE = 30
/** Tickets créés sur 7 jours glissants à partir desquels un compte est signalé. */
export const TICKET_BURST_THRESHOLD = 3
export const TICKET_BURST_WINDOW_DAYS = 7
/** Fenêtre de relance échue retenue, en jours. Au-delà, c'est de la dette, pas une action de la semaine. */
export const FOLLOW_UP_WINDOW_DAYS = 14

const RULE_KEYS: readonly ExceptionRuleKey[] = [
  'milestone_overdue',
  'started_without_go_live',
  'ticket_burst',
  'live_without_csm',
  'implementer_over_capacity',
  'follow_up_due',
]

/**
 * Clé de rapprochement d'un nom de compte : majuscules, trim, espaces réduits.
 * Doit rester identique à la normalisation utilisée par `lib/csm/ticketHealth.ts`,
 * sinon le rattachement des tickets aux comptes échoue silencieusement.
 */
function normalizeAccountKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Nombre de jours entiers entre deux dates 'YYYY-MM-DD'. */
function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000))
}

function emptyCountsByRule(): Record<ExceptionRuleKey, number> {
  const counts = {} as Record<ExceptionRuleKey, number>
  for (const rule of RULE_KEYS) counts[rule] = 0
  return counts
}

function pluralize(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular
}

class RowBuilder {
  private readonly rowsByKey = new Map<string, ExceptionRow>()

  add(row: {
    subjectKind: ExceptionSubjectKind
    subjectId: string
    subjectName: string
    ownerName: string | null
    actionUrl: string | null
    reason: ExceptionReason
  }): void {
    const key = `${row.subjectKind}:${row.subjectId}`
    const existing = this.rowsByKey.get(key)
    if (existing) {
      existing.reasons.push(row.reason)
      return
    }
    this.rowsByKey.set(key, {
      subjectKind: row.subjectKind,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      ownerName: row.ownerName,
      actionUrl: row.actionUrl,
      reasons: [row.reason],
      score: 0,
      oldestAgeDays: null,
    })
  }

  build(): ExceptionRow[] {
    const rows = Array.from(this.rowsByKey.values())
    for (const row of rows) {
      row.score = row.reasons.reduce((sum, reason) => sum + reason.weight, 0)
      const ages = row.reasons
        .map(reason => reason.ageDays)
        .filter((age): age is number => age !== null)
      row.oldestAgeDays = ages.length > 0 ? Math.max(...ages) : null
    }
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aAge = a.oldestAgeDays ?? -Infinity
      const bAge = b.oldestAgeDays ?? -Infinity
      if (bAge !== aAge) return bAge - aAge
      return a.subjectName.localeCompare(b.subjectName)
    })
    return rows
  }
}

export function computeWeeklyExceptions(input: WeeklyExceptionsInput): WeeklyExceptionsResult {
  const {
    overdueMilestones,
    projects,
    csmAccounts,
    recentTicketsByAccountName,
    obRoster,
    referenceDate,
  } = input

  const builder = new RowBuilder()

  // Règle 1 : milestone_overdue, une ligne par projet.
  const milestonesByProject = new Map<string, MilestoneDelayRow[]>()
  for (const milestone of overdueMilestones) {
    const list = milestonesByProject.get(milestone.projectId) ?? []
    list.push(milestone)
    milestonesByProject.set(milestone.projectId, list)
  }
  for (const [projectId, milestones] of milestonesByProject) {
    const oldest = Math.max(...milestones.map(m => m.delayDays))
    const count = milestones.length
    const label = `${count} ${pluralize(count, 'jalon en retard', 'jalons en retard')}, le plus ancien depuis ${oldest} jours`
    const projectName = milestones[0].projectName
    const ownerName = milestones[0].ownerName
    builder.add({
      subjectKind: 'project',
      subjectId: projectId,
      subjectName: projectName,
      ownerName,
      actionUrl: buildZohoProjectUrl(projectId),
      reason: { rule: 'milestone_overdue', label, ageDays: oldest, weight: 3 },
    })
  }

  // Règle 2 : started_without_go_live.
  for (const project of projects) {
    if (!project.startDate) continue
    if (project.actualGoLiveDate) continue
    if (project.status === 'live' || project.status === 'other') continue
    if (!isActiveProject(project)) continue

    const ageDays = daysBetween(project.startDate, referenceDate)
    if (ageDays <= DAYS_STARTED_WITHOUT_GO_LIVE) continue

    builder.add({
      subjectKind: 'project',
      subjectId: project.id,
      subjectName: project.name,
      ownerName: project.ownerName,
      actionUrl: buildZohoProjectUrl(project.id),
      reason: {
        rule: 'started_without_go_live',
        label: `Démarré depuis ${ageDays} jours, sans date de mise en ligne`,
        ageDays,
        weight: 2,
      },
    })
  }

  // Règle 3 : ticket_burst.
  // Un compte doit produire UNE ligne, quelle que soit la règle qui le signale.
  // Les tickets n'exposent qu'un nom de compte Desk : on le rattache à son id
  // CRM par égalité stricte de nom normalisé, la même règle que partout
  // ailleurs. Sans ce rattachement, un compte cumulant un pic de tickets et
  // l'absence de CSM produirait DEUX lignes et gonflerait le nombre de
  // dossiers, ce que la vue doit précisément éviter.
  const accountsByNormalizedName = new Map<string, CsmAccountRow>()
  for (const account of csmAccounts) {
    accountsByNormalizedName.set(normalizeAccountKey(account.accountName), account)
  }

  let ticketAccountsUnlinked = 0
  let ticketAccountsIgnoredAsEmail = 0

  for (const [accountNameKey, recentCount] of recentTicketsByAccountName) {
    if (recentCount < TICKET_BURST_THRESHOLD) continue

    // Le libellé de compte Desk vaut parfois une adresse e-mail : le ticket n'a
    // alors pas de compte rattaché et Desk retombe sur l'expéditeur. Ce n'est
    // pas un dossier client, et deux de ces adresses sont des boîtes internes.
    // On les écarte en les comptant, plutôt que d'afficher la messagerie d'un
    // collègue comme un compte en difficulté.
    if (accountNameKey.includes('@')) {
      ticketAccountsIgnoredAsEmail += 1
      continue
    }

    const matched = accountsByNormalizedName.get(accountNameKey) ?? null
    if (!matched) ticketAccountsUnlinked += 1
    builder.add({
      subjectKind: 'account',
      subjectId: matched ? matched.accountId : accountNameKey,
      subjectName: matched ? matched.accountName : accountNameKey,
      ownerName: matched?.csmName ?? null,
      actionUrl: null,
      reason: {
        rule: 'ticket_burst',
        label: `${recentCount} ${pluralize(recentCount, 'ticket support', 'tickets support')} en ${TICKET_BURST_WINDOW_DAYS} jours`,
        ageDays: null,
        weight: 3,
      },
    })
  }

  // Règle 4 : live_without_csm.
  for (const account of csmAccounts) {
    if (account.status !== 'client') continue
    if (!account.live) continue
    if (account.csmName !== null) continue

    let label = 'Compte en ligne sans CSM identifié'
    if (account.unmanagedOwner) {
      label += ', porteur à réattribuer'
    }

    builder.add({
      subjectKind: 'account',
      subjectId: account.accountId,
      subjectName: account.accountName,
      ownerName: null,
      actionUrl: null,
      reason: { rule: 'live_without_csm', label, ageDays: null, weight: 2 },
    })
  }

  // Règle 5 : implementer_over_capacity.
  for (const member of obRoster) {
    const currentActiveProjects = member.currentActiveProjects ?? 0
    const capacity = effectiveCapacity(member.maxProjects, member.availability)

    if (capacity === 0) {
      if (currentActiveProjects <= 0) continue
      builder.add({
        subjectKind: 'implementer',
        subjectId: member.name,
        subjectName: member.name,
        ownerName: member.name,
        actionUrl: null,
        reason: {
          rule: 'implementer_over_capacity',
          label: `${currentActiveProjects} projets actifs alors que la capacité est nulle, absent ou arrêté`,
          ageDays: null,
          weight: 3,
        },
      })
      continue
    }

    if (currentActiveProjects <= capacity) continue

    builder.add({
      subjectKind: 'implementer',
      subjectId: member.name,
      subjectName: member.name,
      ownerName: member.name,
      actionUrl: null,
      reason: {
        rule: 'implementer_over_capacity',
        label: `${currentActiveProjects} projets actifs pour un plafond de ${capacity}`,
        ageDays: null,
        weight: 3,
      },
    })
  }

  // Règle 6 : follow_up_due.
  for (const account of csmAccounts) {
    if (account.status !== 'client') continue
    if (!account.nextFollowUpDate) continue

    const ageDays = daysBetween(account.nextFollowUpDate, referenceDate)
    if (ageDays <= 0) continue
    if (ageDays > FOLLOW_UP_WINDOW_DAYS) continue

    builder.add({
      subjectKind: 'account',
      subjectId: account.accountId,
      subjectName: account.accountName,
      ownerName: account.csmName,
      actionUrl: null,
      reason: {
        rule: 'follow_up_due',
        label: `Relance échue depuis ${ageDays} ${pluralize(ageDays, 'jour', 'jours')}`,
        ageDays,
        weight: 2,
      },
    })
  }

  const rows = builder.build()

  const countsByRule = emptyCountsByRule()
  let reasonCount = 0
  for (const row of rows) {
    reasonCount += row.reasons.length
    const rulesSeen = new Set(row.reasons.map(reason => reason.rule))
    for (const rule of rulesSeen) {
      countsByRule[rule] += 1
    }
  }

  const uncoveredRules = [
    {
      rule: 'Jalon dépassant le 75e centile de sa phase',
      reason: 'demande le calcul des centiles par phase, lot 1.5, non livré',
    },
    {
      rule: 'Ticket au-delà du SLA de son urgence',
      reason: "la préqualification d'urgence est en mode observation, lot 1.2",
    },
    {
      rule: 'Ticket rouvert dans les 7 jours',
      reason: "le compteur de réouvertures n'est pas conservé en base",
    },
  ]

  return {
    rows,
    subjectCount: rows.length,
    reasonCount,
    countsByRule,
    uncoveredRules,
    diagnostics: { ticketAccountsUnlinked, ticketAccountsIgnoredAsEmail },
  }
}
