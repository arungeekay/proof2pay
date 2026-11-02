# Proof2Pay progress

Updated at the end of every session (plan Section 0). Current status first, then the session log, newest first.

## Current status (2026-11-02, Day 3 of "Foundation", Oct 31 to Nov 2)

### Waiting on Arun

All free, and none needs a payment card (plan rule 11).

- [ ] **GitHub:** run `gh repo create arungeekay/proof2pay --public --source . --remote origin --push` from this folder. Claude Code's auto mode won't create public repos.
- [x] **Gemini API key:** in local `.env` and tested 2026-11-02. `gemini-3.8-flash` and `gemini-3.6-flash` both answer. Paste the same key into Render when the Blueprint prompts for it.
- [ ] **PayPal sandbox:** create three US accounts (exporter business, carrier business, buyer personal) and one app, and turn on the app's Payouts, Invoicing and Disputes features. Client id and secret go in `.env`. Account logins go in `docs/judge-credentials.md`, which is gitignored.
- [ ] **Neon:** create the free Postgres project `proof2pay` in Singapore and copy the direct (unpooled) connection string.
- [ ] **Render:** deploy the Blueprint (README button), pasting the Neon string and keys when prompted, then send Claude the URL. Optionally claim the hackathon credits, but never add a card.
- [ ] **APIMatic:** reload the window, approve the `context-matic` MCP server from `.mcp.json`, then authenticate it in `/mcp` with a free APIMatic account. Also fill in the Devpost APIMatic form.
- [ ] **AG Studio:** request the 45-day trial today; started Nov 2, it lasts to Dec 17. The licence key goes in `.env` as `AG_STUDIO_LICENSE_KEY`.
- [ ] **Elastic (Nov 3, not before):** start the trial via https://ela.st/elastic-paypal-hackathon. `ELASTIC_URL` and `ELASTIC_API_KEY` go in `.env`. Extend it around Nov 15 at https://www.elastic.co/trialextension.

### Claude does once those land

- Register the PayPal webhook through the REST API (no dashboard step), store `PAYPAL_WEBHOOK_ID`, and set it on Render.
- Set the GitHub repository variable `APP_URL` so the keep-alive ping starts, then check `/api/health` on the hosted URL.

### Decisions (Arun delegated all decisions on 2026-11-02, provided they cost nothing)

| Topic | Decision | Why |
|---|---|---|
| LLM | Google Gemini free tier, `gemini-3.8-flash` (stable, vision, tool use), behind `lib/llm.ts` | Anthropic has no free API tier. Free-tier prompts may be used by Google, which is fine because all demo data is fictional. |
| Quota safety | `lib/llm.ts` retries with backoff on 503 and 429, then falls back to `gemini-3.6-flash`. As a last resort, `DEMO_MODE` replays recorded output for the scripted SH-1042 flow and labels it as replayed | `gemini-3.8-flash` returned 503 "high demand" on the first test on 2026-11-02, then recovered. Judging runs to Dec 15 on a free quota. |
| Database | Neon free Postgres (0.5 GB, scales to zero, no expiry, no card) | Render's free Postgres expires after 30 days, and paid Render needs a card |
| Hosting | Render free web service via `render.yaml`. The build runs migrations and seeds only an empty database. Keep-alive GitHub Action pings `/api/ping` every 10 minutes | Avoids the cold start of about a minute for judges. One service uses about 744 of 750 free hours a month. |
| APIMatic | ContextMatic MCP server declared in project `.mcp.json` (OAuth login, free) | Installing the plugin from the CLI was blocked by auto mode, and this is the same server |
| Credit clock start | Day of acceptance of goods, which is the verified delivery date. The invoice is sent the same day, due acceptance + credit days | MSMED s.15 counts from acceptance; the seed already does this |
| Demo time compression | Generate the SH-1042 demo POD at seed time, dated inside the delivery window | Delivery AI should verify it cleanly apart from the scripted dented carton |
| RBI bank rate | 5.75% (rbi.org.in, checked 2026-11-02; repo raised to 5.50% on Oct 7). Next MPC Dec 2 to 4: re-check before recording | MSMED interest is 3x the bank rate |
| Sandbox account country | United States for all three accounts, currency USD | Indian PayPal accounts can't send payouts and have domestic restrictions. The story stays "exporter in Chennai", and the README will say so. |
| Exporter name | Keep the fictional "Marina Precision Exports Pvt Ltd" | A fictional name avoids implying a real company |
| MSMED pitch | Claim documentation value, not enforcement, against overseas buyers | Recovery through MSME Samadhaan is hard against a foreign buyer |
| Packages | Approved, each installed on its plan day: PayPal Agent Toolkit plus MCP client, `@paypal/paypal-server-sdk` (if the toolkit lacks a call), Gemini SDK, `@elastic/elasticsearch`, Bryntum trial, AG Studio, Render Workflows SDK | All free or trial |
| npm audit | Leave the 8 build-time findings; the fix needs Next 16 | Not in the plan |

