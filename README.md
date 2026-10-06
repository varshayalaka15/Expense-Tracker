# Expense Tracker

A React and TypeScript expense tracker with weekly/monthly USD summaries, category filtering, receipt photos, and optional Supabase authentication and permanent storage.

## Features

- Add, edit, and delete expenses, including payer names and optional notes.
- Attach JPEG, PNG, or WebP bill photos up to 10 MB; preview, replace, or capture photos on supported devices.
- View private bills beside their expense details.
- See spending from Monday through today, monthly totals, and category breakdowns.
- Sign up, confirm your email, sign in, and sign out when Supabase is configured.
- Save expense details in PostgreSQL and bills in private Supabase Storage.
- Separate personal-upload and administrator links, protected by login and database permissions.
- Uploaders access only their own records; the designated administrator can view, edit, and delete all submitted bills.

Each account owns its own expenses, and the administrator manages submissions across accounts. Shared households, invitations, receipt scanning/OCR, inventory, and shopping features are future work. Image validation checks whether a photo is readable, not whether it contains a real bill.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the Vite address printed in the terminal. The app's base path is `/Expense-Tracker/`.

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

**Demo mode:** with no Supabase environment variables, the app uses labeled sample entries and illustrative bills. New demo entries/photos reset on reload. Demo data is never uploaded or automatically migrated into an account.

## Connect Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com/dashboard).
2. In its SQL Editor, run the entire contents of [`supabase/migrations/202610050001_expenses.sql`](supabase/migrations/202610050001_expenses.sql) **once**. It creates the expense table, indexes, constraints, private `receipts` bucket, and access policies. The migration targets a new project; an existing table or bucket with the same name needs review before applying it. Alternatively, use the Supabase CLI's migration workflow with `supabase db push`.
3. Copy `.env.example` to `.env.local` and replace the placeholders:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   Find these values in the project's Connect dialog or API settings. A legacy anon key also works with `VITE_SUPABASE_ANON_KEY`. Use only the browser-safe publishable/anon key. Never use a secret key, service-role key, or database password in a `VITE_` variable. Vite variables are embedded in the public frontend bundle.

4. In Supabase Authentication's URL Configuration, set the Site URL and allowed Redirect URLs to include your app URL. For local development this is usually `http://localhost:5173/Expense-Tracker/`; use the actual address Vite prints. Add the deployed URL when hosting. Keep email confirmation enabled, and configure an appropriate email provider before offering signup broadly.
5. Restart `npm run dev`. You should see the sign-in screen instead of sample data.
6. Create an account, follow the confirmation email if required, and sign in. Add an expense with a photo, refresh, and open its bill to confirm persistence.

