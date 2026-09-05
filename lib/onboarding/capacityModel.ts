/**
 * Modèle de capacité et de barème pour le moteur d'attribution plan de charge OB / CSM.
 * Module pur : aucune dépendance Supabase, Zoho, Next, fs ou réseau.
 */

/** États de disponibilité possibles pour un membre OB ou CSM. */
export type Availability = 'full' | 'relache' | 'absent' | 'stop'

/** Rôles possibles pour un implémenteur OB, déterminant son éligibilité et son plafond par défaut. */
export type ObRole = 'senior' | 'junior' | 'alternant' | 'stagiaire'

/** Tier tarifaire d'un compte, utilisé par le barème de poids. */
export type AccountTier = 'Bronze' | 'Silver' | 'Gold' | 'Key'

/** Valeurs valides de disponibilité. */
export const AVAILABILITY_VALUES: readonly Availability[] = ['full', 'relache', 'absent', 'stop']

/** Valeurs valides de rôle OB. */
export const OB_ROLE_VALUES: readonly ObRole[] = ['senior', 'junior', 'alternant', 'stagiaire']

/** Libellés affichables des états de disponibilité. */
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  full: 'Dispo',
  relache: 'Relâche',
  absent: 'Absent',
  stop: 'STOP',
}

/** Plafond de projets simultanés par défaut, par rôle OB. */
export const ROLE_CAP: Record<ObRole, number> = {
  senior: 50,
  junior: 50,
  alternant: 30,
  stagiaire: 5,
}

/** Facteur de capacité appliqué en état "Relâche". */
export const RELACHE_FACTOR = 0.5

/** Un junior ne prend que les groupes de moins de ce nombre d'hôtels. */
export const JUNIOR_MAX_GROUP_SIZE = 5

/** Capacité mensuelle CSM par défaut, en points. */
export const DEFAULT_CSM_MONTHLY_CAPACITY = 15

/** Garde de type pour une valeur de disponibilité. */
export function isAvailability(value: unknown): value is Availability {
  return typeof value === 'string' && (AVAILABILITY_VALUES as readonly string[]).includes(value)
}

/** Garde de type pour un rôle OB. */
export function isObRole(value: unknown): value is ObRole {
  return typeof value === 'string' && (OB_ROLE_VALUES as readonly string[]).includes(value)
}

/** Facteur multiplicatif de capacité selon l'état de disponibilité. */
export function availabilityFactor(availability: Availability): number {
  switch (availability) {
    case 'full':
      return 1
    case 'relache':
      return RELACHE_FACTOR
    case 'absent':
    case 'stop':
      return 0
  }
}

/** Capacité effective, plafond brut multiplié par le facteur de disponibilité. */
export function effectiveCapacity(capacity: number, availability: Availability): number {
  return Math.max(0, capacity) * availabilityFactor(availability)
}

/** Un membre peut recevoir du travail seulement s'il est Dispo ou en Relâche. */
export function canReceiveWork(availability: Availability): boolean {
  return availability === 'full' || availability === 'relache'
}

/** Forme minimale d'un compte nécessaire au barème et à l'éligibilité. */
export interface AccountShape {
  tier: AccountTier
  isGroup: boolean
  hotels: number
  dmbookOnly: boolean
}

/** Détermine si un compte est un groupe : drapeau explicite ou plus d'un hôtel. */
export function isGroupAccount(input: { isGroup?: boolean; hotels?: number }): boolean {
  return input.isGroup === true || (input.hotels ?? 1) > 1
}

/** Éligibilité d'un rôle OB à un compte donné, portée du prototype. */
export function obEligible(role: ObRole, account: AccountShape): boolean {
  const grp = isGroupAccount(account)
  const size = account.hotels
  switch (role) {
    case 'senior':
      return true
    case 'junior':
      return !grp || size < JUNIOR_MAX_GROUP_SIZE
    case 'alternant':
      return !grp
    case 'stagiaire':
      return !grp
  }
}

/** Une ligne du barème de poids, miroir de la table Supabase `csm_assignment_rules`. */
export interface AssignmentWeightRule {
  tier: string
  customerType: string // 'Individuel' | 'Groupe' | '*'
  dmbookOnly: boolean | null
  points: number
}

/**
 * Miroir exact du seed de la migration 016, utilisé en repli et dans les tests.
 * Note : le tier Bronze a un poids unique quel que soit indiv/groupe (règle '*'),
 * et idem pour Key — c'est volontaire, ça vient du barème métier.
 */
export const DEFAULT_WEIGHT_RULES: readonly AssignmentWeightRule[] = [
  { tier: 'Bronze', customerType: '*', dmbookOnly: true, points: 1 },
  { tier: 'Bronze', customerType: '*', dmbookOnly: false, points: 2 },
  { tier: 'Silver', customerType: 'Individuel', dmbookOnly: false, points: 3 },
  { tier: 'Silver', customerType: 'Groupe', dmbookOnly: false, points: 4 },
  { tier: 'Gold', customerType: 'Individuel', dmbookOnly: false, points: 5 },
  { tier: 'Gold', customerType: 'Groupe', dmbookOnly: false, points: 8 },
  { tier: 'Key', customerType: '*', dmbookOnly: false, points: 10 },
]

/** Convertit un segment CRM (`segmentFromMRR`) vers un tier du barème, insensible à la casse. */
export function tierFromSegment(segment: string): AccountTier {
  switch (segment.toLowerCase()) {
    case 'strategic':
    case 'key':
      return 'Key'
    case 'gold':
      return 'Gold'
    case 'bronze':
      return 'Bronze'
    case 'silver':
    default:
      return 'Silver'
  }
}

/** Détermine le poids d'attribution (barème commun OB/CSM) pour un compte, à partir des règles fournies. */
export function weightForAccount(
  rules: readonly AssignmentWeightRule[],
  account: AccountShape,
): number {
  const tier = account.tier.toLowerCase()

  // Cas 1 : Bronze Dmbook seul, règle dédiée.
  if (account.dmbookOnly === true && tier === 'bronze') {
    const dmbookRule = rules.find(
      rule => rule.tier.toLowerCase() === 'bronze' && rule.dmbookOnly === true,
    )
    if (dmbookRule) return dmbookRule.points
  }

  const customerType = isGroupAccount(account) ? 'Groupe' : 'Individuel'

  // a. tier exact + customerType exact (en ignorant les règles Dmbook, réservées au cas 1).
  const exact = rules.find(
    rule =>
      rule.dmbookOnly !== true &&
      rule.tier.toLowerCase() === tier &&
      rule.customerType.toLowerCase() === customerType.toLowerCase(),
  )
  if (exact) return exact.points

  // b. tier exact + customerType '*'.
  const wildcard = rules.find(
    rule =>
      rule.dmbookOnly !== true &&
      rule.tier.toLowerCase() === tier &&
      rule.customerType === '*',
  )
  if (wildcard) return wildcard.points

  // Repli : Silver Individuel du jeu fourni, sinon 0.
  const fallback = rules.find(
    rule =>
      rule.dmbookOnly !== true &&
      rule.tier.toLowerCase() === 'silver' &&
      rule.customerType.toLowerCase() === 'individuel',
  )
  return fallback ? fallback.points : 0
}
