import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { parseCaseBatch } from '@/lib/reporting/sfCases'

export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const secret = process.env.SF_INGEST_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header?.startsWith('Bearer ')) return false
  const supplied = header.slice(7)
  const expectedHash = createHash('sha256').update(secret).digest()
  const suppliedHash = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(expectedHash, suppliedHash)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON requis.' }, { status: 400 })
  }

  let batch: ReturnType<typeof parseCaseBatch>
  try {
    const body = await request.text()
    if (body.length > 262_144) throw new Error('Lot trop volumineux.')
    batch = parseCaseBatch(JSON.parse(body))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lot invalide.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('replace_sf_case_monthly', {
    p_month: batch.month, p_rows: batch.rows,
  })
  if (error) {
    console.error('[ingest-sf-case-monthly] Replacement failed:', error.message)
    return NextResponse.json({ error: 'Enregistrement Salesforce indisponible.' }, { status: 503 })
  }
  return NextResponse.json({ month: batch.month, rows_written: batch.rows.length, synced_at: data })
}
