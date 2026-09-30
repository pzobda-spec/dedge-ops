import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { NextRequest } from 'next/server'
import { homePathForRole, safeNextPath } from '../lib/auth/paths'

const requireTest = createRequire(import.meta.url)
type Fixture = {
  profile?: object; request?: object; dbError?: boolean; insertError?: boolean;
  authUsers?: object[][]; createError?: object; rpcError?: boolean; writes: object[]; calls: string[]
}
const state = globalThis as typeof globalThis & { authFixture: Fixture }
const fixture = (overrides: Partial<Fixture> = {}) => (state.authFixture = { writes: [], calls: [], ...overrides })
const db = `
export const supabaseAdmin = {
 from(table) {
  const f = globalThis.authFixture;
  const chain = {
   select(){return chain},eq(){return chain},order(){return chain},
   insert(row){f.writes.push(row);return chain},update(row){f.writes.push(row);return chain},
   async maybeSingle(){return {data:(table==='users'?f.profile:f.request)??null,error:f.dbError?{message:'db failed'}:null}},
   then(resolve,reject){return Promise.resolve({data:[{id:'request'}],error:f.insertError?{message:'insert failed'}:null}).then(resolve,reject)}
  }; return chain;
 },
 async rpc(){const f=globalThis.authFixture;f.calls.push('rpc');return {data:'auth-id',error:f.rpcError?{message:'transaction failed'}:null}},
 auth:{admin:{
  async listUsers({page}){const f=globalThis.authFixture;f.calls.push('list:'+page);return {data:{users:f.authUsers?.[page-1]??[]},error:null}},
  async createUser(){const f=globalThis.authFixture;f.calls.push('create');return {data:{user:{id:'new-id'}},error:f.createError??null}}
 }}
};`
const auth = `
export function isRole(v){return ['admin','onboarder','support','commercial_readonly','csm_lead'].includes(v)}
export async function requireRole(req,roles){if(!roles.includes(req.headers.get('x-role')))throw Object.assign(new Error('Unauthorized'),{status:401})}
export function authErrorResponse(e){return e.status ? Response.json({error:e.message},{status:e.status}) : null}
`
async function load(path: string, extra: Record<string, string> = {}) {
  const stubs: Record<string, string> = {
    '@/lib/supabase/server': db, '@/lib/auth/roles': auth,
    '@supabase/ssr': `export function createServerClient(){return {auth:{async signInWithOtp(){globalThis.authFixture.calls.push('otp');return {error:null}}}}}`,
    '@supabase/supabase-js': `export function createClient(){return {auth:{async signInWithOtp(){globalThis.authFixture.calls.push('otp');return {error:null}}}}}`,
    'next/headers': 'export async function cookies(){return {getAll(){return []},set(){}}}',
    'next/server': 'export const NextResponse = Response', ...extra,
  }
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', plugins: [{ name: 'auth-fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'stub' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }] })
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> }
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, requireTest)
  return module.exports
}
function request(body: object, role = '') {
  return Object.assign(new Request('http://localhost:3000/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-role': role }, body: JSON.stringify(body),
  }), { nextUrl: new URL('http://localhost:3000/api') })
}

test('login: explicit complete request, domain validation, DB errors, existing and inactive profiles', async () => {
  const { POST } = await load('app/api/auth/login/route.ts')
  fixture()
  assert.equal((await (await POST(request({ email: 'new@d-edge.com' }))).json()).status, 'details_required')
  assert.equal(state.authFixture.writes.length, 0)
  for (const body of [
    { email: 'external@example.org', intent: 'request', full_name: 'External', requested_role: 'onboarder' },
    { email: 'new@d-edge.com', intent: 'request', requested_role: 'admin' },
    { email: 'new@d-edge.com', intent: 'request', full_name: 'New User', requested_role: 'unknown' },
  ]) assert.equal((await POST(request(body))).status, 400)
  const body = { email: ' New@D-EDGE.com ', intent: 'request', full_name: 'New User', requested_role: 'support' }
  assert.equal((await (await POST(request(body))).json()).status, 'pending')
  assert.deepEqual(state.authFixture.writes, [{ email: 'new@d-edge.com', full_name: 'New User', requested_role: 'support', status: 'pending' }])
  fixture({ insertError: true })
  assert.equal((await POST(request(body))).status, 500)
  fixture({ profile: { active: true, role: 'onboarder' } })
  assert.equal((await (await POST(request({ email: 'direct@d-edge.com' }))).json()).status, 'sent')
  assert.deepEqual(state.authFixture.calls, ['otp'])
  fixture({ profile: { active: false, role: 'onboarder' }, request: { status: 'approved' } })
  assert.equal((await POST(request({ email: 'disabled@d-edge.com' }))).status, 403)
  assert.deepEqual(state.authFixture.calls, [])
  fixture({ request: { status: 'approved' } })
  assert.equal((await POST(request({ email: 'orphan@d-edge.com' }))).status, 409)
})

