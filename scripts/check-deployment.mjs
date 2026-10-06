// Read-only deployment checks. Never print keys, passwords, or Git credentials.
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const config = {}
try {
  const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
} catch { /* Configuration may not exist yet. */ }
const result = { supabaseConfigured: false, adminMigrationApplied: false, githubSignedIn: false }
const key = config.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY
if (config.VITE_SUPABASE_URL && key) {
  result.supabaseConfigured = true
  try {
    const client = createClient(config.VITE_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client.rpc('is_admin')
    result.adminMigrationApplied = error?.code === '42501'
    if (error && error.code !== '42501') result.supabaseCheck = error.code || 'Unable to check project'
  } catch { result.supabaseCheck = 'Unable to check project' }
}
let token
try {
  const credential = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
} catch { /* No saved credential, or credential access is unavailable. */ }
if (token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  try {
    const repo = 'https://api.github.com/repos/varshayalaka15/Expense-Tracker'
    const response = await fetch(repo, { headers, signal: AbortSignal.timeout(15_000) })
    if (response.ok) {
      result.githubSignedIn = true
      const repository = await response.json()
      result.canPush = repository.permissions?.push === true
      const [pages, variables] = await Promise.all([
        fetch(`${repo}/pages`, { headers, signal: AbortSignal.timeout(15_000) }),
        fetch(`${repo}/actions/variables`, { headers, signal: AbortSignal.timeout(15_000) }),
      ])
      result.pagesConfigured = pages.ok
      if (variables.ok) {
        const { variables: entries } = await variables.json()
        result.pagesUrlMatches = entries.some(entry => entry.name === 'VITE_SUPABASE_URL' && entry.value === config.VITE_SUPABASE_URL)
        result.pagesKeyMatches = entries.some(entry => entry.name === 'VITE_SUPABASE_PUBLISHABLE_KEY' && entry.value === key)
      } else result.variablesCheck = variables.status
    } else result.githubCheck = response.status
  } catch { result.githubCheck = 'Unable to reach GitHub' }
}
console.log(JSON.stringify(result, null, 2))
