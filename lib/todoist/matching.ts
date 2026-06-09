import { distance } from 'fastest-levenshtein'

export interface TodoistProjectForMatching {
  id: string
  name: string
}

export interface ZohoProjectForMatching {
  id: string
  name: string
}

export type TodoistMatchStatus = 'auto_matched' | 'needs_review' | 'unmatched'

export interface TodoistProjectMatch {
  todoistProjectId: string
  zohoProjectId: string | null
  score: number
  status: TodoistMatchStatus
}

const COMMON_WORDS = new Set(['projet', 'project', 'crm', 'd', 'edge', 'dedge'])
const SEPARATOR_WORDS = new Set(['x', 'and', 'et'])

export function normalizeProjectName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/d[\s-]*edge/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(word => word && !COMMON_WORDS.has(word) && !SEPARATOR_WORDS.has(word))
    .join(' ')
    .trim()
}

export function projectNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeProjectName(left)
  const normalizedRight = normalizeProjectName(right)

  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1

  const longestLength = Math.max(normalizedLeft.length, normalizedRight.length)
  const levenshteinScore = 1 - distance(normalizedLeft, normalizedRight) / longestLength
  const leftTokens = new Set(normalizedLeft.split(' '))
  const rightTokens = new Set(normalizedRight.split(' '))
  const commonTokens = [...leftTokens].filter(token => rightTokens.has(token)).length
  const containmentScore = commonTokens >= 2
    ? commonTokens / Math.min(leftTokens.size, rightTokens.size)
    : 0

  return Math.max(levenshteinScore, containmentScore)
}

export function matchTodoistToZoho(
  todoistProjects: TodoistProjectForMatching[],
  zohoProjects: ZohoProjectForMatching[],
): TodoistProjectMatch[] {
  return todoistProjects.map(todoistProject => {
    let bestZohoProjectId: string | null = null
    let bestScore = 0

    for (const zohoProject of zohoProjects) {
      const score = projectNameSimilarity(todoistProject.name, zohoProject.name)
      if (score > bestScore) {
        bestScore = score
        bestZohoProjectId = zohoProject.id
      }
    }

    const roundedScore = Math.round(bestScore * 10_000) / 10_000
    if (roundedScore > 0.75) {
      return {
        todoistProjectId: todoistProject.id,
        zohoProjectId: bestZohoProjectId,
        score: roundedScore,
        status: 'auto_matched',
      }
    }

    if (roundedScore >= 0.5 && bestZohoProjectId) {
      return {
        todoistProjectId: todoistProject.id,
        zohoProjectId: bestZohoProjectId,
        score: roundedScore,
        status: 'needs_review',
      }
    }

    return {
      todoistProjectId: todoistProject.id,
      zohoProjectId: null,
      score: roundedScore,
      status: 'unmatched',
    }
  })
}
