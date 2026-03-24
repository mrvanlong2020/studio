import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable, bookingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/payments", async (req, res) => {
  const bookingId = req.query.bookingId ? parseInt(req.query.bookingId as string) : undefined;
  const rentalId = req.query.rentalId ? parseInt(req.query.rentalId as string) : undefined;

  let query = db.select().from(paymentsTable).$dynamic();

  if (bookingId) {
    query = query.where(eq(paymentsTable.bookingId, bookingId));
  } else if (rentalId) {
    query = query.where(eq(paymentsTable.rentalId, rentalId));
  }

  const payments = await query.orderBy(paymentsTable.paidAt);
  res.json(payments.map((p) => ({ ...p, amount: parseFloat(p.amount) })));
});

router.post("/payments", async (req, res) => {
  const { bookingId, rentalId, amount, paymentMethod, paymentType, notes } = req.body;
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      bookingId: bookingId || null,
      rentalId: rentalId || null,
      amount: String(amount),
      paymentMethod,
      paymentType,
      notes,
    })
    .returning();

  if (bookingId) {
    const allPayments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, bookingId));
    const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    await db.update(bookingsTable).set({ paidAmount: String(totalPaid) }).where(eq(bookingsTable.id, bookingId));
  }

  res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
});

router.delete("/payments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
  if (payment?.bookingId) {
    const remaining = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, payment.bookingId));
    const totalPaid = remaining.reduce((s, p) => s + parseFloat(p.amount), 0);
    await db.update(bookingsTable).set({ paidAmount: String(totalPaid) }).where(eq(bookingsTable.id, payment.bookingId));
  }
  res.status(204).send();
});

export default router;
