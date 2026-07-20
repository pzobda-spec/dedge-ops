import { supabaseAdmin } from '@/lib/supabase/server'

export interface OnboardingProjectDetail {
  id: string
  zoho_project_id: string | null
  zoho_status: string | null
  hotel_name: string | null
  product: string | null
  commercial_plan: string | null
  customer_tier: string | null
  customer_type: string | null
  dmbook_only: boolean | null
  enabled_options: Record<string, boolean>
  csm_name: string | null
  csm_email: string | null
  csm_assignment_status: string | null
  csm_assignment_points: number | null
  csm_assignment_reason: string | null
  owner: string | null
  owner_email: string | null
  start_date: string | null
  target_go_live: string | null
  actual_go_live: string | null
  last_synced_at: string | null
  executive_summary: string | null
  executive_summary_generated_at: string | null
  status_report: ProjectStatusReport | null
  status_report_generated_at: string | null
}

export interface ProjectStatusReport {
  tldr: string
  current_status: string
  key_updates: string[]
  risks: string[]
  next_steps: string[]
  source_comment_count: number
}

export const ONBOARDING_PROJECT_DETAIL_SELECT =
  'id, zoho_project_id, zoho_status, hotel_name, product, commercial_plan, customer_tier, customer_type, dmbook_only, enabled_options, csm_name, csm_email, csm_assignment_status, csm_assignment_points, csm_assignment_reason, owner, owner_email, start_date, target_go_live, actual_go_live, last_synced_at, executive_summary, executive_summary_generated_at, status_report, status_report_generated_at'

export async function getOnboardingProjectByIdOrZohoId(id: string): Promise<OnboardingProjectDetail | null> {
  const filterValue = id.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const { data: project, error } = await supabaseAdmin
    .from('onboarding_projects')
    .select(ONBOARDING_PROJECT_DETAIL_SELECT)
    .or(`id.eq.${filterValue},zoho_project_id.eq.${filterValue}`)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (project as OnboardingProjectDetail | null) ?? null
}
