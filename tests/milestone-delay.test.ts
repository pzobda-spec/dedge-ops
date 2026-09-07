import assert from 'node:assert/strict'
import test from 'node:test'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import type { ZohoMilestone } from '@/lib/zoho/projectsClient'
import {
  computeMilestoneDelays,
  MILESTONE_DELAY_CAP_DAYS,
  normalizeMilestoneName,
} from '@/lib/onboarding/milestoneDelay'

function makeProject(overrides: Partial<OnboardingProject> = {}): OnboardingProject {
  return {
    id: 'proj-1',
    name: 'Projet test',
    hotelName: 'Hotel test',
    product: 'PMS',
    status: 'in_progress',
    statusLabel: 'En cours',
    ownerName: 'Thuy-Tien',
    ownerEmail: null,
    ownerShort: 'Thuy-Tien',
    startDate: null,
    endDate: null,
    actualGoLiveDate: null,
    percentComplete: 0,
    riskLevel: 'low',
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
    clientTypology: 'individual',
    isOverdue: false,
    isBlocked: false,
    projectUrl: 'https://example.com',
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<ZohoMilestone> = {}): ZohoMilestone {
  return {
    id: 'm-1',
    name: 'Kickoff & Information Gathering',
    projectId: 'proj-1',
    projectName: 'Projet test',
    startDate: null,
    endDate: '2026-08-01',
    completedOn: null,
    isClosed: false,
    ownerName: 'Lan Marol',
    ownerEmail: 'lan@example.com',
    ...overrides,
  }
}

const REFERENCE_DATE = '2026-09-07'

test('normalizeMilestoneName gomme entités HTML, doubles espaces, accents et casse', () => {
  const raw = normalizeMilestoneName('Kickoff &amp;  Information Gathering')
  const readable = normalizeMilestoneName('Kickoff & Information Gathering')
  assert.equal(raw, readable)
  assert.equal(normalizeMilestoneName('Éténé'), 'etene')
})

test('un jalon ouvert en retard, nom conservé, projet non Live, entre dans actionable', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ endDate: '2026-08-28' })], // 10 jours de retard
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 1)
  assert.equal(result.actionable[0].delayDays, 10)
  assert.equal(result.debt.length, 0)
})

test('un jalon clôturé en retard ne va ni dans actionable ni dans debt, compte en closedLate', () => {
  const result = computeMilestoneDelays({
    milestones: [
      makeMilestone({ isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-15' }),
    ],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 0)
  assert.equal(result.closedLateStats.closedLate, 1)
  assert.equal(result.closedLateStats.medianDelayDays, 14)
})

test('un jalon ouvert en retard de 200 jours va dans debt, pas dans actionable', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ endDate: '2026-02-19' })], // ~200 jours
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 1)
  assert.equal(result.diagnostics.excludedByCap, 1)
})

test('un jalon dont le nom n’est pas conservé est exclu d’actionable et figure en debt s’il dépasse le plafond', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ name: 'Transfert CSM & GP', endDate: '2026-02-19' })],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 1)
  // Entonnoir exclusif : au-delà du plafond, le motif retenu est le plafond,
  // qui est aussi la raison de sa présence en dette. Le compter en plus sous
  // `excludedByName` casserait la réconciliation des chiffres.
  assert.equal(result.diagnostics.excludedByCap, 1)
  assert.equal(result.diagnostics.excludedByName, 0)
})

