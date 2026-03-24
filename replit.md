# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## App: Amazing Studio

A wedding photography studio and wedding dress rental management system for "Amazing Studio".

### Features
- **Tổng quan (Dashboard)**: Real-time stats, revenue chart, upcoming bookings
- **Khách hàng (Customers)**: CRUD customer management with search
- **Lịch chụp (Bookings)**: Booking management with status tracking, package types
- **Váy cưới (Dresses)**: Wedding dress inventory management
- **Cho thuê váy (Rentals)**: Dress rental management with return tracking
- **Thanh toán (Payments)**: Payment tracking (cash, bank transfer, MoMo, ZaloPay)
- **Bảng giá (Pricing)**: Full pricing catalog — service groups, packages with detailed items, surcharges CRUD; 4 DB tables: service_groups, service_packages, package_items, surcharges; seed data with 11 groups, 15 packages, 10 surcharges

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/amazing-studio)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **UI Libraries**: Recharts, react-hook-form, framer-motion, date-fns

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── amazing-studio/     # React + Vite frontend (previewPath: /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── customers.ts
│           ├── bookings.ts
│           ├── dresses.ts
│           ├── rentals.ts
│           └── payments.ts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Packages

### `artifacts/amazing-studio` (`@workspace/amazing-studio`)

React + Vite frontend served at previewPath `/`.
- Pages: Dashboard, Customers, Bookings, Dresses, Rentals, Payments
- Vietnamese language UI
- Elegant rose/gold/cream color scheme

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes at `/api`.
- GET/POST `/api/customers`
- GET/PUT/DELETE `/api/customers/:id`
- GET/POST `/api/bookings`
- GET/PUT/DELETE `/api/bookings/:id`
- GET/POST `/api/dresses`
- GET/PUT/DELETE `/api/dresses/:id`
- GET/POST `/api/rentals`
- GET/PUT `/api/rentals/:id`
- GET/POST `/api/payments`
- GET `/api/dashboard/stats`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

Production migrations: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
