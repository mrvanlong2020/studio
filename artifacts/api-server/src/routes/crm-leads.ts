import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { crmLeadsTable, customersTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

async function ensureCrmLeadsNotesColumn() {
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS notes TEXT`).catch((err: unknown) => {
    console.error("[CRM] ensureCrmLeadsNotesColumn error:", err);
  });
}
ensureCrmLeadsNotesColumn();

router.get("/crm-leads", async (req, res) => {
  try {
    const leads = await db
      .select()
      .from(crmLeadsTable)
      .orderBy(sql`${crmLeadsTable.lastMessageAt} DESC NULLS LAST`, desc(crmLeadsTable.createdAt));
    res.json(leads);
  } catch (err) {
    console.error("GET /crm-leads error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.post("/crm-leads", async (req, res) => {
  try {
    const { name, phone, message, source, status } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Tên là bắt buộc" });
    const [lead] = await db
      .insert(crmLeadsTable)
      .values({
        name: String(name).trim(),
        phone: phone ? String(phone).trim() : null,
        message: message ? String(message).trim() : null,
        source: source || "facebook",
        status: status || "new",
      })
      .returning();
    res.status(201).json(lead);
  } catch (err) {
    console.error("POST /crm-leads error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

const VALID_STATUSES = ["new", "chatting", "hot", "lost"];

router.patch("/crm-leads/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, notes } = req.body;

    const setObj: { status?: string; notes?: string | null } = {};
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
      setObj.status = status;
    }
    if (notes !== undefined) {
      setObj.notes = notes === null ? null : String(notes);
    }
    if (Object.keys(setObj).length === 0) return res.status(400).json({ error: "Không có gì để cập nhật" });

    const [lead] = await db
      .update(crmLeadsTable)
      .set(setObj)
      .where(eq(crmLeadsTable.id, id))
      .returning();
    if (!lead) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(lead);
  } catch (err) {
    console.error("PATCH /crm-leads/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

router.post("/crm-leads/:id/convert-to-customer", async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const [lead] = await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.id, leadId));
    if (!lead) return res.status(404).json({ error: "Không tìm thấy lead" });

    if (!lead.phone) return res.status(400).json({ error: "Lead này chưa có số điện thoại, không thể chuyển thành khách" });

    const [existingCustomer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, lead.phone));
    if (existingCustomer) return res.status(400).json({ error: "Khách hàng với SĐT này đã tồn tại" });

    const [customer] = await db
      .insert(customersTable)
      .values({
        name: lead.name,
        phone: lead.phone,
        source: lead.source || "crm",
        notes: lead.notes || lead.message || undefined,
      })
      .returning();

    await db
      .update(crmLeadsTable)
      .set({ status: "lost" })
      .where(eq(crmLeadsTable.id, leadId));

    res.status(201).json(customer);
  } catch (err) {
    console.error("POST /crm-leads/:id/convert-to-customer error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

export default router;
