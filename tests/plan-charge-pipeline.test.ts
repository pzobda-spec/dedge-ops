import assert from 'node:assert/strict'
import test from 'node:test'
import type { CRMAccount, ZohoWonDeal } from '@/lib/zoho/crmClient'
import type { OnboardingProject } from '@/lib/zoho/projectsClient'
import {
  normalizeCsmLabel,
  resolveCsmName,
  type CsmDirectoryEntry,
} from '@/lib/onboarding/csmDirectory'
import {
  buildPlanChargePipeline,
  computeCurrentMonthBasePoints,
  type AccountAssignmentOverride,
  type PlanChargePipelineInput,
} from '@/lib/onboarding/pipeline'
import { runAssignmentEngine } from '@/lib/onboarding/assignmentEngine'
import { DEFAULT_WEIGHT_RULES } from '@/lib/onboarding/capacityModel'

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

function makeDeal(overrides: Partial<ZohoWonDeal> = {}): ZohoWonDeal {
  return {
    id: 'deal-1',
    dealName: 'Compte Test',
    stage: 'Won',
    closingDate: '2026-06-01',
    ...overrides,
  }
}

function makeDirectory(): CsmDirectoryEntry[] {
  return [
    { csmName: 'Ghislaine', zohoUserId: 'u-ghislaine', aliases: ['Rohaut'] },
    { csmName: 'Laurane', zohoUserId: 'u-laurane', aliases: ['Exilie'] },
    { csmName: 'Anne-Charlotte', zohoUserId: 'u-anne-charlotte', aliases: ['Bonnaud'] },
    { csmName: 'Aika', zohoUserId: 'u-aika', aliases: ['Aitkali'] },
    { csmName: 'Deydra', zohoUserId: 'u-deydra', aliases: ['Acero'] },
    { csmName: 'Sherazade', zohoUserId: 'u-sherazade', aliases: ['Benamar'] },
    { csmName: 'Tara', zohoUserId: 'u-tara', aliases: ['Donnelly'] },
  ]
}

function baseInput(overrides: Partial<PlanChargePipelineInput> = {}): PlanChargePipelineInput {
  return {
    accounts: [],
    projects: [],
    wonDeals: [],
    csmDirectory: makeDirectory(),
    overrides: [],
    referenceDate: '2026-09-05',
    ...overrides,
  }
}

test('normalizeCsmLabel gomme accents, casse et tirets', () => {
  assert.equal(normalizeCsmLabel('Anne-Charlotte'), 'anne charlotte')
  assert.equal(normalizeCsmLabel('  AÏKA  Aitkali '), 'aika aitkali')
  assert.equal(normalizeCsmLabel("D'Éxilie"), 'd exilie')
})

test('resolveCsmName résout par id utilisateur Zoho en priorité, même si le libellé est trompeur', () => {
  const directory = makeDirectory()
  const result = resolveCsmName(directory, { name: 'Rohaut', userId: 'u-aika' })
  assert.equal(result.csmName, 'Aika')
  assert.equal(result.matchedBy, 'zoho_id')
})

test('resolveCsmName résout "Rohaut" par alias et "Aika Aitkali" par jeton', () => {
  const directory = makeDirectory()
  const byAlias = resolveCsmName(directory, { name: 'Rohaut' })
  assert.equal(byAlias.csmName, 'Ghislaine')
  assert.equal(byAlias.matchedBy, 'alias')

  const byToken = resolveCsmName(directory, { name: 'Aika Aitkali' })
  assert.equal(byToken.csmName, 'Aika')
  assert.equal(byToken.matchedBy, 'token')
})

test('resolveCsmName renvoie non résolu sur libellé inconnu, et sur ambiguïté', () => {
  const directory = makeDirectory()
  const unknown = resolveCsmName(directory, { name: 'Personne Inconnue' })
  assert.equal(unknown.csmName, null)
  assert.equal(unknown.matchedBy, null)

  const ambiguousDirectory: CsmDirectoryEntry[] = [
    { csmName: 'Aika', zohoUserId: null, aliases: ['X'] },
    { csmName: 'Autre', zohoUserId: null, aliases: ['X'] },
  ]
  const ambiguous = resolveCsmName(ambiguousDirectory, { name: 'X' })
  assert.equal(ambiguous.csmName, null)
  assert.equal(ambiguous.matchedBy, null)
})

