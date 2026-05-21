import { NextRequest, NextResponse } from 'next/server'
import { createMeetEvent, sendMeetEmail } from '@/lib/google/calendarClient'

export const dynamic = 'force-dynamic'

interface Participant {
  email: string
  name: string
  hotelName: string
}

interface CreateMeetBody {
  sessionTitle: string
  sessionDatetime: string   // ISO 8601 start
  durationMinutes: number
  participants: Participant[]
  hostName: string
}

export async function POST(req: NextRequest) {
  // Graceful degradation when credentials are missing
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Google credentials not configured', configured: false },
      { status: 503 }
    )
  }

  try {
    const body: CreateMeetBody = await req.json()
    const { sessionTitle, sessionDatetime, durationMinutes, participants, hostName } = body

    // Compute end datetime
    const startDate = new Date(sessionDatetime)
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

    // Only email registered participants (non-empty email)
    const registeredParticipants = participants.filter(p => p.email && p.email.trim() !== '')

    // 1. Create Calendar event with Meet link — Google sends calendar invites via sendUpdates: 'all'
    const meetEvent = await createMeetEvent({
      title: sessionTitle,
      startDatetime: startDate.toISOString(),
      endDatetime: endDate.toISOString(),
      attendeeEmails: registeredParticipants.map(p => p.email),
    })

    // Format date for email body: "DD/MM/YYYY à HH:MM"
    const day = String(startDate.getDate()).padStart(2, '0')
    const month = String(startDate.getMonth() + 1).padStart(2, '0')
    const year = startDate.getFullYear()
    const hours = String(startDate.getHours()).padStart(2, '0')
    const minutes = String(startDate.getMinutes()).padStart(2, '0')
    const sessionDate = `${day}/${month}/${year} à ${hours}:${minutes}`

    // 2. Send a separate plain-text email to each participant with the Meet link
    const emailPromises = registeredParticipants.map(p =>
      sendMeetEmail({
        to: p.email,
        participantName: p.name,
        sessionTitle,
        sessionDate,
        meetLink: meetEvent.meetLink,
        hostName,
      })
    )

    await Promise.all(emailPromises)

    return NextResponse.json({
      meetLink: meetEvent.meetLink,
      eventId: meetEvent.eventId,
      htmlLink: meetEvent.htmlLink,
      emailsSent: registeredParticipants.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
