import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { expensesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifyToken } from "./auth";

const router: IRouter = Router();

const fmt = (e: { amount: string; [key: string]: unknown }) => ({ ...e, amount: parseFloat(e.amount) });

function genCode() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 900 + 100);
  return `PC${y}${m}${d}${r}`;
}

router.get("/expenses", async (req, res) => {
  const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.expenseDate), desc(expensesTable.createdAt));
  let filtered = rows;

  const category = req.query.category as string | undefined;
  const createdBy = req.query.createdBy as string | undefined;
  const dateRange = req.query.dateRange as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const mine = req.query.mine === "1" || req.query.mine === "true";

  // Kiểm tra quyền caller — nhân viên không phải admin luôn chỉ thấy chi tiêu của mình
  const callerId = verifyToken(req.headers.authorization);
  let callerIsAdmin = false;
  if (callerId) {
    const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
    const caller = callerR.rows[0] as Record<string, unknown> | undefined;
    callerIsAdmin = !!(caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin"))));
  }

  if (!callerId) {
    // Không có token hợp lệ — trả về danh sách rỗng
    return res.json([]);
  }

  if (!callerIsAdmin) {
    // Nhân viên không phải admin luôn chỉ thấy chi tiêu của mình
    filtered = filtered.filter(e => e.createdByStaffId === callerId);
  } else if (mine) {
    // Admin chọn xem của mình thôi
    filtered = filtered.filter(e => e.createdByStaffId === callerId);
  }

  if (category) filtered = filtered.filter(e => e.category === category);
  if (createdBy) filtered = filtered.filter(e => e.createdBy === createdBy);
  if (statusFilter) filtered = filtered.filter(e => e.status === statusFilter);
  if (dateRange) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (dateRange === "today") {
      filtered = filtered.filter(e => e.expenseDate === today);
    } else if (dateRange === "7days") {
      const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
      filtered = filtered.filter(e => e.expenseDate >= d7.toISOString().slice(0, 10));
    } else if (dateRange === "month") {
      const ym = today.slice(0, 7);
      filtered = filtered.filter(e => e.expenseDate.startsWith(ym));
    }
  }

  res.json(filtered.map(fmt));
});

router.get("/expenses/stats", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.json({ today: 0, todayCount: 0, week: 0, weekCount: 0, month: 0, monthCount: 0, total: 0, totalCount: 0 });

  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));

  let allRows = await db.select().from(expensesTable);
  // Nhân viên chỉ thấy thống kê chi phí của mình
  const rows = isAdmin ? allRows : allRows.filter(e => e.createdByStaffId === callerId);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const ym = today.slice(0, 7);

  const todayRows = rows.filter(e => e.expenseDate === today);
  const d7Rows = rows.filter(e => e.expenseDate >= d7.toISOString().slice(0, 10));
  const monthRows = rows.filter(e => e.expenseDate.startsWith(ym));

  const sum = (arr: typeof rows) => arr.reduce((s, e) => s + parseFloat(e.amount), 0);
  res.json({
    today: sum(todayRows),
    todayCount: todayRows.length,
    week: sum(d7Rows),
    weekCount: d7Rows.length,
    month: sum(monthRows),
    monthCount: monthRows.length,
    total: sum(rows),
    totalCount: rows.length,
  });
});

router.get("/expenses/:id", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));

  const id = parseInt(req.params.id);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e) return res.status(404).json({ error: "Không tìm thấy" });
  // Staff can only see their own expense detail
  if (!isAdmin && e.createdByStaffId !== callerId) return res.status(403).json({ error: "Không có quyền xem chi phí này" });
  res.json(fmt(e));
});

router.post("/expenses", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });

  const { type, category, amount, description, bookingId, paymentMethod, expenseDate, receiptUrl, createdBy, notes, bankName, bankAccount } = req.body;
  const expenseCode = genCode();

  // Nhân viên tự nộp → status LUÔN = "submitted", admin tạo → "approved"
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  const status = isAdmin ? "approved" : "submitted";
  const createdByStaffId = isAdmin ? null : callerId;

  const [expense] = await db
    .insert(expensesTable)
    .values({
      expenseCode,
      type: type || "operational",
      category: category || "Chi khác",
      amount: String(amount),
      description: description || "",
      bookingId: bookingId || null,
      paymentMethod: paymentMethod || "cash",
      expenseDate: expenseDate || new Date().toISOString().slice(0, 10),
      receiptUrl: receiptUrl || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      createdBy: createdBy || null,
      createdByStaffId,
      status,
      notes: notes || null,
    })
    .returning();
  res.status(201).json(fmt(expense));
});

