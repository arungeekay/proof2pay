# Proof2Pay progress

Updated at the end of every session (plan Section 0). Current status first, then the session log, newest first.

## Current status (2026-11-11, 23:00 IST; submission target Nov 12, 18:00 IST)

The plan changed on Nov 11 to the v2 scope in `PROOF2PAY_BUILD_PLAN.md` Section 17 (three demo scenarios, three build levels).
**Level 1 is done:** all three scenarios run end to end with live Gemini and mocked PayPal (`npm run e2e`, log in the session entry below).

### Waiting on Arun (in this order)

- [ ] **PayPal sandbox (tonight):** developer.paypal.com > Apps & Credentials > Sandbox > Create App. Put the client id and secret in `.env` as `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`. Put the sandbox **Personal** account email in `PAYPAL_SANDBOX_BUYER_EMAIL` (invoices go there). Logins go in `docs/judge-credentials.md`.
- [ ] **Render:** deploy the Blueprint (README button). Paste both Neon URLs, the Gemini key, the PayPal keys and `PAYPAL_SANDBOX_BUYER_EMAIL`. Send Claude the URL.
- [ ] **Pay as the buyer:** on the hosted app, open the SH-1042 invoice link and pay with the sandbox Personal account.
- [ ] **Video and Devpost** (14:00 to 18:00 on Nov 12).
- [ ] Optional: Windows DNS to 1.1.1.1 (see "Local DNS" below).

### Claude does once those land

- `npm run paypal:setup` (checks keys), then `npm run paypal:setup -- https://<render-url>` to register the webhook; set `PAYPAL_WEBHOOK_ID` locally and on Render.
- Run scenario 1 and 3 against the real sandbox; check whether provide-evidence works on a sandbox dispute (falls back to send-message, else the labelled replay).
- Set the GitHub variable `APP_URL` for the keep-alive. README final, `docs/demo-script.md`, `docs/devpost-submission.md`.

### Local DNS (found 2026-11-11)

The JioFiber router refuses DNS queries for `*.neon.tech` ("Query refused"); public resolvers answer. Workaround for local runs only:
`NODE_OPTIONS="--require=./scripts/public-dns.cjs"` before `npx next dev`, `npx tsx prisma/seed.ts` and `npm run e2e`.
Prisma Migrate's native engine ignores it, so `scripts/apply-migration-pg.cjs` applies migrations over `pg` and records them exactly like `prisma migrate deploy`.
Render is not affected. Changing Windows DNS to 1.1.1.1 removes the need for both.

### Decisions (Arun delegated all decisions on 2026-11-02, provided they cost nothing)

| Topic | Decision | Why |
|---|---|---|
| Plan v2 (Nov 11) | Adopt the PDF's three scenarios, three build levels, domestic manual records and "what the AI never does". Keep Gemini (the PDF suggested OpenAI or Claude: not free). Cut Elastic, Bryntum, AG Studio assistant, Render Workflows, Payouts and Catalog | 20 hours left and no keys for those; AG Grid Community (free, MIT) carries the receivables ledger and audit trail |
| Freight | Billed to the buyer as a line on the PayPal goods invoice (`PAYPAL_INVOICE_LINE`); no separate freight order or carrier payout | One PayPal flow the buyer can pay in sandbox; payouts cut |
| Paid status | Only from PayPal (verified webhook, then a re-read of the invoice, or the Sync button) or, for domestic trade, an operator's manually verified record with a bank reference | "Never mark paid without verified payment evidence" |
| Tracking | Added to the PayPal transaction once the invoice is paid (Add Tracking needs a transaction id) | Strengthens the seller in a dispute |
| Refunds | Payments v2 refund on the invoice's payment transaction, after operator approval; then a simulated insurance claim, also approved | |
| Disputes | Sync from PayPal (or webhook); Resolution AI builds the evidence pack; on approval, provide-evidence, falling back to send-message. DEMO_MODE has a labelled replay | Sandbox dispute creation is unreliable |
| Scenario 2 data | SH-1039 is now a domestic INR sale to Kaveri Auto Components (Coimbatore), 28 days overdue, MSMED interest accruing | MSMED rules concern Indian buyers |
| Gemini model | `gemini-3.6-flash` primary, `gemini-3.8-flash` fallback; a model that hangs or fails is skipped for 5 minutes; labelled sample output as the last resort | 3.8 hung for 60s+ on Nov 11 while 3.6 answered in 3s |
| Uploads | POD and photos stored in Postgres as data URLs, served by `/api/evidence/[id]` | Render's free disk is ephemeral |
| Demo POD | Generated in the browser (canvas, dated today, captioned "generated") or any real upload | Works on any judging day |
| LLM | Google Gemini free tier behind `lib/llm.ts` | Anthropic has no free API tier |
| Database | Neon free Postgres; app uses the pooled URL, Prisma Migrate the direct one | Render's free Postgres expires after 30 days |
| Hosting | Render free web service via `render.yaml`; keep-alive pings `/api/ping` every 10 minutes | |
| RBI bank rate | 5.75% (checked 2026-11-02). Next MPC Dec 2 to 4 | MSMED interest is 3x the bank rate |
| Sandbox account country | United States | Indian PayPal accounts can't send payouts and have domestic restrictions |

