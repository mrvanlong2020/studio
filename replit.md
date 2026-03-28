# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## App: Amazing Studio

### Authentication
- **Login gate**: `LoginPage` (`src/pages/login.tsx`) shown when no valid session; token stored in `localStorage` key `amazingStudioToken_v1`
- **JWT flow**: `POST /api/auth/login` validates phone+password → returns `{ token, user }`; `GET /api/auth/me` verifies token
- **Default passwords**: each staff's password = their phone number; admin (no phone) = "admin123"; use username "admin" for the admin account
- **Roles**: `admin` role → full access (`effectiveIsAdmin`); staff roles → limited nav (no Payments, Expenses, Revenue, etc.)
- **Password hashing**: bcryptjs, 10 rounds; `password_hash` column on `staff` table (idempotent ALTER TABLE migration on startup)
- **Change password**: `POST /api/auth/change-password` (admin can change for others; staff can change own with current password check)
- **StaffAuthContext**: `login(user, token)`, `logout()`, `authChecked` (loading state on first render), `token` — all exported from context

A wedding photography studio and wedding dress rental management system for "Amazing Studio".

### Features
- **Tổng quan (Dashboard)**: Real-time stats, revenue chart, upcoming bookings
- **Khách hàng (Customers)**: CRUD customer management with search; phone number has UNIQUE constraint at DB level (`customers_phone_unique`); client-side check on create AND edit (handles spaces); API returns 409 with Vietnamese error on duplicate phone; Drizzle schema updated to `.unique()`
- **Lịch chụp (Calendar)**: Google Calendar-style 3-view system:
  - **Month view**: 30-day grid with booking chips (color-coded by status), solar+lunar calendar
  - **Day view**: 24h timeline, click hour slot → create show form; role toggle "Admin/NV" button in header
  - **Detail view** (`ShowDetailPanel`): Read-only panel. Admin sees finances + edit/delete; staff sees only work info. If booking has `parentId` → shows "Tất cả dịch vụ trong hợp đồng" sibling list + contract totals. Each item shows `notes` (📝 amber block) and `conceptImages` (🖼️ 3-col grid, click for lightbox).
  - **Form view** (`ShowFormPanel`): Edit/create. Toggle "＋ Nhiều dịch vụ / ngày khác" for multi-service contract mode (see below). Each `OrderLineRow` has `notes` textarea + concept image upload section (presigned URL → objectPath stored in `OrderLine.conceptImages[]`).
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
  - **Inline edit (2026-03-27)**: Detail panel now has pencil icon buttons for Mô tả, Ghi chú, Chi tiết hạng mục. Click pencil → inline textarea/item editor appears; save → PUT /api/service-packages/:id; items editor supports add/remove/reorder (ArrowUp/ArrowDown)
- **Object Storage (Image Upload)**:
  - Server: `artifacts/api-server/src/lib/objectStorage.ts` (GCS client wrapper), `objectAcl.ts`, `routes/storage.ts`
  - Endpoints: `POST /api/storage/uploads/request-url` (presigned URL), `GET /api/storage/objects/*` (serve uploaded files), `GET /api/storage/public-objects/*`
  - Client: Custom upload via presigned URL; `getImageSrc(url)` helper converts `/objects/xxx` paths to full API URL
  - Wardrobe uses this for dress photo upload (click to upload + instant preview)
- **Hóa đơn dịch vụ (Contracts)** `/contracts`:
  - Renamed from "Hợp đồng" to "Hóa đơn dịch vụ" throughout
  - `printInvoice(contract)` generates HTML popup with professional formatting
  - DEFAULT_TERMS constant with 5 sections (DỊCH VỤ, DỜI/HỦY LỊCH, TRANG PHỤC, GIAO SẢN PHẨM, PHÁT SINH)
  - Form has editable terms textarea + "↺ Khôi phục điều khoản mặc định" button
  - STUDIO_INFO: name="Amazing Studio", address="Số 80, Hẻm 71, CMT8, KP Hiệp Bình, P. Hiệp Ninh, Tây Ninh", phone="0392817079"
  - Calendar `generateContractHTML` also renamed to "Hóa Đơn Dịch Vụ"
- **SmartSearch** (`src/components/SmartSearch.tsx`): Global search bar in layout header
  - Searches `/api/bookings?q=...` with debounce; shows customer name, order code, phone, shoot date, status dot
  - Keyboard Escape clears; results link to calendar page
- **Booking detail cover banner**: Facebook-style gradient banner at top of `ShowDetailPanel`
  - Purple gradient with decorative circles, service label badge (top-left), order code (top-right), customer avatar circle (bottom-left overlapping body)
- **Payment form improvements**:
  - Amount field blank by default (no auto-fill on booking select)
  - Quick suggestion buttons: 500k, 1M, 2M, Thu đủ (with remaining amount shown)
  - Helper text when field is empty; amount clears after successful save
