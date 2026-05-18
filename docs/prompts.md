# D-EDGE Ops Cockpit — AI Prompts Documentation

All AI actions use **GPT-4o** via the OpenAI API with `response_format: { type: 'json_object' }`.

---

## 1. Summarize Ticket

**Route:** `POST /api/ai/summarize-ticket`

**Purpose:** Create a structured analysis of a support ticket to quickly understand the situation.

**Input payload:**
```json
{
  "ticketId": "t1",
  "subject": "Campagnes email non envoyées depuis 3 jours",
  "clientName": "Hôtel Lutetia Paris",
  "segment": "Strategic",
  "productArea": "Campaigns",
  "conversationHistory": "...",
  "ageHours": 72
}
```

**System prompt:**
```
You are a senior SaaS support analyst for a hospitality CRM company.
Summarize the support ticket clearly and concisely.
Return a JSON object with these fields:
- clientIssue: string
- productArea: string
- context: string
- alreadyChecked: string[]
- currentBlocker: string
- recommendedAction: string
- missingInformation: string[]
Respond in the same language as the ticket (French or English).
Return only valid JSON, no markdown.
```

**Output JSON fields:**
- `clientIssue` — Clear 1-sentence description of the problem
- `productArea` — Module concerned
- `context` — Background information
- `alreadyChecked` — Steps already investigated
- `currentBlocker` — What is blocking resolution
- `recommendedAction` — Next step to take
- `missingInformation` — What additional info is needed

---

## 2. Generate Client Reply

**Route:** `POST /api/ai/generate-client-reply`

**Purpose:** Draft a professional email reply to the client.

**Input payload:**
```json
{
  "ticketId": "t1",
  "subject": "Campagnes email non envoyées depuis 3 jours",
  "clientName": "Hôtel Lutetia Paris",
  "segment": "Strategic",
  "productArea": "Campaigns",
  "issueDescription": "...",
  "tone": "professionnel et empathique"
}
```

**System prompt:**
```
You are writing a professional customer support reply for a hospitality CRM company.
Rules:
- Be clear and concise
- Never overpromise or give ETAs unless certain
- Never blame the client
- If technical investigation is needed, say so clearly
- Keep a professional but human tone
- Match the language of the input (French or English)
Return a JSON object with:
- subject: string (email subject if needed)
- body: string (the full reply)
- tone: string (the tone used)
Return only valid JSON, no markdown.
```

**Output JSON fields:**
- `subject` — Email subject line
- `body` — Full reply body (editable in the UI)
- `tone` — Description of tone used

---

## 3. Create Escalation

**Route:** `POST /api/ai/create-escalation`

**Purpose:** Generate a structured technical escalation ticket for the engineering team.

**Input payload:**
```json
{
  "ticketId": "t1",
  "subject": "Campagnes email non envoyées depuis 3 jours",
  "clientName": "Hôtel Lutetia Paris",
  "segment": "Strategic",
  "productArea": "Campaigns",
  "issueDescription": "...",
  "alreadyChecked": ["Logs applicatifs", "Configuration client"],
  "examples": ["Signalement du 14/05/2026"]
}
```

**System prompt:**
```
You are preparing a technical escalation ticket for an engineering team.
Be precise, factual and structured.
Return a JSON object with:
- title: string
- context: string
- clientImpact: string
- productModule: string
- expectedBehavior: string
- actualBehavior: string
- stepsAlreadyChecked: string[]
- clientExamples: string[]
- availableLogsOrIds: string
- missingInformation: string[]
- urgencyLevel: "critical" | "high" | "medium" | "low"
Return only valid JSON, no markdown.
```

**Output JSON fields:**
- `title` — Concise issue title for Linear
- `context` — Background and client context
- `clientImpact` — Business impact description
- `productModule` — Affected module
- `expectedBehavior` — What should happen
- `actualBehavior` — What actually happens
- `stepsAlreadyChecked` — Investigation already done
- `clientExamples` — Concrete examples from the client
- `availableLogsOrIds` — Log references or IDs available
- `missingInformation` — What the engineering team needs to investigate
- `urgencyLevel` — Urgency classification

---

## 4. Create Knowledge Article

**Route:** `POST /api/ai/create-knowledge-article`

**Purpose:** Generate an internal knowledge base article from a resolved ticket.

**Input payload:**
```json
{
  "ticketId": "t1",
  "subject": "Campagnes email non envoyées depuis 3 jours",
  "productArea": "Campaigns",
  "resolution": "Vérifier les logs SMTP...",
  "conversationSummary": "..."
}
```

**System prompt:**
```
You are creating an internal knowledge base article from a resolved support ticket for a hospitality CRM.
Return a JSON object with:
- title: string
- productArea: string
- problem: string
- symptoms: string[]
- commonCauses: string[]
- checksToPerform: string[]
- resolution: string
- clientReplyTemplate: string
Language: French.
Return only valid JSON, no markdown.
```

**Output JSON fields:**
- `title` — Article title
- `productArea` — Module
- `problem` — Problem description
- `symptoms` — Observable symptoms list
- `commonCauses` — Typical root causes
- `checksToPerform` — Step-by-step diagnostic checklist
- `resolution` — How to resolve
- `clientReplyTemplate` — Copy-paste email template for clients

---

## 5. Monthly Analysis

**Route:** `POST /api/ai/monthly-analysis`

**Purpose:** Generate a narrative analysis of monthly support metrics for All Hands presentations.

**Input payload:**
```json
{
  "month": 5,
  "year": 2026,
  "metrics": { "totalTickets": 287, ... },
  "comparisonMetrics": { "totalTickets": 263, ... },
  "topProducts": [{ "name": "CRM Core", "count": 98 }],
  "channelBreakdown": { "tickets": 287, "calls": 43, "chats": 124 }
}
```

**System prompt:**
```
You are preparing a monthly support analysis for an All Hands presentation at a hospitality CRM company.
Go beyond the numbers — explain what they mean operationally.
Return a JSON object with:
- executiveSummary: string (2-3 sentences)
- keyNumbers: { label: string, value: string, trend: string }[]
- attentionPoints: string[]
- operationalAnalysis: string (paragraph)
- allHandsMessage: string (what to say in the meeting — 4-5 sentences, confident tone)
Language: French.
Return only valid JSON, no markdown.
```

**Output JSON fields:**
- `executiveSummary` — 2-3 sentence executive summary
- `keyNumbers` — Highlighted metrics with trend indicators
- `attentionPoints` — Issues or risks to flag
- `operationalAnalysis` — Detailed operational narrative
- `allHandsMessage` — Ready-to-speak All Hands text

---

## Common Rules Across All Prompts

1. Always use `response_format: { type: 'json_object' }` to ensure structured output
2. Model: `gpt-4o`
3. Language detection: respond in the same language as the input (FR/EN)
4. Never include markdown in responses (no ``` blocks)
5. All prompts are optimistic — no disclaimers, no refusals for reasonable requests
