/**
 * Moteur d'attribution et de projection de charge, OB (implémenteurs) et CSM.
 * Module pur : aucune dépendance Supabase, Zoho, Next, fs ou réseau, hormis
 * `import type` vers `capacityModel`.
 *
 * Priorité générale d'attribution CSM : override manuel > continuité de
 * groupe > répartition auto (greedy sur la capacité restante). Côté OB,
 * seul override manuel > répartition auto (pas de notion de continuité).
 *
 * Deux écarts assumés vis-à-vis du prototype de référence :
 * 1. Éligibilité OB : le prototype n'excluait que les membres `absent`. La
 *    spec §4.6 exige d'exclure aussi les membres `stop` ; c'est ce que fait
 *    `canReceiveWork`.
 * 2. Projection OB : le prototype comptait la charge dès que
 *    `goLiveMonth >= mois`, ce qui inclut des mois antérieurs à la
 *    signature. La spec §4.7 précise qu'un compte consomme un slot projet OB
 *    "de la signature jusqu'au go-live" ; on borne donc la fenêtre à
 *    `[moisSignature, moisGoLive]` inclus.
 */

import type {
  AccountShape,
  AccountTier,
  Availability,
  AssignmentWeightRule,
  ObRole,
} from '@/lib/onboarding/capacityModel'
import {
  canReceiveWork,
  DEFAULT_WEIGHT_RULES,
  effectiveCapacity,
  obEligible,
  weightForAccount,
} from '@/lib/onboarding/capacityModel'

/** Mode d'équilibrage de la répartition greedy. */
export type BalanceMode = 'absolute' | 'utilization'

/** Origine de l'attribution OB retenue pour un compte. */
export type ObAssignmentSource = 'override' | 'auto'

/** Origine de l'attribution CSM retenue pour un compte. */
export type CsmAssignmentSource = 'override' | 'continuity' | 'auto'

/** Membre du roster OB (implémenteurs). */
export interface ObMember {
  name: string
  role: ObRole
  maxProjects: number
  availability: Availability
}

/** Membre du roster CSM. */
export interface CsmMember {
  name: string
  monthlyCapacityPoints: number
  availability: Availability
  /** Points déjà attribués sur le mois courant, point de départ de la projection. */
  currentMonthBasePoints?: number
}

/** Un compte du pipeline de signatures à attribuer. */
export interface PipelineAccount {
  id: string
  name: string
  groupId: string | null
  tier: AccountTier
  isGroup: boolean
  hotels: number
  dmbookOnly: boolean
  signedDate: string // 'YYYY-MM-DD'
  expectedGoLiveMonth: string // 'YYYY-MM'
  obOverride?: string | null
  csmOverride?: string | null
}

/** Entrée du moteur d'attribution. */
export interface AssignmentEngineInput {
  pipeline: readonly PipelineAccount[]
  obRoster: readonly ObMember[]
  csmRoster: readonly CsmMember[]
  /** groupId -> nom du CSM qui suit déjà le groupe. */
  groupContinuity?: Readonly<Record<string, string>>
  /** Barème, typiquement lu depuis csm_assignment_rules. Défaut : DEFAULT_WEIGHT_RULES. */
  weightRules?: readonly AssignmentWeightRule[]
  /** Horizon de projection, 'YYYY-MM' triés. */
  months: readonly string[]
  /** Mois courant 'YYYY-MM', reçoit les currentMonthBasePoints. */
  currentMonth: string
  /** Défaut 'absolute' : capacité restante en valeur absolue, comme le prototype. */
  balanceMode?: BalanceMode
}

/** Résultat d'attribution pour un compte du pipeline. */
export interface AccountAssignment {
  accountId: string
  accountName: string
  weight: number
  hotels: number
  goLiveMonth: string
  obOwner: string | null
  obSource: ObAssignmentSource | null
  obEligibleCount: number
  csmName: string | null
  csmSource: CsmAssignmentSource | null
  csmEligibleCount: number
}

/** Dépassement de capacité détecté sur un mois donné. */
export interface CapacityOverload {
  name: string
  month: string
  load: number
  capacity: number
}