test('admin endpoints require administrator before any read/write or Auth action', async () => {
  for (const [path, method] of [
    ['app/api/auth/approve/route.ts','POST'], ['app/api/auth/pending/route.ts','GET'], ['app/api/admin/users/invite/route.ts','POST'],
  ]) {
    const route = await load(path)
    for (const role of ['', 'onboarder', 'support']) {
      fixture()
      assert.equal((await route[method](request({ email: 'winli@d-edge.com', action: 'approve', role: 'admin' }, role))).status, 401)
      assert.deepEqual(state.authFixture.calls, [])
      assert.deepEqual(state.authFixture.writes, [])
    }
  }
})

test('approval reuses existing Auth user across pages and sends email only after DB success', async () => {
  const { POST } = await load('app/api/auth/approve/route.ts')
  const authUsers = [Array.from({ length: 100 }, (_, i) => ({ id: String(i), email: `${i}@d-edge.com` })), [{ id: 'auth-id', email: 'winli@d-edge.com' }]]
  fixture({ request: { status: 'approved', full_name: 'Winli' }, authUsers })
  assert.equal((await POST(request({ email: 'winli@d-edge.com', action: 'approve', role: 'onboarder' }, 'admin'))).status, 200)
  assert.deepEqual(state.authFixture.calls, ['list:1','list:2','rpc','otp'])
  fixture({ request: { status: 'pending', full_name: 'Winli' }, authUsers, rpcError: true })
  assert.equal((await POST(request({ email: 'winli@d-edge.com', action: 'approve', role: 'onboarder' }, 'admin'))).status, 500)
  assert.equal(state.authFixture.calls.includes('otp'), false)
  fixture({ request: { status: 'pending', full_name: 'Winli' } })
  assert.equal((await POST(request({ email: 'winli@d-edge.com', action: 'approve' }, 'admin'))).status, 400)
  assert.deepEqual(state.authFixture.calls, [])
})

test('role landing pages and open redirect protection', () => {
  assert.equal(homePathForRole('onboarder'), '/onboarding')
  assert.equal(homePathForRole('csm_lead'), '/csm/pilotage')
  assert.equal(safeNextPath('/onboarding?view=active'), '/onboarding?view=active')
  for (const path of ['//evil.test', '/\\evil.test', '/\nevil.test', 'https://evil.test']) assert.equal(safeNextPath(path), null)
})

test('middleware: orphan sessions terminate, onboarder routes and refresh cookies are enforced', async () => {
  const { middleware } = await load('middleware.ts', {
    'next/server': '',
    '@supabase/ssr': `export function createServerClient(url,key,options){return {auth:{async getUser(){options.cookies.setAll([{name:'refreshed',value:'session',options:{path:'/'}}]);return {data:{user:{email:'fixture@d-edge.com'}},error:null}}}}}`,
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json(state.authFixture.profile ? [state.authFixture.profile] : [])
  try {
    fixture()
    for (const path of ['/login', '/', '/dashboard']) {
      const response = await middleware(new NextRequest(`http://localhost${path}`))
      assert.equal(new URL(response.headers.get('location')).pathname, '/forbidden')
      assert.match(response.headers.get('set-cookie'), /refreshed=session/)
    }
    fixture({ profile: { email: 'fixture@d-edge.com', role: 'onboarder', active: true } })
    for (const path of ['/login', '/a-traiter', '/settings', '/settings/me']) {
      const response = await middleware(new NextRequest(`http://localhost${path}`))
      assert.equal(new URL(response.headers.get('location')).pathname, '/onboarding', path)
    }
    assert.equal((await middleware(new NextRequest('http://localhost/api/onboarding/weekly-exceptions'))).status, 403)
    assert.equal((await middleware(new NextRequest('http://localhost/onboarding'))).status, 200)
    assert.equal((await middleware(new NextRequest('http://localhost/api/cron/ingest-sf-case-monthly', { method: 'POST' }))).status, 200)
    fixture({ profile: { email: 'fixture@d-edge.com', role: 'onboarder', active: false } })
    assert.equal(new URL((await middleware(new NextRequest('http://localhost/login'))).headers.get('location')).pathname, '/forbidden')
  } finally { globalThis.fetch = originalFetch }
})
