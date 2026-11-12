# Devpost submission text

Copy each section into the matching Devpost field. Fill in the `<…>` links before submitting.

## Project name
Proof2Pay

## Tagline
Every shipment, every promise, every payment, verified: AI agents that recommend, people who approve, and PayPal that settles.

## Links
- Hosted demo: https://proof2pay-3frl.onrender.com
- Source: https://github.com/arungeekay/proof2pay (MIT)
- Video: `<YouTube link>`

## About the project

### Inspiration
Small exporters and logistics companies in India carry the cost of late payment, weak paperwork and customers they cannot assess. Delayed-payment claims by micro and small enterprises on the government's Samadhaan portal total more than ₹22,000 crore. A payment platform processes the transaction, but the business relationship around it (the agreement, the delivery, the credit period, the outcome) stays on email threads.

### What it does
Proof2Pay makes that relationship verifiable. Three scenarios run end to end:

1. **Successful shipment.** Contract AI fills a fixed, human-written clause library from the shipment terms, flags issues and explains them; an MSMED Act rule blocks illegal credit periods. Exporter and buyer accept the same SHA-256 hash. The carrier uploads the proof of delivery; Delivery AI reads it with Gemini vision and checks it against the contract. Payment AI proposes a PayPal invoice, which an operator approves. The buyer pays through PayPal, a verified webhook confirms the payment, and tracking is attached to the PayPal transaction.
2. **Delayed payment.** On an overdue Indian domestic invoice, the credit clock computes statutory interest (three times the RBI bank rate, compounded monthly). Payment AI drafts an escalating final notice and assembles an MSME evidence package, labelled "not a government filing".
3. **Damage and dispute.** The buyer reports a dented carton. Resolution AI weighs the claim against the contract, the POD and the insurance cover, and recommends a partial refund that cites its evidence. An operator approves the PayPal refund, a simulated insurance claim and the PayPal dispute response.

Trust profiles for payers and carriers change only on verified events, carry a confidence band, and never label anyone a defaulter or a fraud. A financial command center answers plain-language questions with AG Grid tables. Every agent action, approval and webhook lands in an audit trail.

### How we built it
- **App and data:** Next.js 15 (TypeScript, App Router) on a Render free web service, with Prisma 7 on Neon Postgres.
- **PayPal REST, sandbox only:**
  - Invoicing v2: create, send, get, remind
  - Payments v2: refunds on the invoice's capture
  - Shipment Tracking: Add Tracking
  - Disputes v1: list, get, provide evidence, send message
  - Webhooks: signature verification and registration through the API
- **AI:** Google Gemini, free tier, called over REST.
  - Every output is validated against a zod schema.
  - The app falls back through a chain of free models.
  - If all models fail, it uses a labelled sample. It never invents silently.
- **Agent pattern:** Agents only recommend, and an approval queue gates every money movement.
- **Deterministic rules:** The decisions with legal weight (MSMED caps and interest, delivery matching, trust metrics, insurance decisions) are made by unit-tested rules, not by the model.
- **Tables:** AG Grid Community runs the receivables ledger, the audit trail and the command-center results.

### Challenges
- **Indian accounts and PayPal.** Indian PayPal accounts can't settle domestic payments, so domestic trade uses manually verified records. Only cross-border trade runs on PayPal.
- **Free-tier limits.** Gemini models were overloaded or out of quota during the build. We added the model chain and a labelled fallback.
- **Sandbox disputes.** Disputes are hard to open on demand in the sandbox, so a labelled replay covers the video.

### What we learned
Agents are most useful when they prepare decisions and paperwork: the contract review, the evidence pack, the reminder. People should take the irreversible steps.

### What's next
- Real cargo insurers and GST/Udyam verification.
- Filing through MSME Samadhaan or ODR from the evidence package.
- PayPal Agent Toolkit tools for the payment agent.
- Domestic settlement once PayPal supports it in India.

## Built with
nextjs, typescript, react, postgresql, prisma, neon, paypal, paypal-invoicing, paypal-disputes, google-gemini, ag-grid, render, tailwindcss, zod

## Tools (AI models and services)
- **Google Gemini (free tier):**
  - `gemini-3.6-flash` first, then the lite models.
  - Contract review, POD and photo extraction (vision), refund recommendations, dispute evidence packs, reminders, the MSME statement of facts, and command-center query interpretation.
  - Every output is schema-validated, and the model name is recorded in the audit trail.
- **PayPal REST APIs (sandbox):** see "How we built it".
- **Claude Code:** development assistant used to write the code.

## Testing instructions
1. Open the hosted URL. Use "Pick who you are" or the switcher at the top right to act as the exporter (Rahul), carrier (Dinesh), buyer (Laura) or finance manager (Kavitha). There are no passwords.
2. Follow the "Next step" banner on SH-1042 for scenarios 1 and 3, and open SH-1039 for scenario 2.
3. To pay the PayPal invoice, open "Open the PayPal invoice as the buyer" on the Payment tab and log in with the sandbox buyer below.
   - Sandbox buyer email: `<from docs/judge-credentials.md>`
   - Password: `<…>`
4. Labels mark anything simulated: the insurer, replayed disputes, domestic manual records, and sample AI output if Gemini's free quota is exhausted.
5. The demo data can be reset on request. Judges see shared state.

## Sponsor prize opt-ins
AG Grid (AG Grid Community in the ledger, audit trail and command center); Render (hosting).
