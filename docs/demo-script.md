# Proof2Pay demo script (video under 3:00, aim for 2:50)

Record the hosted app in a browser at 1080p. Voiceover; no music, or royalty-free only; no third-party logos. Before recording, reseed so SH-1042 starts as a draft (`npm run db:seed`, which wipes the demo). Keep the PayPal sandbox buyer logged in in a second browser profile.

Say these words on camera where they appear: **PayPal**, **agent**, **Gemini**, **AG Grid**, **Render**, **APIMatic** (only if it was actually used).

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:20 | Home page: tagline, three scenario cards | "Small exporters and logistics firms ship thousands of dollars of goods on an email thread. Payment runs late, delivery is hard to prove, and nobody knows who pays on time. Proof2Pay makes every shipment, promise and payment verifiable, with PayPal settling the money." |
| 0:20–0:45 | SH-1042 as Rahul (exporter): Draft contract. Change credit to 60 days: the MSMED rule blocks it. Back to 30 | "Contract AI fills a fixed, human-written clause library from the shipment, flags issues and explains them. Under India's MSMED Act, 60-day credit is illegal for a small supplier, so the rule blocks it. The AI never invents legal terms." |
| 0:45–0:55 | Accept as exporter; switch to Laura (buyer), accept | "Both parties accept the same SHA-256 hash. The AI never signs." |
| 0:55–1:20 | Switch to Dinesh (carrier): Confirm pickup. Generate demo POD, upload. Verification report with "1 carton dented" | "At delivery, Delivery AI reads the signed proof of delivery and photos with Gemini vision and checks them against the contract. It finds one dented carton and records it." |
| 1:20–1:45 | Switch to Kavitha (finance manager): approval card, Approve. Payment tab: PayPal invoice, credit clock running | "Payment AI proposes the PayPal invoice, due 30 days from acceptance. Nothing goes to PayPal until a person approves." |
| 1:45–2:00 | Second browser: buyer opens the PayPal invoice link and pays in sandbox. Back in the app: paid, tracking added | "The buyer pays through PayPal. Only PayPal's verified webhook marks it paid, and Proof2Pay attaches the delivery tracking to the PayPal transaction." |
| 2:00–2:25 | Laura: Resolution tab, request $400. Recommendation: partial $300 with cited evidence. Kavitha approves: PayPal refund, simulated insurance claim | "The buyer asks for $400. Resolution AI compares the claim with the contract and the POD: one carton was recorded damaged, worth $300 at contract value. The manager approves; the PayPal refund runs, and the loss is claimed from the insurer, simulated in this demo." |
| 2:25–2:40 | SH-1039: 28 days overdue, ₹5,425 interest, Draft final notice, MSME package | "Delayed payment: an Indian domestic sale. PayPal doesn't settle domestic Indian payments, so the payment is a manually verified record, but the credit clock, statutory interest and the MSME evidence package all work." |
| 2:40–2:50 | Command center: "Show disputed shipments over $10,000 with insurance attached". Then the trust profile | "Managers ask in plain language; AG Grid shows the answer. Trust profiles change only on verified events." |
| 2:50–3:00 | Audit trail | "Every agent decision explained, every action approved by a person, every dollar through PayPal. Today Proof2Pay settles cross-border trade through PayPal; when PayPal can settle India's domestic B2B payments, the trust record is already there." |

## Fallbacks while recording

- **Gemini busy:** the app tries the next free model. If every model fails, it shows labelled sample output. Pause and retry rather than record a "sample" badge.
- **Sandbox dispute won't open:** as Laura, use "Open a dispute (replay, labelled)". The video must show the "replayed dispute" label.
- **Webhook slow:** use "Sync from PayPal" on the Payment tab. It reads the invoice from PayPal, which is the same evidence.