test('resolveCsmName : "Anne-Sophie Paillard" ne se résout pas vers Anne-Charlotte', () => {
  // Piège de résolution documenté en spec §9.3 : un homonyme partiel de
  // prénom ("Anne-") existe côté Zoho (Anne-Sophie Paillard) et ne doit
  // jamais être confondu avec Anne-Charlotte lors de la résolution par jeton.
  const directory = makeDirectory()
  const result = resolveCsmName(directory, { name: 'Anne-Sophie Paillard' })
  assert.equal(result.csmName, null)
  assert.equal(result.matchedBy, null)
})

test('resolveCsmName : "Acero Vela" se résout vers Deydra via l\'alias composé, "Harmony Telli" via jeton', () => {
  const directory: CsmDirectoryEntry[] = [
    ...makeDirectory(),
    { csmName: 'Harmony', zohoUserId: 'u-harmony', aliases: ['Telli'] },
    { csmName: 'Astrid', zohoUserId: 'u-astrid', aliases: ['Lapeyre'] },
  ]
  // Deydra a l'alias composé "Acero Vela" en plus de "Acero".
  const withComposedAlias = directory.map(entry =>
    entry.csmName === 'Deydra' ? { ...entry, aliases: ['Acero', 'Acero Vela'] } : entry,
  )

  const aceroVela = resolveCsmName(withComposedAlias, { name: 'Acero Vela' })
  assert.equal(aceroVela.csmName, 'Deydra')
  assert.equal(aceroVela.matchedBy, 'alias')

  const harmonyTelli = resolveCsmName(withComposedAlias, { name: 'Harmony Telli' })
  assert.equal(harmonyTelli.csmName, 'Harmony')
  assert.equal(harmonyTelli.matchedBy, 'token')
})

test('sélection : Client avec Sub_Start_date future et sans projet live entre dans le pipeline', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01' })],
    }),
  )
  assert.equal(result.pipeline.length, 1)
  assert.equal(result.pipeline[0].id, 'a1')
  assert.equal(result.diagnostics.clientAccounts, 1)
  assert.equal(result.diagnostics.withFutureSubStart, 1)
})

test('exclusion : compte avec un projet Zoho au statut live est exclu', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01' })],
      projects: [makeProject({ status: 'live', accountCRMId: 'a1' })],
    }),
  )
  assert.equal(result.pipeline.length, 0)
  assert.equal(result.diagnostics.excludedAlreadyLive, 1)
})

test('exclusion : Sub_Start_date passée/absente ou Account_Type différent de Client', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'a1', subStartDate: '2020-01-01' }),
        makeAccount({ id: 'a2', subStartDate: null }),
        makeAccount({ id: 'a3', accountType: 'Prospect', subStartDate: '2027-01-01' }),
      ],
    }),
  )
  assert.equal(result.pipeline.length, 0)
})

test('hôtels : zoho_field prioritaire, puis sibling_count avec frère à MRR nul, puis default', () => {
  const withField = buildPlanChargePipeline(
    baseInput({ accounts: [makeAccount({ id: 'a1', hotelCount: 3, subStartDate: '2027-01-01' })] }),
  )
  assert.equal(withField.entries[0].hotelsSource, 'zoho_field')
  assert.equal(withField.pipeline[0].hotels, 3)

  const withSiblings = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'a1', parentId: 'grp', subStartDate: '2027-01-01', hotelCount: null }),
        makeAccount({ id: 'a2', parentId: 'grp', subStartDate: '2020-01-01', mrr: 0 }),
      ],
    }),
  )
  const entryA1 = withSiblings.entries.find(entry => entry.account.id === 'a1')!
  assert.equal(entryA1.hotelsSource, 'sibling_count')
  assert.equal(entryA1.account.hotels, 2)

  const withDefault = buildPlanChargePipeline(
    baseInput({ accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', hotelCount: null })] }),
  )
  assert.equal(withDefault.entries[0].hotelsSource, 'default')
  assert.equal(withDefault.pipeline[0].hotels, 1)
})

