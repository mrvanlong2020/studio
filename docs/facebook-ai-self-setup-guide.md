# Huong dan tu thiet lap Inbox Facebook AI

Tai lieu nay dung de ban giao cho chu studio/nhan vien ky thuat tu cau hinh he thong Inbox Facebook AI.

## 1) Dieu kien can co

- Da co Facebook Fanpage.
- Da co tai khoan [Meta for Developers](https://developers.facebook.com/).
- Da co OpenAI API key.
- He thong Amazing Studio da chay duoc voi URL public HTTPS.

## 2) Tao Meta App va ket noi Messenger

1. Vao Meta for Developers, tao App moi (loai Business hoac Other phu hop).
2. Them san pham **Messenger**.
3. Trong Messenger settings:
   - Ket noi den Fanpage can dung.
   - Lay **Page Access Token**.
4. Luu token nay de dan vao phan Cai dat trong app.

## 3) Cau hinh webhook Messenger

1. Vao Messenger > Webhooks.
2. Nhap:
   - Callback URL: `https://tranchistudio.com/api/webhook/facebook`
   - (Neu dung domain tam) `https://amazing-studio-manager.replit.app/api/webhook/facebook`
   - Verify Token: chuoi ban tu dat (vi du: `studio-verify-2026`)
3. Dang ky it nhat cac event:
   - `messages`
   - `messaging_postbacks`

## 4) Cau hinh trong app Amazing Studio

Vao **Cai dat** -> phan **Cau hinh Facebook Fanpage + ChatGPT**:

- Facebook Page Access Token: dan token tu Meta.
- Webhook Verify Token: nhap dung chuoi da dat o Meta.
- OpenAI API Key: dan key bat dau bang `sk-...`.
- Bat/Tat Auto reply theo nhu cau.

Nhan **Luu Facebook + ChatGPT**.

## 5) Kiem tra hoat dong

1. Dung tai khoan Facebook ca nhan nhan tin vao Fanpage.
2. Vao tab **Inbox Facebook AI** trong app:
   - Thay hoi thoai moi xuat hien.
   - Bam **AI goi y** de tao noi dung tra loi.
   - Co the sua noi dung roi bam **Gui Facebook**.
3. Neu bat Auto reply:
   - AI se tu gui khi dung kich ban.
   - Co delay 3-4 giay de giong nguoi that.

## 6) Nguyen tac an toan van hanh

- Cac cau hoi ngoai pham vi se khong tu dong tra loi.
- Nhan vien se tra loi thu cong tren tab Inbox.
- Khong chia se API key cho nhan vien khong lien quan.
- Dinh ky doi token/API key neu nghi ro ri.

## 7) Su co thuong gap

- **Khong nhan duoc tin vao app**
  - Kiem tra callback URL co dung HTTPS va truy cap duoc tu internet.
  - Kiem tra webhook da subscribe `messages`.
  - Kiem tra Verify Token giong nhau giua Meta va app.

- **Gui tin that bai**
  - Kiem tra Page Access Token con han va dung page.
  - Kiem tra quyen Messenger cua app.

- **AI khong goi y / khong tu tra loi**
  - Kiem tra OpenAI API key.
  - Kiem tra han muc tai khoan OpenAI con du.
  - Kiem tra trang thai Auto reply dang Bat.

## 8) Mo hinh van hanh de tiet kiem chi phi

- De xuat cho studio nho:
  - Ban ngay: de Auto reply Bat cho FAQ co ban.
  - Cac ca khac: nhan vien duyet va gui tay.
- Dat prompt gon, tra loi ngan de giam token.
- Theo doi tuan su dung de toi uu ngan sach OpenAI.
