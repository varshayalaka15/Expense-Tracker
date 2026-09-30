# Expense Tracker

A household expense tracker, built one feature at a time using React, TypeScript, Vite, and Tailwind CSS.

## Current feature: frontend preview

- Responsive overview with weekly/monthly USD spending and category breakdown.
- Expense list with category filtering and bill details.
- Add Expense form with required date, description, category, amount, payer name, and a bill photo; optional notes.
- JPEG, PNG, and WebP bill photos up to 10 MB, with preview, replacement, and camera capture where supported.
- Clearly labeled sample expenses and illustrative sample receipts.

Entries and photos live only in the current tab's memory and reset on reload. Nothing is uploaded, and the frontend cannot determine whether a photo contains an actual bill. Database, authentication, permanent storage, OCR, editing/deleting expenses, inventory, and shopping behavior will be added separately.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite.

```sh
npm run build
npm run lint
npm test
npm run preview
```

## Project structure

```text
src/                 Application source
  main.tsx           React entry point
  App.tsx            Application shell and expense state
  App.css            Application styles
  index.css          Global styles
  assets/            Assets imported by components
  components/        Shared dialog and icons
  features/expenses/ Expense form, list, bill details, types, and helpers
public/              Static files served directly
tests/               Node-based money, validation, and date tests
index.html           HTML entry point
vite.config.ts       Development and build configuration
tsconfig*.json       TypeScript configuration
package.json         Dependencies and npm commands
package-lock.json    Reproducible dependency versions
```

Add feature folders under `src/` as each feature is implemented. No database account or environment variables are needed for this preview. The dashboard date is fixed at page load; reload after midnight to use the new day.

## Manual checks

1. Open Add Expense and submit without fields: verify field errors and keyboard focus.
2. Enter a payer and expense details; saving without a bill must fail.
3. Try an unsupported, empty, oversized, or corrupt image; verify an actionable error.
4. Select a valid bill, replace/remove it, and cancel; cancelling must not create an expense.
5. Add a valid expense; verify it appears once, totals update, and View Bill shows the selected image and payer.
6. Filter to Other to see the empty state; add an Other expense and verify the filter updates.
7. Check narrow mobile and desktop layouts, Tab navigation, Escape dismissal, and focus restoration.
8. Reload: the sample data returns and added expenses disappear, as described in the preview notice.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
