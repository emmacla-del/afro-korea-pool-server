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

- Real authentication (MVP uses `x-user-id` header)
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

## API quickstart (manual MVP auth)

Use any UUID as your user id for now (until auth is implemented):

- DEV: seed a supplier user:
  - `POST /dev/seed/supplier` header: `x-admin-secret: <DEV_ADMIN_SECRET>` body: `{ "displayName": "Lagos Textiles" }`
  - returns `{ supplierUserId, supplierId }`

- Supplier: import products (bulk JSON):
  - `POST /supplier/catalog/import` header: `x-user-id: <supplierUserId>` body:
    - `{ "products": [ { "title": "...", "category": "...", "variants": [ { "sku": "...", "unitPriceXaf": 25000, "thresholdQty": 50 } ] } ] }`

- Supplier: list my products:
  - `GET /supplier/products` header: `x-user-id: <supplierUserId>`

- Create pool:
  - `POST /pools` body: `{ "variantId": "<uuid>", "deadlineAt": "2026-02-06T12:00:00.000Z" }`

- Commit units:
  - `POST /pools/:id/commit` header: `x-user-id: <uuid>` body: `{ "qty": 10 }`

- Direct purchase (skip pooling):
  - `POST /orders/direct` header: `x-user-id: <uuid>` body: `{ "variantId": "<uuid>", "qty": 2 }`

- List my orders:
  - `GET /me/orders` header: `x-user-id: <uuid>`

- DEV: mark an order as paid:
  - `POST /dev/orders/:id/mark-paid` header: `x-admin-secret: <DEV_ADMIN_SECRET>`

- Supplier: list purchase orders:
  - `GET /supplier/purchase-orders` header: `x-user-id: <supplier-user-uuid>`

## Next (recommended)

1) Add real auth (phone OTP) and role-based access (customer vs supplier).
2) Implement catalog upload (CSV) for suppliers and public catalog browse for customers.
3) Integrate the first payment provider (MoMo/card), with idempotent webhooks.
4) Add realtime updates for pool progress (SSE/WebSocket).