Checked 2026-11-02: MSMED s.15 caps a written period at 45 days from acceptance and sets 15 days when nothing is agreed. s.16 is compound interest with monthly rests at 3x the RBI bank rate. This matches `lib/credit-clock/presets.ts`.

### Next three tasks (once the PayPal keys land)

1. `lib/paypal` REST client with APIMatic ContextMatic: OAuth token cache, Orders authorize and capture, Invoicing create/send/get, Payouts, Refunds, webhook verification, and webhook registration.
2. PayPal MCP client and a test route making one tool call.
3. Hosted check: Render deploy green, `/api/health` live, keep-alive running.

## Session log

### 2026-11-02

- Switched every paid service to a free one (plan rule 11 added). Gemini replaces Anthropic, and Neon plus Render free replace paid Render. The plan's Sections 0, 4.1, 4.3, 5, 12, 13.1 and 14 are updated to match.
- Added `render.yaml`, `/api/ping`, `db:seed:if-empty` (`--if-empty` skips seeding when data exists), and two GitHub workflows: `ci.yml` (lint, typecheck, test, build) and `keepalive.yml`. The README has a free deploy section with a Deploy to Render button.
- Added the APIMatic ContextMatic MCP server in `.mcp.json`. Its endpoint answers with an OAuth challenge, so it needs a one-time login.
- RBI bank rate default moved from 5.50% to 5.75% in `lib/credit-clock/presets.ts`, `.env.example` and `.env`.
- Verified: lint, typecheck, 27 tests, `next build`. The full Render build sequence (migrate, seed-if-empty twice) ran against an empty database: it seeded the first time and skipped the second.
- Installed the Neon agent skills locally (`npx neon skills -y`: `neon`, `neon-postgres` and 7 others). They are gitignored because `.claude/skills` holds absolute symlinks, so rerun the command on another machine.
  - We use only Lakebase Postgres. Neon Auth, Functions, Object Storage and the AI Gateway are out of scope.
  - Neon advises a pooled URL for app traffic and a direct one for migrations. We keep one direct `DATABASE_URL` because the app is a long-running Node server with a 10-connection pool, not serverless.

### 2026-10-31

- **Scaffold:** Next.js 15.5 (App Router, TypeScript), Tailwind 4, shadcn/ui (Radix, Nova preset), ESLint, Vitest 5. Folder layout per Section 4.2, with placeholder folders for later modules.
- **Repo hygiene:** MIT `LICENSE`, `.env.example`, and a `.gitignore` covering `.env`, the generated Prisma client, `/uploads` and `docs/judge-credentials.md`.
- **Database:** Prisma 7.10 schema with every Section 9 model plus `PaymentReminder`, which `/invoices` needs for reminder history. First migration `20261031163632_init`. Local Postgres 17 in Docker on port 5433 (`npm run db:up`).
- **Seed** (`npm run db:seed`, re-runnable, refuses unless `DEMO_MODE=true`): 6 businesses, 7 users (4 role-switcher personas), 20 historical shipments, and SH-1042 as a draft.
  - Settled: 17 shipments. 3 of them were paid late (MSMED interest recorded), and 2 were disputed: one resolved for the buyer with a $560 refund and a simulated insurance claim, one resolved for the seller.
  - The other 3: one overdue with interest accruing, one with a running clock, and one with a minor POD discrepancy.
  - Trust profiles therefore span confidence levels: Northwind 12, Harbourside 6, Rhein 2, Example Freight 16, Bluewater 4.
- **Credit-clock engine** (`lib/credit-clock`, Section 10): `IN_MSMED` and `GENERIC` presets, interest, and the reminder schedule (T-7, T-1, T+1, T+15). 21 unit tests.
- **Contract clauses** (`lib/contracts`): a zod schema for the Section 6.1 clause list, a markdown renderer, and a canonical-JSON hash. 6 unit tests.
- **App:** `/api/health` (DB ping) and a placeholder home page that reads the DB.

### Foundation acceptance criteria (Section 12)

- [x] Repo, Next.js, Prisma
- [x] Seed data (20 shipments)
- [x] Deploy config (`render.yaml`, CI, keep-alive)
- [ ] Hosted Postgres and deployed skeleton: Neon project and Render deploy (Arun)
- [ ] PayPal sandbox accounts, app and webhook: accounts and app (Arun); webhook registration (Claude, via API)
- [ ] `lib/paypal`: Orders, Invoicing, webhook verification, Payouts, Refunds
- [ ] PayPal MCP client making one tool call from a test route
- [x] APIMatic ContextMatic declared in `.mcp.json`
- [ ] APIMatic login and first evidence screenshot
