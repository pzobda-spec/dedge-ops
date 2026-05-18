// Mock data for D-EDGE Ops Cockpit — Sprint 1
// All dates relative to 2026-05-18

export type Segment = 'Strategic' | 'Gold' | 'Silver' | 'Bronze'

export type Client = {
  id: string
  name: string
  segment: Segment
  country: string
  language: string
  products: string[]
}

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'reopened'
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TicketType = 'question' | 'problem' | 'task' | 'feature'
export type ProductArea = 'Campaigns' | 'Guest Profile' | 'CRM Core' | 'PMS' | 'WhatsApp' | 'Guest App'

export type Ticket = {
  id: string
  externalId: string
  clientId: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  type: TicketType
  productArea: ProductArea
  source: 'email' | 'chat' | 'phone'
  createdAt: string
  updatedAt: string
  lastClientMessageAt: string
  lastAgentReplyAt: string
  sentiment: 'positive' | 'neutral' | 'negative'
  riskScore: number
  summary: string
  recommendedAction: string
}

export type EscalationStatus =
  | 'to_qualify'
  | 'sent'
  | 'waiting'
  | 'in_progress'
  | 'fix_ready'
  | 'resolved'
  | 'client_to_inform'

export type Escalation = {
  id: string
  ticketId: string
  linearIssueId: string
  status: EscalationStatus
  subject: string
  technicalSummary: string
  expectedBehavior: string
  actualBehavior: string
  reproductionSteps: string
  impact: string
  nextAction: string
  owner: string
  createdAt: string
  updatedAt: string
}

export type Training = {
  id: string
  title: string
  language: 'FR' | 'EN' | 'ES'
  trainingDate: string
  theme: string
  status: 'scheduled' | 'completed' | 'cancelled'
  registrations: Array<{
    hotelName: string
    participantName: string
    participantEmail: string
    status: 'registered' | 'cancelled' | 'no_show'
  }>
  replaySent: boolean
}

export type OnboardingStatus =
  | 'kickoff'
  | 'credentials_pending'
  | 'documents_pending'
  | 'build'
  | 'client_review'
  | 'adjustments'
  | 'ready'
  | 'live'
  | 'blocked'

export type OnboardingProject = {
  id: string
  clientId: string
  owner: 'Lan' | 'Thuy' | 'Dalia'
  plan: string
  status: OnboardingStatus
  startDate: string
  targetGoLive: string
  actualGoLive: string | null
  blockers: string
  iterationCount: number
}

export type KnowledgeArticle = {
  id: string
  title: string
  productArea: string
  problem: string
  symptoms: string[]
  causes: string[]
  checks: string[]
  solution: string
  clientReplyTemplate: string
  sourceTicketId: string
  createdAt: string
}

export type MonthlyMetric = {
  month: number
  year: number
  totalTickets: number
  totalCalls: number
  totalChats: number
  avgFirstResponseHours: number
  fcrRate: number
  topProducts: Array<{ name: string; count: number }>
  byChannel: { tickets: number; calls: number; chats: number }
  openedVsResolved: { opened: number; resolved: number }
}

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------
export const clients: Client[] = [
  { id: 'c1', name: 'Hôtel Lutetia Paris', segment: 'Strategic', country: 'France', language: 'FR', products: ['CRM Core', 'Guest Profile', 'Campaigns'] },
  { id: 'c2', name: 'Grand Hôtel Bordeaux', segment: 'Strategic', country: 'France', language: 'FR', products: ['CRM Core', 'Guest Profile', 'WhatsApp'] },
  { id: 'c3', name: 'Mercure Lyon Centre', segment: 'Gold', country: 'France', language: 'FR', products: ['CRM Core', 'Campaigns'] },
  { id: 'c4', name: 'Novotel Paris Bercy', segment: 'Gold', country: 'France', language: 'FR', products: ['CRM Core', 'PMS', 'Guest App'] },
  { id: 'c5', name: 'Pullman Marseille', segment: 'Gold', country: 'France', language: 'EN', products: ['CRM Core', 'Guest Profile'] },
  { id: 'c6', name: 'Ibis Strasbourg', segment: 'Silver', country: 'France', language: 'FR', products: ['CRM Core'] },
  { id: 'c7', name: 'Best Western Rennes', segment: 'Silver', country: 'France', language: 'FR', products: ['CRM Core', 'Campaigns'] },
  { id: 'c8', name: 'Campanile Nantes', segment: 'Silver', country: 'France', language: 'FR', products: ['CRM Core'] },
  { id: 'c9', name: 'Formula 1 Dijon', segment: 'Bronze', country: 'France', language: 'FR', products: ['CRM Core'] },
  { id: 'c10', name: 'Etap Hotel Lille', segment: 'Bronze', country: 'France', language: 'FR', products: ['CRM Core'] },
]