test('groupe : parentId définit groupId, un compte sans parent mais avec enfants est un groupe porté par son propre id', () => {
  const withParent = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'a1', parentId: 'grp', subStartDate: '2027-01-01' }),
        makeAccount({ id: 'grp', name: 'Groupe', subStartDate: '2020-01-01' }),
      ],
    }),
  )
  const entryA1 = withParent.entries.find(entry => entry.account.id === 'a1')!
  assert.equal(entryA1.account.groupId, 'grp')
  assert.equal(entryA1.account.isGroup, true)

  const withoutParent = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'parent', subStartDate: '2027-01-01' }),
        makeAccount({ id: 'child', parentId: 'parent', subStartDate: '2020-01-01' }),
      ],
    }),
  )
  const parentEntry = withoutParent.entries.find(entry => entry.account.id === 'parent')!
  assert.equal(parentEntry.account.groupId, 'parent')
  assert.equal(parentEntry.account.isGroup, true)
})

test('continuité : un frère avec CSM "Rohaut" produit groupContinuity[groupId] === "Ghislaine"', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'a1', parentId: 'grp', subStartDate: '2027-01-01', csm: null }),
        makeAccount({ id: 'a2', parentId: 'grp', subStartDate: '2020-01-01', csm: 'Rohaut' }),
      ],
    }),
  )
  assert.equal(result.groupContinuity['grp'], 'Ghislaine')

  const withoutContinuity = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'b1', parentId: 'grp2', subStartDate: '2027-01-01', csm: null }),
        makeAccount({ id: 'b2', parentId: 'grp2', subStartDate: '2020-01-01', csm: null }),
      ],
    }),
  )
  assert.equal(withoutContinuity.groupContinuity['grp2'], undefined)
  assert.deepEqual(withoutContinuity.diagnostics.groupsWithoutContinuity, ['grp2'])
})

test('CSM non résolu : le compte reste dans le pipeline mais figure dans diagnostics.unresolvedCsm', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', csm: 'Nom Inconnu' })],
    }),
  )
  assert.equal(result.pipeline.length, 1)
  assert.deepEqual(result.diagnostics.unresolvedCsm, [
    { accountId: 'a1', accountName: 'Compte Test', rawCsm: 'Nom Inconnu' },
  ])
})

test('deals : Deal_Name correspondant fixe signedDate/closingDate, sinon repli createdTime', () => {
  const matched = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', name: 'Cairns Hotel', subStartDate: '2027-01-01', createdTime: '2026-01-01' })],
      wonDeals: [makeDeal({ id: 'd1', dealName: 'Cairns Hotel', closingDate: '2026-06-15' })],
    }),
  )
  assert.equal(matched.entries[0].account.signedDate, '2026-06-15')
  assert.equal(matched.entries[0].signedDateSource, 'deal')
  assert.equal(matched.diagnostics.dealsMatched, 1)

  const unmatched = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', name: 'Cairns Hotel', subStartDate: '2027-01-01', createdTime: '2026-01-01' })],
      wonDeals: [makeDeal({ id: 'd1', dealName: 'Something Completely Different' })],
    }),
  )
  assert.equal(unmatched.entries[0].account.signedDate, '2026-01-01')
  assert.equal(unmatched.entries[0].signedDateSource, 'account_created')
  assert.equal(unmatched.diagnostics.dealsUnmatched, 1)
})

