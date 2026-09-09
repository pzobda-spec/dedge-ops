import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const requireTest = createRequire(import.meta.url)
const authStub = `
export async function requireRole(req, allowed) {
 const role = req.headers.get('x-test-role');
 if (!allowed.includes(role)) throw Object.assign(new Error('Forbidden'), {status:403});
 return {role};
}
export function authErrorResponse(error) {return error.status ? Response.json({error:error.message},{status:error.status}) : null}
`
const dbStub = `
export const supabaseAdmin = {from(){
 const chain = {
  select(){return chain}, eq(){return chain},
  async maybeSingle(){return {data:null,error:null}},
  upsert(row){globalThis.__testWrites.push(row);return chain},
  update(row){globalThis.__testWrites.push(row);return chain},
  async single(){return {data:globalThis.__testWrites.at(-1),error:null}},
  then(resolve,reject){return Promise.resolve({data:[{name:'fixture'}],error:null}).then(resolve,reject)}
 };return chain;
}}
`
async function loadRoute(path: string) {
  const stubs: Record<string, string> = { '@/lib/auth/roles': authStub, '@/lib/supabase/server': dbStub, 'next/server': 'export const NextResponse = Response' }
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', plugins: [{ name: 'isolated-route', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'stub' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }] })
  const module = { exports: {} as { POST: (req: Request) => Promise<Response> } }
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, requireTest)
  return module.exports.POST
}

test('routes réelles : droits CSM et validation, stockage isolé', async () => {
  const assignments = await loadRoute('app/api/csm/plan-charge/assignments/route.ts')
  const roster = await loadRoute('app/api/csm/plan-charge/roster/route.ts')
  const global = globalThis as typeof globalThis & { __testWrites: unknown[] }
  const request = (role: string, body: object) => new Request('http://localhost', { method: 'POST', headers: { 'x-test-role': role, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  for (const field of ['ob_owner', 'ob_locked', 'group_id']) {
    global.__testWrites = []
    const response = await assignments(request('csm_lead', { account_id: '1', [field]: null }))
    assert.equal(response.status, 403, field)
    assert.equal(global.__testWrites.length, 0)
  }
  global.__testWrites = []
  assert.equal((await assignments(request('commercial_readonly', { account_id: '1', csm_name: 'Bob' }))).status, 403)
  assert.equal((await assignments(request('csm_lead', { account_id: '1', expected_go_live: '2026-02-30' }))).status, 400)
  assert.equal(global.__testWrites.length, 0)
  assert.equal((await assignments(request('csm_lead', { account_id: '1', csm_name: 'Bob', csm_locked: true, expected_go_live: '2026-11-01' }))).status, 200)
  assert.equal(global.__testWrites.length, 1)
  global.__testWrites = []
  assert.equal((await roster(request('csm_lead', { kind: 'ob', name: 'Alice', availability: 'full', role: 'senior', max_projects: 5 }))).status, 403)
  assert.equal(global.__testWrites.length, 0)
  assert.equal((await roster(request('csm_lead', { kind: 'csm', name: 'Bob', availability: 'relache', monthly_capacity_points: 12 }))).status, 200)
  assert.equal(global.__testWrites.length, 1)
})
