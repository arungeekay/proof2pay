# Proof2Pay progress

Updated at the end of every session (plan Section 0). Newest session first.

## 2026-10-31: Day 1 of "Foundation" (Oct 31 to Nov 2)

### Done

- **Scaffold:** Next.js 15.5 (App Router, TypeScript), Tailwind 4, shadcn/ui (Radix, Nova preset), ESLint, Vitest 5. Folder layout per Section 4.2, with placeholder folders for later modules.
- **Repo hygiene:** MIT `LICENSE`, `.env.example` (Section 4.3 plus `RBI_BANK_RATE_PCT`), `.gitignore` covering `.env`, the generated Prisma client, `/uploads` and `docs/judge-credentials.md`.
- **Database:** Prisma 7.10 schema with every Section 9 model plus `PaymentReminder` (needed for reminder history on `/invoices`). First migration `20261031163632_init`. Local Postgres 17 in Docker on port 5433 (`npm run db:up`).
- **Seed** (`npm run db:seed`, re-runnable, refuses unless `DEMO_MODE=true`): 6 businesses, 7 users (4 role-switcher personas), 20 historical shipments and SH-1042 as a draft.
  - 17 of the historical shipments are settled. Of those, 3 were paid late (MSMED interest recorded) and 2 were disputed: one resolved for the buyer with a $560 refund and a simulated insurance claim, one resolved for the seller.
  - Of the other 3: 1 is overdue with interest accruing, 1 has a running clock and 1 carries a minor POD discrepancy.
  - Trust profiles therefore span confidence levels: Northwind 12 shipments, Harbourside 6, Rhein 2, Example Freight 16, Bluewater 4.
- **Credit-clock engine** (`lib/credit-clock`, Section 10): `IN_MSMED` (45-day cap, 15-day default, compound monthly interest at 3x the bank rate) and `GENERIC` presets, interest, reminder schedule (T-7, T-1, T+1, T+15). 21 unit tests.
- **Contract clauses** (`lib/contracts`): zod schema covering the Section 6.1 clause list, a markdown renderer and a canonical-JSON hash for immutable versions and acceptances. 6 unit tests.
- **App:** `/api/health` (DB ping for Render) and a placeholder home page that reads the DB.
- **Verified:** lint, typecheck, 27 tests, and `next build` all pass. The production server returns `{"status":"ok"}` and renders 21 shipments from the seeded database.

### Day 1 to 3 acceptance criteria (Section 12)

- [x] Repo, Next.js, Prisma
- [x] Seed data (20 shipments)
- [ ] Postgres on Render and deployed skeleton: needs a Render account and credits, plus a public GitHub repo
- [ ] PayPal sandbox accounts, app and webhook: needs the developer dashboard
- [ ] `lib/paypal`: Orders (authorize/capture), Invoicing (create/send/get), webhook verification, Payouts, Refunds. Waits on sandbox credentials and the APIMatic plugin (rule 10)
- [ ] PayPal MCP client making one tool call from a test route: needs an MCP access token
- [ ] APIMatic Context Plugin installed, first evidence screenshot

### Blocked on Arun

1. **PayPal developer dashboard:** sandbox app (client id and secret), a business account (exporter), a personal account (buyer) and a second business account (carrier, for payouts). Credentials go in `.env`.
2. **APIMatic:** claim the free month and install the Context Plugin in Claude Code. Rule 10 asks for every PayPal module to be built with it, so `lib/paypal` waits for it.
3. **Render and GitHub:** claim Render credits. Create the public `proof2pay` GitHub repo, or approve Claude creating and pushing it.
4. **Anthropic API key**, needed from Nov 3 for Contract AI.
5. **Trial timing:** judging runs to Dec 15. The AG Studio trial lasts 45 days, so request it on or after Nov 1. Check the Bryntum trial length too. Elastic starts Nov 3 per the plan.

### Open decisions

- **Demo time compression:** SH-1042's windows are set relative to seed time (pickup in 2 days, sea delivery about 40 days later), but the demo uploads the POD the same day. Suggested fix: generate the demo POD at seed time, dated inside the delivery window. Decide on Nov 3 with Delivery AI.
- **When the credit clock starts:** Section 5 says invoice sent date and contract acceptance date. Section 10 (MSMED) counts from acceptance of the goods. The seed uses the verified delivery date. Confirm.
- **Figures to verify before the demo:** the RBI bank rate defaults to 5.50% (check rbi.org.in), and the MSMED 45-day and 15-day rules (check samadhaan.msme.gov.in).
- **MSMED and overseas buyers:** recovery through MSME Samadhaan is hard against a foreign buyer. The evidence pack and pitch should claim documentation value, not enforcement.
- **Exporter name:** "Marina Precision Exports Pvt Ltd" is a placeholder. All demo names live in `prisma/seed-data.ts`.
- **npm audit:** 8 findings, all build-time or CLI-only (PostCSS bundled in Next 15, shadcn CLI dependencies). The fix requires Next 16, which the plan does not call for. Leaving as is.

### Sponsor and integration packages: not installed, awaiting go-ahead (Section 16)

| Package | Purpose | Planned |
|---|---|---|
| PayPal Agent Toolkit plus an MCP client | Agents call PayPal through MCP tools | Nov 1 to 2 |
| `@paypal/paypal-server-sdk` or direct fetch | REST calls the toolkit lacks | Nov 1 to 2 |
| `@anthropic-ai/sdk` | `lib/llm.ts` provider abstraction | Nov 3 |
| `@elastic/elasticsearch` | Evidence store | Nov 3 |
| `@bryntum/scheduler@npm:@bryntum/scheduler-trial` | Shipment and settlement timeline | Nov 4 |
| AG Studio packages, per the PayPal boilerplate | Command center | Nov 9 |
| Render Workflows SDK | Durable delivery-to-payment pipeline | Nov 9 |

### Next three tasks

1. `lib/paypal` REST client: OAuth token cache, Orders authorize and capture, Invoicing create, send and get, Payouts, Refunds, and webhook signature verification. Built with the APIMatic plugin.
2. PayPal MCP client and a test route making one tool call.
3. Render deploy: web service and Postgres, `db:deploy` plus seed, `/api/health` live.
