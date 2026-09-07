import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeWeeklyExceptions,
  DAYS_STARTED_WITHOUT_GO_LIVE,
  TICKET_BURST_THRESHOLD,
  type WeeklyExceptionsInput,
} from '@/lib/onboarding/weeklyExceptions'
import type { MilestoneDelayRow } from '@/lib/onboarding/milestoneDelay'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { CsmAccountRow } from '@/lib/csm/dashboard'
import type { Availability } from '@/lib/onboarding/capacityModel'

const REFERENCE_DATE = '2026-09-07'

function makeMilestone(overrides: Partial<MilestoneDelayRow> = {}): MilestoneDelayRow {
  return {
    milestoneId: 'ms-1',
    milestoneName: 'Kickoff & Information Gathering',
    projectId: 'proj-1',
    projectName: 'Hôtel Test',
    ownerName: 'Alice',
    dueDate: '2026-08-01',
    delayDays: 37,
    ...overrides,
  }
}

function makeProject(overrides: Partial<OnboardingProject> = {}): OnboardingProject {
  return {
    id: 'proj-1',
    name: 'Hôtel Test',
    hotelName: 'Hôtel Test',
    product: '',
    status: 'in_progress',
    statusLabel: 'In Progress',
    ownerName: 'Alice',
    ownerEmail: null,
    ownerShort: 'Alice',
    startDate: null,
    endDate: null,
    actualGoLiveDate: null,
    percentComplete: 0,
    riskLevel: null,
    implementationLanguage: null,
    pms: null,
    csmName: null,
    accountCRMId: null,
    accountCRMName: null,
    clientPropertyId: null,
    clientPropertyName: null,
    clientType: null,
    clientId: null,
    clientName: null,
    clientIsGroup: false,
    clientTypology: 'unlinked',
    isOverdue: false,
    isBlocked: false,
    projectUrl: 'https://projects.zoho.eu/portal/loungeup#allprojects/proj-1',
    ...overrides,
  }
}

function makeCsmAccount(overrides: Partial<CsmAccountRow> = {}): CsmAccountRow {
  return {
    accountId: 'acc-1',
    accountName: 'Compte Test',
    csmName: null,
    rawCsm: null,
    unmanagedOwner: false,
    status: 'client',
    mrr: 500,
    tier: 'Silver',
    isGroup: false,
    hotels: 1,
    live: false,
    churnVintages: [],
    openTickets: 0,
    tickets6m: 0,
    ticketMatched: true,
    ...overrides,
  }
}

function makeObMember(overrides: {
  name?: string
  maxProjects?: number
  availability?: Availability
  currentActiveProjects?: number
} = {}) {
  return {
    name: 'Implémenteur Test',
    maxProjects: 50,
    availability: 'full' as Availability,
    currentActiveProjects: 10,
    ...overrides,
  }
}

function baseInput(overrides: Partial<WeeklyExceptionsInput> = {}): WeeklyExceptionsInput {
  return {
    overdueMilestones: [],
    projects: [],
    csmAccounts: [],
    ticketsByAccountName: new Map(),
    recentTicketsByAccountName: new Map(),
    obRoster: [],
    referenceDate: REFERENCE_DATE,
    ...overrides,
  }
}

test('un projet à trois jalons en retard produit une seule ligne', () => {
  const milestones = [
    makeMilestone({ milestoneId: 'ms-1', delayDays: 47 }),
    makeMilestone({ milestoneId: 'ms-2', delayDays: 10 }),
    makeMilestone({ milestoneId: 'ms-3', delayDays: 20 }),
  ]
  const result = computeWeeklyExceptions(baseInput({ overdueMilestones: milestones }))

  assert.equal(result.subjectCount, 1)
  assert.equal(result.reasonCount, 1)
  assert.equal(result.rows.length, 1)
  assert.match(result.rows[0].reasons[0].label, /3 jalons en retard/)
  assert.match(result.rows[0].reasons[0].label, /47 jours/)
})

