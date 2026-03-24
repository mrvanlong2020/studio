import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable, bookingsTable, customersTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

const fmt = (e: { amount: string; [key: string]: unknown }) => ({ ...e, amount: parseFloat(e.amount) });

router.get("/expenses", async (req, res) => {
  const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string) : undefined;
  const type = req.query.type as string | undefined;
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;
  const year = req.query.year ? parseInt(req.query.year as string) : undefined;

  const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.expenseDate));
  let filtered = rows;
  if (bookingId) filtered = filtered.filter(e => e.bookingId === bookingId);
  if (type) filtered = filtered.filter(e => e.type === type);
  if (month && year) {
    filtered = filtered.filter(e => {
      const d = new Date(e.expenseDate);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
  }

  res.json(filtered.map(fmt));
});

router.post("/expenses", async (req, res) => {
  const { type, category, amount, description, bookingId, paymentMethod, expenseDate, receiptUrl, createdBy, notes } = req.body;
  const [expense] = await db
    .insert(expensesTable)
    .values({ type: type || "operational", category, amount: String(amount), description, bookingId: bookingId || null, paymentMethod: paymentMethod || "cash", expenseDate, receiptUrl, createdBy, notes })
    .returning();
  res.status(201).json(fmt(expense));
});

router.put("/expenses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { type, category, amount, description, bookingId, paymentMethod, expenseDate, receiptUrl, notes } = req.body;
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
