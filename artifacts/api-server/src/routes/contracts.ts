import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { contractsTable, customersTable, bookingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";

const router: IRouter = Router();

router.get("/contracts", async (req, res) => {
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const rows = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      bookingId: contractsTable.bookingId,
      customerId: contractsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: contractsTable.title,
      totalValue: contractsTable.totalValue,
      status: contractsTable.status,
      signedAt: contractsTable.signedAt,
      expiresAt: contractsTable.expiresAt,
      notes: contractsTable.notes,
      createdAt: contractsTable.createdAt,
      bookingDeductions: bookingsTable.deductions,
      bookingSurcharges: bookingsTable.surcharges,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .leftJoin(bookingsTable, eq(contractsTable.bookingId, bookingsTable.id))
    .orderBy(desc(contractsTable.createdAt));

  let filtered = rows;
  if (customerId) filtered = filtered.filter(c => c.customerId === customerId);
  res.json(filtered);
});

router.post("/contracts", async (req, res) => {
  const { bookingId, customerId, title, content, status, signedAt, expiresAt, totalValue, notes } = req.body;
  const count = await db.select().from(contractsTable);
  const contractCode = `HD${String(count.length + 1).padStart(4, "0")}`;
  const [contract] = await db
    .insert(contractsTable)
    .values({ contractCode, bookingId: bookingId || null, customerId, title, content: content || "", status: status || "draft", signedAt: signedAt || null, expiresAt: expiresAt || null, totalValue: totalValue ? String(totalValue) : "0", notes })
    .returning();
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  res.status(201).json({ ...contract, customerName: customer.name, customerPhone: customer.phone });
});

router.post("/contracts/:id/sign-link", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      customerId: contractsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: contractsTable.title,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .where(eq(contractsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Không tìm thấy hợp đồng" });
    return;
  }

  const baseUrl = process.env.PUBLIC_APP_URL || process.env.REPLIT_DEV_DOMAIN || "";
  const signUrl = `${baseUrl.replace(/\/$/, "")}/contracts/${id}/sign`;

  res.json({
    signUrl,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    contractCode: row.contractCode,
    title: row.title,
  });
});

router.get("/contracts/:id/sign", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      customerName: customersTable.name,
      title: contractsTable.title,
      content: contractsTable.content,
      status: contractsTable.status,
      signedAt: contractsTable.signedAt,
      expiresAt: contractsTable.expiresAt,
      totalValue: contractsTable.totalValue,
      notes: contractsTable.notes,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .where(eq(contractsTable.id, id));

  if (!row) {
    res.status(404).send("Không tìm thấy hợp đồng");
    return;
  }

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ký hợp đồng ${row.contractCode}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#faf7fb;color:#222}
    .wrap{max-width:980px;margin:0 auto;padding:24px}
    .card{background:#fff;border:1px solid #eadcec;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(139,26,107,.08)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .sig{border:1px dashed #d9b8d3;border-radius:14px;padding:18px;min-height:230px}
    .sig h3{margin:0 0 8px;color:#8B1A6B}
    canvas{width:100%;height:130px;border-bottom:1px solid #bbb;display:block}
    button{border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer}
    .primary{background:#8B1A6B;color:#fff}
    .ghost{background:#f3e8f3;color:#6b2d63}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1 style="margin:0 0 10px;color:#8B1A6B">✍️ Xác nhận & ký tên</h1>
      <p style="margin:0 0 20px">Hợp đồng <strong>${row.contractCode}</strong> · ${row.title}</p>
      <div class="grid">
        <div class="sig">
          <h3>Bên A – Amazing Studio</h3>
          <p>Đại diện ký tên</p>
          <canvas id="studio"></canvas>
          <p style="color:#777;font-style:italic">Ký, ghi rõ họ tên</p>
        </div>
        <div class="sig">
          <h3>Bên B – ${row.customerName}</h3>
          <p>Khách hàng ký tên</p>
          <canvas id="customer"></canvas>
          <p style="color:#777;font-style:italic">Ký, ghi rõ họ tên</p>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">
        <button class="ghost" onclick="clearSig()">Xóa nét ký</button>
        <button class="primary" onclick="submitSign()">Hoàn tất ký</button>
      </div>
      <p id="msg" style="margin-top:14px;color:#8B1A6B;font-weight:700"></p>
    </div>
  </div>
  <script>
    const c = document.getElementById('customer');
    const ctx = c.getContext('2d');
    let drawing = false, last = null;
    function resize(){ const r = c.getBoundingClientRect(); c.width = r.width * devicePixelRatio; c.height = 130 * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio); }
    resize(); addEventListener('resize', resize);
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => { drawing = true; c.setPointerCapture(e.pointerId); last = pos(e); });
    c.addEventListener('pointermove', e => { if(!drawing) return; const p = pos(e); ctx.lineWidth = 2.5; ctx.lineCap='round'; ctx.strokeStyle='#222'; ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; });
    c.addEventListener('pointerup', () => { drawing = false; last = null; });
    function clearSig(){ ctx.clearRect(0,0,c.width,c.height); }
    async function submitSign(){ document.getElementById('msg').textContent = 'Đã ghi nhận chữ ký mẫu. Kết nối backend lưu chữ ký là bước tiếp theo.'; }
  </script>
</body>
</html>`;

  res.type("html").send(html);
});

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({
      id: contractsTable.id,
      contractCode: contractsTable.contractCode,
      bookingId: contractsTable.bookingId,
      customerId: contractsTable.customerId,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      title: contractsTable.title,
      content: contractsTable.content,
      totalValue: contractsTable.totalValue,
      status: contractsTable.status,
      signedAt: contractsTable.signedAt,
      expiresAt: contractsTable.expiresAt,
      fileUrl: contractsTable.fileUrl,
      notes: contractsTable.notes,
      createdAt: contractsTable.createdAt,
      bookingDeductions: bookingsTable.deductions,
      bookingSurcharges: bookingsTable.surcharges,
    })
    .from(contractsTable)
    .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
    .leftJoin(bookingsTable, eq(contractsTable.bookingId, bookingsTable.id))
    .where(eq(contractsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Không tìm thấy hợp đồng" });
    return;
  }
  res.json(row);
});

router.put("/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { title, content, status, signedAt, expiresAt, totalValue, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (status !== undefined) update.status = status;
  if (signedAt !== undefined) update.signedAt = signedAt;
  if (expiresAt !== undefined) update.expiresAt = expiresAt;
  if (totalValue !== undefined) update.totalValue = String(totalValue);
  if (notes !== undefined) update.notes = notes;
  const [contract] = await db.update(contractsTable).set(update).where(eq(contractsTable.id, id)).returning();
  if (!contract) {
    res.status(404).json({ error: "Không tìm thấy hợp đồng" });
    return;
  }
  res.json(contract);
});

router.delete("/contracts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(contractsTable).where(eq(contractsTable.id, id));
  res.status(204).send();
});

export default router;
