import { supabaseAdmin } from '@/lib/supabase/server'

export interface OnboardingProjectDetail {
  id: string
  zoho_project_id: string | null
  zoho_status: string | null
  hotel_name: string | null
  product: string | null
  owner: string | null
  owner_email: string | null
  start_date: string | null
  target_go_live: string | null
  actual_go_live: string | null
  last_synced_at: string | null
  executive_summary: string | null
  executive_summary_generated_at: string | null
}

export const ONBOARDING_PROJECT_DETAIL_SELECT =
  'id, zoho_project_id, zoho_status, hotel_name, product, owner, owner_email, start_date, target_go_live, actual_go_live, last_synced_at, executive_summary, executive_summary_generated_at'

export async function getOnboardingProjectByIdOrZohoId(id: string): Promise<OnboardingProjectDetail | null> {
  const { data: projectById, error: idError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(ONBOARDING_PROJECT_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (idError) throw new Error(idError.message)
  if (projectById) return projectById as OnboardingProjectDetail

  const { data: projectByZohoId, error: zohoError } = await supabaseAdmin
    .from('onboarding_projects')
    .select(ONBOARDING_PROJECT_DETAIL_SELECT)
    .eq('zoho_project_id', id)
    .maybeSingle()

  if (zohoError) throw new Error(zohoError.message)
  return (projectByZohoId as OnboardingProjectDetail | null) ?? null
}
