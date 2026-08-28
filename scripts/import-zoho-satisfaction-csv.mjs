import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const csvPath = new URL('../Usefull references/zoho form/SatisfactionOnboarding_Report.csv', import.meta.url)
const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
function parseCsv(input) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < input.length; i++) { const c = input[i]; const n = input[i + 1]
    if (c === '"') { if (quoted && n === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i++; row.push(cell); cell = ''; if (row.some(v => v)) rows.push(row); row = [] }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift().map(v => v.trim())
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()])))
}
const rows = parseCsv(text)
const num = v => { const n = Number.parseFloat(v); return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0 }
const date = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() }
const data = rows.map((r, i) => ({
  zoho_id: r['Single Line'] || `csv-${i + 1}`,
  establishment: r['Your establishment'] || '', respondent_name: r.Name || '', owner: r['Task Owner'] || '',
  score_global: num(r['Global satisfaction']), score_onboarding: num(r.Onboarding),
  score_simplicity: num(r['Simplicity of implementation']), score_tool: num(r['Tool performance']),
  score_training: num(r.Trainings), comment: r['Please help us to improve !'] || null,
  submitted_at: date(r['Added Time']), updated_at: new Date().toISOString(),
}))
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { error } = await supabase.from('onboarding_satisfaction').upsert(data, { onConflict: 'zoho_id' })
if (error) throw error
console.log(JSON.stringify({ imported: data.length, first: data[0]?.submitted_at, last: data.at(-1)?.submitted_at }))