/** Résultat complet du moteur d'attribution. */
export interface AssignmentEngineResult {
  months: string[]
  assignments: AccountAssignment[]
  /** Stock cumulé de projets simultanés par implémenteur (état du greedy). */
  obLoad: Record<string, number>
  /** obLoadByMonth[owner][month] = projets simultanés ce mois-là. */
  obLoadByMonth: Record<string, Record<string, number>>
  /** csmLoadByMonth[csm][month] = points de reprise ce mois-là. */
  csmLoadByMonth: Record<string, Record<string, number>>
  obOverloads: CapacityOverload[]
  csmOverloads: CapacityOverload[]
  /** Ids des comptes sans OB ou sans CSM attribuable. */
  unassigned: string[]
}

/** Renvoie l'union triée croissante (lexicographique) de deux listes de mois, dédupliquée. */
function unionMonths(a: readonly string[], b: readonly string[]): string[] {
  return Array.from(new Set([...a, ...b])).sort()
}

/** Capacité restante (mode absolute) ou taux d'utilisation (mode utilization) d'un candidat. */
function candidateScore(
  mode: BalanceMode,
  capacity: number,
  currentLoad: number,
): number | null {
  if (mode === 'utilization') {
    if (capacity <= 0) return null
    return currentLoad / capacity
  }
  // absolute
  return capacity - currentLoad
}

