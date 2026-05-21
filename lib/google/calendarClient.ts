import { getGoogleAccessToken } from './auth'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

export interface MeetEvent {
  eventId: string
  meetLink: string
  htmlLink: string   // Google Calendar event link
}

export async function createMeetEvent(params: {
  title: string
  startDatetime: string   // ISO 8601
  endDatetime: string     // ISO 8601
  attendeeEmails: string[]
  timezone?: string
}): Promise<MeetEvent> {
  const token = await getGoogleAccessToken()

  const event = {
    summary: params.title,
    start: { dateTime: params.startDatetime, timeZone: params.timezone ?? 'Europe/Paris' },
    end: { dateTime: params.endDatetime, timeZone: params.timezone ?? 'Europe/Paris' },
    attendees: params.attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    guestsCanSeeOtherGuests: true,
    sendUpdates: 'all',  // sends invitations to all attendees
  }

  const res = await fetch(
    `${CALENDAR_BASE}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  if (!res.ok) throw new Error(`Google Calendar error ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const meetLink = data.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === 'video')?.uri

  return {
    eventId: data.id,
    meetLink: meetLink ?? data.hangoutLink ?? '',
    htmlLink: data.htmlLink,
  }
}

export async function sendMeetEmail(params: {
  to: string
  participantName: string
  sessionTitle: string
  sessionDate: string    // formatted "DD/MM/YYYY à HH:MM"
  meetLink: string
  hostName: string
}): Promise<void> {
  const token = await getGoogleAccessToken()

  const subject = `Lien visio – ${params.sessionTitle}`
  const body = `Bonjour ${params.participantName},

Voici le lien Google Meet pour votre formation "${params.sessionTitle}" du ${params.sessionDate} :

🔗 ${params.meetLink}

Vous pouvez rejoindre la session en cliquant sur le lien ci-dessus quelques minutes avant le début.

À bientôt,
${params.hostName}
D-EDGE CRM – Support & Formation`

  // Build RFC 2822 email
  const email = [
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')

  const encoded = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch(`${GMAIL_BASE}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) throw new Error(`Gmail send error ${res.status}: ${await res.text()}`)
}
