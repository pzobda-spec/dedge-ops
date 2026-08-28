#!/usr/bin/env node
/**
 * support-cases-report.mjs
 * Génère un rapport markdown des cas support les plus fréquents par produit.
 *
 * Usage:
 *   node --env-file=.env.local scripts/support-cases-report.mjs
 *   node --env-file=.env.local scripts/support-cases-report.mjs --days=14
 *   node --env-file=.env.local scripts/support-cases-report.mjs --days=60 --all
 *
 * --all   : inclut les tickets fermés (Closed / Solved)
 * --days  : fenêtre temporelle (défaut 30 jours)
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ZOHO_ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN
const ZOHO_ORG_ID       = process.env.ZOHO_ORG_ID

const DAYS         = Number(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] ?? 30)
const INCLUDE_ALL  = process.argv.includes('--all')
const CLOSED_STATUSES = new Set(['Closed', 'Solved', 'Fermé'])
const DEPT_ID      = '5861000000007061'  // Support (pas CSM)

async function zohoGet(path) {
  const res = await fetch(`https://desk.zoho.eu/api/v1${path}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`,
      orgId: ZOHO_ORG_ID,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Zoho ${res.status} — ${path.slice(0, 60)} — ${body.slice(0, 200)}`)
  }
  return res.json()
}

// ── Fetch tickets (all pages, no status filter — same as the app) ─────────────

async function fetchAllTickets() {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString()
  const all = []
  let from = 0
  let pages = 0

  process.stdout.write('Fetching pages')
  while (true) {
    const params = new URLSearchParams({
      departmentId: DEPT_ID,
      limit:        '100',
      from:         String(from),
      sortBy:       '-createdTime',   // newest first
      fields:       'id,ticketNumber,subject,status,priority,channel,category,createdTime,modifiedTime,contact,account,assignee',
    })

    const data = await zohoGet(`/tickets?${params}`)
    const page = data.data ?? []
    if (page.length === 0) break

    let hitOldBoundary = false
    for (const t of page) {
      if (t.createdTime < since) { hitOldBoundary = true; break }
      if (!INCLUDE_ALL && CLOSED_STATUSES.has(t.status)) continue
      all.push(t)
    }

    if (hitOldBoundary) break          // all remaining pages are older → stop
    from += page.length
    pages++
    process.stdout.write('.')
    if (page.length < 100) break
    await new Promise(r => setTimeout(r, 300))
  }
  process.stdout.write(` ${pages + 1} pages\n`)
  return all
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanSubject(raw) {
  return (raw ?? '')
    .replace(/^(re|fwd|fw|tr|rép?|aw)[\s:]+/i, '')
    .replace(/^\[.*?\]\s*/,'')
    .trim()
    .slice(0, 90)
}

/**
 * Extrait le "vrai sujet" en supprimant le préfixe hôtel.
 * "HOTEL X - Bug formulaire" → "Bug formulaire"
 * "HOTEL X — connexion" → "connexion"
 */