## Session log

### 2026-11-11

- Reviewed `Proof2pay.pdf` (the Nov 10 plan) against the build plan; merged into plan Section 17.
- Built Level 1 (mocked PayPal, live Gemini):
  - Schema: migration `20261111170000_v2_scope` (`PaymentChannel`, `payerViewUrl`, approval types `INVOICE_SEND` and `INSURANCE_CLAIM`, reminder stage `FINAL_NOTICE`, decision `INVESTIGATE`).
  - `lib/llm.ts` (Gemini REST, zod-validated JSON, retry, fallback, labelled sample output), `lib/paypal` (OAuth, Invoicing, refunds, Add Tracking, Disputes, webhook verify and register, mock mode), `lib/agents` (contract, delivery, payment, resolution, trust, execute, audit), `lib/insurer-sim`, `lib/trust-score`, `lib/approvals.ts`, `lib/session.ts`.
  - Pages: overview with the three scenarios, shipments, shipment detail (contract, delivery, payment, resolution, audit), approvals, receivables (AG Grid), trust profiles, audit trail (AG Grid), evidence packs. PayPal webhook route.
  - Seed: Kaveri Auto Components (IN) and SH-1039 as the domestic overdue sale.
- Verified: lint, typecheck, 39 tests, `next build`. `npm run e2e` against Neon ran all three scenarios: MSMED rule blocked Net 60; both parties accepted Net 30; Gemini vision read the POD and found the dented carton; invoice approved and sent (mocked); payment; Resolution AI recommended $300 of the $400 asked; refund, simulated insurance claim and dispute evidence approved; domestic final notice and MSME package (Rs 5,425.48 interest at 17.25%). 30 audit events. Every page returned 200. Two Gemini calls hit 503 and used labelled sample output.
- Neon reseeded clean afterwards.
- Late session (Nov 11 to 12, after "do everything yourself"): pushed to GitHub. Browser click-through with Playwright (outside the repo) as each persona passed all three scenarios. Added:
  - the command center (Gemini turns a question into a read-only query spec; AG Grid shows it)
  - a "Reset demo data" button (DEMO_MODE)
  - a Gemini model chain (3.6-flash, then the lite models; 3.6 hit its free quota during testing)
  - `docs/demo-script.md`, `docs/devpost-submission.md`, screenshots in `docs/screenshots`, and the final README

  40 tests pass.

### 2026-11-02

- Switched every paid service to a free one (plan rule 11 added). Gemini replaces Anthropic, and Neon plus Render free replace paid Render. The plan's Sections 0, 4.1, 4.3, 5, 12, 13.1 and 14 are updated to match.
- Added `render.yaml`, `/api/ping`, `db:seed:if-empty` (`--if-empty` skips seeding when data exists), and two GitHub workflows: `ci.yml` (lint, typecheck, test, build) and `keepalive.yml`. The README has a free deploy section with a Deploy to Render button.
- Added the APIMatic ContextMatic MCP server in `.mcp.json`. Its endpoint answers with an OAuth challenge, so it needs a one-time login.
- RBI bank rate default moved from 5.50% to 5.75% in `lib/credit-clock/presets.ts`, `.env.example` and `.env`.
- Verified: lint, typecheck, 27 tests, `next build`. The full Render build sequence (migrate, seed-if-empty twice) ran against an empty database: it seeded the first time and skipped the second.
- Installed the Neon agent skills locally (`npx neon skills -y`: `neon`, `neon-postgres` and 7 others). They are gitignored because `.claude/skills` holds absolute symlinks, so rerun the command on another machine.
  - We use only Lakebase Postgres. Neon Auth, Functions, Object Storage and the AI Gateway are out of scope.
- Set up Neon with `neon init` and `neon deploy`, which wrote `neon.ts`, the gitignored `.neon` link, and `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` in `.env`.
  - `prisma.config.ts` now migrates over the direct URL. `render.yaml` and the README ask for both URLs.
  - Proof: `db:deploy` ran on the direct host, and the seed ran over the pooler. Build passed. `next start` served `/api/ping` and `/api/health` with 200, and the home page showed 21 shipments and SH-1042 DRAFT. Both URLs reach Neon (134 `neon.*` settings, 21 shipments).
  - `neon init` also installed the user-scope Claude Code plugin `neon@neon` (same skills plus the Neon MCP server at mcp.neon.tech).
  - **Caution:** local `.env` now points at the Neon `production` branch, which the hosted demo will use. `npm run db:seed` wipes it. For throwaway local work, switch `DATABASE_URL` back to Docker (see `.env.example`) or use `neon checkout dev --create`.

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