test('deals : nom sous le seuil n\'est pas apparié, aucune date erronée', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', name: 'Windy Peaks', subStartDate: '2027-01-01', createdTime: '2026-02-01' })],
      wonDeals: [makeDeal({ id: 'd1', dealName: 'Completely Unrelated Text Value', closingDate: '2026-09-09' })],
    }),
  )
  assert.equal(result.entries[0].matchedDealId, null)
  assert.equal(result.entries[0].account.signedDate, '2026-02-01')
  assert.equal(result.diagnostics.dealsUnmatched, 1)
  assert.equal(result.diagnostics.dealsMatched, 0)
})

test('dmbookOnly : vrai seulement si Plan vaut exactement ["Dmbook"] (spec §9.1)', () => {
  const exact = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', plan: ['Dmbook'] })],
    }),
  )
  assert.equal(exact.pipeline[0].dmbookOnly, true)

  const withOther = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', plan: ['Dmbook', 'Insight'] })],
    }),
  )
  assert.equal(withOther.pipeline[0].dmbookOnly, false)

  // La valeur métier est "Dmbook", pas "Dmbook Pro" : ce dernier n'est jamais dmbookOnly.
  const dmbookPro = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', plan: ['Dmbook Pro'] })],
    }),
  )
  assert.equal(dmbookPro.pipeline[0].dmbookOnly, false)

  const empty = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01', plan: [] })],
    }),
  )
  assert.equal(empty.pipeline[0].dmbookOnly, false)
})

test('overrides : override verrouillé repris, override non verrouillé ignoré', () => {
  const locked: AccountAssignmentOverride = {
    accountId: 'a1',
    obOwner: 'Dalia',
    obLocked: true,
    csmName: 'Winli',
    csmLocked: true,
  }
  const withLocked = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01' })],
      overrides: [locked],
    }),
  )
  assert.equal(withLocked.pipeline[0].obOverride, 'Dalia')
  assert.equal(withLocked.pipeline[0].csmOverride, 'Winli')

  const unlocked: AccountAssignmentOverride = {
    accountId: 'a1',
    obOwner: 'Dalia',
    obLocked: false,
    csmName: 'Winli',
    csmLocked: false,
  }
  const withUnlocked = buildPlanChargePipeline(
    baseInput({
      accounts: [makeAccount({ id: 'a1', subStartDate: '2027-01-01' })],
      overrides: [unlocked],
    }),
  )
  assert.equal(withUnlocked.pipeline[0].obOverride, null)
  assert.equal(withUnlocked.pipeline[0].csmOverride, null)
})

test('le résultat alimente le moteur, continuité de groupe appliquée de bout en bout', () => {
  const result = buildPlanChargePipeline(
    baseInput({
      accounts: [
        makeAccount({ id: 'a1', parentId: 'grp', subStartDate: '2027-01-01', csm: null, segment: 'Strategic' }),
        makeAccount({ id: 'a2', parentId: 'grp', subStartDate: '2020-01-01', csm: 'Rohaut' }),
      ],
    }),
  )
  const engineResult = runAssignmentEngine({
    pipeline: result.pipeline,
    obRoster: [{ name: 'Thuy-Tien', role: 'senior', maxProjects: 50, availability: 'full' }],
    csmRoster: [
      { name: 'Ghislaine', monthlyCapacityPoints: 15, availability: 'full' },
      { name: 'Winli', monthlyCapacityPoints: 15, availability: 'full' },
    ],
    groupContinuity: result.groupContinuity,
    months: ['2027-01'],
    currentMonth: '2026-09',
  })
  const assignment = engineResult.assignments.find(item => item.accountId === 'a1')!
  assert.equal(assignment.csmName, 'Ghislaine')
  assert.equal(assignment.csmSource, 'continuity')
})

test('déterminisme : deux appels identiques donnent des résultats deepEqual, sans mutation', () => {
  const accounts = [
    makeAccount({ id: 'a1', subStartDate: '2027-01-01', csm: 'Rohaut' }),
    makeAccount({ id: 'a2', parentId: 'a1', subStartDate: '2027-02-01' }),
  ]
  const accountsCopy = JSON.parse(JSON.stringify(accounts))
  const input = baseInput({ accounts })

  const first = buildPlanChargePipeline(input)
  const second = buildPlanChargePipeline(input)
  assert.deepEqual(first, second)
  assert.deepEqual(accounts, accountsCopy)
})

