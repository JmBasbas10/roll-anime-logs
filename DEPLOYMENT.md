# Rollwatch deployment checklist

## 1. Create the Supabase schema

Open Supabase **SQL Editor**, paste the contents of
`supabase/migrations/202607220001_realtime_logs.sql`, and run it once.

The migration creates:

- idempotent purchase and gift tables;
- bounded constraints and indexes;
- an incrementally maintained product totals table;
- atomic batch-ingestion functions; and
- RLS with no anonymous table policies.

## 2. Push the project to GitHub

Create a private GitHub repository and push this project. `.env.local` is
ignored and must never be committed.

## 3. Create the Render service

In Render, choose **New > Blueprint**, connect the GitHub repository, and use
the included `render.yaml`. Render will create a Node web service using:

- build command: `npm ci && npm run build`
- start command: `npm start`
- health check: `/api/health`

The Starter plan is selected because an always-on service is preferable for
Roblox ingestion. Change the plan in Render if needed.

## 4. Configure server secrets

Set these values locally in `.env.local` and under **Render > Environment**:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-sb-secret-or-legacy-service-role-key
ROBLOX_INGEST_SECRET=your-random-ingestion-secret
```

Keep the existing `ROBLOX_*` Open Cloud values. Never create a
`NEXT_PUBLIC_SUPABASE_SECRET_KEY` variable.

Also copy the existing Roblox Open Cloud values shown in `.env.example`.
Trigger a new Render deployment after saving the variables.

## 5. Validate the backend

After deployment, open `/api/health`. It reports only whether each integration
is configured and never returns secret values.

The ingestion endpoints accept either one object or a JSON array of at most
100 objects:

- `POST /api/events/purchase`
- `POST /api/events/gift`

Both require `Authorization: Bearer <ROBLOX_INGEST_SECRET>`. A repeated
`receiptId` or `giftId` is accepted as a duplicate and is never inserted twice.

## 6. Connect Roblox

Enable **Game Settings > Security > Allow HTTP Requests**. Copy
`examples/roblox/LogIngestor.lua` into `ServerScriptService`, then set its
deployed HTTPS URL and ingestion secret in the private production copy.

Call `QueuePurchase` only after the product has been granted successfully.
Call `QueueGift` only after the unit transfer and player saves succeed.

The example batches up to 50 events every two seconds, retries failed batches,
caps memory use, and flushes during server shutdown. Database uniqueness makes
all retries safe.

## 7. Production safeguards

- Add authentication before sharing the dashboard URL publicly. Public hosting
  does not mean player operational data should be publicly readable.
- Put Cloudflare or another reverse proxy in front of Render if you need edge
  rate limiting. Start high enough for expected server traffic and monitor
  before tightening it.
- Keep batching enabled. Fifty events per request turns thousands of event
  writes into tens of HTTPS requests.
- Enable Supabase backups/PITR appropriate to the project plan.
- Monitor Supabase database size, API errors, function latency, and index usage.
- Decide a retention period. For high-volume logs, archive or delete old raw
  events in small scheduled batches rather than one large transaction.
- Rotate `ROBLOX_INGEST_SECRET` immediately if it appears in client code, chat,
  logs, or source control.

## 8. Event contracts

Purchase:

```json
{
  "receiptId": "unique Roblox purchase receipt",
  "playerId": 123,
  "playerName": "Player",
  "productId": 3605501682,
  "productName": "5k Cash",
  "priceRobux": 99,
  "purchasedAt": 1784683878
}
```

Gift:

```json
{
  "giftId": "unique gift ID",
  "giverId": 123,
  "giverName": "PlayerOne",
  "receiverId": 456,
  "receiverName": "PlayerTwo",
  "createdAt": 1784683878,
  "unit": {
    "name": "Sakura",
    "level": 10,
    "mutation": "Diamond",
    "trait": "Lethal",
    "uuid": "unit UUID"
  }
}
```