- **Tiến độ hậu kỳ (Photoshop Jobs)** `/photoshop-jobs`: Job tracking module for post-production work
  - DB table: `photoshop_jobs` (job_code, customer info, assigned staff, shoot_date, received_file_date, internal_deadline, customer_deadline, status, progress_percent, total_photos, done_photos, notes)
  - Status: `chua_nhan` (Chưa nhận), `dang_xu_ly` (Đang xử lý), `cho_duyet` (Chờ duyệt), `hoan_thanh` (Hoàn thành)
  - Color-coded deadline warnings: red (trễ), orange (hôm nay), amber (≤2 ngày), yellow (≤5 ngày)
  - Progress bar with quick-set buttons (0/25/50/75/100%) per job
  - Quick status change via dropdown on each job card
  - Filter tabs by status with counts; search by job code/customer/staff
  - Sort by: deadline, progress, status, newest
  - API: GET/POST/PUT/DELETE `/api/photoshop-jobs`
- **Chấm công (Attendance)** `/attendance`: Full attendance module with QR + GPS check-in/out
  - DB tables: `attendance_logs` (check_in/check_out logs), `attendance_rules` (on-time window + weekly bonus), `attendance_late_rules` (late penalty tiers), `attendance_adjustments` (manual bonus/penalty by admin)
  - **Check-in flow**: "Chấm vào (QR)" button → opens jsQR camera scanner (device camera) → scans QR code → gets GPS location → POST /api/attendance/check-in; falls back to GPS-only button
  - **Geofence**: Studio lat/lng/radius in `settings` table; within radius → method=`qr`; outside but has offsite booking today → method=`offsite`; else rejected
  - **My tab**: Monthly calendar view (color: green=full day, amber=offsite, blue=check-in only), summary cards (Ngày công / Đúng giờ % / Thưởng/Phạt net), bonus/penalty list, admin adjustments panel with staff dropdown
  - **Admin tab**: Per-staff summary table (Ngày công, Đủ giờ/Total, Ngoài studio, Lần cuối); raw log table (collapsible); manual check-in form with staff dropdown
  - **Rules tab**: Editable form (tên quy tắc, giờ vào từ/đến, bonus tuần); late rules table with "+" Thêm dòng + per-row delete; save saves all to DB
  - **Settings**: Added Geofence section (lat/lng/radius) to settings page, linked to DB via PUT /api/settings; default 11.3101,106.1074,300m
  - **API**: POST /api/attendance/check-in (geofence + offsite check), POST /api/attendance/check-out, GET /api/attendance/me?month, GET /api/attendance/admin?month, GET/PUT /api/attendance/rules, GET/POST /api/attendance/adjustments, POST /api/attendance/manual (admin)
  - **jsQR** package installed for QR code scanning from camera frame
- **ServiceSearchBox** (`src/components/service-search-box.tsx`): Shared searchable package picker — live filtering, smart suggestions from localStorage recent, shows tags (serviceType, makeup, addon, album). Used in booking forms and calendar.
- **SurchargeEditor** (`src/components/surcharge-editor.tsx`): Shared multi-line phát sinh/phụ thu editor. Each row: name + amount, auto-sum. Stores as JSONB `surcharges` column on bookings table.
- **Booking surcharges**: `surcharges` JSONB column on `bookingsTable` (`[{name, amount}]`). POST/PUT /bookings accept `surcharges`. Total = sum(line items) + sum(surcharges). Auto-computed in form when package selected.
- **Nhân sự & Lương (Staff & Payroll)** `/staff`: Full HR system with multi-role staff + freelancer support
  - `staffType` field: "official" (nhân viên chính thức) or "freelancer" (CTV)
  - Roles: admin, photographer, makeup, sale, photoshop, assistant, marketing (jsonb array)
  - Real staff seeded: 5 chính thức (Trần Chí, Trung, Hoa, Quân, Diệu Mai) + 15 CTV photographers
  - Per-staff individual pricing via `staff_rate_prices` table (staffId × role × taskKey → rate + rateType) — OLD system, still used as fallback
  - **NEW: Cast theo gói (T001)**: `staff_cast_rates(staffId, role, packageId, amount)` — cast cost per employee+role+package. Section G in staff profile shows package-based cast sheet with tabs (photographer/makeup/photoshop). Calendar uses `lookupCastByPkg()` first, falls back to old system. API: `/api/staff-cast` (GET/POST bulk/DELETE).
  - `costCastPhoto/Makeup/Pts` columns REMOVED from `service_packages` schema (DB columns still exist, ignored by Drizzle)
  - Filter by type (Tất cả / Chính thức / CTV) and role in staff list
  - DB: `staff.roles` (jsonb), `staff.staffType`, `staff_rate_prices`, `staff_job_earnings`, `staff_cast_rates`
  - API: `/api/staff-rates` (bulk upsert old), `/api/job-earnings`, `/api/staff-cast` (new packageId-based cast)
  - Tasks schema: Added `servicePackageId`, `role`, `taskType` columns to `tasks` table
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
