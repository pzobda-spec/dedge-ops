import type { ProjectEventType } from './events'

export type EmailTemplateKey =
  | 'email_launch'
  | 'email_content_request'
  | 'email_backoffice'
  | 'email_followup_1'
  | 'email_followup_2'

export interface EmailTemplate {
  key: EmailTemplateKey
  event_type: ProjectEventType
  language: 'fr' | 'en'
  subject: string
  body: string
  required_vars: string[]
  optional_vars: string[]
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'email_launch',
    event_type: 'email_launch_sent',
    language: 'fr',
    subject: 'Bienvenue chez D-EDGE CRM — réservez votre kick-off (15 min)',
    body: `Bonjour {prenom_client},

Bienvenue chez D-EDGE CRM. Je serai votre interlocuteur(rice) tout au long de l'implémentation de votre solution.

Première étape : un kick-off de 30 minutes pour cadrer votre projet.

Choisissez votre créneau ici :
👉 {acuity_link_30min}

À l'issue de ce kick-off, vous aurez :
• Le rétroplanning de votre projet
• La liste précise du contenu à préparer
• Les coordonnées de vos interlocuteurs

À très vite,
{prenom_onboarder}`,
    required_vars: ['prenom_client', 'prenom_onboarder', 'acuity_link_30min'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_launch',
    event_type: 'email_launch_sent',
    language: 'en',
    subject: 'Welcome to D-EDGE CRM — book your kick-off call (15 min)',
    body: `Hello {prenom_client},

Welcome to D-EDGE CRM. I will be your main contact throughout the implementation of your solution.

First step: a 30-minute kick-off call to frame your project.

Please choose your slot here:
👉 {acuity_link_30min}

After this kick-off, you will have:
• Your project timeline
• The exact content to prepare
• The contact details of your key contacts

Speak soon,
{prenom_onboarder}`,
    required_vars: ['prenom_client', 'prenom_onboarder', 'acuity_link_30min'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_content_request',
    event_type: 'email_content_request_sent',
    language: 'fr',
    subject: 'Préparation kick-off {hotel} — votre espace contenu est prêt',
    body: `Bonjour {prenom_client},

Votre kick-off est confirmé pour le {date_rdv}.

Pour le préparer, voici votre espace contenu :
👉 {drive_link}

Avant notre RDV, prévoyez idéalement (sans urgence) :
• Votre logo en version transparente
• 2 ou 3 photos représentatives de l'établissement
• Les couleurs principales de votre charte

On verra ensemble le reste pendant le kick-off — pas de panique sur l'exhaustivité maintenant.

À bientôt,
{prenom_onboarder}`,
    required_vars: ['prenom_client', 'hotel', 'date_rdv', 'drive_link', 'prenom_onboarder'],
    optional_vars: ['signature'],
  },
  {
    key: 'email_content_request',
    event_type: 'email_content_request_sent',
    language: 'en',
    subject: '{hotel} kick-off preparation — your content folder is ready',
    body: `Hello {prenom_client},

Your kick-off is confirmed for {date_rdv}.

To prepare it, here is your content folder:
👉 {drive_link}

Before our meeting, please prepare ideally, with no urgency:
• Your logo with transparent background
• 2 or 3 representative photos of the property
• The main colors of your brand guidelines

We will review the rest together during the kick-off, so no need to have everything exhaustive now.

Speak soon,
{prenom_onboarder}`,
    required_vars: ['prenom_client', 'hotel', 'date_rdv', 'drive_link', 'prenom_onboarder'],
    optional_vars: ['signature'],
  },
  {
    key: 'email_backoffice',
    event_type: 'email_backoffice_sent',
    language: 'fr',
    subject: 'Accès à votre back-office D-EDGE CRM',
    body: `Bonjour {prenom_client},

Votre back-office D-EDGE CRM est créé.

Pour vous connecter :
1. Allez sur admin.loungeup.com
2. Saisissez votre email
3. Cliquez sur "Mot de passe oublié"
4. Vous recevrez un email pour créer votre mot de passe

Vous pouvez explorer dès maintenant, mais nous prendrons le temps de tout vous présenter lors du RDV d'implémentation.

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'prenom_onboarder'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_backoffice',
    event_type: 'email_backoffice_sent',
    language: 'en',
    subject: 'Access to your D-EDGE CRM back office',
    body: `Hello {prenom_client},

Your D-EDGE CRM back office has been created.

To log in:
1. Go to admin.loungeup.com
2. Enter your email address
3. Click "Forgot password"
4. You will receive an email to create your password

You can already explore it, but we will take the time to walk you through everything during the implementation meeting.

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'prenom_onboarder'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_followup_1',
    event_type: 'email_followup_1_sent',
    language: 'fr',
    subject: 'Petit point sur {livrable_precis}',
    body: `Bonjour {prenom_client},

Petit point sur {livrable_precis} que nous attendions pour {date_butoir}.
Avez-vous un blocage ? Je suis disponible 15 min cette semaine si besoin.

👉 {acuity_link_15min}

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'livrable_precis', 'date_butoir', 'acuity_link_15min', 'prenom_onboarder'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_followup_1',
    event_type: 'email_followup_1_sent',
    language: 'en',
    subject: 'Quick follow-up on {livrable_precis}',
    body: `Hello {prenom_client},

Quick follow-up on {livrable_precis}, which we were expecting by {date_butoir}.
Is anything blocking you? I am available for 15 minutes this week if needed.

👉 {acuity_link_15min}

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'livrable_precis', 'date_butoir', 'acuity_link_15min', 'prenom_onboarder'],
    optional_vars: ['hotel', 'signature'],
  },
  {
    key: 'email_followup_2',
    event_type: 'email_followup_2_sent',
    language: 'fr',
    subject: '{hotel} — votre projet est en pause',
    body: `Bonjour {prenom_client},

Sans nouvelles depuis {date_butoir}, votre projet est mis en pause de notre côté.

Pour le relancer, j'ai juste besoin de {livrable_precis}.

Si quelque chose a changé côté planning ou priorités, dites-le moi — on s'adapte.

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'hotel', 'date_butoir', 'livrable_precis', 'prenom_onboarder'],
    optional_vars: ['signature'],
  },
  {
    key: 'email_followup_2',
    event_type: 'email_followup_2_sent',
    language: 'en',
    subject: '{hotel} — your project is paused',
    body: `Hello {prenom_client},

As we have not heard back since {date_butoir}, your project is now paused on our side.

To restart it, I only need {livrable_precis}.

If anything has changed in your planning or priorities, just let me know and we will adapt.

{prenom_onboarder}`,
    required_vars: ['prenom_client', 'hotel', 'date_butoir', 'livrable_precis', 'prenom_onboarder'],
    optional_vars: ['signature'],
  },
]

export function getEmailTemplate(key: EmailTemplateKey, language: 'fr' | 'en'): EmailTemplate {
  return EMAIL_TEMPLATES.find(template => template.key === key && template.language === language) ??
    EMAIL_TEMPLATES.find(template => template.key === key && template.language === 'fr')!
}

export function interpolateTemplate(template: EmailTemplate, vars: Record<string, string>): { subject: string; body: string } {
  const replaceVars = (value: string) =>
    value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? '')

  return {
    subject: replaceVars(template.subject),
    body: replaceVars(template.body),
  }
}
