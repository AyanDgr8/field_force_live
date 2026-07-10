# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run seed` — load demo data (admin1/password123)
- Required env: `DATABASE_URL` — MySQL connection string, `SESSION_SECRET`, `PORT`
- Frontend dev: set `PORT`, `BASE_PATH=/`, and `API_PROXY_TARGET=http://localhost:<api-port>`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: MySQL 8 + Drizzle ORM (`mysql2` driver)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Gotchas

- MySQL has no `RETURNING`. Use `insertReturning` / `insertManyReturning` /
  `updateReturning` / `deleteReturning` from `@workspace/db` instead of Drizzle's
  `.returning()`, which the mysql2 driver does not expose.
- Timestamps are `datetime(fsp: 3)` holding UTC. Every pooled connection sets
  `time_zone = '+00:00'` (see `lib/db/src/client.ts`) so `now(3)` defaults are UTC
  too. Don't remove that hook.
- Drizzle's `datetime` builder has no `.defaultNow()` — use `.default(sql\`(now(3))\`)`.
- Columns that need a unique index must be `varchar`, not `text`; MySQL cannot index
  a TEXT column without a key prefix length.

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