router.put("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) {
    // Staff can only edit their own submitted expenses
    const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Không tìm thấy chi phí" });
    if (existing.createdByStaffId !== callerId) return res.status(403).json({ error: "Không có quyền sửa chi phí này" });
    if (existing.status !== "submitted") return res.status(403).json({ error: "Chỉ có thể sửa chi phí chưa duyệt" });
  }
  const { type, category, amount, description, bookingId, paymentMethod, expenseDate, receiptUrl, notes, bankName, bankAccount, createdBy } = req.body;
  const update: Record<string, unknown> = {};
  if (type !== undefined) update.type = type;
  if (category !== undefined) update.category = category;
  if (amount !== undefined) update.amount = String(amount);
  if (description !== undefined) update.description = description;
  if (bookingId !== undefined) update.bookingId = bookingId || null;
  if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
  if (expenseDate !== undefined) update.expenseDate = expenseDate;
  if (receiptUrl !== undefined) update.receiptUrl = receiptUrl;
  if (notes !== undefined) update.notes = notes;
  if (bankName !== undefined) update.bankName = bankName;
  if (bankAccount !== undefined) update.bankAccount = bankAccount;
  if (createdBy !== undefined) update.createdBy = createdBy;
  const [expense] = await db.update(expensesTable).set(update).where(eq(expensesTable.id, id)).returning();
  if (!expense) return res.status(404).json({ error: "Không tìm thấy chi phí" });
  res.json(fmt(expense));
});

// ── Task #12: Approve / Reject ─────────────────────────────────────────────────
router.patch("/expenses/:id/approve", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền duyệt chi phí" });

  const id = parseInt(req.params.id);
  const { action = "approve" } = req.body;

  const [e] = await db.update(expensesTable)
    .set({
      status: action === "reject" ? "rejected" : "approved",
      approvedByStaffId: action === "reject" ? null : callerId,
    })
    .where(eq(expensesTable.id, id))
    .returning();
  if (!e) return res.status(404).json({ error: "Không tìm thấy chi phí" });
  res.json(fmt(e));
});

// ── Task #12: Reject expense ──────────────────────────────────────────────────
router.patch("/expenses/:id/reject", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền từ chối chi phí" });

  const id = parseInt(req.params.id);
  const [e] = await db.update(expensesTable)
    .set({ status: "rejected", approvedByStaffId: null })
    .where(eq(expensesTable.id, id))
    .returning();
  if (!e) return res.status(404).json({ error: "Không tìm thấy chi phí" });
  res.json(fmt(e));
});

// ── Task #12: Mark as Paid ────────────────────────────────────────────────────
router.patch("/expenses/:id/pay", async (req, res) => {
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) return res.status(403).json({ error: "Không có quyền xác nhận thanh toán" });

  const id = parseInt(req.params.id);
  const { paidFrom = "cash", paidAt } = req.body;

  const [e] = await db.update(expensesTable)
    .set({
      status: "paid",
      paidByStaffId: callerId,
      paidFrom,
      paidAt: paidAt || new Date().toISOString(),
    })
    .where(eq(expensesTable.id, id))
    .returning();
  if (!e) return res.status(404).json({ error: "Không tìm thấy chi phí" });
  res.json(fmt(e));
});

router.delete("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const callerId = verifyToken(req.headers.authorization);
  if (!callerId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const callerR = await pool.query(`SELECT role, roles FROM staff WHERE id = $1`, [callerId]);
  const caller = callerR.rows[0] as Record<string, unknown> | undefined;
  const isAdmin = caller && (caller.role === "admin" || (Array.isArray(caller.roles) && caller.roles.includes("admin")));
  if (!isAdmin) {
    const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Không tìm thấy chi phí" });
    if (existing.createdByStaffId !== callerId) return res.status(403).json({ error: "Không có quyền xoá chi phí này" });
    if (existing.status !== "submitted") return res.status(403).json({ error: "Chỉ có thể xoá chi phí chưa duyệt" });
  }
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).send();
});

export default router;
