# AfroPool Server (MVP, no BaaS)

This folder is a minimal backend for the “pooling / threshold” e-commerce MVP:

- A **Pool** is tied to a single `product_variant` and has a **unit threshold** + **deadline**.
- Customers create **Commitments** (qty) while the pool is `OPEN`.
- When `committed_qty >= threshold_qty`, the pool **locks immediately** and enters `PAYMENT_WINDOW`.
- MVP payment model: **pay when threshold met** (customers pay during the payment window).
- When enough units are paid, a **PurchaseOrder** is created for the supplier.
- Customers can also make **Direct (individual) purchases** that skip pooling.

## What’s implemented

- Prisma models for `Pool`, `Commitment`, `Order`, `Payment`, `PurchaseOrder`
- `POST /pools/:id/commit` does an atomic commit + pool lock
- `POST /orders/direct` creates an individual purchase order (pending payment)
- Supplier product APIs:
  - `POST /supplier/products`
  - `POST /supplier/variants`
  - `POST /supplier/catalog/import` (bulk JSON import)
  - `GET /supplier/products`
- Public browse:
  - `GET /products`
- A scheduler runs every ~15s to:
  - expire `OPEN` pools after deadline
  - finalize `PAYMENT_WINDOW` pools after the payment window ends
- Supplier endpoints to list/confirm/ship purchase orders

## What’s intentionally MVP / missing

- Real payments integration (there’s a DEV endpoint to mark an order as paid)
- Catalog upload endpoints (schema supports products/variants, endpoints can be added next)
- Multi-variant pools, partial shipment, refunds, dispute/chargeback handling

## Prereqs

- Node.js
- A PostgreSQL database (local install or hosted)

## Setup

1) Copy env file:

`copy .env.example .env`

2) Edit `.env` and set `DATABASE_URL`.

3) Generate Prisma client:

`npm.cmd run prisma:generate`

4) Apply the initial migration:

- If you want Prisma to run migrations (requires DB reachable):
  - `npm.cmd run prisma:migrate`

## Run

`npm.cmd run dev`

Server starts on `https://afropool-backend.onrender.com` in production (or `http://localhost:3000` when running locally).

## API quickstart (JWT auth)

1) Register:

- `POST /auth/register` body: `{ "phone": "+237600000001", "password": "secret123", "role": "SUPPLIER" }`

2) Login:

- `POST /auth/login` body: `{ "phone": "+237600000001", "password": "secret123" }`
- returns `{ access_token, user }`

3) Use bearer token on protected routes:

- `Authorization: Bearer <access_token>`

- DEV: seed a supplier user:
  - `POST /dev/seed/supplier` header: `x-admin-secret: <DEV_ADMIN_SECRET>` body: `{ "displayName": "Lagos Textiles" }`
  - returns `{ supplierUserId, supplierId }`

- Supplier: import products (bulk JSON):
  - `POST /supplier/catalog/import` header: `Authorization: Bearer <token>` body:
    - `{ "products": [ { "title": "...", "category": "...", "variants": [ { "sku": "...", "unitPriceXaf": 25000, "thresholdQty": 50 } ] } ] }`

- Supplier: list my products:
  - `GET /supplier/products` header: `Authorization: Bearer <token>`

- Create pool:
  - `POST /pools` body: `{ "variantId": "<uuid>", "deadlineAt": "2026-02-06T12:00:00.000Z" }`

- Commit units:
  - `POST /pools/:id/commit` header: `Authorization: Bearer <token>` body: `{ "qty": 10 }`

- Direct purchase (skip pooling):
  - `POST /orders/direct` header: `Authorization: Bearer <token>` body: `{ "variantId": "<uuid>", "qty": 2 }`

- List my orders:
  - `GET /me/orders` header: `Authorization: Bearer <token>`

- DEV: mark an order as paid:
  - `POST /dev/orders/:id/mark-paid` header: `x-admin-secret: <DEV_ADMIN_SECRET>`

- Supplier: list purchase orders:
  - `GET /supplier/purchase-orders` header: `Authorization: Bearer <token>`

## Next (recommended)

1) Add password reset / phone OTP verification.
2) Implement catalog upload (CSV) for suppliers and public catalog browse for customers.
3) Integrate the first payment provider (MoMo/card), with idempotent webhooks.
4) Add realtime updates for pool progress (SSE/WebSocket).


📘 Updated README
Server Project
Setup
Prerequisites
Node.js v18+

PostgreSQL (or use Render PostgreSQL)

npm or yarn

Environment Variables
Create a .env file in the server/ root with:

env
DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=no-verify"
PORT=3000
JWT_SECRET=your-secret
# ... other variables
Installation
bash
npm install
Database Migrations
Normal Flow (Development)
bash
npx prisma migrate dev --name init
Production Deployment
bash
npx prisma migrate deploy
npx prisma generate
Handling Custom prisma.config.ts
If you have a custom Prisma config, the CLI may ignore .env. Temporarily rename it:

bash
Move-Item prisma.config.ts prisma.config.ts.bak
Then run migration commands normally. Restore afterward:

bash
Move-Item prisma.config.ts.bak prisma.config.ts
Troubleshooting BOM Errors
If you encounter syntax error at or near "", your migration file may contain a UTF-8 BOM. Remove it using PowerShell:

powershell
$path = "prisma/migrations/[migration_name]/migration.sql"
$content = Get-Content -Path $path -Raw -Encoding UTF8
if ($content[0] -eq 0xFEFF) { $content = $content.Substring(1) }
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))
Dealing with Failed Migrations
If a migration fails, mark it as rolled back before retrying:

bash
npx prisma migrate resolve --rolled-back <migration_name>
After fixing the cause, deploy again:

bash
npx prisma migrate deploy
Manual SQL Execution
To apply raw SQL without affecting the migration history:

bash
echo "SQL_STATEMENT" | npx prisma db execute --stdin --url="$DATABASE_URL"
Running the Server
bash
npm run dev
The server will start on http://localhost:3000.

Scheduler Notes
The PoolsSchedulerService runs every 15 seconds to expire pools and finalize payment windows.

If you see Cannot read properties of undefined (reading 'expireOpenPastDeadline'), ensure forwardRef is used as described above.

Known Issues & Workarounds
Database client removed from pool log: This is harmless and may come from a test connection. Ignore unless accompanied by errors.

Prisma v7 Upgrade: Not yet performed. When upgrading, be aware of breaking changes (env loading, driver adapters). Test in development first.

📌 Additional Notes
Always backup production database before manual interventions.

Use prisma migrate status to check the current state.

Keep migration files free of BOM (use UTF-8 without BOM encoding in your editor).

