import { revalidateTag, unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const getKnowledgeArticles = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin
      .from('knowledge_articles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  },
  ['knowledge-articles'],
  { revalidate: 300, tags: ['knowledge-articles'] }
)

export async function GET() {
  try {
    const articles = await getKnowledgeArticles()
    return NextResponse.json({ articles })
  } catch (err) {
    console.error('[knowledge] GET error:', err)
    return NextResponse.json({ error: 'Erreur lors de la récupération des articles' }, { status: 500 })
  }
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

  revalidateTag('knowledge-articles')
  return NextResponse.json(data, { status: 201 })
}
