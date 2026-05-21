import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    zohoDeskConfigured: !!(
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET
    ),
    zohoCrmConfigured: !!process.env.ZOHO_CRM_REFRESH_TOKEN,
    zohoProjectsConfigured: !!process.env.ZOHO_PROJECTS_REFRESH_TOKEN,
    linearConfigured: !!process.env.LINEAR_API_TOKEN,
    acuityConfigured: !!(process.env.ACUITY_USER_ID && process.env.ACUITY_API_KEY),
    supabaseConfigured: !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    zohoFormsConfigured: !!process.env.ZOHO_FORMS_SATISFACTION_FORM,
  })
}
