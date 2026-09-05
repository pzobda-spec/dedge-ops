import assert from 'node:assert/strict'
import test from 'node:test'
import type { CRMAccount } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'
import {
  computeCsmDashboard,
  UNMANAGED_OWNER_IDS,
  type CsmDashboardInput,
} from '@/lib/csm/dashboard'

function makeAccount(overrides: Partial<CRMAccount> = {}): CRMAccount {
  return {
    id: 'acc-1',
    name: 'Compte Test',
    parentId: null,
    parentName: null,
    segment: 'Silver',
    mrr: 500,
    country: 'FR',
    plan: ['Enterprise'],
    csm: null,
    csmUserId: null,
    loungeUpClientId: null,
    accountType: 'Client',
    subStartDate: '2027-01-01',
    handoverDate: null,
    hotelCount: null,
    createdTime: '2026-01-01',
    tags: [],
    ...overrides,
  }
}

function makeProject(overrides: Partial<OnboardingProject> = {}): OnboardingProject {
  return {
    id: 'proj-1',
    name: 'Projet Test',
    hotelName: 'Hotel Test',
    product: 'PMS',
    status: 'in_progress',
    statusLabel: 'En cours',
    ownerName: 'Thuy-Tien',
    ownerEmail: null,
    ownerShort: 'TT',
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

function makeDirectory(): CsmDirectoryEntry[] {
  return [
    { csmName: 'Ghislaine', zohoUserId: 'u-ghislaine', aliases: ['Rohaut'] },
    { csmName: 'Laurane', zohoUserId: 'u-laurane', aliases: [] },
  ]
}

function baseInput(overrides: Partial<CsmDashboardInput> = {}): CsmDashboardInput {
  return {
    accounts: [],
    projects: [],
    csmDirectory: makeDirectory(),
    csmNames: ['Ghislaine', 'Laurane'],
    ticketsByAccountName: new Map(),
    ...overrides,
  }
}

test('un compte prospect est ignoré, un compte client est compté', () => {
  const accounts = [
    makeAccount({ id: 'prospect-1', accountType: 'Prospect', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'client-1', accountType: 'Client', csmUserId: 'u-ghislaine' }),
  ]
  const result = computeCsmDashboard(baseInput({ accounts }))
  assert.equal(result.global.accounts, 1)
})

test('MRR, comptes groupe et individuel agrégés correctement, global et par CSM', () => {
  const accounts = [
    makeAccount({ id: 'parent-1', mrr: 1000, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'child-1', parentId: 'parent-1', mrr: 200, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'solo-1', mrr: 300, csmUserId: 'u-laurane' }),
  ]
  const result = computeCsmDashboard(baseInput({ accounts }))
  assert.equal(result.global.mrr, 1500)
  assert.equal(result.global.groupAccounts, 2) // parent + child
  assert.equal(result.global.individualAccounts, 1) // solo

  const ghislaine = result.byCsm.find(row => row.csmName === 'Ghislaine')!
  assert.equal(ghislaine.mrr, 1200)
  assert.equal(ghislaine.groupAccounts, 2)

  const laurane = result.byCsm.find(row => row.csmName === 'Laurane')!
  assert.equal(laurane.mrr, 300)
  assert.equal(laurane.individualAccounts, 1)
})

test('churn : millésimes, tag générique, double millésime, tag sans rapport ignoré', () => {
  const accounts = [
    makeAccount({ id: 'a1', mrr: 100, tags: ['churn25'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', mrr: 200, tags: ['churn26'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a3', mrr: 50, tags: ['churn'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a4', mrr: 300, tags: ['churn25', 'churn26'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a5', mrr: 400, tags: ['vip'], csmUserId: 'u-ghislaine' }),
  ]
  const result = computeCsmDashboard(baseInput({ accounts }))
  assert.equal(result.global.churnByVintage['churn25'], 2) // a1, a4
  assert.equal(result.global.churnByVintage['churn26'], 2) // a2, a4
  assert.equal(result.global.churnByVintage['churn'], 1) // a3
  assert.equal(result.global.churnMrrByVintage['churn25'], 400) // a1 + a4
  assert.equal(result.global.churnMrrByVintage['churn26'], 500) // a2 + a4
  assert.equal(result.global.churnByVintage['vip'], undefined)
})

test('un compte porté par un ancien CSM va dans unmanaged, pas dans byCsm, mais reste dans global', () => {
  const oldOwnerId = UNMANAGED_OWNER_IDS[0]
  const accounts = [
    makeAccount({ id: 'a1', mrr: 100, csm: 'Grégoire Tiers', csmUserId: oldOwnerId }),
  ]
  const result = computeCsmDashboard(baseInput({ accounts }))
  assert.equal(result.global.accounts, 1)
  assert.equal(result.unmanaged.accounts, 1)
  assert.equal(result.unmanaged.mrr, 100)
  assert.deepEqual(result.unmanaged.ownerLabels, ['Grégoire Tiers'])
  for (const row of result.byCsm) {
    assert.equal(row.accounts, 0)
  }
})

test('tickets : correspondance stricte par nom normalisé, un nom partiel ne se rattache pas', () => {
  const accounts = [
    makeAccount({ id: 'a1', name: 'Hotel Paris', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', name: 'Hotel Paris Annexe', csmUserId: 'u-ghislaine' }),
  ]
  const ticketsByAccountName = new Map([['HOTEL PARIS', { open: 3, last6m: 10 }]])
  const result = computeCsmDashboard(baseInput({ accounts, ticketsByAccountName }))
  assert.equal(result.global.openTickets, 3) // seul a1 matché
  assert.equal(result.global.tickets6m, 10)
  assert.equal(result.diagnostics.accountsWithoutTicketMatch, 1) // a2 non matché
})

test('accountHealth trié par tickets ouverts décroissants, exclut les comptes à zéro', () => {
  const accounts = [
    makeAccount({ id: 'a1', name: 'Low', mrr: 500, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', name: 'High', mrr: 100, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a3', name: 'Zero', mrr: 900, csmUserId: 'u-ghislaine' }),
  ]
  const ticketsByAccountName = new Map([
    ['LOW', { open: 2, last6m: 2 }],
    ['HIGH', { open: 5, last6m: 5 }],
    ['ZERO', { open: 0, last6m: 0 }],
  ])
  const result = computeCsmDashboard(baseInput({ accounts, ticketsByAccountName }))
  assert.deepEqual(result.accountHealth.map(row => row.accountName), ['High', 'Low'])
})

test('un CSM du roster sans compte a bien une ligne à zéro', () => {
  const result = computeCsmDashboard(baseInput({ accounts: [] }))
  const laurane = result.byCsm.find(row => row.csmName === 'Laurane')!
  assert.equal(laurane.accounts, 0)
  assert.equal(laurane.mrr, 0)
})
