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
  - **Detail view** (`ShowDetailPanel`): Read-only panel. Admin sees finances + edit/delete; staff sees only work info. If booking has `parentId` → shows "Tất cả dịch vụ trong hợp đồng" sibling list + contract totals.
  - **Form view** (`ShowFormPanel`): Edit/create. Toggle "＋ Nhiều dịch vụ / ngày khác" for multi-service contract mode (see below).
  - **Role toggle**: "Admin" ↔ "Nhân viên" in both month + day view headers; persisted to `localStorage.cal_view_mode`
- **Multi-service contract (Hợp đồng đa dịch vụ)**:
  - **Data model**: 1 parent booking (`isParentContract=true`) + N child bookings (`parentId=parentId`). Each child has its own `shootDate`, `serviceLabel`, `items`, `assignedStaff`.
  - **DB columns added**: `parent_id integer`, `service_label text`, `is_parent_contract boolean default false`
  - **API**: `POST /bookings` with `subServices:[...]` → creates parent + children atomically; `GET /bookings/:id` returns `siblings`, `parentContract`, `children` when applicable; `DELETE /bookings/:id` cascades to children.
  - **Calendar display**: Filters out `isParentContract=true` bookings — only children appear on their own dates (each child is its own calendar event).
  - **Form creation**: Toggle "＋ Nhiều dịch vụ / ngày khác" in section B → violet sub-service blocks, each with label, date override toggle, time, service search, notes. "+ Thêm dịch vụ N" adds more blocks. Total auto-sums.
  - **Detail view**: When `parentId` is set, detail panel fetches full booking (includes siblings) and shows violet card "Tất cả dịch vụ trong hợp đồng (N)" listing all siblings with dates, "Đang xem" badge on current. Admin sees green contract totals.
- **Váy cưới (Dresses)**: Wedding dress inventory management
- **Cho thuê váy (Rentals)**: Dress rental management with return tracking
- **Nhân sự (HR/Staff)**: Full staff management with individual profile pages:
  - **StaffAvatar component** (`src/components/StaffAvatar.tsx`): Shared avatar component — role-based gradient colors (photographer→blue, makeup→pink, sale→orange, admin→violet, photoshop→teal), status dot (green=active, amber=probation, red=inactive), initials fallback, click-to-upload (square center-crop 200px JPEG), image error fallback, sizes xs/sm/md/lg/xl
  - **Trang danh sách**: Staff cards with "Bạn là ai?" viewer selector (localStorage-based); click "Xem hồ sơ chi tiết" to open profile; cards and viewer selector show StaffAvatar
  - **Hồ sơ cá nhân** (`/staff/:id`): A. Thông tin cơ bản; B. Công việc tháng này (clickable stat cards → filtered list); C. Tiền lương tháng này; D. Thu nhập hôm nay; E. Lịch sử công việc; F. Đơn xin nghỉ (create + admin approve/reject); G. Bảng giá cá nhân (per-role rates); H. Ghi chú nội bộ (admin-only)
  - **Phân quyền**: Admin xem tất cả; nhân viên chỉ xem hồ sơ của chính mình; `StaffAuthContext` lưu viewer trong localStorage
  - **DB tables**: `staff_leave_requests` (đơn xin nghỉ), `staff_internal_notes` (ghi chú admin)
  - **API**: `GET /api/staff/:id/profile` (full profile data), `POST/GET /api/staff/:id/leave-requests`, `PUT /api/leave-requests/:id`, `GET/PUT /api/staff/:id/internal-notes`
  - **Job query**: Hỗ trợ 2 format assignedStaff: array `[id]` (cũ) và object `{photo: id, makeup: id}` (mới)
- **Thanh toán (Payments)**: Payment tracking (cash, bank transfer, MoMo, ZaloPay)
- **Bảng giá (Pricing)**: Full pricing catalog — service groups, packages with detailed items, surcharges CRUD; 4 DB tables: service_groups, service_packages, package_items, surcharges; seed data with 11 groups, 41 packages, 10 surcharges
  - **Group icons & colors**: Each service group has a unique icon + color theme (rose/camera for CHỤP CỔNG, violet/book for ALBUM TẠI STUDIO, sky/pin for ALBUM NGOẠI CẢNH, amber/star for CHỤP TIỆC CƯỚI, pink/sparkles for BEAUTY, purple/palette for COMBO CÓ MAKEUP, etc.)
  - **Filter tabs**: Max 8 groups shown initially + "+N nhóm" button to expand; each tab shows the group's icon
  - **Duplicate prevention**: `service_groups.name` has UNIQUE constraint; API POST /service-groups returns 409 for duplicates; `seedBeautyIfMissing()` checks both old and new names; GET /service-groups deduplicates by name in-memory as safety net
  - **Bug fix (2026-03-26)**: `seedBeautyIfMissing` was creating a new "CHỤP BEAUTY" group on every restart (because `updateGroupSortOrders` renamed it to "BEAUTY / THỜI TRANG", so the old-name check always missed it). Resulted in 57 duplicate groups (700+ packages). Fixed by checking both names. DB cleaned up (56 duplicate groups + 112 packages deleted). UNIQUE constraint added to prevent future duplicates.
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
