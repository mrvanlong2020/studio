import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable } from "@workspace/db/schema";
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
  res.status(201).json({ ...payment, amount: parseFloat(payment.amount) });
});

export default router;
