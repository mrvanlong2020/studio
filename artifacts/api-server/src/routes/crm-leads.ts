import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { crmLeadsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/crm-leads", async (req, res) => {
  try {
    const leads = await db.select().from(crmLeadsTable).orderBy(desc(crmLeadsTable.createdAt));
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
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: "Số điện thoại là bắt buộc" });
    const [lead] = await db
      .insert(crmLeadsTable)
      .values({
        name: String(name).trim(),
        phone: String(phone).trim(),
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
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Thiếu trạng thái" });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    const [lead] = await db
      .update(crmLeadsTable)
      .set({ status })
      .where(eq(crmLeadsTable.id, id))
      .returning();
    if (!lead) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(lead);
  } catch (err) {
    console.error("PATCH /crm-leads/:id error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
});

export default router;
