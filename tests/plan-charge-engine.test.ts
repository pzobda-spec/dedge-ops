import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_WEIGHT_RULES,
  effectiveCapacity,
  canReceiveWork,
  obEligible,
  tierFromSegment,
  weightForAccount,
  type AccountShape,
  type Availability,
  type ObRole,
} from '@/lib/onboarding/capacityModel'
import {
  runAssignmentEngine,
  type CsmMember,
  type ObMember,
  type PipelineAccount,
} from '@/lib/onboarding/assignmentEngine'

function makeOb(overrides: Partial<ObMember> = {}): ObMember {
  return {
    name: 'OB-Test',
    role: 'senior',
    maxProjects: 50,
    availability: 'full',
    ...overrides,
  }
}

function makeCsm(overrides: Partial<CsmMember> = {}): CsmMember {
  return {
    name: 'CSM-Test',
    monthlyCapacityPoints: 15,
    availability: 'full',
    ...overrides,
  }
}

function makeAccount(overrides: Partial<PipelineAccount> = {}): PipelineAccount {
  return {
    id: 'acc-1',
    name: 'Compte test',
    groupId: null,
    tier: 'Silver',
    isGroup: false,
    hotels: 1,
    dmbookOnly: false,
    signedDate: '2026-09-01',
    expectedGoLiveMonth: '2026-09',
    ...overrides,
  }
}

function shape(overrides: Partial<AccountShape> = {}): AccountShape {
  return { tier: 'Silver', isGroup: false, hotels: 1, dmbookOnly: false, ...overrides }
}

test('barème : poids de référence pour chaque tier', () => {
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Bronze', dmbookOnly: true })), 1)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Bronze', isGroup: false })), 2)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Bronze', isGroup: true, hotels: 4 })), 2)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Silver', isGroup: false })), 3)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Silver', isGroup: true, hotels: 3 })), 4)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Gold', isGroup: false })), 5)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Gold', isGroup: true, hotels: 3 })), 8)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Key', isGroup: false })), 10)
})

test('barème : cas de repli, Gold dmbookOnly et groupe implicite', () => {
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Gold', dmbookOnly: true, isGroup: false })), 5)
  assert.equal(weightForAccount(DEFAULT_WEIGHT_RULES, shape({ tier: 'Silver', hotels: 3, isGroup: false })), 4)
})

test('tierFromSegment mappe les segments CRM', () => {
  assert.equal(tierFromSegment('Strategic'), 'Key')
  assert.equal(tierFromSegment('strategic'), 'Key')
  assert.equal(tierFromSegment('gold'), 'Gold')
  assert.equal(tierFromSegment('inconnu'), 'Silver')
})

test('effectiveCapacity et canReceiveWork selon la disponibilité', () => {
  const avail: Record<Availability, number> = { full: 100, relache: 50, absent: 0, stop: 0 }
  for (const [availability, expected] of Object.entries(avail) as [Availability, number][]) {
    assert.equal(effectiveCapacity(100, availability), expected)
  }
  assert.equal(canReceiveWork('full'), true)
  assert.equal(canReceiveWork('relache'), true)
  assert.equal(canReceiveWork('absent'), false)
  assert.equal(canReceiveWork('stop'), false)
})

test('obEligible selon rôle et taille de groupe', () => {
  const roleFor = (role: ObRole, hotels: number) => obEligible(role, shape({ isGroup: true, hotels }))
  assert.equal(roleFor('senior', 8), true)
  assert.equal(roleFor('junior', 4), true)
  assert.equal(roleFor('junior', 5), false)
  assert.equal(roleFor('alternant', 2), false)
  assert.equal(roleFor('stagiaire', 2), false)
  assert.equal(obEligible('alternant', shape({ isGroup: false, hotels: 1 })), true)
  assert.equal(obEligible('stagiaire', shape({ isGroup: false, hotels: 1 })), true)
})

