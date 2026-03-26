# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## App: Amazing Studio

A wedding photography studio and wedding dress rental management system for "Amazing Studio".

### Features
- **Tổng quan (Dashboard)**: Real-time stats, revenue chart, upcoming bookings
- **Khách hàng (Customers)**: CRUD customer management with search
- **Lịch chụp (Calendar)**: Google Calendar-style 3-view system:
  - **Month view**: 30-day grid with booking chips (color-coded by status), solar+lunar calendar
  - **Day view**: 24h timeline, click hour slot → create show form; role toggle "Admin/NV" button in header
  - **Detail view** (`ShowDetailPanel`): Read-only Google Calendar-style panel when tapping any booking. Shows: customer, date/time, services (with package items/products/description), surcharges, staff, payment info. Admin sees finances + pencil+trash; staff sees only work info.
  - **Form view** (`ShowFormPanel`): Edit/create — opens from detail's pencil button or "Tạo show"
  - **Role toggle**: "Admin" ↔ "Nhân viên" button in month + day view headers; persisted to localStorage `cal_view_mode`. Admin sees all; staff hides finances, edit/delete
- **Váy cưới (Dresses)**: Wedding dress inventory management
- **Cho thuê váy (Rentals)**: Dress rental management with return tracking
- **Thanh toán (Payments)**: Payment tracking (cash, bank transfer, MoMo, ZaloPay)
- **Bảng giá (Pricing)**: Full pricing catalog — service groups, packages with detailed items, surcharges CRUD; 4 DB tables: service_groups, service_packages, package_items, surcharges; seed data with 11 groups, 15 packages, 10 surcharges
- **ServiceSearchBox** (`src/components/service-search-box.tsx`): Shared searchable package picker — live filtering, smart suggestions from localStorage recent, shows tags (serviceType, makeup, addon, album). Used in booking forms and calendar.
- **SurchargeEditor** (`src/components/surcharge-editor.tsx`): Shared multi-line phát sinh/phụ thu editor. Each row: name + amount, auto-sum. Stores as JSONB `surcharges` column on bookings table.
- **Booking surcharges**: `surcharges` JSONB column on `bookingsTable` (`[{name, amount}]`). POST/PUT /bookings accept `surcharges`. Total = sum(line items) + sum(surcharges). Auto-computed in form when package selected.
- **Nhân sự & Lương (Staff & Payroll)** `/staff`: Full HR system with multi-role staff + freelancer support
  - `staffType` field: "official" (nhân viên chính thức) or "freelancer" (CTV)
  - Roles: admin, photographer, makeup, sale, photoshop, assistant, marketing (jsonb array)
  - Real staff seeded: 5 chính thức (Trần Chí, Trung, Hoa, Quân, Diệu Mai) + 15 CTV photographers
  - Per-staff individual pricing via `staff_rate_prices` table (staffId × role × taskKey → rate + rateType)
  - Filter by type (Tất cả / Chính thức / CTV) and role in staff list
  - DB: `staff.roles` (jsonb), `staff.staffType`, `staff_rate_prices`, `staff_job_earnings`
  - API: `/api/staff-rates` (bulk upsert), `/api/job-earnings`
  - Auto-compute: booking → "completed" → earnings auto-generated per assigned staff using per-staff rates
  - Calendar: `photoTask`/`makeupTask`/`saleTask`/`photoshopTask` stored per booking item + `assignedStaff`

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
