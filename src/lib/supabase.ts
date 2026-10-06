import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

let client: SupabaseClient | null = null
let error = ''
if (Boolean(url) !== Boolean(key)) error = 'Both the Supabase project URL and publishable key are required.'
if (url && key) {
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Invalid project URL')
    if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a secret key.')
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role !== 'anon') throw new Error('Use a publishable key or legacy anon key.')
    }
    // Only a publishable/anon key belongs in the browser. RLS protects each account.
    client = createClient(url, key)
  } catch { error = 'Check your Supabase URL and publishable key. Secret and service-role keys must never be used in the frontend.' }
}
export const supabase = client
export const configurationError = error
