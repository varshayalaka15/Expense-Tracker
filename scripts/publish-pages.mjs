// Configure public client variables or verify Pages deployment using saved Git
// authentication. Secrets and environment values are never printed.
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const repo = 'https://api.github.com/repos/varshayalaka15/Expense-Tracker'
const argument = process.argv[2]
if (!['--configure', '--status'].includes(argument)) throw new Error('Use --configure or --status')
let credential
try {
  credential = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, stdio: ['pipe', 'pipe', 'ignore'],
  })
} catch { throw new Error('Sign into GitHub with Git Credential Manager before publishing.') }
const token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
if (!token) throw new Error('No saved GitHub authentication found.')
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
async function api(path, options = {}) {
  const response = await fetch(`${repo}${path}`, { ...options, headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`GitHub request ${path} failed (${response.status}). Check repository access.`)
  return response.status === 204 ? null : response.json()
}
if (argument === '--configure') {
  const config = {}
  for (const line of (await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  const url = config.VITE_SUPABASE_URL
  const key = config.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('your-project') || key.includes('your-publishable')) throw new Error('Set your real Supabase URL and publishable key in .env.local first.')
  if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Invalid Supabase project URL.')
  if (key.startsWith('sb_secret_')) throw new Error('Secret keys cannot be published.')
  if (key.startsWith('eyJ') && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error('Only publishable or legacy anon keys can be published.')
  if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) throw new Error('Use a publishable or legacy anon key.')
  const { variables } = await api('/actions/variables')
  for (const [name, value] of [['VITE_SUPABASE_URL', url], ['VITE_SUPABASE_PUBLISHABLE_KEY', key]]) {
    const exists = variables.some(variable => variable.name === name)
    await api(`/actions/variables${exists ? `/${name}` : ''}`, { method: exists ? 'PATCH' : 'POST', body: JSON.stringify({ name, value }) })
    console.log(`Configured ${name} for GitHub Pages.`)
  }
} else {
  const { workflow_runs } = await api('/actions/workflows/deploy-pages.yml/runs?per_page=3')
  console.log(JSON.stringify(workflow_runs.map(run => ({ commit: run.head_sha, status: run.status, conclusion: run.conclusion, url: run.html_url })), null, 2))
}
