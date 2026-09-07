import assert from 'node:assert/strict'
import test from 'node:test'
import type { OnboardingProject, ProjectStatus } from '@/lib/zoho/projectsClient'
import {
  countActiveProjectsByOwner,
  isActiveProject,
  isOpenProject,
  isPausedProject,
} from '@/lib/onboarding/workload'

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

const PAUSED: ProjectStatus[] = ['blocked', 'pending_client', 'standby']
const CLOSED: ProjectStatus[] = ['live', 'other']
const WORKED: ProjectStatus[] = ['in_progress', 'not_started']

test('un dossier en pause ne pèse plus sur la charge', () => {
  // Régression : blocked, pending_client et standby comptaient dans la charge
  // des implémenteurs et dans le plafond du moteur, alors que personne ne les
  // traite. Mesuré sur 46 projets du portail au 6 septembre 2026.
  for (const status of PAUSED) {
    assert.equal(isActiveProject(makeProject({ status })), false, status)
    assert.equal(isPausedProject(makeProject({ status })), true, status)
  }
})

test('un dossier terminé ou hors périmètre ne pèse pas sur la charge', () => {
  for (const status of CLOSED) {
    assert.equal(isActiveProject(makeProject({ status })), false, status)
    assert.equal(isPausedProject(makeProject({ status })), false, status)
  }
})

test('un dossier réellement en cours pèse sur la charge', () => {
  for (const status of WORKED) {
    assert.equal(isActiveProject(makeProject({ status })), true, status)
    assert.equal(isPausedProject(makeProject({ status })), false, status)
  }
})

test('le périmètre d’affichage garde les pauses, contrairement à la charge', () => {
  // isOpenProject sert aux vues board et clients : une pause doit y rester
  // visible, sinon les colonnes Bloqué et Standby se videraient.
  for (const status of [...WORKED, ...PAUSED]) {
    assert.equal(isOpenProject(makeProject({ status })), true, status)
  }
  for (const status of CLOSED) {
    assert.equal(isOpenProject(makeProject({ status })), false, status)
  }
})

test('countActiveProjectsByOwner ignore les pauses et garde les règles de périmètre', () => {
  const counts = countActiveProjectsByOwner([
    makeProject({ id: 'p1', ownerShort: 'Thuy-Tien', status: 'in_progress' }),
    makeProject({ id: 'p2', ownerShort: 'Thuy-Tien', status: 'not_started' }),
    makeProject({ id: 'p3', ownerShort: 'Thuy-Tien', status: 'blocked' }),
    makeProject({ id: 'p4', ownerShort: 'Thuy-Tien', status: 'pending_client' }),
    makeProject({ id: 'p5', ownerShort: 'Thuy-Tien', status: 'standby' }),
    makeProject({ id: 'p6', ownerShort: 'Thuy-Tien', status: 'live' }),
    // Alias de Winli, normalisé sur le nom canonique.
    makeProject({ id: 'p7', ownerShort: 'Wilini', status: 'in_progress' }),
    // Owner hors périmètre onboarding.
    makeProject({ id: 'p8', ownerShort: 'Bruno', status: 'in_progress' }),
  ])
  assert.equal(counts['Thuy-Tien'], 2)
  assert.equal(counts['Winli'], 1)
  assert.equal(counts['Bruno'], undefined)
})

test('un implémenteur dont tous les dossiers sont en pause sort de la charge', () => {
  const counts = countActiveProjectsByOwner([
    makeProject({ id: 'p1', ownerShort: 'Dalia', status: 'blocked' }),
    makeProject({ id: 'p2', ownerShort: 'Dalia', status: 'standby' }),
  ])
  assert.equal(counts['Dalia'], undefined)
})
