import type { ProjectEventType } from './events'

export type EventColor = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple'
export type EventCategory = 'system' | 'email' | 'call' | 'meeting' | 'delivery' | 'milestone' | 'note'

export interface EventTypeMeta {
  key: ProjectEventType
  label: string
  icon: string
  color: EventColor
  category: EventCategory
}

export const EVENT_TYPES: Record<ProjectEventType, EventTypeMeta> = {
  project_created: { key: 'project_created', label: 'Projet créé', icon: 'Plus', color: 'gray', category: 'system' },
  status_changed: { key: 'status_changed', label: 'Statut mis à jour', icon: 'RefreshCw', color: 'gray', category: 'system' },
  email_launch_sent: { key: 'email_launch_sent', label: 'Email de lancement envoyé', icon: 'Mail', color: 'blue', category: 'email' },
  email_content_request_sent: { key: 'email_content_request_sent', label: 'Demande de contenu envoyée', icon: 'Mail', color: 'blue', category: 'email' },
  email_backoffice_sent: { key: 'email_backoffice_sent', label: 'Accès back-office envoyé', icon: 'Mail', color: 'blue', category: 'email' },
  email_followup_1_sent: { key: 'email_followup_1_sent', label: 'Relance niveau 1 envoyée', icon: 'Mail', color: 'orange', category: 'email' },
  email_followup_2_sent: { key: 'email_followup_2_sent', label: 'Relance niveau 2 envoyée', icon: 'Mail', color: 'red', category: 'email' },
  first_contact_call: { key: 'first_contact_call', label: 'Appel premier contact', icon: 'Phone', color: 'green', category: 'call' },
  kickoff_scheduled: { key: 'kickoff_scheduled', label: 'Kick-off planifié', icon: 'Calendar', color: 'blue', category: 'meeting' },
  kickoff_completed: { key: 'kickoff_completed', label: 'Kick-off réalisé', icon: 'CheckCircle', color: 'green', category: 'meeting' },
  implementation_scheduled: { key: 'implementation_scheduled', label: 'RDV implémentation planifié', icon: 'Calendar', color: 'blue', category: 'meeting' },
  implementation_completed: { key: 'implementation_completed', label: 'RDV implémentation réalisé', icon: 'CheckCircle', color: 'green', category: 'meeting' },
  recap_generated: { key: 'recap_generated', label: 'Récap RDV généré', icon: 'FileText', color: 'purple', category: 'meeting' },
  content_received: { key: 'content_received', label: 'Contenu client reçu', icon: 'Box', color: 'green', category: 'delivery' },
  resource_updated: { key: 'resource_updated', label: 'Ressource client mise à jour', icon: 'Box', color: 'blue', category: 'delivery' },
  resources_validated: { key: 'resources_validated', label: 'Ressources validées', icon: 'CheckCircle', color: 'green', category: 'milestone' },
  implementation_started: { key: 'implementation_started', label: 'Implémentation démarrée', icon: 'Rocket', color: 'purple', category: 'milestone' },
  phase_changed: { key: 'phase_changed', label: 'Phase du projet mise à jour', icon: 'RefreshCw', color: 'purple', category: 'system' },
  v1_delivered: { key: 'v1_delivered', label: 'V1 livrée', icon: 'Package', color: 'green', category: 'delivery' },
  v2_delivered: { key: 'v2_delivered', label: 'V2 livrée', icon: 'Package', color: 'green', category: 'delivery' },
  go_live: { key: 'go_live', label: 'Go-live', icon: 'Rocket', color: 'green', category: 'milestone' },
  project_blocked: { key: 'project_blocked', label: 'Projet bloqué', icon: 'AlertCircle', color: 'red', category: 'milestone' },
  note_added: { key: 'note_added', label: 'Note ajoutée', icon: 'StickyNote', color: 'gray', category: 'note' },
}

export function isProjectEventType(value: unknown): value is ProjectEventType {
  return typeof value === 'string' && value in EVENT_TYPES
}