test('un projet cumulant deux règles produit une ligne à deux raisons et un score cumulé', () => {
  const milestones = [makeMilestone({ delayDays: 15 })]
  const project = makeProject({
    startDate: '2026-06-01', // > 30 jours avant le 2026-09-07
    status: 'in_progress',
    actualGoLiveDate: null,
  })
  const result = computeWeeklyExceptions(
    baseInput({ overdueMilestones: milestones, projects: [project] }),
  )

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].reasons.length, 2)
  assert.equal(result.rows[0].score, 3 + 2)
})

test('countsByRule compte les dossiers, pas les raisons', () => {
  const milestones = [
    makeMilestone({ milestoneId: 'ms-1', projectId: 'proj-1', delayDays: 10 }),
    makeMilestone({ milestoneId: 'ms-2', projectId: 'proj-1', delayDays: 20 }),
    makeMilestone({ milestoneId: 'ms-3', projectId: 'proj-2', projectName: 'Hôtel 2', delayDays: 5 }),
  ]
  const result = computeWeeklyExceptions(baseInput({ overdueMilestones: milestones }))

  assert.equal(result.countsByRule.milestone_overdue, 2)
  assert.equal(result.subjectCount, 2)
  assert.equal(result.reasonCount, 2)
})

test('règle 2 : démarré sans mise en ligne, pause et démarrage récent exclus', () => {
  const started40DaysAgo = makeProject({
    id: 'proj-40',
    startDate: '2026-07-29', // 40 jours avant référence
    status: 'in_progress',
  })
  const blockedProject = makeProject({
    id: 'proj-blocked',
    startDate: '2026-07-01',
    status: 'blocked',
  })
  const started10DaysAgo = makeProject({
    id: 'proj-10',
    startDate: '2026-08-28', // 10 jours avant référence
    status: 'in_progress',
  })

  const result = computeWeeklyExceptions(
    baseInput({ projects: [started40DaysAgo, blockedProject, started10DaysAgo] }),
  )

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].subjectId, 'proj-40')
  assert.ok((result.rows[0].oldestAgeDays ?? 0) > DAYS_STARTED_WITHOUT_GO_LIVE)
})

test('règle 3 : rafale de tickets, seuil à 3', () => {
  const recentTicketsByAccountName = new Map<string, number>([
    ['COMPTE A', TICKET_BURST_THRESHOLD],
    ['COMPTE B', TICKET_BURST_THRESHOLD - 1],
  ])
  const result = computeWeeklyExceptions(baseInput({ recentTicketsByAccountName }))

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].subjectId, 'COMPTE A')
})

test('règle 4 : compte en ligne sans CSM', () => {
  const withoutCsm = makeCsmAccount({ accountId: 'acc-1', live: true, csmName: null, status: 'client' })
  const withCsm = makeCsmAccount({ accountId: 'acc-2', live: true, csmName: 'Bob', status: 'client' })
  const formerClient = makeCsmAccount({ accountId: 'acc-3', live: true, csmName: null, status: 'former_client' })

  const result = computeWeeklyExceptions(
    baseInput({ csmAccounts: [withoutCsm, withCsm, formerClient] }),
  )

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].subjectId, 'acc-1')
})

test('règle 5 : surcharge implémenteur, y compris capacité nulle', () => {
  const overCapacity = makeObMember({ name: 'Alice', maxProjects: 50, availability: 'full', currentActiveProjects: 54 })
  const zeroCapacity = makeObMember({ name: 'Bob', maxProjects: 50, availability: 'stop', currentActiveProjects: 12 })
  const underCapacity = makeObMember({ name: 'Carla', maxProjects: 50, availability: 'full', currentActiveProjects: 10 })

  const result = computeWeeklyExceptions(
    baseInput({ obRoster: [overCapacity, zeroCapacity, underCapacity] }),
  )

  assert.equal(result.rows.length, 2)
  const bobRow = result.rows.find(row => row.subjectId === 'Bob')
  assert.ok(bobRow)
  assert.match(bobRow!.reasons[0].label, /capacité est nulle, absent ou arrêté/)
  const aliceRow = result.rows.find(row => row.subjectId === 'Alice')
  assert.ok(aliceRow)
  assert.match(aliceRow!.reasons[0].label, /54 projets actifs pour un plafond de 50/)
})