function extractIssue(raw) {
  const s = (raw ?? '').trim()
  // Suppress leading "Undefined — " or "Undefined - "
  const noUndef = s.replace(/^undefined\s*[—\-–]\s*/i, '')
  // Split on first separator (—, -, /, :) that looks like it separates hotel from issue
  // Hotel names are typically ALL CAPS or start with a proper noun
  const sep = noUndef.match(/^[A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇŒÆ0-9\s&',.()/*-]{3,60}(?:\s+[—\-–/:]\s+|\s+-\s+)(.+)$/i)
  const issue = sep?.[1] ?? noUndef
  return issue
    .replace(/^(re|fwd|fw|tr|rép?|aw)[\s:]+/i, '')
    .trim()
    .slice(0, 80)
}

/**
 * Sur une grande fenêtre temporelle, regroupe les sujets similaires par mots-clés.
 * Retourne les patterns les plus fréquents.
 */
function topPatterns(tickets, limit = 15) {
  // Count exact cleaned issues
  const exact = {}
  for (const t of tickets) {
    const issue = extractIssue(t.subject).toLowerCase()
    if (!issue || issue.length < 4) continue
    exact[issue] = (exact[issue] ?? 0) + 1
  }

  // Sort by frequency
  const sorted = Object.entries(exact)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  // Display with original casing (take the first ticket's version)
  const display = {}
  for (const t of tickets) {
    const key = extractIssue(t.subject).toLowerCase()
    if (!display[key]) display[key] = extractIssue(t.subject)
  }

  return sorted.map(([key, count]) => ({ issue: display[key] ?? key, count }))
}

function prioFR(p) {
  return { High: 'Haute', Urgent: 'Urgente', Low: 'Faible', Medium: 'Normale', null: 'Normale', undefined: 'Normale' }[p ?? 'Medium'] ?? p
}

function clientName(t) {
  return t.account?.accountName
    || t.contact?.account?.accountName
    || [t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(' ')
    || '—'
}

// ── Build markdown ────────────────────────────────────────────────────────────

function buildReport(tickets, dateStr) {
  // Group by category
  const byProduct = {}
  for (const t of tickets) {
    const cat = (t.category || 'Non catégorisé').trim()
    if (!byProduct[cat]) byProduct[cat] = []
    byProduct[cat].push(t)
  }

  const sorted = Object.entries(byProduct).sort((a, b) => b[1].length - a[1].length)

  const totalUrgent = tickets.filter(t => t.priority === 'Urgent').length
  const totalHigh   = tickets.filter(t => t.priority === 'High').length
  const openCount   = tickets.filter(t => !CLOSED_STATUSES.has(t.status)).length
  const maxCount    = sorted[0]?.[1]?.length ?? 1

  const lines = []

  lines.push(`# Cas support — ${DAYS} derniers jours`)
  lines.push(`_${dateStr} · ${tickets.length} tickets${INCLUDE_ALL ? '' : ' actifs'} · département Support_`)
  lines.push('')

  // Synthèse
  lines.push('## Synthèse')
  lines.push('')
  lines.push(`| | |`)
  lines.push(`|---|---|`)
  lines.push(`| Tickets dans la fenêtre | **${tickets.length}** |`)
  if (!INCLUDE_ALL) lines.push(`| Actifs (hors closed/solved) | **${openCount}** |`)
  lines.push(`| Urgents | **${totalUrgent}** |`)
  lines.push(`| Haute priorité | **${totalHigh}** |`)
  lines.push(`| Produits distincts | **${sorted.length}** |`)
  lines.push('')

  // Bar chart
  lines.push('## Volume par produit')
  lines.push('')
  for (const [cat, ts] of sorted) {
    const filled = Math.max(1, Math.round((ts.length / maxCount) * 24))
    const bar = '█'.repeat(filled).padEnd(24)
    lines.push(`\`${bar}\` **${ts.length}**  ${cat}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // Détail produit par produit
  for (const [cat, ts] of sorted) {
    lines.push(`## ${cat}`)
    lines.push('')
    lines.push(`**${ts.length} tickets** sur ${DAYS}j`)
    lines.push('')

    // Priority breakdown
    const prioMap = {}
    for (const t of ts) {
      const p = prioFR(t.priority)
      prioMap[p] = (prioMap[p] ?? 0) + 1
    }
    const prioStr = Object.entries(prioMap)
      .sort((a, b) => {
        const order = { Urgente: 0, Haute: 1, Normale: 2, Faible: 3 }
        return (order[a[0]] ?? 9) - (order[b[0]] ?? 9)
      })
      .map(([p, n]) => `${p} × ${n}`)
      .join(' · ')
    lines.push(`_${prioStr}_`)
    lines.push('')

    // Top issue patterns (strips hotel names, groups similar)
    const top = topPatterns(ts, 15)

    if (top.length > 0) {
      lines.push('### Problèmes les plus fréquents')
      lines.push('')
      lines.push('| # | Problème | Occurrences |')
      lines.push('|---|---|:---:|')
      top.forEach(({ issue, count }, i) => {
        const c = count > 1 ? `**${count}**` : '1'
        lines.push(`| ${i + 1} | ${issue} | ${c} |`)
      })
      lines.push('')
    }

    // 5 most recent / urgent tickets
    const sample = [...ts]
      .sort((a, b) => {
        const prioOrder = { Urgent: 0, High: 1 }
        const pa = prioOrder[a.priority] ?? 2
        const pb = prioOrder[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        return new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
      })
      .slice(0, 5)

    lines.push('<details><summary>Exemples récents / urgents</summary>')
    lines.push('')
    for (const t of sample) {
      const d = new Date(t.createdTime).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      const prio = t.priority && !['Medium', 'null'].includes(String(t.priority))
        ? ` · **${prioFR(t.priority)}**` : ''
      const cl = clientName(t)
      const subj = cleanSubject(t.subject)
      lines.push(`- \`${t.status}\`${prio} · ${d} · *${cl}* — ${subj}`)
    }
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!ZOHO_ACCESS_TOKEN || !ZOHO_ORG_ID) {
    console.error('❌  Variables manquantes dans .env.local : ZOHO_ACCESS_TOKEN, ZOHO_ORG_ID')
    process.exit(1)
  }

  console.log(`⏳  Fenêtre : ${DAYS} jours · statuts : ${INCLUDE_ALL ? 'tous' : 'actifs uniquement'}`)

  const tickets = await fetchAllTickets()
  console.log(`✓  ${tickets.length} tickets récupérés`)

  if (tickets.length === 0) {
    console.warn('⚠️  Aucun ticket trouvé — vérifiez ZOHO_ORG_ID et les credentials')
    process.exit(0)
  }

  const now     = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const slug    = now.toISOString().slice(0, 10)

  const md  = buildReport(tickets, dateStr)
  const out = join(__dirname, '..', 'docs', `support-cases-${slug}.md`)
  writeFileSync(out, md, 'utf-8')
  console.log(`✓  Rapport : docs/support-cases-${slug}.md`)
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1) })