test('greedy OB : répartit deux comptes sur deux implémenteurs différents', () => {
  const result = runAssignmentEngine({
    pipeline: [
      makeAccount({ id: 'a1', hotels: 10, expectedGoLiveMonth: '2026-09' }),
      makeAccount({ id: 'a2', hotels: 1, expectedGoLiveMonth: '2026-09' }),
    ],
    obRoster: [makeOb({ name: 'Thuy-Tien' }), makeOb({ name: 'Dalia' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  const a1 = result.assignments.find(item => item.accountId === 'a1')!
  const a2 = result.assignments.find(item => item.accountId === 'a2')!
  assert.notEqual(a1.obOwner, a2.obOwner)
  assert.equal(result.obLoad[a1.obOwner!], 10)
  assert.equal(result.obLoad[a2.obOwner!], 1)
})

test('groupe sans senior disponible reste sans OB', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', isGroup: true, hotels: 8 })],
    obRoster: [makeOb({ name: 'Dalia', role: 'junior' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  const a1 = result.assignments[0]
  assert.equal(a1.obOwner, null)
  assert.equal(a1.obEligibleCount, 0)
  assert.deepEqual(result.unassigned, ['a1'])
})

test('implémenteur absent ou stop ne reçoit rien, la charge est redistribuée', () => {
  const resultAbsent = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1' })],
    obRoster: [makeOb({ name: 'Absent', availability: 'absent' }), makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  assert.equal(resultAbsent.assignments[0].obOwner, 'Dispo')

  const resultStop = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1' })],
    obRoster: [makeOb({ name: 'Stop', availability: 'stop' }), makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  assert.equal(resultStop.assignments[0].obOwner, 'Dispo')
})

test('continuité de groupe : un CSM en stop reste prioritaire et sa surcharge apparaît', () => {
  // Spec §4.5 : la continuité prime même sur un état STOP, et la surcharge qui en
  // résulte doit rester visible. Un CSM en stop a une capacité effective nulle, donc
  // toute charge portée est par construction une surcharge.
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', groupId: 'grp-1', tier: 'Key', expectedGoLiveMonth: '2026-09' })],
    obRoster: [makeOb({ name: 'Thuy-Tien' })],
    csmRoster: [makeCsm({ name: 'Aika', availability: 'stop' }), makeCsm({ name: 'Winli' })],
    groupContinuity: { 'grp-1': 'Aika' },
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  const a1 = result.assignments[0]
  assert.equal(a1.csmName, 'Aika')
  assert.equal(a1.csmSource, 'continuity')
  assert.equal(result.csmLoadByMonth['Aika']['2026-09'], 10)
  assert.deepEqual(result.csmOverloads, [{ name: 'Aika', month: '2026-09', load: 10, capacity: 0 }])
})

test('continuité de groupe : un CSM dispo au plafond dépassé apparaît aussi en surcharge', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', groupId: 'grp-1', tier: 'Key', expectedGoLiveMonth: '2026-09' })],
    obRoster: [makeOb({ name: 'Thuy-Tien' })],
    csmRoster: [
      makeCsm({ name: 'Aika', availability: 'full', monthlyCapacityPoints: 1 }),
      makeCsm({ name: 'Winli' }),
    ],
    groupContinuity: { 'grp-1': 'Aika' },
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  assert.equal(result.assignments[0].csmSource, 'continuity')
  assert.ok(result.csmOverloads.some(overload => overload.name === 'Aika' && overload.month === '2026-09'))
})

test('override manuel vers un implémenteur absent rend la surcharge visible', () => {
  // Même règle côté OB : la capacité effective d'un absent est nulle, la charge
  // imposée par un override doit donc ressortir dans obOverloads.
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', obOverride: 'Absent-OB', hotels: 2, isGroup: true })],
    obRoster: [makeOb({ name: 'Absent-OB', availability: 'absent' }), makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  assert.equal(result.assignments[0].obOwner, 'Absent-OB')
  assert.deepEqual(result.obOverloads, [
    { name: 'Absent-OB', month: '2026-09', load: 2, capacity: 0 },
  ])
})

test('override manuel prime sur continuité et sur greedy même si indisponible', () => {
  const result = runAssignmentEngine({
    pipeline: [
      makeAccount({
        id: 'a1',
        groupId: 'grp-1',
        obOverride: 'Absent-OB',
        csmOverride: 'Winli',
        expectedGoLiveMonth: '2026-09',
      }),
    ],
    obRoster: [makeOb({ name: 'Absent-OB', availability: 'absent' }), makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Aika' }), makeCsm({ name: 'Winli' })],
    groupContinuity: { 'grp-1': 'Aika' },
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  const a1 = result.assignments[0]
  assert.equal(a1.obOwner, 'Absent-OB')
  assert.equal(a1.obSource, 'override')
  assert.equal(a1.csmName, 'Winli')
  assert.equal(a1.csmSource, 'override')
})

test('override invalide est ignoré, la répartition automatique reprend la main', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', obOverride: 'Inconnu', csmOverride: 'Inconnu' })],
    obRoster: [makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  const a1 = result.assignments[0]
  assert.equal(a1.obOwner, 'Dispo')
  assert.equal(a1.obSource, 'auto')
  assert.equal(a1.csmName, 'Winli')
  assert.equal(a1.csmSource, 'auto')
})

test('points de départ du mois courant saturent un CSM au profit d\'un autre', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', tier: 'Key', expectedGoLiveMonth: '2026-09' })],
    obRoster: [makeOb({ name: 'Dispo' })],
    csmRoster: [
      makeCsm({ name: 'Sature', monthlyCapacityPoints: 15, currentMonthBasePoints: 15 }),
      makeCsm({ name: 'Libre', monthlyCapacityPoints: 15 }),
    ],
    months: ['2026-09'],
    currentMonth: '2026-09',
  })
  assert.equal(result.assignments[0].csmName, 'Libre')
})

test('projection OB : charge de la signature au go-live inclus, pas au-delà', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', hotels: 3, signedDate: '2026-09-05', expectedGoLiveMonth: '2026-11' })],
    obRoster: [makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09', '2026-10', '2026-11', '2026-12'],
    currentMonth: '2026-09',
  })
  const owner = result.assignments[0].obOwner!
  assert.equal(result.obLoadByMonth[owner]['2026-09'], 3)
  assert.equal(result.obLoadByMonth[owner]['2026-10'], 3)
  assert.equal(result.obLoadByMonth[owner]['2026-11'], 3)
  assert.equal(result.obLoadByMonth[owner]['2026-12'], 0)
})

test('projection CSM : les points ne tombent que sur le mois de go-live', () => {
  const result = runAssignmentEngine({
    pipeline: [makeAccount({ id: 'a1', tier: 'Gold', signedDate: '2026-09-05', expectedGoLiveMonth: '2026-11' })],
    obRoster: [makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09', '2026-10', '2026-11'],
    currentMonth: '2026-09',
  })
  assert.equal(result.csmLoadByMonth['Winli']['2026-09'], 0)
  assert.equal(result.csmLoadByMonth['Winli']['2026-10'], 0)
  assert.equal(result.csmLoadByMonth['Winli']['2026-11'], 5)
})

test('balanceMode utilization change l\'attribution par rapport à absolute', () => {
  const base = {
    pipeline: [makeAccount({ id: 'a1' })],
    obRoster: [
      makeOb({ name: 'GrosPlafond', maxProjects: 100 }),
      makeOb({ name: 'PetitPlafond', maxProjects: 2 }),
    ],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  }
  // On simule une charge déjà présente en attribuant d'abord plusieurs comptes au gros plafond.
  const preload = runAssignmentEngine({
    ...base,
    pipeline: [
      makeAccount({ id: 'p1', hotels: 90 }),
    ],
    balanceMode: 'absolute',
  })
  assert.equal(preload.assignments[0].obOwner, 'GrosPlafond')

  const absolute = runAssignmentEngine({
    pipeline: [
      makeAccount({ id: 'p1', hotels: 90, signedDate: '2026-08-01' }),
      makeAccount({ id: 'a1', hotels: 1, signedDate: '2026-09-01' }),
    ],
    obRoster: base.obRoster,
    csmRoster: base.csmRoster,
    months: ['2026-09'],
    currentMonth: '2026-09',
    balanceMode: 'absolute',
  })
  const utilization = runAssignmentEngine({
    pipeline: [
      makeAccount({ id: 'p1', hotels: 90, signedDate: '2026-08-01' }),
      makeAccount({ id: 'a1', hotels: 1, signedDate: '2026-09-01' }),
    ],
    obRoster: base.obRoster,
    csmRoster: base.csmRoster,
    months: ['2026-09'],
    currentMonth: '2026-09',
    balanceMode: 'utilization',
  })
  const absoluteA1 = absolute.assignments.find(item => item.accountId === 'a1')!
  const utilizationA1 = utilization.assignments.find(item => item.accountId === 'a1')!
  assert.notEqual(absoluteA1.obOwner, utilizationA1.obOwner)
})

test('déterminisme : appels successifs identiques, pipeline non muté', () => {
  const pipeline = [makeAccount({ id: 'a1' }), makeAccount({ id: 'a2', signedDate: '2026-09-10' })]
  const pipelineCopy = JSON.parse(JSON.stringify(pipeline))
  const input = {
    pipeline,
    obRoster: [makeOb({ name: 'Dispo' })],
    csmRoster: [makeCsm({ name: 'Winli' })],
    months: ['2026-09'],
    currentMonth: '2026-09',
  }
  const first = runAssignmentEngine(input)
  const second = runAssignmentEngine(input)
  assert.deepEqual(first, second)
  assert.deepEqual(pipeline, pipelineCopy)
})

test('entrées vides ne lèvent pas et renvoient des collections vides', () => {
  const result = runAssignmentEngine({
    pipeline: [],
    obRoster: [],
    csmRoster: [],
    months: [],
    currentMonth: '2026-09',
  })
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.unassigned, [])
  // Le mois courant fait toujours partie de l'horizon, même sans mois fourni.
  assert.deepEqual(result.months, ['2026-09'])
  assert.deepEqual(result.obOverloads, [])
  assert.deepEqual(result.csmOverloads, [])
})
