import type { ZohoMilestone } from '@/lib/zoho/projectsClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'

/**
 * TEMPORAIRE. Les cinq jalons conservés au gabarit (arbitrage B1). Ce filtre
 * existe parce que le nettoyage du gabarit Zoho (arbitrage B2) n'est pas fait :
 * 590 des 1 340 jalons en retard viennent de `Transfert CSM & GP` et
 * `FollowUp & Transfert to CSM`, qui doivent disparaître. Sans ce filtre, la
 * vue « à traiter cette semaine » naîtrait polluée à 44 %.
 * À SUPPRIMER le jour où le gabarit Zoho est propre.
 */
export const RETAINED_MILESTONE_NAMES: readonly string[] = [
  'Kickoff & Information Gathering',
  'Connexion PMS',
  'Content integration',
  'Implementation meeting',
  'Campagnes Auto',
]

/** Plafond d'affichage du retard, en jours. Au-delà, le jalon part en dette. */
export const MILESTONE_DELAY_CAP_DAYS = 90

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/** Normalise un nom de jalon : entités HTML décodées, accents et casse gommés, espaces réduits. */
export function normalizeMilestoneName(name: string): string {
  let decoded = name
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char)
  }

  return decoded
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const RETAINED_MILESTONE_NAMES_NORMALIZED = new Set(
  RETAINED_MILESTONE_NAMES.map(normalizeMilestoneName),
)

export interface MilestoneDelayRow {
  milestoneId: string
  milestoneName: string // forme lisible, entités décodées
  projectId: string
  projectName: string
  ownerName: string | null
  dueDate: string // end_date
  delayDays: number // jours entiers de retard, > 0
}

/**
 * Fenêtre glissante de l'indicateur de tenue de délai, en mois.
 *
 * La tenue de délai est une mesure de PERFORMANCE, pas de dette. Calculée sur
 * tout l'historique, elle donne une médiane de 30 jours que les dossiers de
 * 2023 tirent vers le bas pour toujours, et elle n'informe plus aucune
 * décision. La dette, elle, garde son historique complet : c'est la vue `debt`.
 */
export const TIMELINESS_WINDOW_MONTHS = 12

export interface ClosedLateStats {
  /** Fenêtre retenue, en mois, pour que le chiffre soit lisible sans contexte. */
  windowMonths: number
  /** Jalons clôturés après leur échéance. */
  closedLate: number
  /** Jalons clôturés à l'heure ou en avance. */
  closedOnTime: number
  /** Médiane du retard de clôture, en jours, sur les seuls clôturés en retard. */
  medianDelayDays: number | null
}

export interface MilestoneDelayResult {
  /** À traiter : ouverts, en retard d'au plus le plafond, nom conservé, projet non Live. */
  actionable: MilestoneDelayRow[]
  /** Dette : ouverts, en retard au-delà du plafond. Ils ne disparaissent pas. */
  debt: MilestoneDelayRow[]
  /** Tenue de délai, notion DISTINCTE du retard à traiter. */
  closedLateStats: ClosedLateStats
  diagnostics: {
    openOverdueTotal: number
    excludedByName: number
    excludedByLiveProject: number
    excludedByCap: number
    milestonesWithoutProject: number
    milestonesWithoutDueDate: number
    projectsConcerned: number
  }
}

/** Décode les entités HTML utiles pour restituer une forme lisible du nom. */
function decodeMilestoneName(name: string): string {
  let decoded = name
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char)
  }
  return decoded.replace(/\s+/g, ' ').trim()
}

/** Nombre de jours entiers entre deux dates 'YYYY-MM-DD'. */
function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000))
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function compareRows(a: MilestoneDelayRow, b: MilestoneDelayRow): number {
  if (b.delayDays !== a.delayDays) return b.delayDays - a.delayDays
  return a.projectName.localeCompare(b.projectName)
}

/** Décale une date 'YYYY-MM-DD' d'un nombre de mois, sans dépendance ni horloge. */
function shiftMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const total = year * 12 + (month - 1) + months
  const shiftedYear = Math.floor(total / 12)
  const shiftedMonth = (total % 12 + 12) % 12 + 1
  const lastDay = new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate()
  const safeDay = Math.min(day, lastDay)
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