test('tri : score décroissant puis ancienneté', () => {
  const milestoneHigh = makeMilestone({ projectId: 'proj-high', projectName: 'Projet Haut', delayDays: 5 })
  const milestoneLow = makeMilestone({ projectId: 'proj-low', projectName: 'Projet Bas', delayDays: 100 })
  const projectOld = makeProject({
    id: 'proj-old',
    startDate: '2026-01-01',
    status: 'in_progress',
  })

  const result = computeWeeklyExceptions(
    baseInput({
      overdueMilestones: [milestoneHigh, milestoneLow],
      projects: [projectOld],
    }),
  )

  // Les deux jalons ont le même score (3), triés par ancienneté décroissante.
  const milestoneRows = result.rows.filter(row => row.reasons[0].rule === 'milestone_overdue')
  assert.equal(milestoneRows[0].subjectId, 'proj-low')
  assert.equal(milestoneRows[1].subjectId, 'proj-high')

  // La règle 2 pèse moins (2) que la règle 1 (3) : elle vient après.
  const rule2Index = result.rows.findIndex(row => row.subjectId === 'proj-old')
  assert.ok(rule2Index > milestoneRows.findIndex(row => row.subjectId === 'proj-high'))
})

test('uncoveredRules contient les quatre règles non couvertes', () => {
  const result = computeWeeklyExceptions(baseInput())
  assert.equal(result.uncoveredRules.length, 4)
  const rules = result.uncoveredRules.map(entry => entry.rule)
  assert.ok(rules.includes('Jalon dépassant le 75e centile de sa phase'))
  assert.ok(rules.includes('Ticket au-delà du SLA de son urgence'))
  assert.ok(rules.includes('Ticket rouvert dans les 7 jours'))
  assert.ok(rules.includes('Compte dont la date de relance est dépassée'))
})

test('entrées vides : aucun plantage, compteurs à zéro', () => {
  const result = computeWeeklyExceptions(baseInput())
  assert.deepEqual(result.rows, [])
  assert.equal(result.subjectCount, 0)
  assert.equal(result.reasonCount, 0)
  assert.equal(result.uncoveredRules.length, 4)
  for (const rule of Object.keys(result.countsByRule)) {
    assert.equal(result.countsByRule[rule as keyof typeof result.countsByRule], 0)
  }
})

test('un compte cumulant pic de tickets et absence de CSM ne produit qu’une seule ligne', () => {
  // Exigence centrale de la vue : on compte des DOSSIERS. Les tickets n'exposent
  // qu'un nom de compte Desk, les comptes CRM un identifiant. Sans
  // rapprochement, le même compte serait compté deux fois.
  const result = computeWeeklyExceptions(
    baseInput({
      csmAccounts: [
        makeCsmAccount({
          accountId: 'acc-1',
          accountName: 'Hotel Beau Rivage',
          status: 'client',
          live: true,
          csmName: null,
        }),
      ],
      recentTicketsByAccountName: new Map([['HOTEL BEAU RIVAGE', 5]]),
    }),
  )

  assert.equal(result.subjectCount, 1)
  assert.equal(result.reasonCount, 2)
  assert.equal(result.rows[0].subjectId, 'acc-1')
  assert.equal(result.rows[0].subjectName, 'Hotel Beau Rivage')
  assert.deepEqual(
    result.rows[0].reasons.map(reason => reason.rule).sort(),
    ['live_without_csm', 'ticket_burst'],
  )
  assert.equal(result.diagnostics.ticketAccountsUnlinked, 0)
})

test('un compte Desk sans correspondance CRM reste listé et compté comme non rattaché', () => {
  const result = computeWeeklyExceptions(
    baseInput({
      csmAccounts: [],
      recentTicketsByAccountName: new Map([['COMPTE DESK INCONNU', 4]]),
    }),
  )

  assert.equal(result.subjectCount, 1)
  assert.equal(result.diagnostics.ticketAccountsUnlinked, 1)
  assert.equal(result.rows[0].subjectId, 'COMPTE DESK INCONNU')
})
