# D-EDGE Ops Cockpit — Planned Integrations

All integrations are planned for Sprint 2–8. Sprint 1 uses mock data only.

---

## 1. Zoho Desk (Sprint 2)

**Purpose:** Source of truth for all support tickets and conversations.

**Data provided:**
- Tickets (id, subject, status, priority, type, assignee, created/updated dates)
- Contacts and accounts (mapped to clients)
- Conversations / messages per ticket
- Tags, custom fields, SLA information

**Endpoints needed:**
- `GET /api/v1/tickets` — list tickets with filters
- `GET /api/v1/tickets/{id}` — single ticket detail
- `GET /api/v1/tickets/{id}/conversations` — ticket messages
- `POST /api/v1/tickets/{id}/comments` — post agent reply
- `PATCH /api/v1/tickets/{id}` — update ticket status, priority
- `GET /api/v1/contacts` — client contacts
- Webhook: `ticket.created`, `ticket.statusChanged`, `ticket.commentAdded`

**Auth:** OAuth 2.0 or API key header

---

## 2. Linear (Sprint 3)

**Purpose:** Track technical escalations created from support tickets.

**Data provided:**
- Issues (id, title, status, assignee, priority, labels)
- Issue comments and activity
- Teams and projects

**Endpoints needed:**
- `POST /graphql` — create issue (mutation)
- `GET /graphql` — fetch issue by ID (query)
- `POST /graphql` — update issue status (mutation)
- `GET /graphql` — list issues by label/team (query)
- Webhook: `Issue.statusChanged`, `Issue.commentAdded`

**Auth:** Personal API key or OAuth 2.0

---

## 3. Slack (Sprint 5)

**Purpose:** Send automated notifications for critical events.

**Notifications planned:**
- Critical ticket alert (Strategic, >24h no reply) → #support-critical
- New escalation created → #tech-escalations
- Blocked onboarding project → #csm-team
- Monthly reporting ready → #all-hands-prep

**Endpoints needed:**
- `POST https://hooks.slack.com/services/...` — Incoming webhook (simple)
- `POST /api/chat.postMessage` — Rich messages with buttons
- `POST /api/chat.update` — Update existing messages

**Auth:** Bot token (xoxb-...)

---

## 4. LearnWorlds (Sprint 6)

**Purpose:** Manage and track online training courses.

**Data provided:**
- Courses list and content
- Enrollments per user/hotel
- Completion rates and certificates
- SCORM/xAPI event tracking

**Endpoints needed:**
- `GET /v2/courses` — list available courses
- `GET /v2/users` — list enrolled users
- `POST /v2/users/{id}/enroll` — enroll a user in a course
- `GET /v2/reports/enrollments` — completion data

**Auth:** API key + school subdomain

---

## 5. Acuity Scheduling (Sprint 6)

**Purpose:** Schedule and track live training sessions (webinars, onboarding calls).

**Data provided:**
- Appointment types (training sessions, onboarding calls)
- Scheduled appointments with attendee details
- Cancellations and no-shows

**Endpoints needed:**
- `GET /api/v1/appointments` — list appointments
- `POST /api/v1/appointments` — create appointment
- `GET /api/v1/appointment-types` — list session types
- `GET /api/v1/availability/classes` — list class sessions, including sessions without attendees
- `DELETE /api/v1/appointments/{id}` — cancel appointment
- `POST /api/enterprise/v2/enterprises/{enterpriseId}/instance/{instanceId}/information/appointment-types` — create a group class type
- `POST /api/enterprise/v2/enterprises/{enterpriseId}/instance/{instanceId}/information/availability/classes` — publish class dates
- Webhook: `appointment.scheduled`, `appointment.canceled`, `appointment.rescheduled`

**Auth:** Public API key + user ID for reads; separate Enterprise ID + Enterprise API key + Instance ID for writes (Basic Auth)

Enterprise mutations are admin-only, use a Supabase-backed idempotency ledger, and create new appointment types as private until all requested dates are published successfully.

---

## 6. Zoho Projects (Sprint 7)

**Purpose:** Track onboarding projects per client.

**Data provided:**
- Projects (client, owner, status, milestones)
- Tasks and sub-tasks per milestone
- Time logs and progress

**Endpoints needed:**
- `GET /restapi/portal/{portalId}/projects/` — list projects
- `GET /restapi/portal/{portalId}/projects/{projectId}/` — project detail
- `GET /restapi/portal/{portalId}/projects/{projectId}/tasks/` — tasks
- `POST /restapi/portal/{portalId}/projects/{projectId}/tasks/` — create task
- Webhook: `project.statusChanged`, `task.completed`

**Auth:** OAuth 2.0

---

## 7. SalesIQ (Sprint 7)

**Purpose:** Track live chat interactions with clients.

**Data provided:**
- Chat conversations and transcripts
- Visitor identification (linked to client accounts)
- Chat ratings and resolution status

**Endpoints needed:**
- `GET /api/v2/chats` — list recent chats
- `GET /api/v2/chats/{id}` — chat detail with transcript
- `GET /api/v2/contacts` — chat contacts
- Webhook: `chat.ended`, `chat.missed`

**Auth:** Client ID + Client Secret (OAuth 2.0)

---

## 8. Ringover (Sprint 8)

**Purpose:** Log and analyze phone support calls.

**Data provided:**
- Call records (duration, direction, number, recording URL)
- Call outcomes and notes
- Agent statistics

**Endpoints needed:**
- `GET /v2/calls` — list calls with filters
- `GET /v2/calls/{id}` — call detail
- `GET /v2/calls/{id}/recording` — recording URL
- Webhook: `call.ended`

**Auth:** API key header

---

## Integration Architecture

```
Zoho Desk ──────┐
Linear ─────────┤
Slack ──────────┤
LearnWorlds ────┼──► Next.js API Routes ──► Supabase DB ──► Frontend
Acuity ─────────┤
Zoho Projects ──┤
SalesIQ ────────┤
Ringover ────────┘
```

All integrations will be implemented as Next.js API route handlers that:
1. Fetch from the external API
2. Transform and normalize data
3. Upsert into Supabase
4. Return normalized data to the frontend