export function computeMilestoneDelays(input: {
  milestones: readonly ZohoMilestone[]
  projects: readonly OnboardingProject[]
  /** Date de référence 'YYYY-MM-DD', injectée pour rester déterministe. */
  referenceDate: string
}): MilestoneDelayResult {
  const { milestones, projects, referenceDate } = input

  const projectsById = new Map<string, OnboardingProject>()
  for (const project of projects) {
    projectsById.set(project.id, project)
  }

  const actionable: MilestoneDelayRow[] = []
  const debt: MilestoneDelayRow[] = []

  let openOverdueTotal = 0
  let excludedByName = 0
  let excludedByLiveProject = 0
  let excludedByCap = 0
  let milestonesWithoutProject = 0
  let milestonesWithoutDueDate = 0

  // Borne basse de la fenêtre glissante, sur la date de CLÔTURE : on mesure la
  // performance récente, pas l'ancienneté de l'échéance.
  const timelinessFrom = shiftMonths(referenceDate, -TIMELINESS_WINDOW_MONTHS)

  const closedLateDelays: number[] = []
  let closedLate = 0
  let closedOnTime = 0

  for (const milestone of milestones) {
    const project = milestone.projectId ? projectsById.get(milestone.projectId) : undefined

    // Tenue de délai : jalons clôturés portant completedOn et endDate.
    //
    // Les projets Live sont INCLUS, contrairement aux vues de retard à traiter.
    // C'est précisément sur un projet mené jusqu'à la mise en ligne que l'on
    // mesure si les jalons ont été clôturés à l'heure. Les exclure ramenait la
    // mesure à 121 jalons sur 3 416, soit une métrique quasi vide et biaisée
    // vers les seuls dossiers encore ouverts.
    //
    // Notion DISTINCTE du retard à traiter : elle ne partage aucun chiffre
    // avec `actionable` ni `debt`.
    if (milestone.isClosed) {
      if (
        milestone.completedOn &&
        milestone.endDate &&
        project &&
        milestone.completedOn >= timelinessFrom
      ) {
        const delay = daysBetween(milestone.endDate, milestone.completedOn)
        if (delay > 0) {
          closedLate += 1
          closedLateDelays.push(delay)
        } else {
          closedOnTime += 1
        }
      }
      continue
    }

    // À partir d'ici, jalons non clôturés uniquement.
    if (!milestone.endDate) {
      milestonesWithoutDueDate += 1
      continue
    }

    if (milestone.endDate >= referenceDate) {
      // Pas en retard.
      continue
    }

    if (!project) {
      milestonesWithoutProject += 1
      continue
    }

    openOverdueTotal += 1

    const nameRetained = RETAINED_MILESTONE_NAMES_NORMALIZED.has(
      normalizeMilestoneName(milestone.name),
    )
    const isLiveProject = project.status === 'live'
    const delayDays = daysBetween(milestone.endDate, referenceDate)
    const overCap = delayDays > MILESTONE_DELAY_CAP_DAYS

    const row: MilestoneDelayRow = {
      milestoneId: milestone.id,
      milestoneName: decodeMilestoneName(milestone.name),
      projectId: milestone.projectId,
      projectName: milestone.projectName,
      ownerName: milestone.ownerName,
      dueDate: milestone.endDate,
      delayDays,
    }

    // Entonnoir EXCLUSIF : chaque jalon en retard incrémente au plus un
    // compteur d'exclusion, ou entre dans `actionable`. C'est ce qui permet de
    // réconcilier les chiffres :
    //   openOverdueTotal = excludedByLiveProject + excludedByCap
    //                    + excludedByName + actionable.length
    // Sans cette exclusivité, les compteurs se recouvrent, leur somme dépasse
    // le total et aucune vérification n'est possible.

    // 1. Projet Live : ni à traiter, ni en dette. Il n'y a rien à faire sur un
    //    projet déjà mis en ligne.
    if (isLiveProject) {
      excludedByLiveProject += 1
      continue
    }

    // 2. Au-delà du plafond : part en dette, tous noms confondus. Le plafond
    //    est un filtre d'AFFICHAGE, pas de données. Les jalons du gabarit
    //    condamné sont précisément ceux qu'il faudra purger, les filtrer par
    //    nom ici les rendrait invisibles à la seule opération qui les concerne.
    //    Par construction, `debt.length === excludedByCap`.
    if (overCap) {
      debt.push(row)
      excludedByCap += 1
      continue
    }

    // 3. Nom hors gabarit conservé : exclu de `actionable`, mais sous le
    //    plafond, donc absent de la dette.
    if (!nameRetained) {
      excludedByName += 1
      continue
    }

    actionable.push(row)
  }

  actionable.sort(compareRows)
  debt.sort(compareRows)

  const projectsConcerned = new Set(actionable.map((row) => row.projectId)).size

  return {
    actionable,
    debt,
    closedLateStats: {
      windowMonths: TIMELINESS_WINDOW_MONTHS,
      closedLate,
      closedOnTime,
      medianDelayDays: median(closedLateDelays),
    },
    diagnostics: {
      openOverdueTotal,
      excludedByName,
      excludedByLiveProject,
      excludedByCap,
      milestonesWithoutProject,
      milestonesWithoutDueDate,
      projectsConcerned,
    },
  }
}
