# Proof2Pay: Build Plan and Submission Spec

> Feed this file to Claude Code at the start of every session. It is the single source of truth for what to build, in what order, and what "done" means. Read it fully before writing any code. Keep `PROGRESS.md` updated at the end of every session.

---

## 0. How to work with this file (instructions for the coding agent)

1. Read this entire document before doing anything.
2. On every session start: read `PROGRESS.md`, confirm which day of the plan we are on (today's date vs Section 12), and state the next three tasks before coding.
3. Plan before coding. For each task, write a short plan, then implement, then run tests, then update `PROGRESS.md`.
4. Never commit secrets. All credentials go in `.env` (gitignored) with a committed `.env.example`.
5. Do not expand scope. If a feature is not in this document, ask before building it. Tier 3 sponsors (Section 7) are off by default.
6. Keep every AI decision auditable. Every agent action must write an `AuditEvent` (Section 9). No exceptions.
7. Human approval gates are mandatory for: refunds, payouts, dispute evidence submission, contract finalisation. Agents recommend; operators approve.
8. Prefer working software over breadth. A feature that is half built scores zero. Cut before the deadline, never ship broken.
9. The PayPal integration must stay central. If a feature does not touch PayPal, it must at minimum read PayPal data or be triggered by a PayPal webhook.
10. Use the APIMatic Context Plugin for PayPal (Section 7, Tier 1) whenever writing PayPal integration code, and record evidence (commit messages mentioning it, screenshots in `docs/evidence/`).

---

## 1. The hackathon

- **Name:** PayPal AI Hackathon, "Build What's Next with PayPal and AI"
- **Platform:** Devpost, https://paypalaihackathon.devpost.com/
- **Sponsor:** PayPal Inc. **Administrator:** Devpost
- **Theme:** No tracks, no problem statements. The only rule: the project must meaningfully use both PayPal and AI, and PayPal must be central.
- **Submission deadline:** **November 12, 2026, 12:00 PM PST** = **November 13, 2026, 1:30 AM IST**. Target internal submission: **November 12, 6:00 PM IST**.
- **Judging period:** December 1 to December 15, 2026 (Pacific). The hosted demo and sandbox credentials must keep working until then.
- **Winners announced:** around December 21, 2026.
- **Support:** PayPal Discord https://discord.gg/sJ2G6DyvSK (every sponsor team is in there).

### 1.1 Judging

**Stage 1 (pass/fail):** Is the idea viable, does it fit the theme, does it reasonably apply the required PayPal APIs/SDKs?

**Stage 2 (five equally weighted criteria):**

| # | Criterion | What the judges are told to look for |
|---|---|---|
| 1 | Technological Implementation | How thoroughly and skilfully PayPal and the AI tools are used; a non-trivial working implementation |
| 2 | Design | A complete, coherent product experience, not a proof of concept |
| 3 | Potential Impact | A credible case that it solves a real problem for a real audience |
| 4 | Innovation / Idea | Creativity and novelty vs existing concepts |
| 5 | Presentation | The video shows the project working end to end; the pitch explains problem, audience and value |

Ties break by comparing criteria in that order, then a judges' vote.

### 1.2 Prizes and what we are targeting

Total pool $69,750. A project may win **at most one** Grand or Honorable Mention prize **plus one** Sponsor prize.

| Category | Prize | Our target? |
|---|---|---|
| Grand 1st / 2nd / 3rd | $12,000 / $8,000 / $5,000 | Secondary |
| Best Use of PayPal + AI | $5,000 | **Primary** |
| Best Use of Agentic Commerce | $5,000 | **Primary** |
| Most Impactful | $5,000 | Secondary |
| Most Creative, Best Demo Delivery | $5,000 each | Secondary |
| AG Grid (Best Use of AG Grid) | $5,000 / $2,000 / $1,000 x3 | **Primary sponsor target** |
| APIMatic | $1,000 x3 + 6 months Business plan | Eligible, low effort |
| Bryntum | $1,000 x3 | Eligible |
| Render | $1,000 / $750 / $500 credits | Eligible |
| Channel3 | $1,500 | Tier 3 only |

Elastic, KERNEL, Zapier, Postman and Astropods have no prize of their own. They are used only where they add Technical Implementation depth cheaply.

### 1.3 Hard submission requirements (from the Official Rules)

- [ ] Working build that judges can run: complete setup and run instructions in the repo **and** a hosted demo URL (do both).
- [ ] Text description of features and functionality (Devpost form).
- [ ] "Tools" section: which AI models/services were used and how.
- [ ] Public, open-source repo on GitHub with all source, assets and instructions. **A LICENSE file must be visible in the repo's About section** (MIT).
- [ ] Demo video **under 3 minutes**, on YouTube, public, link on the form, showing the project running on its target device (web browser). No copyrighted music, no third-party trademarks without permission (do not show other companies' logos).
- [ ] Sandbox credentials and any API keys judges need to test, provided in the submission and valid through December 15.
- [ ] Everything in English.
- [ ] Original work, built during the submission period (Oct 1 to Nov 12, 2026). Open source components allowed with licence compliance.

---

## 2. Product definition

### 2.1 One-liner

**Proof2Pay is the trust and settlement layer for cross-border B2B trade.** Every shipment starts with an AI-drafted contract, is verified at delivery by AI, settles through PayPal, and leaves both parties with a verified track record.

### 2.2 The problem (for the pitch)

Small exporters and logistics providers ship goods worth thousands of dollars on nothing more than an email thread. Payment arrives late or not at all, disputes are decided on whoever has the better paperwork, and there is no shared record of who actually pays on time. Collections and dispute evidence are assembled by hand, months after the fact.

### 2.3 The audience

- Exporters and SME sellers shipping cross-border (the **payee**).
- Logistics providers / carriers (the **carrier**).
- Overseas business buyers (the **payer**).
- The operator persona in the demo is the exporter's finance manager.

### 2.4 Why cross-border, not domestic

PayPal does not support domestic payments for India-based accounts. All money in the demo moves between an exporter/carrier side and an overseas buyer, so **every payment, refund, payout and dispute runs through the PayPal sandbox**. Do not build any non-PayPal payment path.

### 2.5 The five agents

Every agent acts through the **PayPal Agent Toolkit / PayPal MCP server (sandbox)** wherever a matching tool exists, and through the REST API otherwise.

| Agent | Responsibility | PayPal surfaces | Approval gate |
|---|---|---|---|
| **Contract AI** | Drafts the pre-shipment contract from shipment details, flags missing or inconsistent clauses, explains clauses in plain language, manages two-party acceptance with immutable versions | Catalog Products (freight + goods line items), Orders v2 create with `intent: AUTHORIZE` on acceptance | Finalising the contract requires both parties to click Accept |
| **Delivery AI** | Reads proof of delivery (PDF/image) and delivery photos, extracts fields, matches against contract (consignee, quantity, condition, delivery window), produces a verification report with confidence and discrepancies, writes tracking to PayPal | Shipment Tracking (Add Tracking API / MCP shipment tools), Webhooks | None for verification; discrepancies route to Resolution AI |
| **Payment AI** | On verified delivery: captures the authorized order **or** creates and sends an invoice (configurable per contract), starts the credit-day clock, sends reminders, reconciles webhook events, prepares carrier payout | Orders capture, Invoicing v2 (create, send, get status, record payment), Payouts, Webhooks, Transactions/Reporting | Payouts require operator approval |
| **Resolution AI** | Evaluates refund requests against contract and evidence, recommends full/partial/none with reasoning, assembles dispute evidence packs, prepares simulated insurer claims | Refunds (Payments v2 capture refund / Invoicing refund), Disputes v1 (list, get, provide evidence, accept claim) | Refunds and dispute submissions require operator approval |
| **Trust AI** | Computes explainable trust metrics for payer and carrier from **verified PayPal outcomes only**, with confidence weighting by volume | Transactions / Reporting (read only) | None (read only, but every score change is audited) |

---

## 3. The demo scenario (the whole build serves this script)

One shipment, start to finish. Seed data must make this reproducible in under 4 minutes of clicking.

**Shipment SH-1042:** 40 cartons of machined parts, declared value $12,000, freight $850, exporter in Chennai, carrier "Example Freight Ltd", buyer "Northwind Imports Inc" in Chicago. Terms Net 30, MSMED preset on, cargo insurance quoted and attached (simulated insurer).

| Step | What happens | PayPal call |
|---|---|---|
| 1 | Exporter creates shipment; Contract AI drafts the contract; both parties accept | Catalog product, Order (AUTHORIZE) |
| 2 | Bryntum timeline shows pickup, delivery window, credit-day deadline, objection window | none (reads Order) |
| 3 | Carrier uploads signed POD + 2 photos; Delivery AI verifies, flags one minor discrepancy (1 carton dented), writes tracking | Add Tracking |
| 4 | Payment AI captures freight, sends goods invoice to buyer, starts the 30-day clock | Orders capture, Invoice create + send |
| 5 | Buyer pays invoice in sandbox; webhook `INVOICING.INVOICE.PAID` reconciles; Bryntum milestone moves | Webhook |
| 6 | Payment AI proposes carrier payout; operator approves | Payouts |
| 7 | Buyer requests $400 refund for the dented carton and opens a sandbox dispute | Disputes |
| 8 | Resolution AI pulls evidence (Elastic), recommends $150 partial refund with reasoning; operator approves; refund executes; evidence pack submitted to dispute | Refund, Disputes provide-evidence |
| 9 | Manager asks the AG Studio command center: "show disputed shipments over $10k with insurance attached"; the Studio agent builds the view | Reporting data |
| 10 | Trust profiles for buyer and carrier update; audit trail shows every agent decision with evidence | Transactions |

Also seed **20 historical shipments** with mixed outcomes so dashboards and trust profiles are not empty.

---

## 4. Technical architecture

### 4.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js 15 (App Router, TypeScript)** | Single repo, React UI + API routes. AG Studio and Bryntum are React libraries. |
| DB | **PostgreSQL on Render** + Prisma | Migrations committed. Seed script required. |
| LLM | **Anthropic Claude (Sonnet or Opus)** via official SDK with tool use; vision for POD/photos | Model name goes in the Tools section of the submission. Abstract behind `lib/llm.ts` so a second provider can be swapped in. |
| PayPal | **PayPal Agent Toolkit + PayPal MCP sandbox server** (https://github.com/paypal/AI-Toolkit) for agent tool calls; **PayPal REST (sandbox)** via `@paypal/paypal-server-sdk` or direct fetch for anything the toolkit lacks | Sandbox only. Business account = exporter. Personal sandbox account = buyer. |
| Agent orchestration | **Render Workflows** for durable multi-step pipelines (verify → capture → invoice → reconcile → payout) | If the Workflows SDK is not available in TypeScript at build time, use a small Python worker in `workers/` with the Python SDK. |
| Search / evidence | **Elastic serverless** (vector + keyword) | Trial starts no earlier than Nov 3 so it covers judging; extend via https://www.elastic.co/trialextension |
| Dashboards | **AG Studio** (AG Grid) with Studio Agent Framework | Start from https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate |
| Timeline | **Bryntum Scheduler** (trial package `@bryntum/scheduler@npm:@bryntum/scheduler-trial`) | |
| Hosting | **Render** web service + Postgres + Workflows | Claim credits: https://credits-portal-mmdm.onrender.com/claim/paypal-ai-hackathon |
| Auth | Simple role switcher for demo (Exporter / Carrier / Buyer / Manager) with seeded users; magic-link optional | Do not spend time on real auth. |
| File storage | Local `/uploads` in dev; Render disk or S3-compatible in prod | PODs and photos. |

### 4.2 Repo layout

```
proof2pay/
  README.md                  # submission-grade (Section 13.2)
  LICENSE                    # MIT
  PROGRESS.md                # updated every session
  PROOF2PAY_BUILD_PLAN.md    # this file
  .env.example
  docs/
    architecture.md
    demo-script.md
    evidence/                # APIMatic plugin screenshots, sponsor usage proof
    postman/                 # Proof2Pay API collection (Section 7)
  prisma/
    schema.prisma
    seed.ts
  app/                       # Next.js app router
    (dashboard)/...
    api/
      paypal/webhooks/route.ts
      agents/<agent>/route.ts
      shipments/..., contracts/..., invoices/..., disputes/..., trust/...
  components/
    ag-studio/               # command center + custom widgets
    bryntum/                 # scheduler views
    ...
  lib/
    llm.ts                   # provider abstraction
    paypal/                  # REST client, MCP client, webhook verification
    agents/
      contract.ts delivery.ts payment.ts resolution.ts trust.ts
      audit.ts               # AuditEvent writer (mandatory)
    credit-clock/            # Section 10
    trust-score/             # Section 11
    elastic/                 # index + search helpers
    insurer-sim/             # simulated insurer
  workers/                   # Render Workflows definitions
  tests/
```

### 4.3 Environment variables (`.env.example`)

```
DATABASE_URL=
ANTHROPIC_API_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=
PAYPAL_MCP_URL=
PAYPAL_MCP_ACCESS_TOKEN=
ELASTIC_URL=
ELASTIC_API_KEY=
AG_STUDIO_LICENSE_KEY=
BRYNTUM_TRIAL=true
RENDER_WORKFLOWS_API_KEY=
APP_BASE_URL=
DEMO_MODE=true
```

---

## 5. PayPal integration spec

All sandbox. Verify current endpoints against https://developer.paypal.com before implementing; use the APIMatic Context Plugin to pull the exact request shapes.

| Capability | Use in Proof2Pay | Notes |
|---|---|---|
| **Catalog Products** | One product per contract line (goods, freight) | Needed for order/invoice line items |
| **Orders v2** | Create with `intent: AUTHORIZE` on contract acceptance; buyer approves via sandbox checkout; `capture` on verified delivery | Freight is captured; goods go by invoice (shows both flows) |
| **Invoicing v2** | Create draft, send, get, list, record-payment, refund; QR code optional | Credit-day clock keys off invoice `sent` date and contract acceptance date |
| **Add Tracking (Shipment Tracking)** | Delivery AI posts carrier + tracking number + status `DELIVERED` against the capture | Strengthens dispute position; shows in PayPal |
| **Payouts** | Carrier payout after verified delivery (operator approved) | Sandbox payouts to a second sandbox account |
| **Payments v2 (refunds)** | Partial/full refund on capture | Resolution AI recommends, operator approves |
| **Disputes v1** | List, get, provide-evidence, accept-claim | Sandbox disputes can be flaky; see Section 14 |
| **Webhooks** | `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.CANCELLED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`, `PAYMENT.PAYOUTSBATCH.SUCCESS` | Verify signatures. Every webhook writes an AuditEvent and may trigger a Workflow step. Use ngrok or Render URL for registration. |
| **Transactions / Reporting** | Trust AI and dashboards read settled outcomes | Read only |
| **PayPal MCP server / Agent Toolkit** | Agents call PayPal through MCP tools (orders, invoices, disputes, shipments, reporting) | This is the headline "AI operates PayPal" story. Document which agent uses which tool in `docs/architecture.md`. |

**Sandbox setup checklist**
- [ ] Developer dashboard app (sandbox) → client id/secret
- [ ] Business sandbox account (exporter) and personal sandbox account (buyer), plus a second business account for the carrier (payouts)
- [ ] Webhook registered to `<APP_BASE_URL>/api/paypal/webhooks` with the events above
- [ ] MCP server access token configured
- [ ] Record all sandbox logins in `docs/judge-credentials.md` (gitignored; paste into Devpost "testing instructions" field instead)

---

## 6. Agent implementation spec

Common pattern for every agent in `lib/agents/*.ts`:

```
input  → gather context (DB + Elastic + PayPal reads)
       → LLM call with tool use (PayPal MCP tools + internal tools)
       → structured output (zod schema)
       → AuditEvent { agent, trigger, evidenceRefs[], reasoning, proposedAction, confidence }
       → if action requires approval: create ApprovalRequest, stop
       → else: execute, write AuditEvent { outcome }
```

### 6.1 Contract AI
- Input: shipment draft (parties, cargo, declared value, route, delivery window, freight, credit terms, insurance choice).
- Output: contract JSON + rendered markdown with clauses: identities, cargo declaration, goods safety and liability limits, delivery conditions and acceptable POD, payment terms and trigger, credit days (validated by credit-clock engine), insurance reference, dispute resolution (objection window, evidence rules), signatures.
- Flags: missing clauses, terms that violate the jurisdiction preset (e.g. 60-day terms under MSMED), inconsistent values.
- Versions are immutable; acceptance stores hash + timestamp + user per party. On full acceptance → create PayPal order (AUTHORIZE) for freight.

### 6.2 Delivery AI
- Input: POD file + photos + shipment/contract.
- Vision extraction: consignee name, signature present, date/time, quantity received, condition notes.
- Match against contract; produce `VerificationReport { status: VERIFIED | VERIFIED_WITH_DISCREPANCY | FAILED, discrepancies[], confidence }`.
- On VERIFIED*: Add Tracking to PayPal, trigger Payment pipeline (Render Workflow).
- Index POD text + report into Elastic.

### 6.3 Payment AI
- On verified delivery: capture freight order; create + send goods invoice; start credit clock.
- Daily job (Workflow cron or scheduled route): check invoices, compute days remaining, draft reminder at T-7, T-1, T+1, T+15 (tone escalates; MSMED preset adds interest note after statutory due date). Reminders are sent via invoice reminder API or email stub; always audited.
- On `INVOICE.PAID`: reconcile, close clock, update Bryntum milestone, propose carrier payout → ApprovalRequest.

### 6.4 Resolution AI
- Input: refund request or dispute webhook.
- Gather: contract clauses, verification report, POD, photos, tracking, invoice, payment, communications (Elastic search, top-k).
- Output: recommendation `{ decision: FULL | PARTIAL | NONE, amount, reasoning, evidenceRefs[], contractClausesCited[] }` and, for disputes, an evidence pack (PDF or markdown bundle + file list) ready for `provide-evidence`.
- Simulated insurer: `lib/insurer-sim/` returns a quote at contract time and accepts a claim with a decision; stored as `InsurancePolicy`/`InsuranceClaim`. Clearly labelled "simulated" in UI.

### 6.5 Trust AI
- See Section 11. Recompute on every settled outcome (webhook) and nightly.

---

## 7. Sponsor integrations (tiered)

### Tier 1: must ship (prize eligible or core)

| Sponsor | Integration | Definition of done | Evidence to capture |
|---|---|---|---|
| **AG Studio (AG Grid)** | Financial Command Center page. Studio Agent Framework wired to our data so a manager can type a question and get a generated dashboard/widget. **Three custom widgets:** Trust Score card, Credit-Day Clock, Shipment Status map/list. Custom theme matching the app. Start from the PayPal boilerplate. 45-day trial licence from https://www.ag-grid.com/studio/license-pricing/ | Natural-language → widget works for 3 scripted prompts; custom widgets render with live data; theme applied | Screenshots, short clip for video, README section "Built with AG Studio" |
| **APIMatic Context Plugin** | Use it inside Claude Code for all PayPal integration work. Claim free month via the form on https://paypalaihackathon.devpost.com/details/apimatic | Every PayPal module built with plugin assistance | Screenshots in `docs/evidence/apimatic/`, commit messages "built with APIMatic Context Plugin", README Tools section mention, one line in video |
| **Render** | Web service + Postgres + **Render Workflows** running the delivery→payment pipeline as durable tasks. Credits via claim link (Section 4.1) | Hosted URL live; at least one Workflow visible running in Render dashboard | Screenshot of workflow run, README "Deployed on Render" |
| **Bryntum Scheduler** | Shipment & Settlement Timeline (pickup, transit, delivery window, invoice sent, credit-day deadline, objection window, dispute deadlines). Milestones move automatically on PayPal webhooks. Second view: Dispute Triage Board (rows = operators, events = open disputes with response deadlines) | Webhook-driven reschedule demonstrated; both views render | Clip for video, README section |

### Tier 2: add once Tier 1 core works (target: start by Nov 7)

| Sponsor | Integration | Definition of done |
|---|---|---|
| **Elastic** | Evidence store: index contracts, PODs (text), verification reports, messages with embeddings; Resolution AI retrieves via hybrid search. Optional: Agent Builder for the Resolution agent. Sign up via https://ela.st/elastic-paypal-hackathon (not before Nov 3) | Resolution AI's evidence list comes from Elastic queries; search UI on the Evidence page |
| **Postman** | Public Postman collection for Proof2Pay's own API in `docs/postman/` and published workspace; use PayPal's collection for testing | Collection runs against hosted URL |
| **Zapier MCP** | Agents push events (contract signed, invoice overdue, dispute opened) to Slack/Gmail via Zapier MCP. Trial at https://zapier.com/sign-up, quickstart https://docs.zapier.com/mcp/get-started/quickstart | One notification type working end to end |

### Tier 3: only if everything above is done and tested by Nov 10

| Sponsor | Integration |
|---|---|
| **Channel3** | Replacement-goods flow: on damaged-cargo outcome, Resolution AI searches Channel3 for a replacement item and raises a PayPal order for it. Promo code `PAYPAL-HACKATHON-2026` at https://trychannel3.com/developers (20,000 credits). Prize requires meaningful use. |
| **KERNEL** | Delivery AI uses a KERNEL cloud browser to fetch tracking from a carrier portal without an API. $50 credits via https://dashboard.onkernel.com/hackathon?code=KERNELDEVPOST2026 |
| **Astropods** | Deploy the reminder agent on Astropods with its Slack connector. |

Do not start Tier 3 without explicit go-ahead.

---

## 8. UI pages (Design criterion)

Polished, consistent, one design system (Tailwind + shadcn/ui is fine). Dark/light both work. Mobile not required but no horizontal scroll at 1280px.

| Route | Page | Key elements |
|---|---|---|
| `/` | Role switcher + overview | Pick Exporter / Carrier / Buyer / Manager |
| `/shipments` | Shipment list | Status chips, trust badges for counterparties |
| `/shipments/[id]` | Shipment detail | Tabs: Contract, Delivery, Payment, Resolution, Audit; Bryntum timeline at top |
| `/contracts/[id]` | Contract view | Rendered clauses, AI explanations, flags, Accept buttons per party, version history |
| `/deliveries/[id]/verify` | POD upload + verification report | Extracted fields vs contract, discrepancies, confidence |
| `/invoices` | Invoices + credit clock | Days remaining, statutory due date, interest accrual (MSMED), reminder history |
| `/resolution` | Refund requests and disputes | Recommendation card, evidence pack preview, Approve / Reject |
| `/approvals` | Operator approval queue | Everything an agent wants to do |
| `/command-center` | AG Studio command center | Prompt box, generated widgets, custom widgets |
| `/trust/[businessId]` | Public trust profile | Metrics, confidence, methodology note, "verified by PayPal transaction outcomes" |
| `/audit` | Audit trail | Filter by agent, shipment, action; each event links to evidence |

---

## 9. Data model (Prisma, minimum)

`Business` (name, role flags, country, paypalEmail, gstin optional, verified)
`User` (business, role)
`Shipment` (exporter, carrier, buyer, cargo, declaredValue, freight, route, windows, status)
`Contract` (shipment, version, clausesJson, markdown, hash, jurisdictionPreset, creditDays, status) + `ContractAcceptance` (party, user, acceptedAt, hash)
`InsurancePolicy`, `InsuranceClaim` (simulated)
`DeliveryEvidence` (type POD/PHOTO, url, extractedJson) + `VerificationReport`
`PayPalOrder`, `PayPalInvoice`, `PayPalCapture`, `PayPalRefund`, `PayPalPayout`, `PayPalDispute`, `PayPalTracking`, `WebhookEvent` (raw + processed)
`CreditClock` (invoice, acceptanceDate, agreedDays, statutoryCapDays, dueDate, statutoryDueDate, status, interestAccrued)
`RefundRequest`, `Recommendation`, `EvidencePack`
`ApprovalRequest` (agent, actionType, payload, status, decidedBy, decidedAt)
`AuditEvent` (agent, trigger, shipment, evidenceRefs[], reasoning, proposedAction, confidence, outcome, createdAt)
`TrustScore` (business, metricsJson, confidence, computedAt, basisTransactionCount)

---

## 10. Credit-day clock engine (`lib/credit-clock/`)

Generic Net-X engine with jurisdiction presets. Pure functions, unit tested.

```
computeClock({ acceptanceDate, agreedDays, preset }) → { dueDate, statutoryDueDate, capViolation, interestRule }
```

**Preset `IN_MSMED`** (verify figures against https://samadhaan.msme.gov.in before shipping):
- Maximum agreed credit period: **45 days** from the day of acceptance (or deemed acceptance).
- No written period: **15 days**.
- Delayed payment interest: compound interest with monthly rests at **three times the RBI bank rate** (Section 16, MSMED Act 2006). Store the rate as config.
- Applies when the supplier is a registered micro or small enterprise (flag on `Business`).
- Contract AI must refuse to finalise terms exceeding the cap when the preset applies, and explain why.
- On breach: Resolution AI generates an **evidence pack** (signed contract, POD, verification report, invoice, PayPal payment record, reminder history) formatted for filing on MSME Samadhaan (https://samadhaan.msme.gov.in/) or MSME ODR (https://odr.msme.gov.in/). Label clearly: "prepared by Proof2Pay; not a government filing".

**Preset `GENERIC`**: no cap, no statutory interest, reminders only.

---

## 11. Trust score (`lib/trust-score/`)

Computed only from platform-verified, PayPal-settled outcomes. Never from unverified claims.

**Payer metrics:** on-time payment rate, average days late, disputes raised vs upheld, verified transaction count, total verified volume.
**Carrier metrics:** documented delivery rate, verification pass rate, damage incidents substantiated, average response time to discrepancies, disputes against vs upheld.

**Confidence weighting:** display a confidence band (Low <10 transactions, Medium 10 to 50, High >50). A business with 2 transactions must never appear as reliable as one with 200.

**Rules (non-negotiable):** no anonymous accusations, no automatic public blacklisting, no AI-generated allegations. Public profile shows objective status only (e.g. "1 payment dispute, resolved in payer's favour"). Include a methodology note and "historical outcomes do not guarantee future behaviour".

---

## 12. Build schedule with acceptance criteria

Today is referenced from `PROGRESS.md`. Each day ends with a commit, passing tests, and a `PROGRESS.md` update.

| Dates (IST) | Deliverable | Acceptance criteria |
|---|---|---|
| **Oct 31 to Nov 2** | Foundation | Repo, Next.js, Prisma, Postgres on Render, seed data (20 shipments). PayPal sandbox accounts + app + webhook. `lib/paypal` with Orders (authorize/capture), Invoicing (create/send/get), Webhook verification, Payouts, Refunds. PayPal MCP client working with one tool call from a test route. APIMatic plugin installed, first evidence screenshot. Deployed skeleton on Render. |
| **Nov 3 to 5** | Contract AI + Delivery AI | Contract drafted, flagged, accepted by two roles, order authorized. POD upload with vision extraction, verification report, Add Tracking call succeeds. Bryntum timeline renders from shipment + moves on `PAYMENT.CAPTURE.COMPLETED`. Elastic trial started Nov 3, indexing works. Credit-clock engine with unit tests. |
| **Nov 6 to 8** | Payment AI + Resolution AI | Capture + invoice on verification, clock running, reminders drafted. Invoice paid in sandbox → webhook → reconcile → payout ApprovalRequest → approve → payout executes. Refund request → recommendation → approve → refund executes. Sandbox dispute → evidence pack → provide-evidence call. Simulated insurer quote + claim. Audit trail page complete. |
| **Nov 9 to 10** | AG Studio + Trust + Workflows | Command center with agent framework answering 3 scripted prompts; 3 custom widgets; theme. Trust profiles live. Render Workflows running the delivery→payment pipeline. Dispute triage board. Tier 2 items if ahead. |
| **Nov 11** | Hardening + submission assets | Full demo script run 3 times on hosted URL without errors. README final (Section 13.2). LICENSE visible. Postman collection. `docs/demo-script.md`. Record and edit video (Section 13.3). Upload to YouTube (public). Fill Devpost form as draft. |
| **Nov 12** | Submit | Final run-through at 10:00 IST. Submit by **18:00 IST** (hard deadline Nov 13, 01:30 IST). Confirm sandbox credentials work from an incognito browser. |

If any day slips by more than one day, cut from the bottom: Tier 3 → Tier 2 → Dispute triage board → Zapier → custom widget #3. Never cut: PayPal flows, Contract AI, Delivery AI, Payment AI, AG Studio command center, video.

---

## 13. Submittables

### 13.1 Devpost form fields (prepare text in `docs/devpost-submission.md`)

- **Project name:** Proof2Pay
- **Tagline (one line):** AI agents that turn a shipment into a signed contract, a verified delivery, a PayPal settlement, and a public track record.
- **About the project:** Inspiration, what it does, how we built it (name every PayPal API and every sponsor tool with its role), challenges, accomplishments, what we learned, what's next. 400 to 700 words.
- **Built with:** nextjs, typescript, postgresql, prisma, paypal, paypal-agent-toolkit, paypal-mcp, anthropic-claude, ag-grid, ag-studio, bryntum, render, render-workflows, elastic, apimatic, postman, zapier (only list what is actually used).
- **Tools (required):** which AI model(s) and services, how each was used, including the APIMatic Context Plugin and Claude Code as development tools.
- **Try it out links:** hosted URL, GitHub repo, Postman collection.
- **Video link:** YouTube.
- **Testing instructions:** demo role switcher, sandbox buyer login (email/password), sandbox card if needed, the 10-step demo script.
- **Sponsor prize opt-ins:** AG Grid, APIMatic, Bryntum, Render (and Channel3 only if Tier 3 shipped).

### 13.2 README structure (judges read this first)

1. Title, one-liner, 3 screenshots, links (demo, video, Postman)
2. The problem and who it is for
3. What it does: the 10-step flow with a diagram
4. The five agents and their approval gates
5. PayPal integration: table of every API/MCP tool used and where in the code
6. Sponsor tools: one subsection per sponsor with what it does in the product and a screenshot
7. Architecture diagram and stack
8. Run locally: prerequisites, `.env.example`, sandbox setup steps, `npm run db:seed`, `npm run dev`; must work on a clean machine
9. Demo walkthrough (link to `docs/demo-script.md`)
10. Trust score methodology and safeguards
11. Credit-day clock and MSMED preset (with disclaimer)
12. What's next
13. License (MIT)

### 13.3 Video (under 3:00, aim 2:50)

Screen recording of the hosted app, voiceover, no music or royalty-free only, no third-party logos. Record at 1080p. Script in `docs/demo-script.md`:

| Time | Content |
|---|---|
| 0:00 to 0:25 | The problem: $12,000 shipped on an email thread, 90 days of chasing, no evidence when it goes wrong |
| 0:25 to 1:00 | Contract AI drafts, flags, both parties accept, PayPal order authorized, Bryntum timeline with credit deadline |
| 1:00 to 1:40 | POD upload, Delivery AI verifies with one discrepancy, tracking written to PayPal, freight captured, invoice sent, carrier payout approved |
| 1:40 to 2:20 | Buyer opens dispute, Resolution AI assembles evidence from Elastic, recommends partial refund, operator approves, refund + evidence submitted |
| 2:20 to 2:50 | Manager asks the AG Studio command center a question, widget builds itself; trust profiles update |
| 2:50 to 3:00 | Audit trail scroll; closing line: "every decision explained, every dollar through PayPal" |

Say the words "PayPal", "agent", "AG Studio", "Bryntum", "Render", "Elastic", "APIMatic" on camera where they appear; judges from those sponsors watch for it.

---

## 14. Risk register and fallbacks

| Risk | Mitigation |
|---|---|
| PayPal disputes sandbox unreliable | Build against sandbox first; also seed a `Dispute` record and a `DEMO_MODE` path that replays a recorded dispute webhook so the video never depends on live sandbox dispute creation. Be transparent in README. |
| Payouts sandbox needs enablement | Test on day 1. If blocked, fall back to Invoicing record-payment to the carrier account and note it. |
| AG Studio agent framework learning curve | Watch the "Self-serve dashboards in 30 lines of code" session and the AG Studio docs on Nov 2; start from the PayPal boilerplate; book the AG Grid team on Discord for questions. |
| Elastic trial expiry before judging | Start trial Nov 3 (14 days → Nov 17), then self-extend 30 days. Also keep a Postgres full-text fallback behind the same interface. |
| Render Workflows SDK language mismatch | Abstract pipeline steps; if TypeScript SDK unavailable, Python worker in `workers/`. |
| Scope creep | Section 0 rule 5. Anything new goes into `docs/backlog.md`, not the build. |
| Video over 3 minutes | Script timed; cut the trust profile segment first if needed. |
| Judges cannot run locally | Hosted URL is primary; README local run tested on a fresh clone on Nov 11. |

---

## 15. Links

**Hackathon:** overview https://paypalaihackathon.devpost.com/ · rules https://paypalaihackathon.devpost.com/rules · resources https://paypalaihackathon.devpost.com/resources · FAQs https://paypalaihackathon.devpost.com/details/faqs · Discord https://discord.gg/sJ2G6DyvSK

**PayPal:** developer https://developer.paypal.com/ · REST https://developer.paypal.com/api/rest/ · invoicing https://developer.paypal.com/invoicing/about · payouts https://developer.paypal.com/docs/payouts/ · disputes https://developer.paypal.com/platforms/disputes/overview · webhooks https://developer.paypal.com/api/webhooks/overview · AI Toolkit https://github.com/paypal/AI-Toolkit · AI docs https://docs.paypal.ai/ · sandbox starter https://github.com/paypaldev/getting-started-with-paypal-sandbox

**Sponsors:** AG Grid https://paypalaihackathon.devpost.com/details/aggrid (boilerplate https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate, agent framework https://www.ag-grid.com/studio/react/ai-agents/) · APIMatic https://paypalaihackathon.devpost.com/details/apimatic · Bryntum https://paypalaihackathon.devpost.com/details/bryntum (https://bryntum.com/download) · Render https://paypalaihackathon.devpost.com/details/render (workflows https://render.com/docs/workflows) · Elastic https://paypalaihackathon.devpost.com/details/elastic · Postman https://www.postman.com/paypal · Zapier https://docs.zapier.com/mcp/home · Channel3 https://docs.trychannel3.com · KERNEL https://www.kernel.sh/docs · Astropods https://docs.astropods.com

**India MSME:** Samadhaan https://samadhaan.msme.gov.in/ · ODR https://odr.msme.gov.in/

---

## 16. First session kick-off prompt (paste into Claude Code)

> Read `PROOF2PAY_BUILD_PLAN.md` in full. Create `PROGRESS.md` with today's date and the Day 1 task list from Section 12. Then scaffold the repo per Section 4.2 (Next.js 15, TypeScript, Prisma, Tailwind, shadcn/ui), add the MIT LICENSE, `.env.example` from Section 4.3, and the Prisma schema from Section 9. Stop and show me the plan before installing any sponsor packages.