Supabase provides the auth, database, and storage APIs; there is no separate Express server. See the official [React setup guide](https://supabase.com/docs/guides/getting-started/tutorials/with-react), [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys), and [private storage access](https://supabase.com/docs/guides/storage/serving/downloads).

## Two links and administrator setup

After deployment, share these links:

- Personal uploads: `https://varshayalaka15.github.io/Expense-Tracker/?view=upload`
- Administrator: `https://varshayalaka15.github.io/Expense-Tracker/?view=admin`

Locally, append `?view=upload` or `?view=admin` to the Vite URL. The homepage defaults to personal uploads. Query parameters work with GitHub Pages without server routing. The administrator link alone never grants access.

If you already ran the original expense setup, **do not run it again**. Apply only the new administrator migration:

1. Run [`supabase/migrations/202610050002_admin_portal.sql`](supabase/migrations/202610050002_admin_portal.sql) once in Supabase's SQL Editor. It preserves existing bills and adds the protected admin role, admin listing API, and expanded access policies.
2. Sign up through the personal-upload link and confirm your email. Existing confirmed accounts can be used.
3. Open [`supabase/setup-admin.sql`](supabase/setup-admin.sql). Replace the first `YOUR_ADMIN_EMAIL_HERE` value assigned to `admin_email` with your Expense Tracker login email, then run it in the SQL Editor. Keep the later placeholder checks unchanged. It checks that the account exists and is confirmed. It is safe to repeat for the same account and refuses to silently replace another admin.
4. Open the admin link and sign in with that account. The page lists all submissions, labels the uploader's email separately from the payer, and filters by uploader/category. Its totals reflect the selected filters. Copy-link buttons provide the admin and upload URLs.

The admin page offers no public signup. To create the designated account, use personal uploads first. Only the Supabase project owner can assign or revoke admin membership through the SQL Editor; public signup, client metadata, and ordinary API requests cannot promote an account. To revoke admin access, remove the membership in `public.app_admins` through the SQL Editor. Signed receipt URLs that were already issued can remain valid until their five-minute expiry.

Configure Supabase Authentication's Site URL to your hosted app and allow these Redirect URLs:

```text
https://varshayalaka15.github.io/Expense-Tracker/
https://varshayalaka15.github.io/Expense-Tracker/?view=upload
```

Add the equivalent local Vite URLs when developing. Signup confirmation returns to personal uploads. Admins can use **My uploads** for their own submissions; edits to someone else's bill preserve the original ownership.

To copy the new migration directly from PowerShell:

```powershell
Get-Content -Raw "C:\Users\yalak\Documents\Expense-Tracker\supabase\migrations\202610050002_admin_portal.sql" | Set-Clipboard
```

Paste it into Supabase's SQL Editor and click Run once. The SQL is executed in Supabase, not PowerShell.

## Data and failure handling

- Money is stored as integer cents. An expense of $25.50 is stored as `2550`.
- Bill paths are scoped to the account and expense, with a new unique filename for every replacement.
- Bill viewing requests a five-minute signed URL; the open dialog renews it before expiry. Signed URLs grant temporary access to anyone holding them, so avoid sharing them.
- Saving uploads the image first, then writes the expense. If the write fails, the app reads back the record to check whether the server committed it before cleaning up the image.
- An unknown save outcome disables another submission; close the form to reload the list before trying again.
- Replacement/deletion removes the old bill after the database change. Cleanup failures are reported without falsely reporting that the expense change failed. An administrator can remove unused files through the Storage dashboard after checking that no expense references them.
- Signed-in lists paginate through all expenses so totals are not limited to the default API row cap. Use Refresh to pick up changes from another tab/device; live synchronization is not implemented.
- The dashboard date is fixed when the page loads. Reload after midnight to update its reporting day.

## Checks

```sh
npm run lint
npm test
npm run build
```

Node tests cover money/date validation and the expense service's upload ordering, pagination, write recovery, rollback cleanup, edits, deletion, and signed URLs. They run both SQL migrations and account-policy checks in PGlite (embedded PostgreSQL) with a minimal representation of Supabase's managed schemas. Admin checks cover blocked self-promotion, ignored client role metadata, cross-account access, preserved ownership, revocation, protected email lookup, and the designation script.

Browser tests use mocked Supabase HTTP responses, not a live database:

```sh
npx playwright install chromium
npm run test:browser
```

They cover desktop and mobile signup, login, save/reload, bills, editing/replacement, deletion, failure recovery, account switching, Escape/focus restoration, denied admin access, admin filtering/totals, cross-account edits/deletions, and role errors/revocation. To use an installed Chrome instead of downloading Chromium, set `PLAYWRIGHT_CHANNEL=chrome` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`). The browser suite starts separate Vite servers on ports 4174 (mocked backend) and 4175 (demo) and does not use your real project.

For actual database access rules, run [`supabase/tests/expenses_rls.sql`](supabase/tests/expenses_rls.sql) in a disposable project's SQL Editor after the migration. It creates transactional fixtures, checks account isolation and constraints, and rolls everything back. It does not upload real file bytes. Then manually verify actual signup and storage with the checklist below.

## Live verification checklist

1. Sign up and confirm your email. Verify incorrect login details show an error.
2. Submit an incomplete expense; check errors and focus. Try a future date, invalid amount, unsupported/empty/oversized/corrupt image.
3. Add a valid expense. Verify the total changes once, refresh, and confirm the saved entry and bill remain.
4. Edit the amount without replacing the bill; then replace it and confirm the old file is gone from Storage.
5. Cancel a deletion; then confirm deletion and verify the record and file disappear.
6. Filter categories and check the empty state, desktop/mobile layout, keyboard navigation, and Escape dismissal.
7. Sign out and sign into a second account. Verify it cannot read/update/delete the first account's rows or read/upload/delete files in the first account's storage folder, including requests made directly to the APIs.
8. Sign in as the designated administrator using the admin link. View both uploaders' bills, filter by email/category, replace a bill, and verify its uploader can still access it. Delete a submission and confirm storage cleanup.
9. Open the admin link as an ordinary user and while signed out. Verify signup is unavailable on that page, and ordinary users cannot call the admin APIs or change role assignments directly.
10. Try offline/server-error conditions and verify actionable errors and retry behavior.

Live authentication, database migration, and Storage/RLS checks require a configured project and are not covered by the mocked browser tests.

## GitHub Pages

The existing `.github/workflows/deploy-pages.yml` runs lint/tests, builds, and deploys `dist/`. In repository **Settings → Pages**, choose **GitHub Actions** as the source.

For the signed-in version, add repository Actions variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public client configuration, not privileged secrets. Add `https://varshayalaka15.github.io/Expense-Tracker/` to Supabase's auth URL configuration. Rebuild/redeploy after changing configuration because Vite embeds it at build time. Without those variables, Pages builds the temporary demo mode.

With saved GitHub authentication in Git Credential Manager, `node scripts/check-deployment.mjs` performs read-only connection checks. `node scripts/publish-pages.mjs --configure` explicitly copies the local public Supabase settings into repository Actions variables without printing them, and `node scripts/publish-pages.mjs --status` reports the deployment workflow status. Commit and push the tested application changes to `main` to trigger the existing workflow. The separate admin migration and account designation still require Supabase's SQL Editor.

Changing the repository/hosting path requires updating `base` in `vite.config.ts` and the auth redirect URLs. The frontend can stay on Pages while Supabase hosts its APIs and data.

## Project structure

```text
src/
  main.tsx                  React entry point
  AppEntry.tsx              Session restoration and authentication gate
  App.tsx                   Dashboard and expense state
  lib/supabase.ts            Supabase client and configuration validation
  features/auth/            Signup/login and administrator authorization gate
  features/expenses/        Form, list, bills, validation, persistence service
  components/               Shared dialogs and icons
supabase/migrations/        Database and private Storage setup
supabase/tests/             Transactional database policy checks
supabase/setup-admin.sql    Assign one existing confirmed administrator account
scripts/                    Connection checks and Pages configuration/status
tests/                      Node tests
  browser/                  Playwright UI flows with mocked API responses
.env.example                Public client configuration template
```
