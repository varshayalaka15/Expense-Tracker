# Expense Tracker

A household expense tracker, built one feature at a time. This initial commit contains only the official Vite React + TypeScript starter. Expense tracking, database integration, authentication, and hosting will be added in later steps.

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
npm run preview
```

## Project structure

```text
src/                 Application source
  main.tsx           React entry point
  App.tsx            Starter application
  App.css            Application styles
  index.css          Global styles
  assets/            Assets imported by components
public/              Static files served directly
index.html           HTML entry point
vite.config.ts       Development and build configuration
tsconfig*.json       TypeScript configuration
package.json         Dependencies and npm commands
package-lock.json    Reproducible dependency versions
```

Add feature folders under `src/` as each feature is implemented. No database account or environment variables are needed for this starter.

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
