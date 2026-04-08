# Amazing Studio Manager

He thong quan ly van hanh studio chup anh cuoi va cho thue vay cuoi.

## Tinh nang chinh

- Quan ly lich chup, don hang, hop dong, bao gia, thanh toan, chi phi, doanh thu.
- Quan ly nhan su, cham cong, giao viec, tien do hau ky.
- CRM Leads va tim kiem nhanh.
- Inbox Facebook AI:
  - Nhan tin nhan fanpage vao app.
  - AI goi y/tu dong tra loi trong pham vi cho phep.
  - Ngoai pham vi de nhan vien duyet va gui thu cong.
  - Delay gui 3-4 giay de giong nguoi that.

## Cong nghe

- Frontend: React + Vite
- Backend: Express + TypeScript
- Database: PostgreSQL + Drizzle ORM
- Monorepo: pnpm workspace

## Chay local nhanh

Yeu cau:

- Node.js 22+
- pnpm (hoac `npx pnpm`)
- PostgreSQL 16+

Lenh co ban:

```powershell
npx pnpm install
```

Backend:

```powershell
$env:PORT='8080'
$env:DATABASE_URL='postgresql://postgres:123456@localhost:5432/amazing_studio'
npx pnpm --filter @workspace/api-server run dev
```

Frontend:

```powershell
$env:PORT='24230'
$env:BASE_PATH='/'
npx pnpm --filter @workspace/amazing-studio run dev
```

Mo:

- Frontend: `http://localhost:24230`
- Health check API: `http://localhost:8080/api/healthz`

## Tai lieu trien khai

- Tu setup Facebook + ChatGPT: `docs/facebook-ai-self-setup-guide.md`
- Checklist deploy production: `docs/deploy-production-checklist.md`

## Luu y bao mat

- Khong commit file dump database, token, key va file release.
- Cau hinh secret qua environment variables hoac trong trang Cai dat (admin only).
