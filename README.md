# Proof2Pay

**The trust and settlement layer for cross-border B2B trade.** Every shipment starts with an AI-drafted contract, is verified at delivery by AI, settles through PayPal, and leaves both parties with a verified track record.

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
