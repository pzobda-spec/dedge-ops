/**
 * Annuaire de résolution des noms CSM Zoho vers les noms canoniques utilisés
 * par `csm_capacity_rules`. Module pur : aucune dépendance Supabase, Zoho,
 * Next, fs ou réseau.
 *
 * Problème résolu : le lookup `CSM` de Zoho renvoie tantôt un nom complet
 * (« Aika Aitkali »), tantôt le seul nom de famille (« Rohaut »), alors que
 * `csm_capacity_rules.csm_name` est indexée sur les prénoms (Ghislaine,
 * Laurane, Anne-Charlotte, Aika, Deydra, Sherazade, Tara).
 */

/** Une entrée d'annuaire CSM, image d'une ligne de `csm_capacity_rules`. */
export interface CsmDirectoryEntry {
  csmName: string
  zohoUserId: string | null
  aliases: string[]
}

/** Méthode ayant permis de résoudre un nom CSM. */
export type CsmMatchMethod = 'zoho_id' | 'exact_name' | 'alias' | 'token'

/** Résultat de la résolution d'un libellé CSM Zoho vers un nom canonique. */
export interface CsmResolution {
  /** Nom canonique, tel qu'en base. `null` si non résolu. */
  csmName: string | null
  matchedBy: CsmMatchMethod | null
  /** Valeur brute reçue de Zoho, conservée pour diagnostic. */
  raw: string | null
}

/**
 * Normalise un libellé CSM pour comparaison : trim, minuscules (locale fr-FR),
 * suppression des diacritiques, tirets/apostrophes remplacés par des espaces,
 * espaces multiples réduits. Pattern déjà utilisé ailleurs dans le repo (voir
 * `lib/onboarding/syncProjects.ts`).
 */
export function normalizeCsmLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Résout un libellé CSM Zoho (nom brut et/ou id utilisateur) vers le nom
 * canonique d'une entrée d'annuaire. Ordre de résolution strict, on s'arrête
 * au premier niveau qui donne un résultat :
 * 1. `userId` égal au `zohoUserId` d'une entrée.
 * 2. Libellé normalisé égal au `csmName` normalisé d'une entrée.
 * 3. Libellé normalisé égal à un alias normalisé d'une entrée.
 * 4. Un jeton du libellé égal au `csmName` normalisé ou à un alias normalisé.
 *
 * À chaque niveau, si plusieurs entrées correspondent, la résolution est
 * ambiguë et renvoie `csmName: null` : on ne devine jamais un rattachement.
 */
export function resolveCsmName(
  directory: readonly CsmDirectoryEntry[],
  input: { name?: string | null; userId?: string | null },
): CsmResolution {
  const name = input.name?.trim() || null
  const userId = input.userId?.trim() || null
  const raw = name

  if (!name && !userId) {
    return { csmName: null, matchedBy: null, raw: null }
  }

  const pick = (matches: CsmDirectoryEntry[], matchedBy: CsmMatchMethod): CsmResolution => {
    if (matches.length === 1) {
      return { csmName: matches[0].csmName, matchedBy, raw }
    }
    return { csmName: null, matchedBy: null, raw }
  }

  // 1. Id utilisateur Zoho.
  if (userId) {
    const byId = directory.filter(entry => entry.zohoUserId === userId)
    if (byId.length > 0) return pick(byId, 'zoho_id')
  }

  if (!name) {
    return { csmName: null, matchedBy: null, raw }
  }

  const normalized = normalizeCsmLabel(name)

  // 2. Égalité exacte avec le nom canonique.
  const byExactName = directory.filter(entry => normalizeCsmLabel(entry.csmName) === normalized)
  if (byExactName.length > 0) return pick(byExactName, 'exact_name')

  // 3. Égalité exacte avec un alias.
  const byAlias = directory.filter(entry =>
    entry.aliases.some(alias => normalizeCsmLabel(alias) === normalized),
  )
  if (byAlias.length > 0) return pick(byAlias, 'alias')

  // 4. Découpage en jetons.
  const tokens = normalized.split(' ').filter(token => token.length > 0)
  const byToken = directory.filter(entry => {
    const canonical = normalizeCsmLabel(entry.csmName)
    const aliasSet = entry.aliases.map(alias => normalizeCsmLabel(alias))
    return tokens.some(token => token === canonical || aliasSet.includes(token))
  })
  if (byToken.length > 0) return pick(byToken, 'token')

  return { csmName: null, matchedBy: null, raw }
}
