export const COMMERCIAL_PLANS = ['communication', 'engagement', 'insight', 'enterprise'] as const
export type CommercialPlan = typeof COMMERCIAL_PLANS[number]

export const PRODUCT_KEYS = ['campaigns', 'app', 'guest_profile'] as const
export const OPTION_KEYS = ['membership_lite', 'whatsapp', 'loyalty_program'] as const
export type ProjectProductKey = typeof PRODUCT_KEYS[number] | typeof OPTION_KEYS[number]

export const PRODUCT_STATUSES = ['not_started', 'in_progress', 'pending_client', 'blocked', 'live', 'cancelled'] as const
export type ProjectProductStatus = typeof PRODUCT_STATUSES[number]

export const IMPLEMENTATION_PHASES = [
  'waiting_resources',
  'ready_to_start',
  'kickoff',
  'configuration',
  'v1_review',
  'iteration_1',
  'iteration_2',
  'final_validation',
  'live',
  'performance_review',
] as const
export type ImplementationPhase = typeof IMPLEMENTATION_PHASES[number]

export const RESOURCE_STATUSES = ['not_received', 'partial', 'received', 'validated', 'not_applicable'] as const
export type ResourceStatus = typeof RESOURCE_STATUSES[number]

export interface ResourceTemplate {
  key: string
  label: string
  category: 'content' | 'brand' | 'pms' | 'option'
  required: boolean
}

const COMMON_RESOURCES: readonly ResourceTemplate[] = [
  { key: 'room_directory', label: 'Room directory / welcome book', category: 'content', required: true },
  { key: 'brand_kit', label: 'Kit de marque, logo, couleurs et police', category: 'brand', required: true },
  { key: 'prestay_services', label: 'Services pre-stay, conditions et tarifs', category: 'content', required: true },
  { key: 'photos_documents', label: 'Photos et documents utiles', category: 'content', required: true },
  { key: 'pms_information', label: 'Informations et accès PMS', category: 'pms', required: true },
]

const APP_RESOURCES: readonly ResourceTemplate[] = [
  { key: 'app_content', label: 'Contenus Guest App', category: 'content', required: true },
  { key: 'hotel_practical_info', label: 'Informations pratiques, menus et horaires', category: 'content', required: true },
]

const WHATSAPP_RESOURCES: readonly ResourceTemplate[] = [
  { key: 'whatsapp_meta', label: 'Compte Meta Business et accès', category: 'option', required: true },
  { key: 'whatsapp_number', label: 'Numéro fixe et configuration SVI', category: 'option', required: true },
]

const LOYALTY_RESOURCES: readonly ResourceTemplate[] = [
  { key: 'loyalty_brand', label: 'Identité et visuels Loyalty', category: 'option', required: true },
  { key: 'loyalty_tiers', label: 'Niveaux, critères et avantages', category: 'option', required: true },
  { key: 'loyalty_rules', label: 'Règles, Booking Engine et codes tarifaires', category: 'option', required: true },
]

export const PLAN_DURATION_WEEKS: Record<CommercialPlan, { min: number; max: number }> = {
  communication: { min: 3, max: 4 },
  engagement: { min: 4, max: 6 },
  insight: { min: 3, max: 4 },
  enterprise: { min: 4, max: 6 },
}

export const PRODUCTS_BY_PLAN: Record<CommercialPlan, readonly ProjectProductKey[]> = {
  communication: ['campaigns'],
  engagement: ['campaigns', 'app'],
  insight: ['campaigns', 'guest_profile'],
  enterprise: ['campaigns', 'app', 'guest_profile'],
}

export function isCommercialPlan(value: unknown): value is CommercialPlan {
  return typeof value === 'string' && COMMERCIAL_PLANS.includes(value as CommercialPlan)
}

export function isProjectProductKey(value: unknown): value is ProjectProductKey {
  return typeof value === 'string' && [...PRODUCT_KEYS, ...OPTION_KEYS].includes(value as ProjectProductKey)
}

export function isProjectProductStatus(value: unknown): value is ProjectProductStatus {
  return typeof value === 'string' && PRODUCT_STATUSES.includes(value as ProjectProductStatus)
}

export function isImplementationPhase(value: unknown): value is ImplementationPhase {
  return typeof value === 'string' && IMPLEMENTATION_PHASES.includes(value as ImplementationPhase)
}

export function isResourceStatus(value: unknown): value is ResourceStatus {
  return typeof value === 'string' && RESOURCE_STATUSES.includes(value as ResourceStatus)
}

export function enabledProductKeys(plan: CommercialPlan | null, options: Record<string, boolean>): ProjectProductKey[] {
  const base = plan ? PRODUCTS_BY_PLAN[plan] : []
  return [...base, ...OPTION_KEYS.filter(key => options[key] === true)]
}

export function resourceTemplates(plan: CommercialPlan | null, options: Record<string, boolean>): ResourceTemplate[] {
  const templates: ResourceTemplate[] = [...COMMON_RESOURCES]
  if (plan === 'engagement' || plan === 'enterprise') templates.push(...APP_RESOURCES)
  if (options.whatsapp === true) templates.push(...WHATSAPP_RESOURCES)
  if (options.loyalty_program === true) templates.push(...LOYALTY_RESOURCES)
  return templates
}

export function implementationDurationWeeks(plan: CommercialPlan | null): number {
  return plan ? PLAN_DURATION_WEEKS[plan].max : 4
}