// ---------------------------------------------------------------------------
// TICKETS
// Risk scoring:
//   Strategic +40, Gold +30, Silver +15
//   >48h since lastAgentReply +25, >24h +15, >8h +8
//   negative sentiment +20, problem type +15
//   urgent priority +20, high priority +10
//   reopened status +10
//   cap 100
// ---------------------------------------------------------------------------
export const tickets: Ticket[] = [
  // t1: c1 Strategic, urgent, negative, problem, lastReply 72h ago → 40+25+20+15+20 = 100
  {
    id: 't1',
    externalId: 'ZD-1001',
    clientId: 'c1',
    subject: 'Campagnes email non envoyées depuis 3 jours',
    status: 'open',
    priority: 'urgent',
    type: 'problem',
    productArea: 'Campaigns',
    source: 'email',
    createdAt: '2026-05-14T08:00:00Z',
    updatedAt: '2026-05-17T10:00:00Z',
    lastClientMessageAt: '2026-05-17T10:00:00Z',
    lastAgentReplyAt: '2026-05-15T08:00:00Z',
    sentiment: 'negative',
    riskScore: 100,
    summary: 'Le client signale que ses campagnes email ne partent plus depuis 3 jours malgré un statut "Envoyé" dans l\'interface.',
    recommendedAction: 'Vérifier les logs d\'envoi SMTP, escalader en urgence à l\'équipe technique.',
  },
  // t2: c1 Strategic, high, negative, problem, lastReply 48h ago → 40+25+20+15+10 = 100 (capped)
  {
    id: 't2',
    externalId: 'ZD-1002',
    clientId: 'c1',
    subject: 'Profils clients dupliqués dans Guest Profile',
    status: 'open',
    priority: 'high',
    type: 'problem',
    productArea: 'Guest Profile',
    source: 'email',
    createdAt: '2026-05-13T09:00:00Z',
    updatedAt: '2026-05-16T09:00:00Z',
    lastClientMessageAt: '2026-05-16T09:00:00Z',
    lastAgentReplyAt: '2026-05-16T09:00:00Z',
    sentiment: 'negative',
    riskScore: 95,
    summary: 'Des doublons de profils clients apparaissent après la dernière synchronisation PMS. Environ 200 profils affectés.',
    recommendedAction: 'Analyser les logs de synchronisation PMS, préparer un script de déduplication.',
  },
  // t3: c2 Strategic, urgent, negative, problem, lastReply 36h ago → 40+15+20+15+20 = 100 (capped)
  {
    id: 't3',
    externalId: 'ZD-1003',
    clientId: 'c2',
    subject: 'WhatsApp Business : messages non délivrés aux clients',
    status: 'open',
    priority: 'urgent',
    type: 'problem',
    productArea: 'WhatsApp',
    source: 'phone',
    createdAt: '2026-05-15T14:00:00Z',
    updatedAt: '2026-05-17T08:00:00Z',
    lastClientMessageAt: '2026-05-17T08:00:00Z',
    lastAgentReplyAt: '2026-05-16T20:00:00Z',
    sentiment: 'negative',
    riskScore: 100,
    summary: 'Le canal WhatsApp du client ne délivre plus les messages de pré-arrivée depuis hier soir. Impact direct sur l\'expérience client.',
    recommendedAction: 'Vérifier le statut de l\'API WhatsApp Business, escalader si token expiré.',
  },
  // t4: c2 Strategic, high, neutral, question, lastReply 52h ago → 40+25+10 = 75
  {
    id: 't4',
    externalId: 'ZD-1004',
    clientId: 'c2',
    subject: 'Comment segmenter les clients VIP dans CRM Core ?',
    status: 'pending',
    priority: 'high',
    type: 'question',
    productArea: 'CRM Core',
    source: 'chat',
    createdAt: '2026-05-12T11:00:00Z',
    updatedAt: '2026-05-15T17:00:00Z',
    lastClientMessageAt: '2026-05-15T17:00:00Z',
    lastAgentReplyAt: '2026-05-16T08:00:00Z',
    sentiment: 'neutral',
    riskScore: 75,
    summary: 'Le client souhaite mettre en place une segmentation avancée pour ses clients VIP afin de personnaliser ses campagnes.',
    recommendedAction: 'Préparer un guide de segmentation, proposer un appel de démonstration.',
  },
  // t5: c3 Gold, urgent, negative, problem → 30+20+15+20 = 85
  {
    id: 't5',
    externalId: 'ZD-1005',
    clientId: 'c3',
    subject: 'Erreur 500 lors de l\'export des contacts',
    status: 'open',
    priority: 'urgent',
    type: 'problem',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-16T10:00:00Z',
    updatedAt: '2026-05-17T15:00:00Z',
    lastClientMessageAt: '2026-05-17T15:00:00Z',
    lastAgentReplyAt: '2026-05-17T10:00:00Z',
    sentiment: 'negative',
    riskScore: 85,
    summary: 'Le client obtient une erreur 500 à chaque tentative d\'export de la liste de contacts. Bloque la préparation de leur campagne hebdomadaire.',
    recommendedAction: 'Reproduire l\'erreur en environnement de test, vérifier les logs serveur.',
  },
  // t6: c4 Gold, high, neutral, problem → 30+15+8 = 53
  {
    id: 't6',
    externalId: 'ZD-1006',
    clientId: 'c4',
    subject: 'Synchronisation PMS - délai anormal de 4h',
    status: 'open',
    priority: 'high',
    type: 'problem',
    productArea: 'PMS',
    source: 'email',
    createdAt: '2026-05-17T08:00:00Z',
    updatedAt: '2026-05-18T07:00:00Z',
    lastClientMessageAt: '2026-05-18T07:00:00Z',
    lastAgentReplyAt: '2026-05-18T06:00:00Z',
    sentiment: 'neutral',
    riskScore: 53,
    summary: 'La synchronisation avec le PMS Opera a un délai de 4 heures au lieu de 15 minutes. Réservations non reflétées en temps réel.',
    recommendedAction: 'Vérifier la configuration du webhook PMS, contacter l\'éditeur si nécessaire.',
  },
  // t7: c5 Gold, medium, negative, problem → 30+20+15+8 = 73
  {
    id: 't7',
    externalId: 'ZD-1007',
    clientId: 'c5',
    subject: 'Guest App: push notifications not received by guests',
    status: 'reopened',
    priority: 'medium',
    type: 'problem',
    productArea: 'Guest App',
    source: 'email',
    createdAt: '2026-05-10T12:00:00Z',
    updatedAt: '2026-05-17T16:00:00Z',
    lastClientMessageAt: '2026-05-17T16:00:00Z',
    lastAgentReplyAt: '2026-05-18T04:00:00Z',
    sentiment: 'negative',
    riskScore: 73,
    summary: 'Push notifications for the guest app are not being delivered to iOS devices. Issue was marked as resolved but has returned.',
    recommendedAction: 'Check APNs certificate validity, review push notification service logs.',
  },
  // t8: c6 Silver, medium, neutral, question → 15+8 = 23
  {
    id: 't8',
    externalId: 'ZD-1008',
    clientId: 'c6',
    subject: 'Comment créer un template d\'email personnalisé ?',
    status: 'pending',
    priority: 'medium',
    type: 'question',
    productArea: 'Campaigns',
    source: 'chat',
    createdAt: '2026-05-18T09:00:00Z',
    updatedAt: '2026-05-18T09:30:00Z',
    lastClientMessageAt: '2026-05-18T09:30:00Z',
    lastAgentReplyAt: '2026-05-18T09:20:00Z',
    sentiment: 'neutral',
    riskScore: 23,
    summary: 'Le client souhaite créer son premier template email personnalisé avec le logo de l\'hôtel et ses couleurs.',
    recommendedAction: 'Envoyer le guide de création de templates et proposer un appel de 20 minutes.',
  },
  // t9: c7 Silver, low, positive, question → 15 = 15
  {
    id: 't9',
    externalId: 'ZD-1009',
    clientId: 'c7',
    subject: 'Demande d\'ajout d\'un utilisateur supplémentaire',
    status: 'resolved',
    priority: 'low',
    type: 'task',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-16T14:00:00Z',
    updatedAt: '2026-05-17T10:00:00Z',
    lastClientMessageAt: '2026-05-16T14:00:00Z',
    lastAgentReplyAt: '2026-05-17T10:00:00Z',
    sentiment: 'positive',
    riskScore: 15,
    summary: 'Le client souhaite ajouter un accès pour leur nouvelle responsable marketing.',
    recommendedAction: 'Créer l\'accès utilisateur selon les permissions standard.',
  },
  // t10: c3 Gold, high, negative, problem, reopened → 30+20+15+10+10 = 85
  {
    id: 't10',
    externalId: 'ZD-1010',
    clientId: 'c3',
    subject: 'Campagne de bienvenue : taux d\'ouverture à 0%',
    status: 'reopened',
    priority: 'high',
    type: 'problem',
    productArea: 'Campaigns',
    source: 'email',
    createdAt: '2026-05-08T10:00:00Z',
    updatedAt: '2026-05-18T08:00:00Z',
    lastClientMessageAt: '2026-05-18T08:00:00Z',
    lastAgentReplyAt: '2026-05-17T18:00:00Z',
    sentiment: 'negative',
    riskScore: 85,
    summary: 'La campagne de bienvenue automatique affiche un taux d\'ouverture de 0% depuis une semaine. Problème d\'envoi ou de tracking.',
    recommendedAction: 'Vérifier la configuration du tracking des ouvertures, tester l\'envoi manuel.',
  },
  // t11: c4 Gold, medium, neutral, feature → 30 = 30
  {
    id: 't11',
    externalId: 'ZD-1011',
    clientId: 'c4',
    subject: 'Demande de fonctionnalité : export automatique mensuel',
    status: 'pending',
    priority: 'medium',
    type: 'feature',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-14T11:00:00Z',
    updatedAt: '2026-05-15T14:00:00Z',
    lastClientMessageAt: '2026-05-14T11:00:00Z',
    lastAgentReplyAt: '2026-05-15T14:00:00Z',
    sentiment: 'neutral',
    riskScore: 30,
    summary: 'Le client souhaite recevoir automatiquement un export CSV de ses contacts chaque 1er du mois.',
    recommendedAction: 'Vérifier si la fonctionnalité est au roadmap, sinon soumettre un ticket de feature request.',
  },
  // t12: c8 Silver, low, positive, task → 15 = 15
  {
    id: 't12',
    externalId: 'ZD-1012',
    clientId: 'c8',
    subject: 'Configuration de la signature email',
    status: 'resolved',
    priority: 'low',
    type: 'task',
    productArea: 'Campaigns',
    source: 'chat',
    createdAt: '2026-05-17T10:00:00Z',
    updatedAt: '2026-05-17T16:00:00Z',
    lastClientMessageAt: '2026-05-17T10:00:00Z',
    lastAgentReplyAt: '2026-05-17T16:00:00Z',
    sentiment: 'positive',
    riskScore: 15,
    summary: 'Le client souhaite mettre à jour la signature email automatique dans ses campagnes.',
    recommendedAction: 'Guider le client dans les paramètres de signature email.',
  },
  // t13: c1 Strategic, medium, neutral, question → 40+8 = 48
  {
    id: 't13',
    externalId: 'ZD-1013',
    clientId: 'c1',
    subject: 'Performance des campagnes : rapport mensuel Mai 2026',
    status: 'pending',
    priority: 'medium',
    type: 'question',
    productArea: 'Campaigns',
    source: 'email',
    createdAt: '2026-05-18T07:00:00Z',
    updatedAt: '2026-05-18T10:00:00Z',
    lastClientMessageAt: '2026-05-18T10:00:00Z',
    lastAgentReplyAt: '2026-05-18T08:00:00Z',
    sentiment: 'neutral',
    riskScore: 48,
    summary: 'Le client demande un rapport de performance détaillé de ses campagnes pour le mois de mai.',
    recommendedAction: 'Préparer le rapport depuis l\'outil de reporting, envoyer avant fin de journée.',
  },
  // t14: c5 Gold, low, positive, question → 30 = 30
  {
    id: 't14',
    externalId: 'ZD-1014',
    clientId: 'c5',
    subject: 'Best practices for pre-arrival email timing',
    status: 'pending',
    priority: 'low',
    type: 'question',
    productArea: 'Campaigns',
    source: 'email',
    createdAt: '2026-05-17T13:00:00Z',
    updatedAt: '2026-05-18T09:00:00Z',
    lastClientMessageAt: '2026-05-17T13:00:00Z',
    lastAgentReplyAt: '2026-05-18T09:00:00Z',
    sentiment: 'positive',
    riskScore: 30,
    summary: 'Client asks about recommended timing for pre-arrival emails (24h vs 48h vs 72h before check-in).',
    recommendedAction: 'Share hospitality email benchmark data, recommend A/B testing approach.',
  },
  // t15: c9 Bronze, low, neutral, question → 0 = 0
  {
    id: 't15',
    externalId: 'ZD-1015',
    clientId: 'c9',
    subject: 'Réinitialisation de mot de passe oublié',
    status: 'resolved',
    priority: 'low',
    type: 'task',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-18T08:30:00Z',
    updatedAt: '2026-05-18T09:00:00Z',
    lastClientMessageAt: '2026-05-18T08:30:00Z',
    lastAgentReplyAt: '2026-05-18T09:00:00Z',
    sentiment: 'neutral',
    riskScore: 8,
    summary: 'L\'utilisateur principal du client ne peut plus se connecter à son compte CRM.',
    recommendedAction: 'Envoyer le lien de réinitialisation de mot de passe via l\'interface admin.',
  },
  // t16: c10 Bronze, medium, negative, problem → 20+15+8 = 43
  {
    id: 't16',
    externalId: 'ZD-1016',
    clientId: 'c10',
    subject: 'Import CSV : erreur de formatage des données',
    status: 'open',
    priority: 'medium',
    type: 'problem',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-17T15:00:00Z',
    updatedAt: '2026-05-18T07:00:00Z',
    lastClientMessageAt: '2026-05-18T07:00:00Z',
    lastAgentReplyAt: '2026-05-18T05:00:00Z',
    sentiment: 'negative',
    riskScore: 43,
    summary: 'Le client obtient une erreur lors de l\'import de son fichier CSV de contacts : format de date non reconnu.',
    recommendedAction: 'Envoyer le template CSV standard D-EDGE, guider le client dans la mise en forme.',
  },
  // t17: c6 Silver, high, negative, problem → 15+20+15+10 = 60
  {
    id: 't17',
    externalId: 'ZD-1017',
    clientId: 'c6',
    subject: 'Segments marketing non mis à jour automatiquement',
    status: 'open',
    priority: 'high',
    type: 'problem',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-15T09:00:00Z',
    updatedAt: '2026-05-17T14:00:00Z',
    lastClientMessageAt: '2026-05-17T14:00:00Z',
    lastAgentReplyAt: '2026-05-17T10:00:00Z',
    sentiment: 'negative',
    riskScore: 60,
    summary: 'Les segments marketing configurés avec des règles dynamiques ne se mettent plus à jour depuis la mise à jour de la semaine dernière.',
    recommendedAction: 'Vérifier la tâche planifiée de mise à jour des segments, relancer manuellement si nécessaire.',
  },
  // t18: c7 Silver, medium, neutral, feature → 15 = 15
  {
    id: 't18',
    externalId: 'ZD-1018',
    clientId: 'c7',
    subject: 'Intégration Google Reviews dans le CRM',
    status: 'pending',
    priority: 'medium',
    type: 'feature',
    productArea: 'CRM Core',
    source: 'email',
    createdAt: '2026-05-16T11:00:00Z',
    updatedAt: '2026-05-17T09:00:00Z',
    lastClientMessageAt: '2026-05-16T11:00:00Z',
    lastAgentReplyAt: '2026-05-17T09:00:00Z',
    sentiment: 'neutral',
    riskScore: 15,
    summary: 'Le client souhaite voir les avis Google de ses clients directement dans le CRM pour contextualiser les profils.',
    recommendedAction: 'Remonter au Product Manager, documenter le cas d\'usage.',
  },
  // t19: c2 Strategic, high, negative, problem → 40+20+15+10+8 = 93
  {
    id: 't19',
    externalId: 'ZD-1019',
    clientId: 'c2',
    subject: 'Guest Profile : champs personnalisés supprimés après migration',
    status: 'open',
    priority: 'high',
    type: 'problem',
    productArea: 'Guest Profile',
    source: 'email',
    createdAt: '2026-05-17T07:00:00Z',
    updatedAt: '2026-05-18T07:00:00Z',
    lastClientMessageAt: '2026-05-18T07:00:00Z',
    lastAgentReplyAt: '2026-05-18T06:00:00Z',
    sentiment: 'negative',
    riskScore: 93,
    summary: 'Après la migration de base de données effectuée vendredi, 12 champs personnalisés du module Guest Profile ont été perdus.',
    recommendedAction: 'Contacter l\'équipe DevOps pour restauration des données, préparer un rapport d\'impact.',
  },
  // t20: c4 Gold, low, positive, question → 30 = 30
  {
    id: 't20',
    externalId: 'ZD-1020',
    clientId: 'c4',
    subject: 'Formation Guest App pour les nouvelles réceptionnistes',
    status: 'pending',
    priority: 'low',
    type: 'question',
    productArea: 'Guest App',
    source: 'email',
    createdAt: '2026-05-18T08:00:00Z',
    updatedAt: '2026-05-18T10:00:00Z',
    lastClientMessageAt: '2026-05-18T08:00:00Z',
    lastAgentReplyAt: '2026-05-18T10:00:00Z',
    sentiment: 'positive',
    riskScore: 30,
    summary: 'Le client souhaite organiser une session de formation Guest App pour ses 3 nouvelles réceptionnistes arrivées en mai.',
    recommendedAction: 'Planifier une session de formation via Acuity, envoyer les supports pédagogiques.',
  },
]

