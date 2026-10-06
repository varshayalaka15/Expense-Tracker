import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('migration and account policies work in PostgreSQL with a minimal Supabase schema', async () => {
  const database = new PGlite()
  try {
    // Supabase-managed tables/functions are represented locally; this does not
    // replace live GoTrue or Storage API testing against a configured project.
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      create schema storage;
      create table storage.buckets (
        id text primary key, name text not null, public boolean default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id), name text not null,
        unique(bucket_id, name)
      );
      create function storage.foldername(name text) returns text[] language sql immutable as
        $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select on storage.objects to anon;
      grant select, insert, update, delete on storage.objects to authenticated;
    `)
    const [migration, checks, adminMigration, adminChecks, adminSetup] = await Promise.all([
      readFile(new URL('../supabase/migrations/202610050001_expenses.sql', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/tests/expenses_rls.sql', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/migrations/202610050002_admin_portal.sql', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/tests/admin_rls.sql', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/setup-admin.sql', import.meta.url), 'utf8'),
    ])
    await database.exec(migration)
    await database.exec(checks)
    await database.exec(adminMigration)
    // Existing personal restrictions still work after adding the admin policies.
    await database.exec(checks)
    await database.exec(adminChecks)
    await database.exec(`insert into auth.users (id, email, email_confirmed_at) values
      ('10000000-0000-4000-8000-000000000003', 'admin@example.invalid', now()),
      ('10000000-0000-4000-8000-000000000004', 'unconfirmed@example.invalid', null)`)
    async function setupFails(email, message) {
      await assert.rejects(database.exec(adminSetup.replace("'YOUR_ADMIN_EMAIL_HERE'", `'${email}'`)), message)
      await database.exec('rollback')
    }
    await setupFails('YOUR_ADMIN_EMAIL_HERE', /Replace YOUR_ADMIN_EMAIL_HERE/)
    await setupFails('missing@example.invalid', /Account not found/)
    await setupFails('unconfirmed@example.invalid', /Confirm the account email/)
    await database.exec(adminSetup.replace("'YOUR_ADMIN_EMAIL_HERE'", "'admin@example.invalid'"))
    await database.exec(adminSetup.replace("'YOUR_ADMIN_EMAIL_HERE'", "'ADMIN@example.invalid'"))
    await database.exec(`update auth.users set email_confirmed_at = now() where email = 'unconfirmed@example.invalid'`)
    await setupFails('unconfirmed@example.invalid', /different administrator/)
    const result = await database.query('select count(*)::int as count from public.expenses')
    assert.equal(result.rows[0].count, 0, 'the policy test must roll back all fixtures')
  } finally { await database.close() }
})
