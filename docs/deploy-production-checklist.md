# Checklist deploy website (Production)

Tai lieu nay dung de dua Amazing Studio len website production, uu tien nhanh, on dinh, de ban giao.

## 1) Chuan bi truoc khi deploy

- Domain chinh: `tranchistudio.com` (da verify).
- Domain du phong: `amazing-studio-manager.replit.app`.
- PostgreSQL production da co du lieu.
- Da dang nhap duoc app local voi tai khoan admin.

## 2) Bien moi truong bat buoc (Backend)

Khai bao tren he thong deploy:

- `PORT=8080`
- `NODE_ENV=production`
- `DATABASE_URL=<chuoi_postgres_production>`

Khuyen nghi them:

- `SESSION_SECRET=<chuoi_bi_mat_dai>`
- `OPENAI_API_KEY=<sk-...>` (hoac nhap trong UI Cai dat)
- `FB_PAGE_ACCESS_TOKEN=<token_fanpage>` (hoac nhap trong UI Cai dat)
- `FB_VERIFY_TOKEN=<verify_token>` (hoac nhap trong UI Cai dat)
- `FB_AUTO_REPLY_ENABLED=false` (bat sau khi test xong)

## 3) Bien moi truong Frontend

- `PORT=24230`
- `BASE_PATH=/`

## 4) Trinh tu deploy de an toan

1. Deploy backend + frontend len production.
2. Kiem tra health backend:
   - `https://tranchistudio.com/api/healthz`
   - Ket qua mong doi: `{"status":"ok"}`
3. Dang nhap giao dien:
   - `https://tranchistudio.com`
4. Vao **Cai dat**:
   - Dien thong tin studio.
   - Dien token Facebook + OpenAI.
   - Tam thoi de **Auto reply = Tat**.
5. Cau hinh webhook Meta:
   - Callback URL: `https://tranchistudio.com/api/webhook/facebook`
   - Verify Token: trung voi token da luu trong Cai dat.
   - Subscribe: `messages`, `messaging_postbacks`.
6. Test nhan tin that:
   - Gui tin vao fanpage.
   - Kiem tra tab **Inbox Facebook AI** co nhan duoc hoi thoai.
7. Test gui tay:
   - Bam AI goi y -> sua -> Gui Facebook.
8. Khi da on dinh moi bat **Auto reply**.

## 5) Checklist nghiem thu truoc ban giao khach

- [ ] Dang nhap/ dang xuat ok.
- [ ] Tao/sua khach hang ok.
- [ ] Lich chup load du lieu.
- [ ] `/api/healthz` tra ve ok.
- [ ] Inbox Facebook nhan tin that.
- [ ] AI goi y duoc.
- [ ] Gui Facebook thanh cong.
- [ ] Ngoai pham vi thi khong tu dong gui.
- [ ] Delay 3-4 giay hoat dong khi gui.

## 6) Van hanh tiet kiem chi phi

- Ban dau de Auto reply = Tat trong 3-7 ngay de quan sat.
- Sau do chi bat Auto cho FAQ co ban.
- Giam chi phi OpenAI bang cach:
  - Cau hinh tra loi ngan.
  - Khong bat auto 24/7 neu khong can.
  - Theo doi so luong tin hang tuan.

## 7) Rollback nhanh neu co su co

Neu co loi lon sau deploy:

1. Tat Auto reply ngay trong Cai dat.
2. Tam thoi dung domain du phong `*.replit.app` de tiep tuc van hanh.
3. Khoi phuc lai phien ban truoc do (release truoc).
4. Mo log backend, sua xong moi deploy lai.