test('les compteurs d’exclusion se réconcilient avec le total des jalons en retard', () => {
  const result = computeMilestoneDelays({
    milestones: [
      // À traiter : nom conservé, sous le plafond, projet non Live.
      makeMilestone({ id: 'm1', name: 'Connexion PMS', endDate: '2026-08-28' }),
      // Dette : au-delà du plafond.
      makeMilestone({ id: 'm2', name: 'Connexion PMS', endDate: '2026-02-19' }),
      // Exclu par le nom, sous le plafond.
      makeMilestone({ id: 'm3', name: 'Transfert CSM & GP', endDate: '2026-08-28' }),
      // Exclu par le projet Live.
      makeMilestone({ id: 'm4', name: 'Connexion PMS', endDate: '2026-08-28', projectId: 'p-live' }),
    ],
    projects: [makeProject(), makeProject({ id: 'p-live', status: 'live' })],
    referenceDate: REFERENCE_DATE,
  })
  const d = result.diagnostics
  assert.equal(
    d.excludedByLiveProject + d.excludedByCap + d.excludedByName + result.actionable.length,
    d.openOverdueTotal,
  )
  assert.equal(result.actionable.length, 1)
  assert.equal(d.excludedByCap, 1)
  assert.equal(d.excludedByName, 1)
  assert.equal(d.excludedByLiveProject, 1)
  assert.equal(d.openOverdueTotal, 4)
})

test('un jalon dont le nom n’est pas conservé et sous le plafond n’apparaît ni en actionable ni en debt', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ name: 'Transfert CSM & GP', endDate: '2026-08-28' })],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 0)
  assert.equal(result.diagnostics.excludedByName, 1)
})

test('un jalon d’un projet Live est exclu et incrémente excludedByLiveProject', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone()],
    projects: [makeProject({ status: 'live' as ProjectStatus })],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 0)
  assert.equal(result.diagnostics.excludedByLiveProject, 1)
})

test('un jalon sans endDate n’est jamais en retard et incrémente milestonesWithoutDueDate', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ endDate: null })],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 0)
  assert.equal(result.diagnostics.milestonesWithoutDueDate, 1)
})

test('un jalon dont le projet est introuvable est exclu et incrémente milestonesWithoutProject', () => {
  const result = computeMilestoneDelays({
    milestones: [makeMilestone({ projectId: 'unknown' })],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 0)
  assert.equal(result.debt.length, 0)
  assert.equal(result.diagnostics.milestonesWithoutProject, 1)
  assert.equal(result.diagnostics.openOverdueTotal, 0)
})

test('closedLateStats.medianDelayDays est une médiane, pair et impair', () => {
  const oddResult = computeMilestoneDelays({
    milestones: [
      makeMilestone({ id: 'm1', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-02' }), // 1
      makeMilestone({ id: 'm2', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-06' }), // 5
      makeMilestone({ id: 'm3', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-11' }), // 10
    ],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(oddResult.closedLateStats.medianDelayDays, 5)

  const evenResult = computeMilestoneDelays({
    milestones: [
      makeMilestone({ id: 'm1', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-02' }), // 1
      makeMilestone({ id: 'm2', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-06' }), // 5
      makeMilestone({ id: 'm3', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-11' }), // 10
      makeMilestone({ id: 'm4', isClosed: true, endDate: '2026-08-01', completedOn: '2026-08-21' }), // 20
    ],
    projects: [makeProject()],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(evenResult.closedLateStats.medianDelayDays, 7.5)
})

test('projectsConcerned compte les projets distincts, pas les jalons', () => {
  const result = computeMilestoneDelays({
    milestones: [
      makeMilestone({ id: 'm1', projectId: 'p1', projectName: 'Projet 1', endDate: '2026-08-28' }),
      makeMilestone({ id: 'm2', projectId: 'p1', projectName: 'Projet 1', name: 'Connexion PMS', endDate: '2026-08-20' }),
      makeMilestone({ id: 'm3', projectId: 'p2', projectName: 'Projet 2', endDate: '2026-08-28' }),
    ],
    projects: [
      makeProject({ id: 'p1', name: 'Projet 1' }),
      makeProject({ id: 'p2', name: 'Projet 2' }),
    ],
    referenceDate: REFERENCE_DATE,
  })
  assert.equal(result.actionable.length, 3)
  assert.equal(result.diagnostics.projectsConcerned, 2)
})

test('MILESTONE_DELAY_CAP_DAYS vaut 90 jours', () => {
  assert.equal(MILESTONE_DELAY_CAP_DAYS, 90)
})