test('computeCurrentMonthBasePoints : Date_de_passation dans le mois courant compte ses points sur le CSM résolu', () => {
  const result = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({ id: 'a1', segment: 'Silver', plan: ['Enterprise'], csm: 'Rohaut', handoverDate: '2026-09-12' }),
    ],
    projects: [],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(result.pointsByCsm['Ghislaine'], 3) // Silver Individuel
  assert.equal(result.accountsCounted, 1)
  assert.deepEqual(result.unresolvedCsm, [])
})

test('computeCurrentMonthBasePoints : Date_de_passation prime sur le go-live du projet sur des mois différents', () => {
  const result = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({
        id: 'a1',
        segment: 'Silver',
        plan: ['Enterprise'],
        csm: 'Rohaut',
        handoverDate: '2026-09-12',
        subStartDate: '2026-10-01',
      }),
    ],
    projects: [makeProject({ accountCRMId: 'a1', actualGoLiveDate: '2026-10-05' })],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(result.pointsByCsm['Ghislaine'], 3)
  assert.equal(result.accountsCounted, 1)

  const otherMonth = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({
        id: 'a1',
        segment: 'Silver',
        plan: ['Enterprise'],
        csm: 'Rohaut',
        handoverDate: '2026-09-12',
        subStartDate: '2026-10-01',
      }),
    ],
    projects: [makeProject({ accountCRMId: 'a1', actualGoLiveDate: '2026-10-05' })],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-10',
  })
  assert.equal(otherMonth.pointsByCsm['Ghislaine'], undefined)
  assert.equal(otherMonth.accountsCounted, 0)
})

test('computeCurrentMonthBasePoints : sans Date_de_passation, repli sur le go-live du projet, sinon sur subStartDate', () => {
  const withGoLive = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({ id: 'a1', segment: 'Gold', plan: ['Enterprise'], csm: 'Rohaut', handoverDate: null, subStartDate: '2026-11-01' }),
    ],
    projects: [makeProject({ accountCRMId: 'a1', actualGoLiveDate: '2026-09-20' })],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(withGoLive.pointsByCsm['Ghislaine'], 5) // Gold Individuel
  assert.equal(withGoLive.accountsCounted, 1)

  const withSubStartOnly = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({ id: 'a1', segment: 'Gold', plan: ['Enterprise'], csm: 'Rohaut', handoverDate: null, subStartDate: '2026-09-20' }),
    ],
    projects: [],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(withSubStartOnly.pointsByCsm['Ghislaine'], 5)
  assert.equal(withSubStartOnly.accountsCounted, 1)
})

test('computeCurrentMonthBasePoints : un compte d\'un autre mois n\'est pas compté', () => {
  const result = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({ id: 'a1', segment: 'Gold', plan: ['Enterprise'], csm: 'Rohaut', handoverDate: '2026-08-01' }),
    ],
    projects: [],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(result.accountsCounted, 0)
  assert.deepEqual(result.pointsByCsm, {})
})

