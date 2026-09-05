import assert from 'node:assert/strict'
import test from 'node:test'
import type { CRMAccount } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import type { CsmDirectoryEntry } from '@/lib/onboarding/csmDirectory'
import {
  buildCsmAccountRows,
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

test('prospect et prescriber ignorés, client et former client produisent chacun une ligne', () => {
  const accounts = [
    makeAccount({ id: 'prospect-1', accountType: 'Prospect', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'prescriber-1', accountType: 'Prescriber', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'client-1', accountType: 'Client', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'former-1', accountType: 'Former client', csmUserId: 'u-ghislaine' }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  assert.equal(result.rows.length, 2)
  assert.equal(result.diagnostics.ignoredAccounts, 2)
  assert.ok(result.rows.some(row => row.accountId === 'client-1'))
  assert.ok(result.rows.some(row => row.accountId === 'former-1'))
})

test('non-régression : former client taggé churn26 produit bien une ligne former_client avec le churn', () => {
  const accounts = [
    makeAccount({
      id: 'former-churn',
      name: 'FLORELLA RESIDENCES',
      accountType: 'Former client',
      tags: ['churn26'],
      csmUserId: 'u-ghislaine',
    }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].status, 'former_client')
  assert.deepEqual(result.rows[0].churnVintages, ['churn26'])
})

test('un compte Client taggé churn26 reste status client : churn annoncé, pas constaté', () => {
  const accounts = [
    makeAccount({ id: 'a1', accountType: 'Client', tags: ['churn26'], csmUserId: 'u-ghislaine' }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  assert.equal(result.rows[0].status, 'client')
  assert.deepEqual(result.rows[0].churnVintages, ['churn26'])
})

test('churn : tag générique seul retenu, tag sans rapport ignoré, deux millésimes portés ensemble', () => {
  const accounts = [
    makeAccount({ id: 'a1', tags: ['churn'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', tags: ['vip'], csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a3', tags: ['churn25', 'churn26'], csmUserId: 'u-ghislaine' }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  const a1 = result.rows.find(row => row.accountId === 'a1')!
  const a2 = result.rows.find(row => row.accountId === 'a2')!
  const a3 = result.rows.find(row => row.accountId === 'a3')!
  assert.deepEqual(a1.churnVintages, ['churn'])
  assert.deepEqual(a2.churnVintages, [])
  assert.deepEqual(a3.churnVintages, ['churn25', 'churn26'])
})

test('un compte porté par un ancien CSM a unmanagedOwner vrai et csmName null', () => {
  const oldOwnerId = UNMANAGED_OWNER_IDS[0]
  const accounts = [
    makeAccount({ id: 'a1', csm: 'Grégoire Tiers', csmUserId: oldOwnerId }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  assert.equal(result.rows[0].unmanagedOwner, true)
  assert.equal(result.rows[0].csmName, null)
  assert.equal(result.rows[0].rawCsm, 'Grégoire Tiers')
})

test('tickets : correspondance stricte par nom normalisé, un nom partiel ne se rattache pas', () => {
  const accounts = [
    makeAccount({ id: 'a1', name: 'Hotel Paris', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', name: 'Hotel Paris Annexe', csmUserId: 'u-ghislaine' }),
  ]
  const ticketsByAccountName = new Map([['HOTEL PARIS', { open: 3, last6m: 10 }]])
  const result = buildCsmAccountRows(baseInput({ accounts, ticketsByAccountName }))
  const a1 = result.rows.find(row => row.accountId === 'a1')!
  const a2 = result.rows.find(row => row.accountId === 'a2')!
  assert.equal(a1.openTickets, 3)
  assert.equal(a1.tickets6m, 10)
  assert.equal(a1.ticketMatched, true)
  assert.equal(a2.openTickets, 0)
  assert.equal(a2.tickets6m, 0)
  assert.equal(a2.ticketMatched, false)
  assert.equal(result.diagnostics.accountsWithoutTicketMatch, 1)
})

test('live vrai si au moins un projet du compte est en statut live', () => {
  const accounts = [
    makeAccount({ id: 'a1', name: 'Hotel Live', csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', name: 'Hotel Not Live', csmUserId: 'u-ghislaine' }),
  ]
  const projects = [
    makeProject({ id: 'p1', accountCRMId: 'a1', status: 'live' }),
    makeProject({ id: 'p2', accountCRMId: 'a2', status: 'in_progress' }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts, projects }))
  const a1 = result.rows.find(row => row.accountId === 'a1')!
  const a2 = result.rows.find(row => row.accountId === 'a2')!
  assert.equal(a1.live, true)
  assert.equal(a2.live, false)
})

test('tri par MRR décroissant', () => {
  const accounts = [
    makeAccount({ id: 'a1', name: 'Low', mrr: 100, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a2', name: 'High', mrr: 900, csmUserId: 'u-ghislaine' }),
    makeAccount({ id: 'a3', name: 'Mid', mrr: 500, csmUserId: 'u-ghislaine' }),
  ]
  const result = buildCsmAccountRows(baseInput({ accounts }))
  assert.deepEqual(result.rows.map(row => row.accountName), ['High', 'Mid', 'Low'])
})
