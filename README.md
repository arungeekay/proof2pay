# Proof2Pay

**Every shipment. Every promise. Every payment. Verified.** Proof2Pay gives B2B logistics a verifiable agreement, a documented delivery, a measurable payment obligation and an auditable outcome. AI agents recommend; people approve; PayPal settles.

## Three scenarios

1. **Successful shipment (SH-1042):** Contract AI drafts and flags the contract, both parties accept the same hash, Delivery AI reads the POD with Gemini vision, the operator approves a PayPal invoice, the buyer pays in the PayPal sandbox, the verified webhook confirms it, and tracking is attached to the PayPal transaction.
2. **Delayed payment (SH-1039):** an Indian domestic invoice past its MSMED due date. The credit clock computes statutory interest, Payment AI drafts the final notice and assembles an MSME evidence package. PayPal does not settle Indian domestic payments, so payment is a manually verified record.
3. **Damage and dispute (SH-1042):** the buyer reports a dented carton; Resolution AI weighs the contract, the POD and the cover, recommends a partial refund; the operator approves the PayPal refund, a simulated insurance claim and the dispute response.

Anything not real is labelled in the UI: PayPal mocked (no sandbox keys), simulated insurer, replayed dispute, sample AI output (Gemini unavailable).

> Work in progress for the PayPal AI Hackathon (submission deadline November 12, 2026). The full README, with screenshots, the PayPal API map and sponsor sections, lands before submission. The build plan is in [PROOF2PAY_BUILD_PLAN.md](PROOF2PAY_BUILD_PLAN.md) and status is in [PROGRESS.md](PROGRESS.md).

## Run locally

Prerequisites: Node.js 22 or later, and Docker (for the local Postgres) or any PostgreSQL 15+ database.

```bash
npm install                # also generates the Prisma client
cp .env.example .env       # fill in keys as features need them
npm run db:up              # Postgres 17 on localhost:5433
npm run db:deploy          # apply migrations
npm run db:seed            # wipe and load demo data (requires DEMO_MODE=true)
npm run dev                # http://localhost:3000
```

Without PayPal keys the app runs with PayPal mocked (every mocked record is labelled). With sandbox keys in `.env`, `npm run paypal:setup` checks them and, given the public URL, registers the webhook: `npm run paypal:setup -- https://your-app.onrender.com`.

`npm run e2e -- pod.png [photo.png]` drives all three scenarios through the agents without a browser (it changes the demo data; reseed afterwards).

If your router refuses DNS for `*.neon.tech`, prefix local commands with `NODE_OPTIONS="--require=./scripts/public-dns.cjs"`.

`GET /api/health` returns `{"status":"ok"}` when the app can reach the database. `GET /api/ping` checks only that the app is up.

## Deploy (free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/arungeekay/proof2pay)

- **App:** a Render free web service, defined in [render.yaml](render.yaml).
- **Database:** a free [Neon](https://neon.tech) Postgres. When Render prompts, paste the pooled connection string as `DATABASE_URL` and the direct one as `DATABASE_URL_UNPOOLED`. `neon env pull` prints both. The app uses the pooled string; Prisma Migrate uses the direct one. The build runs migrations and seeds the demo data only when the database is empty.
- **Staying awake:** Render's free plan sleeps after 15 idle minutes. Set the repository variable `APP_URL` to the Render URL, and [keepalive.yml](.github/workflows/keepalive.yml) pings it every 10 minutes.

## Checks

```bash
npm test                   # unit tests (Vitest)
npm run typecheck
npm run lint
npm run build
```

## Demo data

`npm run db:seed` loads six fictional businesses, the four demo personas (Exporter, Carrier, Buyer, Manager), 20 historical shipments with mixed payment and dispute outcomes, and shipment SH-1042 as a draft ready for the live demo. Historical PayPal ids carry a `SEED-` prefix: they are placeholders and were never sent to PayPal.

## License

[MIT](LICENSE)