test('computeCurrentMonthBasePoints : un CSM non résolu place le compte dans unresolvedCsm sans compter ses points', () => {
  const result = computeCurrentMonthBasePoints({
    accounts: [
      makeAccount({ id: 'a1', name: 'Compte Test', segment: 'Gold', plan: ['Enterprise'], csm: 'Nom Inconnu', handoverDate: '2026-09-01' }),
    ],
    projects: [],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.deepEqual(result.pointsByCsm, {})
  assert.equal(result.accountsCounted, 1)
  assert.deepEqual(result.unresolvedCsm, [{ accountId: 'a1', accountName: 'Compte Test', rawCsm: 'Nom Inconnu' }])
})

test('computeCurrentMonthBasePoints : le barème passé en weightRules est bien celui utilisé', () => {
  const account = makeAccount({ id: 'a1', segment: 'Silver', plan: ['Enterprise'], csm: 'Rohaut', handoverDate: '2026-09-01' })

  const withDefault = computeCurrentMonthBasePoints({
    accounts: [account],
    projects: [],
    csmDirectory: makeDirectory(),
    currentMonth: '2026-09',
  })
  assert.equal(withDefault.pointsByCsm['Ghislaine'], 3)

  const customRules = DEFAULT_WEIGHT_RULES.map(rule =>
    rule.tier === 'Silver' && rule.customerType === 'Individuel' ? { ...rule, points: 42 } : rule,
  )
  const withCustom = computeCurrentMonthBasePoints({
    accounts: [account],
    projects: [],
    csmDirectory: makeDirectory(),
    weightRules: customRules,
    currentMonth: '2026-09',
  })
  assert.equal(withCustom.pointsByCsm['Ghislaine'], 42)
})

test('un compte encore au pipeline n\'est pas compté aussi dans les points de départ du mois', () => {
  // Piège de double comptage : un compte dont la date de démarrage tombe plus
  // tard dans le mois courant est à la fois au pipeline et sur le mois courant.
  // Le moteur ajoutera son poids au mois de go-live ; le compter en base le
  // ferait peser deux fois sur le même mois.
  const directory: CsmDirectoryEntry[] = [{ csmName: 'Ghislaine', zohoUserId: null, aliases: ['Rohaut'] }]
  const account = makeAccount({
    id: 'acc-futur',
    name: 'Hotel Bientot',
    csm: 'Rohaut',
    subStartDate: '2026-09-20',
    handoverDate: null,
  })

  const pipeline = buildPlanChargePipeline({
    accounts: [account],
    projects: [],
    csmDirectory: directory,
    referenceDate: '2026-09-05',
  })
  assert.equal(pipeline.pipeline.length, 1)

  const sansExclusion = computeCurrentMonthBasePoints({
    accounts: [account],
    projects: [],
    csmDirectory: directory,
    currentMonth: '2026-09',
  })
  assert.equal(sansExclusion.pointsByCsm['Ghislaine'], 3)

  const avecExclusion = computeCurrentMonthBasePoints({
    accounts: [account],
    projects: [],
    csmDirectory: directory,
    currentMonth: '2026-09',
    excludeAccountIds: new Set(pipeline.pipeline.map(entry => entry.id)),
  })
  assert.deepEqual(avecExclusion.pointsByCsm, {})
  assert.equal(avecExclusion.accountsCounted, 0)
})

test('computePlanCharge ne compte jamais deux fois un compte du pipeline', async () => {
  const { computePlanCharge } = await import('@/lib/onboarding/planCharge')
  const directory: CsmDirectoryEntry[] = [{ csmName: 'Ghislaine', zohoUserId: null, aliases: ['Rohaut'] }]
  const result = computePlanCharge(
    {
      accounts: [
        makeAccount({ id: 'acc-futur', name: 'Hotel Bientot', csm: 'Rohaut', subStartDate: '2026-09-20' }),
        makeAccount({ id: 'acc-passe', name: 'Hotel Deja La', csm: 'Rohaut', subStartDate: '2026-01-01', handoverDate: '2026-09-02' }),
      ],
      projects: [],
      wonDeals: [],
      dealsTruncated: false,
      obRoster: [{ name: 'Thuy-Tien', role: 'senior', maxProjects: 50, availability: 'full' }],
      csmRoster: [{ name: 'Ghislaine', monthlyCapacityPoints: 15, availability: 'full' }],
      csmDirectory: directory,
      overrides: [],
      weightRules: [...DEFAULT_WEIGHT_RULES],
      warnings: [],
    },
    { referenceDate: '2026-09-05', months: ['2026-09', '2026-10'] },
  )

  // Le compte déjà passé compte en base (3 points), celui du pipeline est
  // ajouté une seule fois par le moteur : 6 au total, pas 9.
  assert.equal(result.basePoints.pointsByCsm['Ghislaine'], 3)
  assert.equal(result.engine.csmLoadByMonth['Ghislaine']['2026-09'], 6)
})