export function runAssignmentEngine(input: AssignmentEngineInput): AssignmentEngineResult {
  const weightRules = input.weightRules ?? DEFAULT_WEIGHT_RULES
  const balanceMode: BalanceMode = input.balanceMode ?? 'absolute'

  // Le mois courant fait toujours partie de l'horizon : il porte les points déjà
  // attribués (currentMonthBasePoints), qui seraient sinon silencieusement perdus.
  const months = unionMonths(
    [...input.months, input.currentMonth],
    input.pipeline.map(account => account.expectedGoLiveMonth),
  )

  // Initialisation des charges.
  const obLoad: Record<string, number> = {}
  for (const member of input.obRoster) {
    obLoad[member.name] = 0
  }

  const csmLoadByMonth: Record<string, Record<string, number>> = {}
  for (const csm of input.csmRoster) {
    csmLoadByMonth[csm.name] = {}
    for (const month of months) {
      csmLoadByMonth[csm.name][month] = 0
    }
    csmLoadByMonth[csm.name][input.currentMonth] += csm.currentMonthBasePoints ?? 0
  }

  // Ordre de traitement, sans muter le pipeline d'entrée.
  const ordered = [...input.pipeline].sort((a, b) => {
    if (a.expectedGoLiveMonth !== b.expectedGoLiveMonth) {
      return a.expectedGoLiveMonth < b.expectedGoLiveMonth ? -1 : 1
    }
    if (a.signedDate !== b.signedDate) {
      return a.signedDate < b.signedDate ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const assignments: AccountAssignment[] = []
  const unassignedSet = new Set<string>()

  for (const account of ordered) {
    const shape: AccountShape = {
      tier: account.tier,
      isGroup: account.isGroup,
      hotels: account.hotels,
      dmbookOnly: account.dmbookOnly,
    }
    const weight = weightForAccount(weightRules, shape)

    // --- Attribution OB ---
    const obEligibles = input.obRoster.filter(
      member => obEligible(member.role, shape) && canReceiveWork(member.availability),
    )
    const obEligibleCount = obEligibles.length

    let obOwner: string | null = null
    let obSource: ObAssignmentSource | null = null

    if (account.obOverride && input.obRoster.some(member => member.name === account.obOverride)) {
      obOwner = account.obOverride
      obSource = 'override'
    } else {
      let bestScore: number | null = null
      for (const member of obEligibles) {
        const capacity = effectiveCapacity(member.maxProjects, member.availability)
        const score = candidateScore(balanceMode, capacity, obLoad[member.name])
        if (score === null) continue
        const better = balanceMode === 'utilization' ? score < (bestScore ?? Infinity) : score > (bestScore ?? -Infinity)
        if (obOwner === null || better) {
          bestScore = score
          obOwner = member.name
        }
      }
      if (obOwner !== null) obSource = 'auto'
    }

    if (obOwner !== null) {
      obLoad[obOwner] = (obLoad[obOwner] ?? 0) + account.hotels
    }

    // --- Attribution CSM ---
    const csmEligibles = input.csmRoster.filter(
      csm => canReceiveWork(csm.availability) && effectiveCapacity(csm.monthlyCapacityPoints, csm.availability) > 0,
    )
    const csmEligibleCount = csmEligibles.length

    let csmName: string | null = null
    let csmSource: CsmAssignmentSource | null = null
    const goLiveMonth = account.expectedGoLiveMonth

    // Continuité de groupe : le CSM qui suit déjà le groupe est imposé, même
    // s'il est indisponible ou déjà au-dessus de son plafond (spec §4.5).
    const continuityCsm = account.groupId ? input.groupContinuity?.[account.groupId] ?? null : null
    const continuityIsKnown =
      continuityCsm !== null && input.csmRoster.some(csm => csm.name === continuityCsm)

    if (account.csmOverride && input.csmRoster.some(csm => csm.name === account.csmOverride)) {
      csmName = account.csmOverride
      csmSource = 'override'
    } else if (continuityIsKnown) {
      csmName = continuityCsm
      csmSource = 'continuity'
    } else {
      let bestScore: number | null = null
      for (const csm of csmEligibles) {
        const capacity = effectiveCapacity(csm.monthlyCapacityPoints, csm.availability)
        const currentLoad = csmLoadByMonth[csm.name]?.[goLiveMonth] ?? 0
        const score = candidateScore(balanceMode, capacity, currentLoad)
        if (score === null) continue
        const better = balanceMode === 'utilization' ? score < (bestScore ?? Infinity) : score > (bestScore ?? -Infinity)
        if (csmName === null || better) {
          bestScore = score
          csmName = csm.name
        }
      }
      if (csmName !== null) csmSource = 'auto'
    }

    if (csmName !== null) {
      if (!csmLoadByMonth[csmName]) csmLoadByMonth[csmName] = {}
      if (csmLoadByMonth[csmName][goLiveMonth] === undefined) csmLoadByMonth[csmName][goLiveMonth] = 0
      csmLoadByMonth[csmName][goLiveMonth] += weight
    }

    if (obOwner === null || csmName === null) {
      unassignedSet.add(account.id)
    }

    assignments.push({
      accountId: account.id,
      accountName: account.name,
      weight,
      hotels: account.hotels,
      goLiveMonth,
      obOwner,
      obSource,
      obEligibleCount,
      csmName,
      csmSource,
      csmEligibleCount,
    })
  }

  // --- Projection OB : charge simultanée par owner et par mois, de la signature au go-live inclus. ---
  const obLoadByMonth: Record<string, Record<string, number>> = {}
  for (const member of input.obRoster) {
    obLoadByMonth[member.name] = {}
    for (const month of months) {
      obLoadByMonth[member.name][month] = 0
    }
  }
  ordered.forEach((account, index) => {
    const owner = assignments[index].obOwner
    if (owner === null) return
    const signedMonth = account.signedDate.slice(0, 7)
    const goLiveMonth = account.expectedGoLiveMonth
    if (!obLoadByMonth[owner]) {
      obLoadByMonth[owner] = {}
      for (const month of months) obLoadByMonth[owner][month] = 0
    }
    for (const month of months) {
      if (month >= signedMonth && month <= goLiveMonth) {
        obLoadByMonth[owner][month] += account.hotels
      }
    }
  })

  // --- Dépassements OB ---
  // Une capacité effective nulle (membre absent ou en stop) qui porte tout de
  // même de la charge, via un override ou la continuité de groupe, doit
  // apparaître en surcharge (spec §4.5) : d'où la condition `load > 0`.
  const obOverloads: CapacityOverload[] = []
  for (const member of input.obRoster) {
    const capacity = effectiveCapacity(member.maxProjects, member.availability)
    for (const month of months) {
      const load = obLoadByMonth[member.name]?.[month] ?? 0
      if (load > 0 && load > capacity) {
        obOverloads.push({ name: member.name, month, load, capacity })
      }
    }
  }

  // --- Dépassements CSM ---
  const csmOverloads: CapacityOverload[] = []
  for (const csm of input.csmRoster) {
    const capacity = effectiveCapacity(csm.monthlyCapacityPoints, csm.availability)
    for (const month of months) {
      const load = csmLoadByMonth[csm.name]?.[month] ?? 0
      if (load > 0 && load > capacity) {
        csmOverloads.push({ name: csm.name, month, load, capacity })
      }
    }
  }

  return {
    months,
    assignments,
    obLoad,
    obLoadByMonth,
    csmLoadByMonth,
    obOverloads,
    csmOverloads,
    unassigned: Array.from(unassignedSet),
  }
}
