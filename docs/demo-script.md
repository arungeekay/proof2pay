# Proof2Pay demo video script

**Proof2Pay** · PayPal AI Hackathon 2026 · Team Proof2Pay: Arun ([arungeekay](https://github.com/arungeekay)), Ajai Kumar M ([Ajai-K](https://github.com/Ajai-K))

Running time **2:54** (limit 3:00). Recorded on the hosted app in a browser, with real PayPal sandbox calls (invoice, card payment, refund). Voiceover in Indian English (en-IN), generated with Google Gemini text-to-speech. Each scene carries an on-screen banner: the feature name and what it does.

| Time | Scene and banner | Voiceover |
|---|---|---|
| 0:00 | **Proof2Pay** | Proof2Pay. Every shipment, every promise, every payment, verified. Built for the PayPal AI Hackathon. |
| 0:08 | **The problem we solve**<br>Late payments, weak delivery proof, manual disputes. Proof2Pay: AI recommends, people approve, PayPal settles. | Indian exporters and logistics firms ship goods worth lakhs on an email thread. Payments run late, delivery is hard to prove, and disputes are fought with scattered paperwork. Proof2Pay fixes this with AI agents that recommend, people who approve, and PayPal that settles the money. |
| 0:25 | **Contract AI**<br>Fixed clause library  ·  MSMED Act s.15 rule blocks 60-day credit  ·  plain-language explanation of every clause | Rahul, the exporter, asks Contract AI to draft the contract from a fixed clause library. When he tries sixty days of credit, the MSMED Act rule blocks it. At thirty days the contract passes, and the AI explains every clause in plain language. |
| 0:43 | **Two-party acceptance**<br>Exporter and buyer accept the same SHA-256 hash  ·  simulated cargo insurance is bound on acceptance | The buyer accepts the same hashed contract. Once both parties accept, the simulated cargo insurance quote is bound to the shipment. The AI never signs anything. |
| 0:53 | **Delivery AI**<br>Gemini vision reads the POD and photos  ·  rule-based match against the contract  ·  1 dented carton flagged | At delivery, the carrier uploads the signed proof of delivery and photos. Delivery AI reads them with Gemini vision, checks them against the contract, and records one dented carton. |
| 1:05 | **Human approval before PayPal**<br>Payment AI proposes the invoice, due 30 days from acceptance  ·  nothing reaches PayPal until a person approves | Payment AI proposes the invoice, due thirty days after acceptance. Nothing goes to PayPal until the finance manager approves it. |
| 1:15 | **PayPal Invoicing + Shipment Tracking**<br>Buyer pays on PayPal's own checkout (sandbox)  ·  paid only on PayPal's record  ·  tracking added to the transaction | The buyer opens PayPal's own invoice page and pays by card in the sandbox. Proof2Pay never marks an invoice paid on its own word. It confirms the payment with PayPal, then attaches the tracking number to the PayPal transaction, to protect the seller. |
| 1:31 | **Resolution AI + PayPal refund**<br>Recommends $300 of the $400 asked, citing the evidence  ·  PayPal Payments refund  ·  simulated insurance claim | The buyer asks for four hundred dollars for the dented carton. Resolution AI weighs the contract and the delivery evidence, and recommends three hundred, the carton's contract value. The manager approves, and PayPal executes the refund. |
| 1:46 | **PayPal dispute response**<br>AI case file: timeline, contradictions, missing evidence  ·  operator approves  ·  replayed dispute is labelled | If the buyer escalates to a PayPal dispute, Resolution AI builds the case file: a timeline, contradictions, missing evidence, and a response that cites every record. A person approves before anything is sent to PayPal. |
| 1:59 | **Delayed payment, Indian domestic trade**<br>Credit clock + MSMED s.16 interest  ·  AI final notice  ·  MSME evidence package (not a government filing) | Next, a domestic Indian sale that is twenty eight days overdue. The credit clock calculates statutory interest, and Payment AI drafts a final notice and an MSME evidence package, clearly marked as not a government filing. |
| 2:15 | **Receivables ledger + PayPal view**<br>AG Grid ledger of every invoice and credit clock  ·  one view of all PayPal invoices, payments and refunds | Finance sees every receivable in an AG Grid ledger, with live credit clocks and statutory interest, and one view of every PayPal invoice, payment and refund. |
| 2:27 | **Command center + trust profiles**<br>Plain-English question → read-only query → AG Grid answer  ·  trust built only from verified events | Managers ask questions in plain English. Gemini turns each question into a safe, read only query, and AG Grid shows the answer. Trust profiles change only on verified events, with a confidence band, and never label anyone a defaulter. |
| 2:42 | **Full audit trail**<br>Every AI decision, human approval and PayPal event, with its reasoning, model and evidence | Every agent decision is explained and audited, every action is approved by a person, and every dollar moves through PayPal. Proof2Pay. Verified trade, for India and the world. |

## Before re-recording

- Press **Reset demo data** on the home page so SH-1042 starts as a draft.
- Pay the invoice on PayPal's page with **Debit or Credit Card**: test card `4012 8888 8888 1881`, expiry 12/30, CVV 123, any US address. Then press **Sync from PayPal** (sandbox webhooks are unreliable).
- Use **Open a dispute (replay, labelled)** for the dispute scene and keep the label visible.
- If a purple "sample AI output" label appears, Gemini's free tier was busy: wait a minute and redo the shot.
- Keep everyone else off the hosted app while recording, and don't push code (a push redeploys Render).
