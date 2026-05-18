import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[knowledge] GET error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des articles' }, { status: 500 })
  }

  return NextResponse.json({ articles: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .insert(body)
    .select()
    .single()

  if (error) {
    console.error('[knowledge] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
