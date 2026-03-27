import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

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

  if (category) filtered = filtered.filter(e => e.category === category);
  if (createdBy) filtered = filtered.filter(e => e.createdBy === createdBy);
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

router.get("/expenses/stats", async (_req, res) => {
  const rows = await db.select().from(expensesTable);
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
  const id = parseInt(req.params.id);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e) return res.status(404).json({ error: "Không tìm thấy" });
  res.json(fmt(e));
});

router.post("/expenses", async (req, res) => {
  const { type, category, amount, description, bookingId, paymentMethod, expenseDate, receiptUrl, createdBy, notes, bankName, bankAccount } = req.body;
  const expenseCode = genCode();
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
      notes: notes || null,
    })
    .returning();
  res.status(201).json(fmt(expense));
});

router.put("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
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

router.delete("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).send();
});

export default router;
