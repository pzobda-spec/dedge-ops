/**
 * Écrit un override manuel d'attribution OB/CSM dans `account_assignments`.
 * Zoho reste en LECTURE SEULE : cette route n'écrit que dans Supabase.
 *
 * Volontairement aucun `revalidateTag` n'est appelé ici : les lectures
 * Supabase de `loadPlanChargeSources` ne sont pas mises en cache et la route
 * GET `/api/onboarding/plan-charge` est `force-dynamic`, donc l'écriture est
 * visible immédiatement. Invalider le tag Zoho forcerait un rechargement
 * complet du CRM à chaque édition, pour rien.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requireRole } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['admin', 'onboarder'])

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const accountId = body.account_id
    if (typeof accountId !== 'string' || accountId.trim() === '') {
      return NextResponse.json({ error: 'account_id est obligatoire.' }, { status: 400 })
    }

    const accountName = typeof body.account_name === 'string' ? body.account_name : null

    const groupId = body.group_id
    if (groupId !== undefined && groupId !== null && typeof groupId !== 'string') {
      return NextResponse.json({ error: 'group_id doit être une chaîne ou null.' }, { status: 400 })
    }

    const obOwner = body.ob_owner
    if (obOwner !== undefined && obOwner !== null && typeof obOwner !== 'string') {
      return NextResponse.json({ error: 'ob_owner doit être une chaîne ou null.' }, { status: 400 })
    }

    const obLocked = body.ob_locked === true

    const csmName = body.csm_name
    if (csmName !== undefined && csmName !== null && typeof csmName !== 'string') {
      return NextResponse.json({ error: 'csm_name doit être une chaîne ou null.' }, { status: 400 })
    }

    const csmLocked = body.csm_locked === true

    const expectedGoLive = body.expected_go_live
    if (expectedGoLive !== undefined && expectedGoLive !== null) {
      if (typeof expectedGoLive !== 'string' || !DATE_RE.test(expectedGoLive)) {
        return NextResponse.json(
          { error: 'expected_go_live doit être au format AAAA-MM-JJ.' },
          { status: 400 },
        )
      }
    }

    // Fusion avec la ligne existante. Un `upsert` direct écraserait les champs
    // absents du corps : poser un override OB effacerait un verrou CSM déjà en
    // place. Champ absent = inchangé, `null` explicite = effacé.
    const { data: existing, error: readError } = await supabaseAdmin
      .from('account_assignments')
      .select('account_name, group_id, ob_owner, ob_locked, csm_name, csm_locked, expected_go_live')
      .eq('account_id', accountId)
      .maybeSingle()

    if (readError) throw readError

    const provided = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

    const row = {
      account_id: accountId,
      account_name: provided('account_name') ? accountName ?? null : existing?.account_name ?? null,
      group_id: provided('group_id') ? groupId ?? null : existing?.group_id ?? null,
      ob_owner: provided('ob_owner') ? obOwner ?? null : existing?.ob_owner ?? null,
      ob_locked: provided('ob_locked') ? obLocked : existing?.ob_locked ?? false,
      csm_name: provided('csm_name') ? csmName ?? null : existing?.csm_name ?? null,
      csm_locked: provided('csm_locked') ? csmLocked : existing?.csm_locked ?? false,
      expected_go_live: provided('expected_go_live')
        ? expectedGoLive ?? null
        : existing?.expected_go_live ?? null,
      source: 'manual',
      updated_at: new Date().toISOString(),
    }

    // Contrôle d'intégrité sur les valeurs fusionnées : un verrou sans valeur
    // figerait une attribution vide.
    if (row.ob_locked && (typeof row.ob_owner !== 'string' || row.ob_owner.trim() === '')) {
      return NextResponse.json(
        { error: 'Un verrou OB exige un implémenteur.' },
        { status: 400 },
      )
    }

    if (row.csm_locked && (typeof row.csm_name !== 'string' || row.csm_name.trim() === '')) {
      return NextResponse.json(
        { error: 'Un verrou CSM exige un CSM.' },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from('account_assignments')
      .upsert(row, { onConflict: 'account_id' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ assignment: data }, { status: 200 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
