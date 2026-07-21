import type { ClientTypology, OnboardingProject } from '@/lib/zoho/projectsClient'
import { resolveOwnerName } from '@/lib/onboarding/constants'

export interface OnboardingClientProperty {
  id: string
  name: string
  projects: OnboardingProject[]
}

export interface OnboardingClientAggregate {
  id: string
  name: string
  typology: ClientTypology
  projects: OnboardingProject[]
  properties: OnboardingClientProperty[]
  products: string[]
  owners: string[]
  progress: number
}

export function syntheticHotelKey(hotelName: string): string {
  return `hotel:${hotelName.trim().toLocaleLowerCase('fr-FR')}`
}

export function clientKey(project: OnboardingProject): string {
  return project.clientId ?? syntheticHotelKey(project.hotelName)
}

export function clientPropertyKey(project: OnboardingProject): string {
  const crmPropertyId = project.clientPropertyId?.trim()
  return crmPropertyId ? `crm:${crmPropertyId}` : syntheticHotelKey(project.hotelName)
}

export function clientPropertyName(project: OnboardingProject): string {
  return project.clientPropertyName?.trim() || project.hotelName
}

export function aggregateOnboardingClients(projects: OnboardingProject[]): OnboardingClientAggregate[] {
  const grouped = new Map<string, OnboardingProject[]>()

  for (const project of projects) {
    const key = clientKey(project)
    grouped.set(key, [...(grouped.get(key) ?? []), project])
  }

  return [...grouped.entries()].map(([id, clientProjects]) => {
    const propertyProjects = new Map<string, { name: string; projects: OnboardingProject[] }>()
    for (const project of clientProjects) {
      const propertyId = clientPropertyKey(project)
      const property = propertyProjects.get(propertyId)
      propertyProjects.set(propertyId, {
        name: property?.name ?? clientPropertyName(project),
        projects: [...(property?.projects ?? []), project],
      })
    }

    const typology: ClientTypology = id.startsWith('hotel:')
      ? 'unlinked'
      : clientProjects.some(project => project.clientTypology === 'group') ? 'group' : 'individual'

    return {
      id,
      name: clientProjects.find(project => project.clientName)?.clientName ?? clientProjects[0]?.hotelName ?? id,
      typology,
      projects: clientProjects,
      properties: [...propertyProjects.entries()]
        .map(([propertyId, property]) => ({
          id: propertyId,
          name: property.name,
          projects: property.projects.sort((a, b) => a.product.localeCompare(b.product, 'fr')),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      products: [...new Set(clientProjects.map(project => project.product).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'fr')),
      owners: [...new Set(clientProjects.map(project => resolveOwnerName(project.ownerShort || project.ownerName)))]
        .sort((a, b) => a.localeCompare(b, 'fr')),
      progress: Math.round(clientProjects.reduce((sum, project) => sum + project.percentComplete, 0) / clientProjects.length),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