// ---------------------------------------------------------------------------
// ESCALATIONS
// ---------------------------------------------------------------------------
export const escalations: Escalation[] = [
  {
    id: 'e1',
    ticketId: 't1',
    linearIssueId: 'LIN-4521',
    status: 'in_progress',
    subject: 'Campagnes email : blocage SMTP côté serveur d\'envoi',
    technicalSummary: 'Les campagnes affichent le statut "Envoyé" dans l\'interface mais les logs SMTP montrent des timeouts répétés côté MTA. Suspicion de liste noire ou de quota dépassé.',
    expectedBehavior: 'Les emails partent dans les 15 minutes suivant le déclenchement de la campagne.',
    actualBehavior: 'Les emails restent bloqués dans la queue d\'envoi sans message d\'erreur visible pour le client.',
    reproductionSteps: '1. Créer une campagne test\n2. La programmer pour envoi immédiat\n3. Observer la queue SMTP\n4. Vérifier les logs MTA',
    impact: 'Client ne peut pas envoyer de campagnes depuis 3 jours. Perte estimée de revenus potentiels liés aux promotions.',
    nextAction: 'Vérifier la réputation IP, contacter le fournisseur SMTP si liste noire confirmée.',
    owner: 'Équipe Infrastructure',
    createdAt: '2026-05-15T10:00:00Z',
    updatedAt: '2026-05-17T14:00:00Z',
  },
  {
    id: 'e2',
    ticketId: 't3',
    linearIssueId: 'LIN-4522',
    status: 'sent',
    subject: 'WhatsApp Business API : token d\'accès expiré',
    technicalSummary: 'Le token d\'accès WhatsApp Business API du client a expiré et le renouvellement automatique a échoué. Les messages ne transitent plus par le webhook.',
    expectedBehavior: 'Les messages WhatsApp sont délivrés aux clients dans les 30 secondes.',
    actualBehavior: 'Les messages retournent une erreur 401 au niveau du webhook, aucun message n\'est délivré.',
    reproductionSteps: '1. Déclencher l\'envoi d\'un message WhatsApp depuis le CRM\n2. Consulter les logs du webhook\n3. Observer l\'erreur 401',
    impact: 'Tous les messages de pré-arrivée WhatsApp sont bloqués. Client impacté pour tous ses clients attendus cette semaine.',
    nextAction: 'Renouveler le token manuellement, mettre en place un alerting sur l\'expiration des tokens.',
    owner: 'Équipe Intégrations',
    createdAt: '2026-05-16T15:00:00Z',
    updatedAt: '2026-05-17T09:00:00Z',
  },
  {
    id: 'e3',
    ticketId: 't5',
    linearIssueId: 'LIN-4523',
    status: 'to_qualify',
    subject: 'Export contacts : erreur 500 serveur non identifiée',
    technicalSummary: 'L\'export de contacts déclenche une erreur 500 non documentée. Les logs applicatifs montrent un timeout en base de données lors de la génération du fichier CSV pour les listes > 5000 contacts.',
    expectedBehavior: 'L\'export CSV se génère en moins de 30 secondes pour toute taille de liste.',
    actualBehavior: 'Erreur 500 après 30 secondes pour les listes > 5000 contacts.',
    reproductionSteps: '1. Aller dans CRM Core > Contacts\n2. Sélectionner > 5000 contacts\n3. Cliquer sur "Exporter CSV"\n4. Observer l\'erreur 500',
    impact: 'Le client ne peut pas préparer sa campagne hebdomadaire. Bloquant.',
    nextAction: 'Qualifier l\'issue avec l\'équipe backend, définir la priorité.',
    owner: 'À assigner',
    createdAt: '2026-05-17T16:00:00Z',
    updatedAt: '2026-05-17T16:00:00Z',
  },
  {
    id: 'e4',
    ticketId: 't2',
    linearIssueId: 'LIN-4524',
    status: 'fix_ready',
    subject: 'Guest Profile : déduplication des profils après sync PMS',
    technicalSummary: 'La synchronisation PMS crée des doublons lorsque le champ "email" est absent dans la réservation. Un script de déduplication a été développé et est prêt à déployer.',
    expectedBehavior: 'Chaque client a un seul profil même en cas de synchronisations multiples.',
    actualBehavior: 'Des profils dupliqués apparaissent après chaque synchronisation PMS si l\'email est absent.',
    reproductionSteps: '1. Créer une réservation sans email dans le PMS\n2. Déclencher la synchronisation\n3. Observer les doublons dans Guest Profile',
    impact: 'Environ 200 profils dupliqués. Fausse les statistiques et les campagnes du client.',
    nextAction: 'Déployer le script de déduplication en production, informer le client.',
    owner: 'Équipe Backend',
    createdAt: '2026-05-14T11:00:00Z',
    updatedAt: '2026-05-18T08:00:00Z',
  },
  {
    id: 'e5',
    ticketId: 't10',
    linearIssueId: 'LIN-4525',
    status: 'client_to_inform',
    subject: 'Tracking ouvertures emails : pixel désactivé par erreur',
    technicalSummary: 'Le pixel de tracking des ouvertures email a été désactivé lors d\'une mise à jour de sécurité. Il a été réactivé, le tracking fonctionne à nouveau correctement.',
    expectedBehavior: 'Le taux d\'ouverture est calculé correctement via le pixel de tracking.',
    actualBehavior: 'Taux d\'ouverture à 0% car le pixel était absent des emails envoyés.',
    reproductionSteps: 'N/A - Bug confirmé et corrigé.',
    impact: 'Données de tracking des 7 derniers jours incorrectes pour ce client.',
    nextAction: 'Informer le client de la correction, expliquer l\'impact sur les données historiques.',
    owner: 'Équipe Support',
    createdAt: '2026-05-10T09:00:00Z',
    updatedAt: '2026-05-18T07:00:00Z',
  },
  {
    id: 'e6',
    ticketId: 't17',
    linearIssueId: 'LIN-4526',
    status: 'waiting',
    subject: 'Segments dynamiques : tâche planifiée en échec',
    technicalSummary: 'La tâche cron de mise à jour des segments dynamiques échoue silencieusement depuis la mise à jour v2.14.1. La regression a été identifiée, un correctif est en cours de développement.',
    expectedBehavior: 'Les segments dynamiques se mettent à jour toutes les 6 heures automatiquement.',
    actualBehavior: 'La tâche cron s\'exécute mais ne met pas à jour les segments (exit code 0 sans action réelle).',
    reproductionSteps: '1. Créer un segment dynamique\n2. Attendre 6 heures\n3. Ajouter un contact correspondant aux critères\n4. Vérifier que le contact n\'apparaît pas dans le segment',
    impact: 'Tous les clients utilisant des segments dynamiques sont potentiellement affectés. Campagnes mal ciblées.',
    nextAction: 'En attente du correctif de l\'équipe backend (ETA : 2026-05-20).',
    owner: 'Équipe Backend',
    createdAt: '2026-05-15T14:00:00Z',
    updatedAt: '2026-05-17T11:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// TRAININGS
// ---------------------------------------------------------------------------
export const trainings: Training[] = [
  {
    id: 'tr1',
    title: 'Formation CRM Core - Prise en main',
    language: 'FR',
    trainingDate: '2026-05-20T10:00:00Z',
    theme: 'CRM Core',
    status: 'scheduled',
    registrations: [
      { hotelName: 'Hôtel Lutetia Paris', participantName: 'Marie Dupont', participantEmail: 'marie.dupont@lutetia.fr', status: 'registered' },
      { hotelName: 'Hôtel Lutetia Paris', participantName: 'Jean Martin', participantEmail: 'jean.martin@lutetia.fr', status: 'registered' },
      { hotelName: 'Mercure Lyon Centre', participantName: 'Sophie Bernard', participantEmail: 's.bernard@mercure-lyon.fr', status: 'registered' },
      { hotelName: 'Ibis Strasbourg', participantName: 'Pierre Leroy', participantEmail: 'p.leroy@ibis-strasbourg.fr', status: 'registered' },
      { hotelName: 'Best Western Rennes', participantName: 'Claire Simon', participantEmail: 'c.simon@bwrennes.fr', status: 'registered' },
    ],
    replaySent: false,
  },
  {
    id: 'tr2',
    title: 'Formation Campagnes Email - Avancé',
    language: 'FR',
    trainingDate: '2026-05-22T14:00:00Z',
    theme: 'Campaigns',
    status: 'scheduled',
    registrations: [
      { hotelName: 'Grand Hôtel Bordeaux', participantName: 'Alice Moreau', participantEmail: 'a.moreau@grandhotelbordeaux.fr', status: 'registered' },
      { hotelName: 'Novotel Paris Bercy', participantName: 'François Petit', participantEmail: 'f.petit@novotel-bercy.fr', status: 'registered' },
      { hotelName: 'Pullman Marseille', participantName: 'Isabelle Roux', participantEmail: 'i.roux@pullman-marseille.fr', status: 'registered' },
      { hotelName: 'Best Western Rennes', participantName: 'Thomas Durand', participantEmail: 't.durand@bwrennes.fr', status: 'cancelled' },
    ],
    replaySent: false,
  },
  {
    id: 'tr3',
    title: 'Guest Profile - Gestion des profils clients',
    language: 'FR',
    trainingDate: '2026-05-15T10:00:00Z',
    theme: 'Guest Profile',
    status: 'completed',
    registrations: [
      { hotelName: 'Hôtel Lutetia Paris', participantName: 'Nathalie Blanc', participantEmail: 'n.blanc@lutetia.fr', status: 'registered' },
      { hotelName: 'Grand Hôtel Bordeaux', participantName: 'Marc Girard', participantEmail: 'm.girard@grandhotelbordeaux.fr', status: 'registered' },
      { hotelName: 'Campanile Nantes', participantName: 'Julie Lambert', participantEmail: 'j.lambert@campanile-nantes.fr', status: 'no_show' },
      { hotelName: 'Formula 1 Dijon', participantName: 'Patrick Morin', participantEmail: 'p.morin@f1-dijon.fr', status: 'registered' },
      { hotelName: 'Etap Hotel Lille', participantName: 'Cécile Fontaine', participantEmail: 'c.fontaine@etap-lille.fr', status: 'registered' },
    ],
    replaySent: true,
  },
  {
    id: 'tr4',
    title: 'WhatsApp Business Integration Training',
    language: 'EN',
    trainingDate: '2026-05-21T09:00:00Z',
    theme: 'WhatsApp',
    status: 'scheduled',
    registrations: [
      { hotelName: 'Pullman Marseille', participantName: 'Sarah Johnson', participantEmail: 's.johnson@pullman-marseille.fr', status: 'registered' },
      { hotelName: 'Novotel Paris Bercy', participantName: 'Michael Chen', participantEmail: 'm.chen@novotel-bercy.fr', status: 'registered' },
      { hotelName: 'Grand Hôtel Bordeaux', participantName: 'Emma Wilson', participantEmail: 'e.wilson@grandhotelbordeaux.fr', status: 'registered' },
    ],
    replaySent: false,
  },
  {
    id: 'tr5',
    title: 'Formación CRM Core - Módulo de Campañas',
    language: 'ES',
    trainingDate: '2026-05-08T11:00:00Z',
    theme: 'Campaigns',
    status: 'completed',
    registrations: [
      { hotelName: 'Hotel Barcelona Palace', participantName: 'Carlos García', participantEmail: 'c.garcia@barcelonapalace.es', status: 'registered' },
      { hotelName: 'Hotel Madrid Centro', participantName: 'Ana Martínez', participantEmail: 'a.martinez@hotelmadridecentro.es', status: 'registered' },
      { hotelName: 'Parador Sevilla', participantName: 'Luis Fernández', participantEmail: 'l.fernandez@paradores.es', status: 'registered' },
      { hotelName: 'Hotel Valencia Sol', participantName: 'María López', participantEmail: 'm.lopez@hotelvalenciasol.es', status: 'no_show' },
    ],
    replaySent: true,
  },
  {
    id: 'tr6',
    title: 'PMS Integration - Configuration avancée',
    language: 'FR',
    trainingDate: '2026-05-06T14:00:00Z',
    theme: 'PMS',
    status: 'completed',
    registrations: [
      { hotelName: 'Novotel Paris Bercy', participantName: 'Hervé Lecomte', participantEmail: 'h.lecomte@novotel-bercy.fr', status: 'registered' },
      { hotelName: 'Mercure Lyon Centre', participantName: 'Valérie Rousseau', participantEmail: 'v.rousseau@mercure-lyon.fr', status: 'registered' },
      { hotelName: 'Ibis Strasbourg', participantName: 'Denis Martin', participantEmail: 'd.martin@ibis-strasbourg.fr', status: 'cancelled' },
      { hotelName: 'Best Western Rennes', participantName: 'Sylvie Bonnet', participantEmail: 's.bonnet@bwrennes.fr', status: 'registered' },
      { hotelName: 'Campanile Nantes', participantName: 'Roger Petit', participantEmail: 'r.petit@campanile-nantes.fr', status: 'registered' },
    ],
    replaySent: true,
  },
  {
    id: 'tr7',
    title: 'Guest App - Setup et personnalisation',
    language: 'FR',
    trainingDate: '2026-06-03T10:00:00Z',
    theme: 'Guest App',
    status: 'scheduled',
    registrations: [
      { hotelName: 'Novotel Paris Bercy', participantName: 'Christine Vidal', participantEmail: 'c.vidal@novotel-bercy.fr', status: 'registered' },
      { hotelName: 'Pullman Marseille', participantName: 'Éric Perrin', participantEmail: 'e.perrin@pullman-marseille.fr', status: 'registered' },
      { hotelName: 'Grand Hôtel Bordeaux', participantName: 'Laure Guerin', participantEmail: 'l.guerin@grandhotelbordeaux.fr', status: 'registered' },
      { hotelName: 'Mercure Lyon Centre', participantName: 'Nicolas Lefebvre', participantEmail: 'n.lefebvre@mercure-lyon.fr', status: 'registered' },
    ],
    replaySent: false,
  },
  {
    id: 'tr8',
    title: 'Reporting & Analytics - Lecture des KPIs',
    language: 'FR',
    trainingDate: '2026-05-29T14:00:00Z',
    theme: 'CRM Core',
    status: 'scheduled',
    registrations: [
      { hotelName: 'Hôtel Lutetia Paris', participantName: 'Amélie Gros', participantEmail: 'a.gros@lutetia.fr', status: 'registered' },
      { hotelName: 'Grand Hôtel Bordeaux', participantName: 'Xavier Lemaire', participantEmail: 'x.lemaire@grandhotelbordeaux.fr', status: 'registered' },
      { hotelName: 'Mercure Lyon Centre', participantName: 'Sandrine Prévot', participantEmail: 's.prevot@mercure-lyon.fr', status: 'registered' },
      { hotelName: 'Ibis Strasbourg', participantName: 'Laurent Chevalier', participantEmail: 'l.chevalier@ibis-strasbourg.fr', status: 'registered' },
      { hotelName: 'Formula 1 Dijon', participantName: 'Monique Renard', participantEmail: 'm.renard@f1-dijon.fr', status: 'registered' },
    ],
    replaySent: false,
  },
]

// ---------------------------------------------------------------------------
// ONBOARDING PROJECTS
// ---------------------------------------------------------------------------
export const onboardingProjects: OnboardingProject[] = [
  {
    id: 'op1',
    clientId: 'c1',
    owner: 'Lan',
    plan: 'CRM Core + Guest Profile + Campaigns',
    status: 'live',
    startDate: '2026-01-15',
    targetGoLive: '2026-03-31',
    actualGoLive: '2026-04-14',
    blockers: '',
    iterationCount: 2,
  },
  {
    id: 'op2',
    clientId: 'c2',
    owner: 'Thuy',
    plan: 'CRM Core + Guest Profile + WhatsApp',
    status: 'blocked',
    startDate: '2026-02-01',
    targetGoLive: '2026-04-30',
    actualGoLive: null,
    blockers: 'Credentials WhatsApp Business non fournies. Le client attend la validation Meta depuis 3 semaines.',
    iterationCount: 1,
  },
  {
    id: 'op3',
    clientId: 'c3',
    owner: 'Dalia',
    plan: 'CRM Core + Campaigns',
    status: 'adjustments',
    startDate: '2026-03-01',
    targetGoLive: '2026-04-15',
    actualGoLive: null,
    blockers: '',
    iterationCount: 4,
  },
  {
    id: 'op4',
    clientId: 'c4',
    owner: 'Lan',
    plan: 'CRM Core + PMS + Guest App',
    status: 'build',
    startDate: '2026-03-15',
    targetGoLive: '2026-05-31',
    actualGoLive: null,
    blockers: '',
    iterationCount: 1,
  },
  {
    id: 'op5',
    clientId: 'c5',
    owner: 'Thuy',
    plan: 'CRM Core + Guest Profile',
    status: 'blocked',
    startDate: '2026-02-15',
    targetGoLive: '2026-04-15',
    actualGoLive: null,
    blockers: 'Accès PMS Opera non fourni. Le client cherche un prestataire pour configurer le connecteur.',
    iterationCount: 3,
  },
  {
    id: 'op6',
    clientId: 'c6',
    owner: 'Dalia',
    plan: 'CRM Core',
    status: 'client_review',
    startDate: '2026-04-01',
    targetGoLive: '2026-05-31',
    actualGoLive: null,
    blockers: '',
    iterationCount: 1,
  },
  {
    id: 'op7',
    clientId: 'c7',
    owner: 'Lan',
    plan: 'CRM Core + Campaigns',
    status: 'blocked',
    startDate: '2026-03-01',
    targetGoLive: '2026-04-30',
    actualGoLive: null,
    blockers: 'Template HTML de campagne refusé par le client 3 fois. Attente de validation de la charte graphique de leur nouveau logo.',
    iterationCount: 5,
  },
  {
    id: 'op8',
    clientId: 'c8',
    owner: 'Thuy',
    plan: 'CRM Core',
    status: 'kickoff',
    startDate: '2026-05-10',
    targetGoLive: '2026-06-30',
    actualGoLive: null,
    blockers: '',
    iterationCount: 0,
  },
]

// ---------------------------------------------------------------------------
// KNOWLEDGE ARTICLES
// ---------------------------------------------------------------------------
export const knowledgeArticles: KnowledgeArticle[] = [
  {
    id: 'kb1',
    title: 'Campagnes email bloquées : diagnostic SMTP et résolution',
    productArea: 'Campaigns',
    problem: 'Les campagnes email affichent le statut "Envoyé" dans l\'interface mais les emails n\'arrivent pas dans les boîtes de réception des destinataires.',
    symptoms: [
      'Statut "Envoyé" dans l\'interface sans délivrance réelle',
      'Taux de délivrance à 0% dans les statistiques',
      'Aucun message d\'erreur visible pour le client',
      'Les tests d\'envoi manuel fonctionnent parfois',
    ],
    causes: [
      'Adresse IP d\'envoi blacklistée par un fournisseur anti-spam',
      'Quota d\'envoi dépassé chez le fournisseur SMTP',
      'Domaine d\'envoi non authentifié (SPF/DKIM manquant)',
      'Contenu de l\'email déclenchant les filtres anti-spam',
    ],
    checks: [
      'Vérifier la réputation IP sur MXToolbox (mxtoolbox.com/blacklists)',
      'Consulter les logs SMTP dans l\'interface d\'administration',
      'Vérifier les enregistrements SPF et DKIM du domaine d\'envoi',
      'Tester l\'envoi vers une adresse Gmail personnelle',
      'Vérifier les quotas d\'envoi dans les paramètres du compte',
    ],
    solution: 'Si l\'IP est blacklistée, contacter l\'équipe infrastructure pour changer l\'IP d\'envoi et demander le retrait de la liste noire. Si c\'est un problème SPF/DKIM, mettre à jour les enregistrements DNS selon la documentation D-EDGE. Si c\'est un problème de quota, augmenter le plan ou étaler l\'envoi.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nNous avons identifié la cause du blocage de vos campagnes. [Description du problème]. Nous avons [action effectuée] et vos campagnes devraient maintenant partir normalement.\n\nNous vous recommandons de tester avec une campagne de faible volume dans un premier temps.\n\nN\'hésitez pas à nous contacter si le problème persiste.\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't1',
    createdAt: '2026-05-16T14:00:00Z',
  },
  {
    id: 'kb2',
    title: 'Profils clients dupliqués après synchronisation PMS',
    productArea: 'Guest Profile',
    problem: 'Des profils clients dupliqués apparaissent dans le module Guest Profile après une synchronisation avec le PMS (Opera, Fidelio, Protel).',
    symptoms: [
      'Plusieurs profils avec le même nom de client',
      'Statistiques de clients incohérentes (nombre de séjours incorrect)',
      'Les campagnes ciblées envoient plusieurs emails au même client',
      'L\'historique des séjours est fragmenté entre les doublons',
    ],
    causes: [
      'Absence du champ email dans la réservation PMS (matching impossible)',
      'Incohérence orthographique dans le nom du client (Jean vs JEAN)',
      'Numéro de réservation PMS non transmis lors de la synchronisation',
      'Synchronisation déclenchée plusieurs fois pour la même réservation',
    ],
    checks: [
      'Vérifier si le champ email est obligatoire dans le PMS',
      'Consulter les logs de synchronisation pour identifier les enregistrements sans email',
      'Rechercher le client par nom dans Guest Profile pour identifier tous les doublons',
      'Vérifier la configuration du matching dans l\'interface d\'administration',
    ],
    solution: 'Utiliser l\'outil de fusion de profils dans Guest Profile > Administration > Gestion des doublons. Pour éviter les futurs doublons, configurer le champ email comme obligatoire dans le PMS et activer le matching par numéro de réservation comme fallback.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nNous avons identifié des profils dupliqués dans votre base Guest Profile, causés par [raison]. Nous avons procédé à la fusion de [X] profils dupliqués.\n\nPour éviter que cela se reproduise, nous vous recommandons de [recommandation].\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't2',
    createdAt: '2026-05-14T16:00:00Z',
  },
  {
    id: 'kb3',
    title: 'WhatsApp Business : messages non délivrés - token expiré',
    productArea: 'WhatsApp',
    problem: 'Les messages WhatsApp ne sont plus délivrés aux clients de l\'hôtel malgré un statut "Envoyé" dans l\'interface CRM.',
    symptoms: [
      'Messages non reçus par les clients',
      'Erreur 401 dans les logs du webhook WhatsApp',
      'Statut "Envoyé" affiché incorrectement dans l\'interface',
      'Alertes d\'échec d\'envoi dans l\'historique',
    ],
    causes: [
      'Token d\'accès WhatsApp Business API expiré (durée de vie 60 jours)',
      'Compte WhatsApp Business désactivé par Meta',
      'URL du webhook incorrecte ou injoignable',
      'Numéro de téléphone non vérifié ou suspendu',
    ],
    checks: [
      'Vérifier la date d\'expiration du token dans Meta for Developers',
      'Tester l\'URL du webhook depuis l\'interface Meta',
      'Vérifier le statut du numéro WhatsApp Business dans Meta Business Manager',
      'Consulter les logs d\'erreur dans CRM > Intégrations > WhatsApp',
    ],
    solution: 'Générer un nouveau token d\'accès permanent dans Meta for Developers > Mon application > WhatsApp > Configuration. Mettre à jour le token dans CRM > Paramètres > Intégrations > WhatsApp Business. Configurer une alerte automatique 7 jours avant l\'expiration.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nLe problème de non-délivrance de vos messages WhatsApp était causé par l\'expiration du token d\'accès à l\'API WhatsApp Business. Nous avons renouvelé le token et vos messages sont à nouveau délivrés correctement.\n\nNous avons également mis en place une alerte automatique pour vous prévenir 7 jours avant la prochaine expiration.\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't3',
    createdAt: '2026-05-17T10:00:00Z',
  },
  {
    id: 'kb4',
    title: 'Export CSV contacts : erreur 500 pour listes volumineuses',
    productArea: 'CRM Core',
    problem: 'L\'export CSV de la liste de contacts échoue avec une erreur 500 lorsque la sélection dépasse un certain nombre de contacts.',
    symptoms: [
      'Erreur 500 après 30 secondes de chargement',
      'Message "Une erreur s\'est produite lors de l\'export"',
      'L\'export fonctionne pour les petites listes (< 1000 contacts)',
      'Aucun fichier téléchargé',
    ],
    causes: [
      'Timeout de la requête SQL pour les grands volumes de données',
      'Limite de mémoire serveur atteinte lors de la génération du fichier',
      'Index de base de données manquant sur les colonnes filtrées',
    ],
    checks: [
      'Tester l\'export avec une sélection de moins de 1000 contacts',
      'Vérifier la taille estimée de la liste sélectionnée',
      'Tenter l\'export avec des filtres pour réduire le volume',
    ],
    solution: 'Solution de contournement : segmenter l\'export en plusieurs listes de moins de 5000 contacts. Solution définitive : ticket escaladé à l\'équipe backend pour optimisation de la requête SQL et augmentation du timeout.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nNous avons identifié que l\'erreur lors de l\'export survient lorsque la sélection dépasse 5 000 contacts. Dans l\'attente d\'un correctif technique, nous vous recommandons de segmenter vos exports en plusieurs listes de moins de 5 000 contacts.\n\nNotre équipe technique travaille sur une solution définitive prévue pour [date].\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't5',
    createdAt: '2026-05-17T17:00:00Z',
  },
  {
    id: 'kb5',
    title: 'Segments dynamiques non mis à jour : diagnostic et solution',
    productArea: 'CRM Core',
    problem: 'Les segments marketing configurés avec des règles dynamiques ne se mettent pas à jour automatiquement, même après le délai normalement attendu.',
    symptoms: [
      'Nouveaux contacts correspondant aux critères non inclus dans le segment',
      'Dernière date de mise à jour du segment inchangée depuis plusieurs jours',
      'Les statistiques du segment ne reflètent pas les ajouts récents',
      'L\'export du segment ne contient pas tous les contacts attendus',
    ],
    causes: [
      'Tâche cron de mise à jour des segments en échec silencieux',
      'Règle de segment avec opérateur non supporté (régression suite à mise à jour)',
      'Conflit entre deux règles contradictoires dans la configuration du segment',
    ],
    checks: [
      'Vérifier la dernière date de mise à jour dans l\'en-tête du segment',
      'Tenter une mise à jour manuelle via le bouton "Actualiser le segment"',
      'Consulter la configuration des règles pour identifier des contradictions',
      'Vérifier les logs de la tâche cron dans l\'interface d\'administration',
    ],
    solution: 'Pour une mise à jour immédiate, utiliser le bouton "Actualiser le segment" dans l\'interface. Pour résoudre définitivement, vérifier et corriger la configuration des règles. Si le problème persiste, escalader à l\'équipe technique pour vérification de la tâche planifiée.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nNous avons identifié que vos segments dynamiques ne se mettaient pas à jour automatiquement en raison de [cause]. Nous avons [action effectuée]. Vos segments devraient maintenant refléter correctement vos données.\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't17',
    createdAt: '2026-05-16T11:00:00Z',
  },
  {
    id: 'kb6',
    title: 'Import CSV contacts : erreurs de formatage et résolution',
    productArea: 'CRM Core',
    problem: 'L\'import d\'un fichier CSV de contacts échoue ou produit des données incorrectes en raison de problèmes de formatage.',
    symptoms: [
      'Message d\'erreur "Format de fichier invalide" lors de l\'import',
      'Dates de naissance ou de séjour importées incorrectement',
      'Caractères spéciaux (accents, ç) mal encodés dans les noms',
      'Import partiel avec seulement une partie des contacts créés',
    ],
    causes: [
      'Encodage du fichier CSV non UTF-8 (souvent Windows-1252)',
      'Format de date non conforme au standard attendu (DD/MM/YYYY requis)',
      'Colonnes manquantes ou mal nommées par rapport au template',
      'Séparateur de colonnes incorrect (virgule attendue, point-virgule utilisé)',
    ],
    checks: [
      'Ouvrir le fichier CSV avec un éditeur de texte pour vérifier l\'encodage',
      'Comparer l\'en-tête du fichier avec le template CSV standard D-EDGE',
      'Vérifier le format des dates (JJ/MM/AAAA)',
      'Tester l\'import avec le fichier template vide rempli manuellement',
    ],
    solution: 'Télécharger le template CSV standard depuis CRM > Contacts > Importer > Télécharger le template. Remplir le template avec les données, en respectant le format UTF-8 et les en-têtes exacts. Pour convertir un fichier existant, utiliser LibreOffice Calc ou Google Sheets pour ré-enregistrer en UTF-8.',
    clientReplyTemplate: 'Bonjour [Prénom],\n\nL\'erreur lors de votre import CSV est liée à [cause]. Vous trouverez en pièce jointe notre template CSV standard à utiliser pour votre import.\n\nPoints importants à vérifier :\n- Encodage UTF-8\n- Dates au format JJ/MM/AAAA\n- Séparateur : virgule\n\nN\'hésitez pas à nous contacter si vous avez besoin d\'aide.\n\nCordialement,\nL\'équipe D-EDGE Support',
    sourceTicketId: 't16',
    createdAt: '2026-05-18T08:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// MONTHLY METRICS
// ---------------------------------------------------------------------------
export const monthlyMetrics: MonthlyMetric[] = [
  {
    month: 5,
    year: 2026,
    totalTickets: 287,
    totalCalls: 43,
    totalChats: 124,
    avgFirstResponseHours: 3.2,
    fcrRate: 0.68,
    topProducts: [
      { name: 'CRM Core', count: 98 },
      { name: 'Campaigns', count: 76 },
      { name: 'Guest Profile', count: 54 },
      { name: 'PMS', count: 31 },
      { name: 'WhatsApp', count: 18 },
      { name: 'Guest App', count: 10 },
    ],
    byChannel: { tickets: 287, calls: 43, chats: 124 },
    openedVsResolved: { opened: 287, resolved: 241 },
  },
  {
    month: 4,
    year: 2026,
    totalTickets: 263,
    totalCalls: 51,
    totalChats: 109,
    avgFirstResponseHours: 4.1,
    fcrRate: 0.71,
    topProducts: [
      { name: 'CRM Core', count: 89 },
      { name: 'Campaigns', count: 68 },
      { name: 'Guest Profile', count: 47 },
      { name: 'PMS', count: 29 },
      { name: 'WhatsApp', count: 20 },
      { name: 'Guest App', count: 10 },
    ],
    byChannel: { tickets: 263, calls: 51, chats: 109 },
    openedVsResolved: { opened: 263, resolved: 248 },
  },
]

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
export function getClient(clientId: string): Client | undefined {
  return clients.find(c => c.id === clientId)
}

export function getTicket(ticketId: string): Ticket | undefined {
  return tickets.find(t => t.id === ticketId)
}
